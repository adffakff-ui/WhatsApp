import { useEffect, useRef, useState } from 'react';
import {
  Activity,
  Lock,
  Mic,
  MicOff,
  MonitorUp,
  Phone,
  PhoneOff,
  RefreshCw,
  SlidersHorizontal,
  Video,
  VideoOff,
  Volume2,
  VolumeX
} from 'lucide-react';
import { Avatar } from './Avatar';
import { formatCallDuration, isRemoteFirebaseUid } from '../lib/chatLogic';
import {
  acquireCallMediaStream,
  applySenderQualityPreset,
  buildMediaConstraints,
  CALL_QUALITY_PRESETS,
  enhanceSdpMediaQuality,
  extractTelemetryFromRtcStats,
  WEBRTC_RTC_CONFIG,
  type CallTelemetryStats
} from '../lib/webrtcConfig';
import {
  answerIncomingCallInFirestore,
  declineIncomingCallInFirestore,
  saveCallRecordToFirestore,
  sendIceCandidateToFirestore,
  subscribeCallDocument,
  subscribeCallIceCandidates,
  updateCallOfferSdpInFirestore
} from '../services/firestoreSync';
import type { CallQualityPreset, CallRecord } from '../types/chat';

interface CallOverlayProps {
  activeCall: CallRecord;
  myUid: string;
  isCloudSynced: boolean;
  onEndCall: (
    durationSeconds: number,
    finalStatus?: 'ended' | 'declined' | 'missed',
    skipRemoteFinalize?: boolean
  ) => void;
}

export function CallOverlay({
  activeCall,
  myUid,
  isCloudSynced,
  onEndCall
}: CallOverlayProps) {
  const isP2PRemoteCall =
    isCloudSynced &&
    isRemoteFirebaseUid(
      activeCall.direction === 'outgoing' ? activeCall.calleeId : activeCall.callerId
    );

  const [callState, setCallState] = useState<'ringing' | 'connecting' | 'connected'>(
    activeCall.direction === 'incoming' ? 'ringing' : isP2PRemoteCall ? 'connecting' : 'ringing'
  );
  const [elapsedSec, setElapsedSec] = useState(0);
  const [isMuted, setIsMuted] = useState(false);
  const [isVideoEnabled, setIsVideoEnabled] = useState(activeCall.callType === 'video');
  const [isSpeakerOn, setIsSpeakerOn] = useState(true);
  const [isScreenSharing, setIsScreenSharing] = useState(false);
  const [facingMode, setFacingMode] = useState<'user' | 'environment'>('user');
  const [qualityPreset, setQualityPreset] = useState<CallQualityPreset>('ultra');
  const [hasLocalVideo, setHasLocalVideo] = useState(false);
  const [hasRemoteVideo, setHasRemoteVideo] = useState(false);
  const [swapStreams, setSwapStreams] = useState(false);
  const [showStatsHud, setShowStatsHud] = useState(false);
  const [iceStatusLabel, setIceStatusLabel] = useState(
    isP2PRemoteCall ? 'جاري تهيئة قناة P2P...' : 'وضع المعاينة الحية'
  );
  const [voiceLevels, setVoiceLevels] = useState<number[]>([22, 34, 48, 30, 20]);
  const [telemetry, setTelemetry] = useState<CallTelemetryStats>({
    rttMs: null,
    packetLossPct: null,
    resolution: null,
    fps: null,
    audioCodec: null,
    videoCodec: null
  });

  const localVideoRef = useRef<HTMLVideoElement>(null);
  const remoteVideoRef = useRef<HTMLVideoElement>(null);
  const remoteAudioRef = useRef<HTMLAudioElement>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const remoteStreamRef = useRef<MediaStream | null>(null);
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const pendingIceCandidatesRef = useRef<RTCIceCandidateInit[]>([]);
  const lastAppliedRemoteSdpRef = useRef<string>('');
  const finishedRef = useRef(false);
  const elapsedSecRef = useRef(0);
  const startCalleeRef = useRef<(() => Promise<void>) | null>(null);

  useEffect(() => {
    elapsedSecRef.current = elapsedSec;
  }, [elapsedSec]);

  const peerName =
    activeCall.direction === 'outgoing' ? activeCall.calleeName : activeCall.callerName;
  const peerAvatar =
    activeCall.direction === 'outgoing' ? activeCall.calleeAvatar : activeCall.callerAvatar;

  const attachVideoStreams = () => {
    const mainEl = remoteVideoRef.current;
    const pipEl = localVideoRef.current;
    const localStream = localStreamRef.current;
    const remoteStream = remoteStreamRef.current;

    if (hasRemoteVideo && remoteStream) {
      if (mainEl) {
        mainEl.srcObject = swapStreams ? localStream : remoteStream;
        void mainEl.play().catch(() => {});
      }
      if (pipEl) {
        pipEl.srcObject = swapStreams ? remoteStream : localStream;
        void pipEl.play().catch(() => {});
      }
    } else {
      if (mainEl && localStream) {
        mainEl.srcObject = localStream;
        void mainEl.play().catch(() => {});
      }
      if (pipEl) {
        pipEl.srcObject = null;
      }
    }
  };

  useEffect(() => {
    attachVideoStreams();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasLocalVideo, hasRemoteVideo, swapStreams, isVideoEnabled]);

  useEffect(() => {
    if (remoteAudioRef.current) {
      remoteAudioRef.current.muted = !isSpeakerOn;
    }
  }, [isSpeakerOn]);

  // Subtle Web Audio ringing tone while ringing
  useEffect(() => {
    if (callState !== 'ringing') return;
    let ringTimer: number | null = null;
    let audioCtx: AudioContext | null = null;

    const pulseTone = () => {
      try {
        const AudioCtx =
          window.AudioContext ||
          (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
        if (!AudioCtx) return;
        if (!audioCtx) audioCtx = new AudioCtx();
        if (audioCtx.state === 'suspended') {
          void audioCtx.resume().catch(() => {});
        }
        const now = audioCtx.currentTime;
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(activeCall.direction === 'incoming' ? 540 : 440, now);
        gain.gain.setValueAtTime(0.0001, now);
        gain.gain.exponentialRampToValueAtTime(0.025, now + 0.04);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.45);
        osc.connect(gain);
        gain.connect(audioCtx.destination);
        osc.start(now);
        osc.stop(now + 0.48);
      } catch {
        // Silent in autoplay-restricted / headless browsers
      }
    };

    pulseTone();
    ringTimer = window.setInterval(pulseTone, 2400);

    return () => {
      if (ringTimer) window.clearInterval(ringTimer);
      void audioCtx?.close().catch(() => {});
    };
  }, [callState, activeCall.direction]);

  // Real Microphone Audio Energy Visualizer via Web Audio API
  useEffect(() => {
    const stream = localStreamRef.current;
    if (!stream || stream.getAudioTracks().length === 0 || isMuted) {
      setVoiceLevels([18, 22, 26, 22, 18]);
      return;
    }

    let rafId = 0;
    let audioCtx: AudioContext | null = null;

    try {
      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!AudioCtx) return;
      audioCtx = new AudioCtx();
      const source = audioCtx.createMediaStreamSource(stream);
      const analyser = audioCtx.createAnalyser();
      analyser.fftSize = 32;
      source.connect(analyser);
      const data = new Uint8Array(analyser.frequencyBinCount);

      const tick = () => {
        analyser.getByteFrequencyData(data);
        const bars = [1, 2, 3, 4, 5].map((i) => {
          const val = data[i] || 0;
          return Math.max(18, Math.min(100, Math.round((val / 255) * 100)));
        });
        setVoiceLevels(bars);
        rafId = window.requestAnimationFrame(tick);
      };
      rafId = window.requestAnimationFrame(tick);
    } catch {
      // Headless fallback
    }

    return () => {
      if (rafId) window.cancelAnimationFrame(rafId);
      void audioCtx?.close().catch(() => {});
    };
  }, [hasLocalVideo, isMuted, callState]);

  // Unified WebRTC Setup & Firestore Signaling Lifecycle (Caller + Callee)
  useEffect(() => {
    let cancelled = false;
    let unsubCallDoc: (() => void) | null = null;
    let unsubIce: (() => void) | null = null;
    let statsTimer: number | null = null;
    let demoConnectTimer: number | null = null;
    let ringTimeoutTimer: number | null = null;
    let restartAttempts = 0;

    const cleanup = () => {
      cancelled = true;
      unsubCallDoc?.();
      unsubIce?.();
      if (statsTimer) window.clearInterval(statsTimer);
      if (demoConnectTimer) window.clearTimeout(demoConnectTimer);
      if (ringTimeoutTimer) window.clearTimeout(ringTimeoutTimer);
      localStreamRef.current?.getTracks().forEach((t) => t.stop());
      remoteStreamRef.current?.getTracks().forEach((t) => t.stop());
      pcRef.current?.close();
      pcRef.current = null;
    };

    const flushPendingCandidates = async (pc: RTCPeerConnection) => {
      while (pendingIceCandidatesRef.current.length > 0) {
        const cand = pendingIceCandidatesRef.current.shift();
        if (cand) {
          try {
            await pc.addIceCandidate(new RTCIceCandidate(cand));
          } catch {
            // Ignore duplicate/late candidate
          }
        }
      }
    };

    const ensureIceSubscription = (pcGetter: () => RTCPeerConnection | null) => {
      if (!isP2PRemoteCall || unsubIce) return;
      unsubIce = subscribeCallIceCandidates(
        activeCall.id,
        activeCall.callerId,
        myUid,
        async (candidate) => {
          const pc = pcGetter();
          if (pc && pc.remoteDescription) {
            try {
              await pc.addIceCandidate(new RTCIceCandidate(candidate));
            } catch {
              // ignore
            }
          } else {
            pendingIceCandidatesRef.current.push(candidate);
          }
        }
      );
    };

    async function startPeerConnection(role: 'caller' | 'callee') {
      if (pcRef.current && pcRef.current.signalingState !== 'closed') {
        pcRef.current.close();
      }

      const pc = new RTCPeerConnection(WEBRTC_RTC_CONFIG);
      pcRef.current = pc;

      const remoteStream = new MediaStream();
      remoteStreamRef.current = remoteStream;

      pc.ontrack = (event) => {
        const incomingTracks =
          event.streams[0]?.getTracks() || (event.track ? [event.track] : []);
        incomingTracks.forEach((track) => {
          if (!remoteStream.getTracks().some((t) => t.id === track.id)) {
            remoteStream.addTrack(track);
          }
          if (track.kind === 'video') {
            setHasRemoteVideo(true);
            track.onunmute = () => setHasRemoteVideo(true);
          }
        });
        if (remoteAudioRef.current) {
          remoteAudioRef.current.srcObject = remoteStream;
          void remoteAudioRef.current.play().catch(() => {});
        }
        attachVideoStreams();
      };

      pc.oniceconnectionstatechange = async () => {
        if (cancelled || finishedRef.current) return;
        const st = pc.iceConnectionState;
        if (st === 'connected' || st === 'completed') {
          restartAttempts = 0;
          setCallState('connected');
          setIceStatusLabel('متصل P2P فائق الوضوح');
        } else if (st === 'checking') {
          setIceStatusLabel('جاري تأمين مسار P2P...');
        } else if (st === 'disconnected' || st === 'failed') {
          setIceStatusLabel('ضعف الاتصال — إعادة الربط...');
          if (isP2PRemoteCall && role === 'caller' && restartAttempts < 2) {
            restartAttempts += 1;
            try {
              pc.restartIce?.();
              const refreshedOffer = await pc.createOffer({
                iceRestart: true,
                offerToReceiveAudio: true,
                offerToReceiveVideo: activeCall.callType === 'video'
              });
              const tunedOffer = enhanceSdpMediaQuality(refreshedOffer.sdp || '', qualityPreset);
              await pc.setLocalDescription({ type: 'offer', sdp: tunedOffer });
              await updateCallOfferSdpInFirestore(activeCall.id, tunedOffer);
            } catch {
              // Ignore transient ICE restart failure
            }
          }
        }
      };

      pc.onicecandidate = (event) => {
        if (!event.candidate || !isP2PRemoteCall) return;
        void sendIceCandidateToFirestore(
          activeCall.id,
          activeCall.callerId,
          activeCall.calleeId,
          myUid,
          event.candidate.toJSON()
        ).catch(() => {});
      };

      // Open HD Media Stream with automatic audio-only fallback if camera is unavailable
      const acquired = await acquireCallMediaStream(
        activeCall.callType,
        qualityPreset,
        facingMode
      );
      if (cancelled) {
        acquired.stream?.getTracks().forEach((t) => t.stop());
        return pc;
      }

      if (acquired.stream) {
        localStreamRef.current = acquired.stream;
        acquired.stream.getTracks().forEach((track) => pc.addTrack(track, acquired.stream!));
        setHasLocalVideo(activeCall.callType === 'video' && acquired.hasVideo);
        if (acquired.fallbackAudioOnly) {
          setIsVideoEnabled(false);
          setIceStatusLabel('تم الاتصال بالصوت (الكاميرا غير متاحة)');
        }
        attachVideoStreams();
        await applySenderQualityPreset(pc, qualityPreset);
      } else {
        setHasLocalVideo(false);
      }

      // Ensure receive transceivers exist even if user had no local mic/camera
      const hasAudioSender = pc.getTransceivers().some((t) => t.receiver.track?.kind === 'audio');
      if (!hasAudioSender) {
        try {
          pc.addTransceiver('audio', { direction: 'recvonly' });
        } catch {
          // ignore
        }
      }
      if (activeCall.callType === 'video') {
        const hasVideoSender = pc.getTransceivers().some((t) => t.receiver.track?.kind === 'video');
        if (!hasVideoSender) {
          try {
            pc.addTransceiver('video', { direction: 'recvonly' });
          } catch {
            // ignore
          }
        }
      }

      // Live WebRTC getStats() Telemetry Loop
      if (statsTimer) window.clearInterval(statsTimer);
      statsTimer = window.setInterval(async () => {
        if (!pcRef.current || pcRef.current.signalingState === 'closed') return;
        try {
          const report = await pcRef.current.getStats();
          setTelemetry(extractTelemetryFromRtcStats(report));
        } catch {
          // Ignore transient stats read
        }
      }, 2000);

      ensureIceSubscription(() => pcRef.current);

      if (isP2PRemoteCall && role === 'caller') {
        const offer = await pc.createOffer({
          offerToReceiveAudio: true,
          offerToReceiveVideo: activeCall.callType === 'video'
        });
        const tunedOfferSdp = enhanceSdpMediaQuality(offer.sdp || '', qualityPreset);
        await pc.setLocalDescription({ type: 'offer', sdp: tunedOfferSdp });

        await saveCallRecordToFirestore({
          ...activeCall,
          offerSdp: tunedOfferSdp
        });
        setIceStatusLabel('بانتظار رد الطرف الآخر...');

        // 45s timeout if unanswered
        ringTimeoutTimer = window.setTimeout(() => {
          if (!cancelled && !finishedRef.current && callState !== 'connected' && elapsedSecRef.current === 0) {
            finishedRef.current = true;
            onEndCall(0, 'missed', false);
          }
        }, 45_000);

        if (!unsubCallDoc) {
          unsubCallDoc = subscribeCallDocument(activeCall.id, async (docUpdate) => {
            if (cancelled || finishedRef.current) return;
            if (
              docUpdate.status === 'declined' ||
              docUpdate.status === 'ended' ||
              docUpdate.status === 'missed'
            ) {
              finishedRef.current = true;
              onEndCall(elapsedSecRef.current, docUpdate.status, true);
              return;
            }
            if (
              docUpdate.answerSdp &&
              docUpdate.answerSdp !== lastAppliedRemoteSdpRef.current
            ) {
              lastAppliedRemoteSdpRef.current = docUpdate.answerSdp;
              if (ringTimeoutTimer) {
                window.clearTimeout(ringTimeoutTimer);
                ringTimeoutTimer = null;
              }
              try {
                await pc.setRemoteDescription({ type: 'answer', sdp: docUpdate.answerSdp });
                await flushPendingCandidates(pc);
                setCallState('connected');
                setIceStatusLabel('متصل P2P فائق الوضوح');
              } catch {
                // Ignore invalid SDP mismatch
              }
            }
          });
        }
      } else if (isP2PRemoteCall && role === 'callee') {
        const handleRemoteOffer = async (offerSdp: string) => {
          if (!offerSdp || offerSdp === lastAppliedRemoteSdpRef.current) return;
          lastAppliedRemoteSdpRef.current = offerSdp;
          try {
            await pc.setRemoteDescription({ type: 'offer', sdp: offerSdp });
            await flushPendingCandidates(pc);
            const answer = await pc.createAnswer();
            const tunedAnswerSdp = enhanceSdpMediaQuality(answer.sdp || '', qualityPreset);
            await pc.setLocalDescription({ type: 'answer', sdp: tunedAnswerSdp });
            await answerIncomingCallInFirestore(activeCall.id, tunedAnswerSdp);
            setCallState('connected');
            setIceStatusLabel('متصل P2P فائق الوضوح');
          } catch {
            setCallState('connected');
            setIceStatusLabel('متصل · مسار احتياطي');
          }
        };

        if (activeCall.offerSdp) {
          await handleRemoteOffer(activeCall.offerSdp);
        }

        unsubCallDoc?.();
        unsubCallDoc = subscribeCallDocument(activeCall.id, async (docUpdate) => {
          if (cancelled || finishedRef.current) return;
          if (
            docUpdate.status === 'ended' ||
            docUpdate.status === 'declined' ||
            docUpdate.status === 'missed'
          ) {
            finishedRef.current = true;
            onEndCall(elapsedSecRef.current, docUpdate.status, true);
            return;
          }
          if (docUpdate.offerSdp && docUpdate.offerSdp !== lastAppliedRemoteSdpRef.current) {
            await handleRemoteOffer(docUpdate.offerSdp);
          }
        });
      } else {
        // Local preview call (demo / offline contact)
        if (isCloudSynced) {
          void saveCallRecordToFirestore(activeCall).catch(() => {});
        }
        demoConnectTimer = window.setTimeout(() => {
          if (!cancelled) {
            setCallState('connected');
            setIceStatusLabel('متصل · جودة HD محلية');
          }
        }, 1200);
      }

      return pc;
    }

    startCalleeRef.current = async () => {
      setCallState('connecting');
      setIceStatusLabel('جاري الرد وتأمين الاتصال...');
      await startPeerConnection('callee');
    };

    if (activeCall.direction === 'outgoing') {
      void startPeerConnection('caller');
    } else {
      // Buffer ICE candidates early while ringing & watch for caller hangup
      if (isP2PRemoteCall) {
        ensureIceSubscription(() => pcRef.current);
        unsubCallDoc = subscribeCallDocument(activeCall.id, (docUpdate) => {
          if (cancelled || finishedRef.current) return;
          if (
            docUpdate.status === 'ended' ||
            docUpdate.status === 'declined' ||
            docUpdate.status === 'missed'
          ) {
            finishedRef.current = true;
            onEndCall(0, docUpdate.status, true);
          }
        });
      }
    }

    return cleanup;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeCall.id]);

  // Call duration timer
  useEffect(() => {
    if (callState !== 'connected') return;
    const timer = window.setInterval(() => {
      setElapsedSec((s) => s + 1);
    }, 1000);
    return () => window.clearInterval(timer);
  }, [callState]);

  const handleAcceptIncomingCall = async () => {
    if (startCalleeRef.current) {
      await startCalleeRef.current();
    }
  };

  const handleDeclineIncoming = async () => {
    finishedRef.current = true;
    if (isP2PRemoteCall) {
      await declineIncomingCallInFirestore(activeCall.id).catch(() => {});
    }
    onEndCall(0, 'declined', isP2PRemoteCall);
  };

  const toggleMute = () => {
    const next = !isMuted;
    setIsMuted(next);
    localStreamRef.current?.getAudioTracks().forEach((t) => {
      t.enabled = !next;
    });
  };

  const toggleVideo = () => {
    const next = !isVideoEnabled;
    setIsVideoEnabled(next);
    localStreamRef.current?.getVideoTracks().forEach((t) => {
      t.enabled = next;
    });
  };

  const handleSwitchCamera = async () => {
    const nextFacing = facingMode === 'user' ? 'environment' : 'user';
    setFacingMode(nextFacing);
    if (!navigator.mediaDevices?.getUserMedia || activeCall.callType !== 'video') return;
    try {
      const nextStream = await navigator.mediaDevices.getUserMedia(
        buildMediaConstraints('video', qualityPreset, nextFacing)
      );
      const newVideoTrack = nextStream.getVideoTracks()[0];
      if (!newVideoTrack) return;
      const oldVideoTrack = localStreamRef.current?.getVideoTracks()[0];
      if (oldVideoTrack) {
        oldVideoTrack.stop();
        localStreamRef.current?.removeTrack(oldVideoTrack);
      }
      localStreamRef.current?.addTrack(newVideoTrack);
      const sender = pcRef.current?.getSenders().find((s) => s.track?.kind === 'video');
      if (sender) {
        await sender.replaceTrack(newVideoTrack);
      }
      nextStream.getAudioTracks().forEach((t) => t.stop());
      setHasLocalVideo(true);
      attachVideoStreams();
    } catch {
      // Rear/front switch unavailable
    }
  };

  const handleCycleQuality = async () => {
    const order: CallQualityPreset[] = ['ultra', 'balanced', 'saver'];
    const next = order[(order.indexOf(qualityPreset) + 1) % order.length];
    setQualityPreset(next);
    if (pcRef.current) {
      await applySenderQualityPreset(pcRef.current, next);
    }
  };

  const toggleScreenShare = async () => {
    if (isScreenSharing) {
      setIsScreenSharing(false);
      if (navigator.mediaDevices?.getUserMedia && activeCall.callType === 'video') {
        try {
          const camStream = await navigator.mediaDevices.getUserMedia(
            buildMediaConstraints('video', qualityPreset, facingMode)
          );
          const camTrack = camStream.getVideoTracks()[0];
          const sender = pcRef.current?.getSenders().find((s) => s.track?.kind === 'video');
          if (camTrack && sender) await sender.replaceTrack(camTrack);
          camStream.getAudioTracks().forEach((t) => t.stop());
          if (camTrack) {
            localStreamRef.current?.getVideoTracks().forEach((t) => {
              t.stop();
              localStreamRef.current?.removeTrack(t);
            });
            localStreamRef.current?.addTrack(camTrack);
          }
          attachVideoStreams();
        } catch {
          // ignore
        }
      }
      return;
    }

    try {
      if (navigator.mediaDevices?.getDisplayMedia) {
        const displayStream = await navigator.mediaDevices.getDisplayMedia({ video: true });
        const screenTrack = displayStream.getVideoTracks()[0];
        if (!screenTrack) return;
        const sender = pcRef.current?.getSenders().find((s) => s.track?.kind === 'video');
        if (sender) {
          await sender.replaceTrack(screenTrack);
        }
        if (remoteVideoRef.current && !hasRemoteVideo) {
          remoteVideoRef.current.srcObject = displayStream;
        }
        setHasLocalVideo(true);
        setIsScreenSharing(true);
        screenTrack.onended = () => {
          void toggleScreenShare();
        };
      }
    } catch {
      setIsScreenSharing(false);
    }
  };

  const activePresetMeta = CALL_QUALITY_PRESETS[qualityPreset];

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`مكالمة ${activeCall.callType === 'video' ? 'مرئية' : 'صوتية'} مع ${peerName}`}
      className="fixed inset-0 z-[60] w-full max-w-full h-[100dvh] bg-[#0B141A] text-white flex flex-col justify-between p-4 sm:p-6 overflow-hidden select-none"
    >
      {/* Hidden Remote Audio Element for Full-Duplex Stereo P2P Audio */}
      <audio ref={remoteAudioRef} autoPlay playsInline className="sr-only" />

      {/* Top Encryption, Quality Preset & Stats HUD Bar */}
      <header className="relative z-20 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-xs text-white/90 bg-black/35 backdrop-blur-md px-3 py-1.5 rounded-full border border-white/10">
          <Lock className="w-3.5 h-3.5 text-[#06CF9C] shrink-0" aria-hidden="true" />
          <span className="font-medium truncate max-w-[190px] sm:max-w-none">{iceStatusLabel}</span>
          <span className="hidden sm:inline text-white/40">·</span>
          <span className="hidden sm:inline font-mono-code text-[11px] text-white/70">
            {activeCall.encryptionFingerprint}
          </span>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => void handleCycleQuality()}
            title="تغيير دقة البث ومعدل نقل البيانات"
            className="min-h-[38px] px-3 py-1.5 rounded-full bg-white/10 hover:bg-white/20 text-xs font-mono-code font-semibold flex items-center gap-1.5 transition-colors cursor-pointer"
          >
            <SlidersHorizontal className="w-3.5 h-3.5 text-[#06CF9C]" aria-hidden="true" />
            <span>{activePresetMeta.badge}</span>
          </button>

          <button
            type="button"
            aria-label="إحصائيات جودة الاتصال"
            aria-expanded={showStatsHud}
            onClick={() => setShowStatsHud((v) => !v)}
            className={`min-h-[38px] min-w-[38px] rounded-full flex items-center justify-center transition-colors cursor-pointer ${
              showStatsHud ? 'bg-[var(--wa-accent)] text-white' : 'bg-white/10 hover:bg-white/20'
            }`}
          >
            <Activity className="w-4 h-4" aria-hidden="true" />
          </button>
        </div>

        {/* Collapsible Live WebRTC Stats Telemetry HUD */}
        {showStatsHud && (
          <div className="absolute top-12 left-0 w-72 rounded-2xl bg-[#111B21]/95 backdrop-blur-md border border-white/15 p-3.5 text-xs space-y-2 shadow-2xl">
            <div className="flex items-center justify-between border-b border-white/10 pb-1.5">
              <span className="font-bold text-[#06CF9C]">جودة النقل الفورية (WebRTC)</span>
              <span className="font-mono-code text-[10px] text-white/70">{activePresetMeta.label}</span>
            </div>
            <div className="grid grid-cols-2 gap-2 font-mono-code text-[11px]">
              <div className="bg-white/5 rounded-lg p-2">
                <span className="block text-[10px] text-white/50">الاستجابة (RTT)</span>
                <span className="font-bold">{telemetry.rttMs !== null ? `${telemetry.rttMs} ms` : 'مباشر'}</span>
              </div>
              <div className="bg-white/5 rounded-lg p-2">
                <span className="block text-[10px] text-white/50">فقد الحزم</span>
                <span className="font-bold">
                  {telemetry.packetLossPct !== null ? `${telemetry.packetLossPct}%` : '0%'}
                </span>
              </div>
              <div className="bg-white/5 rounded-lg p-2">
                <span className="block text-[10px] text-white/50">الدقة / الإطارات</span>
                <span className="font-bold">
                  {telemetry.resolution || (activeCall.callType === 'video' ? `${activePresetMeta.width}×${activePresetMeta.height}` : 'صوت فقط')}
                  {telemetry.fps ? ` @${telemetry.fps}` : ''}
                </span>
              </div>
              <div className="bg-white/5 rounded-lg p-2">
                <span className="block text-[10px] text-white/50">الترميز</span>
                <span className="font-bold truncate block">
                  {[telemetry.audioCodec || 'OPUS', telemetry.videoCodec].filter(Boolean).join(' / ')}
                </span>
              </div>
            </div>
          </div>
        )}
      </header>

      {/* Main Video / Voice Stage */}
      <div className="flex-1 flex flex-col items-center justify-center relative my-3 min-h-0">
        {isVideoEnabled && (hasRemoteVideo || hasLocalVideo) ? (
          <div className="w-full h-full max-w-4xl max-h-[70dvh] rounded-3xl overflow-hidden bg-[#111B21] border border-white/10 relative shadow-2xl">
            <video
              ref={remoteVideoRef}
              autoPlay
              muted={!hasRemoteVideo || swapStreams}
              playsInline
              className="w-full h-full object-cover"
            />

            {/* Corner Local Self-View Picture-in-Picture (Tap to swap) */}
            {hasRemoteVideo && hasLocalVideo && (
              <button
                type="button"
                onClick={() => setSwapStreams((v) => !v)}
                aria-label="تبديل عرض الكاميرا المحلية والبعيدة"
                className="w-28 sm:w-36 aspect-[3/4] sm:aspect-video rounded-2xl overflow-hidden border-2 border-white/40 shadow-xl bg-black absolute top-3 right-3 cursor-pointer hover:scale-[1.02] transition-transform"
              >
                <video
                  ref={localVideoRef}
                  autoPlay
                  muted
                  playsInline
                  className="w-full h-full object-cover"
                />
              </button>
            )}

            <div className="absolute bottom-3 right-3 left-3 flex items-center justify-between pointer-events-none">
              <div className="bg-black/60 backdrop-blur-md px-3.5 py-1.5 rounded-full text-xs font-medium flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-[#06CF9C]" />
                <span>
                  {peerName} · {callState === 'connected' ? formatCallDuration(elapsedSec) : 'جاري الاتصال...'}
                </span>
              </div>
              {isScreenSharing && (
                <span className="bg-[var(--wa-accent)] px-3 py-1 rounded-full text-[11px] font-bold">
                  مشاركة الشاشة نشطة
                </span>
              )}
            </div>
          </div>
        ) : (
          <div className="flex flex-col items-center text-center">
            <div className="relative">
              <div
                className={`absolute -inset-4 rounded-full border-2 border-[#00A884]/40 ${
                  callState !== 'connected' ? 'animate-ping' : ''
                }`}
              />
              <Avatar src={peerAvatar} name={peerName} size="xl" />
            </div>

            <h2 className="mt-6 font-display text-2xl sm:text-3xl font-bold">{peerName}</h2>
            <p className="mt-2 text-sm text-[#06CF9C] font-mono-code font-semibold">
              {callState === 'ringing'
                ? activeCall.direction === 'incoming'
                  ? 'مكالمة واردة...'
                  : 'جاري الرنين...'
                : callState === 'connecting'
                  ? 'جاري تأمين قناة الصوت والصورة...'
                  : `متصل · ${formatCallDuration(elapsedSec)}`}
            </p>
            <p className="mt-1 text-xs text-white/60">
              {activeCall.callType === 'video' ? 'مكالمة مرئية فائقة الدقة (HD)' : 'مكالمة صوتية ستيريو Opus 48kHz'}
            </p>

            {/* Real-time Audio Waveform Bars */}
            {callState === 'connected' && (
              <div
                aria-hidden="true"
                className="mt-6 flex items-end justify-center gap-1.5 h-10"
              >
                {voiceLevels.map((lvl, idx) => (
                  <span
                    key={idx}
                    style={{ height: `${lvl}%` }}
                    className="w-1.5 rounded-full bg-[#06CF9C] transition-all duration-100"
                  />
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Bottom Ergonomic Controls Dock */}
      {activeCall.direction === 'incoming' && callState === 'ringing' ? (
        <div className="relative z-20 flex items-center justify-center gap-6 pb-safe pb-3">
          <button
            type="button"
            onClick={() => void handleDeclineIncoming()}
            className="min-h-[54px] px-7 rounded-full bg-red-600 hover:bg-red-700 text-white font-bold text-sm flex items-center gap-2 shadow-lg cursor-pointer"
          >
            <PhoneOff className="w-5 h-5" aria-hidden="true" />
            <span>رفض</span>
          </button>
          <button
            type="button"
            onClick={() => void handleAcceptIncomingCall()}
            className="min-h-[54px] px-7 rounded-full bg-[#00A884] hover:brightness-95 text-white font-bold text-sm flex items-center gap-2 shadow-lg animate-pulse cursor-pointer"
          >
            {activeCall.callType === 'video' ? (
              <Video className="w-5 h-5" aria-hidden="true" />
            ) : (
              <Phone className="w-5 h-5" aria-hidden="true" />
            )}
            <span>قبول المكالمة</span>
          </button>
        </div>
      ) : (
        <div className="relative z-20 flex flex-wrap items-center justify-center gap-3 sm:gap-4 pb-safe pb-2">
          <button
            type="button"
            aria-label={isSpeakerOn ? 'إيقاف مكبر الصوت' : 'تشغيل مكبر الصوت'}
            onClick={() => setIsSpeakerOn((v) => !v)}
            className={`w-12 h-12 rounded-full flex items-center justify-center transition-colors cursor-pointer ${
              isSpeakerOn ? 'bg-white/15 hover:bg-white/25' : 'bg-white/5 text-white/50'
            }`}
          >
            {isSpeakerOn ? <Volume2 className="w-5 h-5" /> : <VolumeX className="w-5 h-5" />}
          </button>

          <button
            type="button"
            aria-label={isVideoEnabled ? 'إيقاف الكاميرا' : 'تشغيل الكاميرا'}
            onClick={toggleVideo}
            className={`w-12 h-12 rounded-full flex items-center justify-center transition-colors cursor-pointer ${
              isVideoEnabled ? 'bg-white/15 hover:bg-white/25' : 'bg-white/5 text-white/50'
            }`}
          >
            {isVideoEnabled ? <Video className="w-5 h-5" /> : <VideoOff className="w-5 h-5" />}
          </button>

          {activeCall.callType === 'video' && (
            <button
              type="button"
              aria-label="تبديل الكاميرا الأمامية والخلفية"
              onClick={() => void handleSwitchCamera()}
              className="w-12 h-12 rounded-full bg-white/15 hover:bg-white/25 flex items-center justify-center transition-colors cursor-pointer"
            >
              <RefreshCw className="w-5 h-5" aria-hidden="true" />
            </button>
          )}

          <button
            type="button"
            aria-label={isMuted ? 'إلغاء كتم الميكروفون' : 'كتم الميكروفون'}
            onClick={toggleMute}
            className={`w-12 h-12 rounded-full flex items-center justify-center transition-colors cursor-pointer ${
              isMuted ? 'bg-white text-[#111B21]' : 'bg-white/15 hover:bg-white/25'
            }`}
          >
            {isMuted ? <MicOff className="w-5 h-5" /> : <Mic className="w-5 h-5" />}
          </button>

          <button
            type="button"
            aria-label={isScreenSharing ? 'إيقاف مشاركة الشاشة' : 'مشاركة الشاشة'}
            onClick={() => void toggleScreenShare()}
            className={`hidden sm:flex w-12 h-12 rounded-full items-center justify-center transition-colors cursor-pointer ${
              isScreenSharing ? 'bg-[#00A884] text-white' : 'bg-white/15 hover:bg-white/25'
            }`}
          >
            <MonitorUp className="w-5 h-5" />
          </button>

          <button
            type="button"
            aria-label="إنهاء المكالمة"
            onClick={() => {
              finishedRef.current = true;
              onEndCall(elapsedSec, elapsedSec > 0 ? 'ended' : 'missed', false);
            }}
            className="w-16 h-12 rounded-full bg-red-600 hover:bg-red-700 text-white flex items-center justify-center transition-colors cursor-pointer shadow-lg"
          >
            <PhoneOff className="w-5 h-5" aria-hidden="true" />
          </button>
        </div>
      )}
    </div>
  );
}
