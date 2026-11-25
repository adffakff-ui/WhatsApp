import { useEffect, useRef, useState } from 'react';
import {
  Activity,
  AudioLines,
  Headphones,
  Lock,
  Mic,
  MicOff,
  MonitorUp,
  Music,
  Phone,
  PhoneOff,
  RefreshCw,
  SlidersHorizontal,
  Sparkles,
  Square,
  SunMedium,
  SwitchCamera,
  Video,
  VideoOff,
  Volume2,
  VolumeX,
  X
} from 'lucide-react';
import { Avatar } from './Avatar';
import { formatCallDuration, isRemoteFirebaseUid } from '../lib/chatLogic';
import {
  computeNormalizedBandLevels,
  createMixedAudioRelay,
  createRemoteAudioEnhancer,
  isSpeechActiveFromLevels,
  LISTENING_BOOST_PRESETS,
  type ListeningBoostLevel,
  type MixedAudioRelaySession,
  type RemoteAudioEnhancerHandle
} from '../lib/callAudioEngine';
import {
  calculateAutoExposureFromLuminance,
  computeMeanLuminance,
  DEFAULT_AUTO_EXPOSURE,
  formatAutoExposureCssFilter,
  smoothAutoExposure,
  type AutoExposureSettings
} from '../lib/videoAutoExposure';
import {
  acquireCallMediaStream,
  acquireCameraVideoTrack,
  applySenderQualityPreset,
  buildCameraSwitchConstraints,
  buildMediaConstraints,
  buildRtcConfiguration,
  CALL_QUALITY_PRESETS,
  enhanceSdpMediaQuality,
  extractTelemetryFromRtcStats,
  findVideoSender,
  prioritizeOpusAudioCodec,
  resolveTrackFacingMode,
  type CallTelemetryStats,
  type CameraFacingMode
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
  onCallAccepted?: (callId: string) => void;
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
  onCallAccepted,
  onEndCall
}: CallOverlayProps) {
  const isP2PRemoteCall =
    isCloudSynced &&
    isRemoteFirebaseUid(
      activeCall.direction === 'outgoing' ? activeCall.calleeId : activeCall.callerId
    );

  const initialCallState: 'ringing' | 'connecting' | 'connected' =
    activeCall.direction === 'incoming' ? 'ringing' : isP2PRemoteCall ? 'connecting' : 'ringing';

  const [callState, setCallState] = useState<'ringing' | 'connecting' | 'connected'>(
    initialCallState
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
  const [hasRemoteAudio, setHasRemoteAudio] = useState(false);
  const [audioPlayBlocked, setAudioPlayBlocked] = useState(false);
  const [streamTick, setStreamTick] = useState(0);
  const [swapStreams, setSwapStreams] = useState(false);
  const [isAutoExposureEnabled, setIsAutoExposureEnabled] = useState(true);
  const [remoteExposure, setRemoteExposure] = useState<AutoExposureSettings>(
    DEFAULT_AUTO_EXPOSURE
  );
  const [showStatsHud, setShowStatsHud] = useState(false);
  const [showAudioStudioPanel, setShowAudioStudioPanel] = useState(false);
  const [isVoiceClarityOn, setIsVoiceClarityOn] = useState(true);
  const [listeningBoost, setListeningBoost] = useState<ListeningBoostLevel>('clear');
  const [audioInputs, setAudioInputs] = useState<MediaDeviceInfo[]>([]);
  const [audioOutputs, setAudioOutputs] = useState<MediaDeviceInfo[]>([]);
  const [videoInputs, setVideoInputs] = useState<MediaDeviceInfo[]>([]);
  const [selectedMicId, setSelectedMicId] = useState<string>('');
  const [selectedSpeakerId, setSelectedSpeakerId] = useState<string>('');
  const [selectedCameraId, setSelectedCameraId] = useState<string>('');
  const [isSwitchingCamera, setIsSwitchingCamera] = useState(false);
  const [cameraSwitchNotice, setCameraSwitchNotice] = useState<{
    text: string;
    tone: 'info' | 'warn';
  } | null>(null);
  const [sharedAudioClipName, setSharedAudioClipName] = useState<string | null>(null);
  const [audioTransferError, setAudioTransferError] = useState<string | null>(null);
  const [peerAudioState, setPeerAudioState] = useState<{
    isMuted: boolean;
    sharingAudioClip: string | null;
  }>({ isMuted: false, sharingAudioClip: null });
  const [iceStatusLabel, setIceStatusLabel] = useState(
    isP2PRemoteCall ? 'جاري تهيئة قناة P2P...' : 'اتصال محلي مشفر'
  );
  const [voiceLevels, setVoiceLevels] = useState<number[]>([20, 32, 44, 28, 18]);
  const [remoteVoiceLevels, setRemoteVoiceLevels] = useState<number[]>([16, 18, 22, 18, 16]);
  const [telemetry, setTelemetry] = useState<CallTelemetryStats>({
    rttMs: null,
    packetLossPct: null,
    resolution: null,
    fps: null,
    audioCodec: null,
    videoCodec: null
  });
  const remoteExposureRef = useRef<AutoExposureSettings>(DEFAULT_AUTO_EXPOSURE);

  const localVideoRef = useRef<HTMLVideoElement>(null);
  const remoteVideoRef = useRef<HTMLVideoElement>(null);
  const remoteAudioRef = useRef<HTMLAudioElement>(null);
  const sharedAudioElRef = useRef<HTMLAudioElement>(null);
  const sharedAudioInputRef = useRef<HTMLInputElement>(null);
  const sharedAudioObjectUrlRef = useRef<string | null>(null);
  const mixedAudioRelayRef = useRef<MixedAudioRelaySession | null>(null);
  const remoteEnhancerRef = useRef<RemoteAudioEnhancerHandle | null>(null);
  const dataChannelRef = useRef<RTCDataChannel | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const rawMicTrackRef = useRef<MediaStreamTrack | null>(null);
  const remoteStreamRef = useRef<MediaStream | null>(null);
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const pendingIceCandidatesRef = useRef<RTCIceCandidateInit[]>([]);
  const pendingOutgoingIceRef = useRef<RTCIceCandidateInit[]>([]);
  const callDocCreatedRef = useRef(activeCall.direction === 'incoming');
  const localTracksAttachedRef = useRef(false);
  const lastAppliedRemoteSdpRef = useRef<string>('');
  const finishedRef = useRef(false);
  const elapsedSecRef = useRef(0);
  const callStateRef = useRef<'ringing' | 'connecting' | 'connected'>(initialCallState);
  const hasRemoteVideoRef = useRef(false);
  const hasLocalVideoRef = useRef(false);
  const isVideoEnabledRef = useRef(activeCall.callType === 'video');
  const isSpeakerOnRef = useRef(true);
  const swapStreamsRef = useRef(false);
  const facingModeRef = useRef<CameraFacingMode>('user');
  const isSwitchingCameraRef = useRef(false);
  const cameraNoticeTimerRef = useRef<number | null>(null);
  const startCalleeRef = useRef<(() => Promise<void>) | null>(null);

  useEffect(() => {
    elapsedSecRef.current = elapsedSec;
  }, [elapsedSec]);

  useEffect(() => {
    callStateRef.current = callState;
  }, [callState]);

  useEffect(() => {
    hasRemoteVideoRef.current = hasRemoteVideo;
  }, [hasRemoteVideo]);

  useEffect(() => {
    hasLocalVideoRef.current = hasLocalVideo;
  }, [hasLocalVideo]);

  useEffect(() => {
    isVideoEnabledRef.current = isVideoEnabled;
  }, [isVideoEnabled]);

  useEffect(() => {
    isSpeakerOnRef.current = isSpeakerOn;
  }, [isSpeakerOn]);

  useEffect(() => {
    swapStreamsRef.current = swapStreams;
  }, [swapStreams]);

  useEffect(() => {
    facingModeRef.current = facingMode;
  }, [facingMode]);

  const showCameraNotice = (text: string, tone: 'info' | 'warn' = 'info') => {
    if (cameraNoticeTimerRef.current) {
      window.clearTimeout(cameraNoticeTimerRef.current);
      cameraNoticeTimerRef.current = null;
    }
    setCameraSwitchNotice({ text, tone });
    cameraNoticeTimerRef.current = window.setTimeout(() => {
      cameraNoticeTimerRef.current = null;
      setCameraSwitchNotice(null);
    }, 2600);
  };

  const peerName =
    activeCall.direction === 'outgoing' ? activeCall.calleeName : activeCall.callerName;
  const peerAvatar =
    activeCall.direction === 'outgoing' ? activeCall.calleeAvatar : activeCall.callerAvatar;

  const syncPeerMetaChannel = (
    overrides?: Partial<{ isMuted: boolean; sharingAudioClip: string | null }>
  ) => {
    const ch = dataChannelRef.current;
    if (!ch || ch.readyState !== 'open') return;
    try {
      ch.send(
        JSON.stringify({
          type: 'audio-state',
          isMuted: overrides?.isMuted ?? isMuted,
          sharingAudioClip:
            overrides && 'sharingAudioClip' in overrides
              ? overrides.sharingAudioClip
              : sharedAudioClipName
        })
      );
    } catch {
      // Ignore transient datachannel send failures
    }
  };

  const refreshAudioDevices = async () => {
    if (!navigator.mediaDevices?.enumerateDevices) return;
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      setAudioInputs(devices.filter((d) => d.kind === 'audioinput'));
      setAudioOutputs(devices.filter((d) => d.kind === 'audiooutput'));
      setVideoInputs(devices.filter((d) => d.kind === 'videoinput'));
      const activeCamId = localStreamRef.current?.getVideoTracks()[0]?.getSettings?.().deviceId;
      if (activeCamId) {
        setSelectedCameraId(activeCamId);
      }
    } catch {
      // Ignore permission-restricted enumeration
    }
  };

  useEffect(() => {
    const enhancer = createRemoteAudioEnhancer({
      clarityEnabled: isVoiceClarityOn,
      boostLevel: listeningBoost
    });
    remoteEnhancerRef.current = enhancer;
    void refreshAudioDevices();

    const handleDeviceChange = () => {
      void refreshAudioDevices();
    };
    navigator.mediaDevices?.addEventListener?.('devicechange', handleDeviceChange);

    return () => {
      if (cameraNoticeTimerRef.current) {
        window.clearTimeout(cameraNoticeTimerRef.current);
        cameraNoticeTimerRef.current = null;
      }
      navigator.mediaDevices?.removeEventListener?.('devicechange', handleDeviceChange);
      enhancer?.dispose();
      remoteEnhancerRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    remoteEnhancerRef.current?.setOptions({
      clarityEnabled: isVoiceClarityOn,
      boostLevel: listeningBoost
    });
  }, [isVoiceClarityOn, listeningBoost]);

  const tryPlayRemoteAudio = () => {
    const audioEl = remoteAudioRef.current;
    const remoteStream = remoteStreamRef.current;
    if (!audioEl || !remoteStream) return;

    const liveAudioTracks = remoteStream.getAudioTracks().filter((t) => t.readyState === 'live');
    const enhancer = remoteEnhancerRef.current;
    if (enhancer && liveAudioTracks.length > 0) {
      enhancer.updateStream(remoteStream);
      void enhancer.resume();
    }

    const processedStream =
      enhancer && liveAudioTracks.length > 0 ? enhancer.getProcessedStream() : null;
    const targetAudioStream =
      processedStream && processedStream.getAudioTracks().length > 0
        ? processedStream
        : remoteStream;

    if (audioEl.srcObject !== targetAudioStream) {
      audioEl.srcObject = targetAudioStream;
    }
    audioEl.volume = 1;
    audioEl.muted = !isSpeakerOnRef.current;
    if (liveAudioTracks.length > 0 || remoteStream.getAudioTracks().length > 0) {
      void audioEl
        .play()
        .then(() => {
          setAudioPlayBlocked(false);
        })
        .catch((err: unknown) => {
          const name = err instanceof Error ? err.name : '';
          if (name === 'NotAllowedError') {
            setAudioPlayBlocked(true);
          }
        });
    }
  };

  const attachVideoStreams = (forceRefreshLocal = false) => {
    const mainEl = remoteVideoRef.current;
    const pipEl = localVideoRef.current;
    const localStream = localStreamRef.current;
    const remoteStream = remoteStreamRef.current;
    const remoteVidLive = hasRemoteVideoRef.current;
    const localVidLive = hasLocalVideoRef.current && isVideoEnabledRef.current;
    const isSwapped = swapStreamsRef.current && remoteVidLive && localVidLive;

    const mainTarget = isSwapped ? localStream : remoteVidLive ? remoteStream : null;
    const pipTarget = isSwapped ? remoteStream : localVidLive ? localStream : null;

    if (mainEl) {
      if (mainEl.srcObject !== mainTarget || (forceRefreshLocal && isSwapped)) {
        if (forceRefreshLocal && isSwapped) {
          mainEl.srcObject = null;
        }
        mainEl.srcObject = mainTarget;
      }
      if (mainTarget) {
        void mainEl.play().catch(() => {});
      }
    }

    if (pipEl) {
      if (pipEl.srcObject !== pipTarget || (forceRefreshLocal && !isSwapped)) {
        if (forceRefreshLocal && !isSwapped) {
          pipEl.srcObject = null;
        }
        pipEl.srcObject = pipTarget;
      }
      if (pipTarget) {
        void pipEl.play().catch(() => {});
      }
    }
  };

  useEffect(() => {
    attachVideoStreams();
    tryPlayRemoteAudio();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasLocalVideo, hasRemoteVideo, hasRemoteAudio, swapStreams, isVideoEnabled, callState, streamTick]);

  useEffect(() => {
    if (remoteAudioRef.current) {
      remoteAudioRef.current.muted = !isSpeakerOn;
      if (isSpeakerOn && remoteStreamRef.current?.getAudioTracks().length) {
        void remoteAudioRef.current
          .play()
          .then(() => setAudioPlayBlocked(false))
          .catch(() => {});
      }
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

  // Real-Time Local & Remote Audio Energy Visualizers via Web Audio API
  useEffect(() => {
    const stream = localStreamRef.current;
    const hasLocalAudio = Boolean(stream && stream.getAudioTracks().length > 0 && !isMuted);
    if (!hasLocalAudio) {
      setVoiceLevels([16, 18, 22, 18, 16]);
    }

    let rafId = 0;
    let audioCtx: AudioContext | null = null;
    let analyser: AnalyserNode | null = null;
    let data: Uint8Array<ArrayBuffer> | null = null;

    if (hasLocalAudio && stream) {
      try {
        const AudioCtx =
          window.AudioContext ||
          (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
        if (AudioCtx) {
          audioCtx = new AudioCtx();
          const source = audioCtx.createMediaStreamSource(
            new MediaStream(stream.getAudioTracks())
          );
          analyser = audioCtx.createAnalyser();
          analyser.fftSize = 64;
          analyser.smoothingTimeConstant = 0.7;
          source.connect(analyser);
          data = new Uint8Array(analyser.frequencyBinCount) as Uint8Array<ArrayBuffer>;
        }
      } catch {
        // Headless fallback
      }
    }

    const tick = () => {
      if (analyser && data) {
        analyser.getByteFrequencyData(data);
        setVoiceLevels(computeNormalizedBandLevels(data, 5, 16));
      }
      if (remoteEnhancerRef.current && hasRemoteAudio) {
        setRemoteVoiceLevels(remoteEnhancerRef.current.getBandLevels());
      } else {
        setRemoteVoiceLevels([16, 18, 20, 18, 16]);
      }
      rafId = window.requestAnimationFrame(tick);
    };

    if (hasLocalAudio || hasRemoteAudio) {
      rafId = window.requestAnimationFrame(tick);
    }

    return () => {
      if (rafId) window.cancelAnimationFrame(rafId);
      void audioCtx?.close().catch(() => {});
    };
  }, [hasLocalVideo, hasRemoteAudio, isMuted, callState, streamTick]);

  // Unified WebRTC Setup & Firestore Signaling Lifecycle (Caller + Callee)
  useEffect(() => {
    let cancelled = false;
    let unsubCallDoc: (() => void) | null = null;
    let unsubIce: (() => void) | null = null;
    let statsTimer: number | null = null;
    let ringTimeoutTimer: number | null = null;
    let disconnectGraceTimer: number | null = null;
    let restartAttempts = 0;
    let isRestartingIce = false;

    const cleanup = () => {
      cancelled = true;
      unsubCallDoc?.();
      unsubIce?.();
      if (statsTimer) window.clearInterval(statsTimer);
      if (ringTimeoutTimer) window.clearTimeout(ringTimeoutTimer);
      if (disconnectGraceTimer) window.clearTimeout(disconnectGraceTimer);
      mixedAudioRelayRef.current?.stop();
      mixedAudioRelayRef.current = null;
      if (sharedAudioObjectUrlRef.current) {
        URL.revokeObjectURL(sharedAudioObjectUrlRef.current);
        sharedAudioObjectUrlRef.current = null;
      }
      dataChannelRef.current?.close();
      dataChannelRef.current = null;
      rawMicTrackRef.current?.stop();
      rawMicTrackRef.current = null;
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

    const flushOutgoingCandidates = async () => {
      if (!callDocCreatedRef.current || !isP2PRemoteCall) return;
      while (pendingOutgoingIceRef.current.length > 0) {
        const cand = pendingOutgoingIceRef.current.shift();
        if (cand) {
          await sendIceCandidateToFirestore(
            activeCall.id,
            activeCall.callerId,
            activeCall.calleeId,
            myUid,
            cand
          ).catch(() => {});
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
      localTracksAttachedRef.current = false;

      const pc = new RTCPeerConnection(buildRtcConfiguration());
      pcRef.current = pc;

      const bindMetaDataChannel = (channel: RTCDataChannel) => {
        dataChannelRef.current = channel;
        channel.onopen = () => {
          syncPeerMetaChannel();
        };
        channel.onmessage = (ev) => {
          try {
            const msg = JSON.parse(String(ev.data)) as {
              type?: string;
              isMuted?: boolean;
              sharingAudioClip?: string | null;
            };
            if (msg.type === 'audio-state') {
              setPeerAudioState({
                isMuted: Boolean(msg.isMuted),
                sharingAudioClip:
                  typeof msg.sharingAudioClip === 'string' ? msg.sharingAudioClip : null
              });
            }
          } catch {
            // Ignore malformed control payload
          }
        };
      };

      if (role === 'caller') {
        try {
          bindMetaDataChannel(pc.createDataChannel('wasil-call-meta', { ordered: true }));
        } catch {
          // Ignore if datachannel unavailable
        }
      } else {
        pc.ondatachannel = (event) => {
          if (event.channel.label === 'wasil-call-meta') {
            bindMetaDataChannel(event.channel);
          }
        };
      }

      const remoteStream = new MediaStream();
      remoteStreamRef.current = remoteStream;

      const triggerCallerIceRestart = async () => {
        if (
          cancelled ||
          finishedRef.current ||
          !isP2PRemoteCall ||
          role !== 'caller' ||
          isRestartingIce ||
          restartAttempts >= 3 ||
          pc.signalingState === 'closed'
        ) {
          return;
        }
        isRestartingIce = true;
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
        } finally {
          isRestartingIce = false;
        }
      };

      const syncConnectionHealth = () => {
        if (cancelled || finishedRef.current) return;
        const ice = pc.iceConnectionState;
        const conn = pc.connectionState;

        if (ice === 'connected' || ice === 'completed' || conn === 'connected') {
          if (disconnectGraceTimer) {
            window.clearTimeout(disconnectGraceTimer);
            disconnectGraceTimer = null;
          }
          restartAttempts = 0;
          callStateRef.current = 'connected';
          setCallState('connected');
          setIceStatusLabel('متصل P2P فائق الوضوح');
          return;
        }

        if (ice === 'checking' || conn === 'connecting') {
          if (disconnectGraceTimer) {
            window.clearTimeout(disconnectGraceTimer);
            disconnectGraceTimer = null;
          }
          setIceStatusLabel('جاري تأمين مسار الصوت والصورة...');
          return;
        }

        if (ice === 'failed' || conn === 'failed') {
          if (disconnectGraceTimer) {
            window.clearTimeout(disconnectGraceTimer);
            disconnectGraceTimer = null;
          }
          setIceStatusLabel('ضعف الاتصال — إعادة الربط...');
          void triggerCallerIceRestart();
          return;
        }

        if (ice === 'disconnected' || conn === 'disconnected') {
          setIceStatusLabel('ضعف الاتصال — إعادة الربط...');
          if (!disconnectGraceTimer) {
            disconnectGraceTimer = window.setTimeout(() => {
              disconnectGraceTimer = null;
              if (
                !cancelled &&
                !finishedRef.current &&
                (pc.iceConnectionState === 'disconnected' ||
                  pc.iceConnectionState === 'failed' ||
                  pc.connectionState === 'disconnected' ||
                  pc.connectionState === 'failed')
              ) {
                void triggerCallerIceRestart();
              }
            }, 3500);
          }
        }
      };

      pc.ontrack = (event) => {
        const trackSet = new Map<string, MediaStreamTrack>();
        if (event.track) {
          trackSet.set(event.track.id, event.track);
        }
        event.streams[0]?.getTracks().forEach((t) => {
          trackSet.set(t.id, t);
        });

        trackSet.forEach((track) => {
          const existingSameId = remoteStream.getTracks().find((t) => t.id === track.id);
          if (!existingSameId) {
            remoteStream.addTrack(track);
          }
          if (track.kind === 'video' && track.readyState === 'live') {
            hasRemoteVideoRef.current = true;
            setHasRemoteVideo(true);
            track.onunmute = () => {
              hasRemoteVideoRef.current = true;
              setHasRemoteVideo(true);
              setStreamTick((t) => t + 1);
              attachVideoStreams();
            };
            track.onended = () => {
              const anyLive = remoteStream.getVideoTracks().some((t) => t.readyState === 'live');
              hasRemoteVideoRef.current = anyLive;
              setHasRemoteVideo(anyLive);
              setStreamTick((t) => t + 1);
              attachVideoStreams();
            };
          } else if (track.kind === 'audio' && track.readyState === 'live') {
            setHasRemoteAudio(true);
            track.onunmute = () => {
              setHasRemoteAudio(true);
              tryPlayRemoteAudio();
            };
          }
        });

        setStreamTick((t) => t + 1);
        tryPlayRemoteAudio();
        attachVideoStreams();
      };

      pc.oniceconnectionstatechange = syncConnectionHealth;
      pc.onconnectionstatechange = syncConnectionHealth;

      pc.onicecandidate = (event) => {
        if (!event.candidate || !isP2PRemoteCall) return;
        const candJson = event.candidate.toJSON();
        if (!callDocCreatedRef.current) {
          // Buffer until caller's calls/{callId} document exists so Firestore security rules allow candidate writes
          pendingOutgoingIceRef.current.push(candJson);
          return;
        }
        void sendIceCandidateToFirestore(
          activeCall.id,
          activeCall.callerId,
          activeCall.calleeId,
          myUid,
          candJson
        ).catch(() => {});
      };

      // Open HD Media Stream with relaxed mobile fallback and audio-only fallback
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
        rawMicTrackRef.current = acquired.stream.getAudioTracks()[0] || null;
        const initialVideoTrack = acquired.stream.getVideoTracks()[0];
        if (initialVideoTrack) {
          const initialFacing = resolveTrackFacingMode(initialVideoTrack, facingModeRef.current);
          facingModeRef.current = initialFacing;
          setFacingMode(initialFacing);
          const initialCamId = initialVideoTrack.getSettings?.().deviceId;
          if (initialCamId) {
            setSelectedCameraId(initialCamId);
          }
        }
        void refreshAudioDevices();
        const localHasVid = activeCall.callType === 'video' && acquired.hasVideo;
        hasLocalVideoRef.current = localHasVid;
        setHasLocalVideo(localHasVid);
        if (acquired.fallbackAudioOnly) {
          isVideoEnabledRef.current = false;
          setIsVideoEnabled(false);
          setIceStatusLabel('تم الاتصال بالصوت (الكاميرا غير متاحة)');
        }
        setStreamTick((t) => t + 1);
        attachVideoStreams();
      } else {
        hasLocalVideoRef.current = false;
        setHasLocalVideo(false);
      }

      const attachLocalTracksToPeer = async () => {
        if (localTracksAttachedRef.current) return;
        localTracksAttachedRef.current = true;
        const localStream = localStreamRef.current;

        if (localStream) {
          const transceivers = pc.getTransceivers();
          for (const track of localStream.getTracks()) {
            // Prefer binding into an open transceiver created by setRemoteDescription (callee path)
            const reusable = transceivers.find(
              (tr) =>
                !tr.sender.track &&
                tr.receiver.track?.kind === track.kind &&
                tr.direction !== 'stopped'
            );
            if (reusable && role === 'callee') {
              await reusable.sender.replaceTrack(track).catch(() => {});
              try {
                reusable.direction = 'sendrecv';
              } catch {
                // ignore if direction readonly
              }
            } else {
              pc.addTrack(track, localStream);
            }
          }
          prioritizeOpusAudioCodec(pc);
          await applySenderQualityPreset(pc, qualityPreset);
        }

        // Caller-side recvonly guard so audio/video m-lines always exist even without local mic/camera
        if (role === 'caller') {
          const hasAudioTransceiver = pc
            .getTransceivers()
            .some((t) => t.receiver.track?.kind === 'audio' || t.sender.track?.kind === 'audio');
          if (!hasAudioTransceiver) {
            try {
              pc.addTransceiver('audio', { direction: 'recvonly' });
            } catch {
              // ignore
            }
          }
          if (activeCall.callType === 'video') {
            const hasVideoTransceiver = pc
              .getTransceivers()
              .some((t) => t.receiver.track?.kind === 'video' || t.sender.track?.kind === 'video');
            if (!hasVideoTransceiver) {
              try {
                pc.addTransceiver('video', { direction: 'recvonly' });
              } catch {
                // ignore
              }
            }
          }
          prioritizeOpusAudioCodec(pc);
        }
      };

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
        await attachLocalTracksToPeer();
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
        callDocCreatedRef.current = true;
        await flushOutgoingCandidates();
        setIceStatusLabel('بانتظار رد الطرف الآخر...');

        // 45s timeout if unanswered (reads ref instead of stale closure state)
        ringTimeoutTimer = window.setTimeout(() => {
          if (
            !cancelled &&
            !finishedRef.current &&
            callStateRef.current !== 'connected' &&
            elapsedSecRef.current === 0
          ) {
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
                callStateRef.current = 'connected';
                setCallState('connected');
                setIceStatusLabel('جاري تأمين مسار الصوت والصورة...');
                syncConnectionHealth();
              } catch {
                // Ignore invalid SDP mismatch
              }
            }
          });
        }
      } else if (isP2PRemoteCall && role === 'callee') {
        callDocCreatedRef.current = true;
        const handleRemoteOffer = async (offerSdp: string) => {
          if (!offerSdp || offerSdp === lastAppliedRemoteSdpRef.current) return;
          lastAppliedRemoteSdpRef.current = offerSdp;
          try {
            // Set remote offer FIRST so Unified Plan transceivers match the caller's m= lines cleanly
            await pc.setRemoteDescription({ type: 'offer', sdp: offerSdp });
            await attachLocalTracksToPeer();
            await flushPendingCandidates(pc);
            const answer = await pc.createAnswer();
            const tunedAnswerSdp = enhanceSdpMediaQuality(answer.sdp || '', qualityPreset);
            await pc.setLocalDescription({ type: 'answer', sdp: tunedAnswerSdp });
            await applySenderQualityPreset(pc, qualityPreset);
            await answerIncomingCallInFirestore(activeCall.id, tunedAnswerSdp);
            callStateRef.current = 'connected';
            setCallState('connected');
            setIceStatusLabel('جاري تأمين مسار الصوت والصورة...');
            syncConnectionHealth();
          } catch {
            callStateRef.current = 'connected';
            setCallState('connected');
            setIceStatusLabel('تعذر مطابقة التشفير — إعادة المحاولة...');
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
        setIceStatusLabel('تعذر بدء الاتصال السحابي بالطرف الآخر');
        ringTimeoutTimer = window.setTimeout(() => {
          if (!cancelled && !finishedRef.current) {
            finishedRef.current = true;
            onEndCall(0, 'missed', true);
          }
        }, 3000);
      }

      return pc;
    }

    startCalleeRef.current = async () => {
      callStateRef.current = 'connecting';
      setCallState('connecting');
      setIceStatusLabel('جاري الرد وتأمين الاتصال...');
      await startPeerConnection('callee');
    };

    if (activeCall.direction === 'outgoing') {
      void startPeerConnection('caller');
    } else {
      // Buffer ICE candidates early while ringing & watch for caller hangup or answer on another device
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
            return;
          }
          if (docUpdate.status === 'connected' && callStateRef.current === 'ringing') {
            finishedRef.current = true;
            onEndCall(0, 'ended', true);
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

  // Real-time Auto-Exposure luminance sampling on the remote participant's video feed
  useEffect(() => {
    if (!isAutoExposureEnabled || !hasRemoteVideo) {
      remoteExposureRef.current = DEFAULT_AUTO_EXPOSURE;
      setRemoteExposure(DEFAULT_AUTO_EXPOSURE);
      return;
    }

    const sampleCanvas = document.createElement('canvas');
    sampleCanvas.width = 48;
    sampleCanvas.height = 36;
    const ctx = sampleCanvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return;

    const analyzeFrame = () => {
      const remoteEl =
        swapStreamsRef.current && hasLocalVideoRef.current && isVideoEnabledRef.current
          ? localVideoRef.current
          : remoteVideoRef.current;

      if (
        !remoteEl ||
        remoteEl.readyState < 2 ||
        remoteEl.videoWidth === 0 ||
        remoteEl.videoHeight === 0
      ) {
        return;
      }

      try {
        ctx.drawImage(remoteEl, 0, 0, sampleCanvas.width, sampleCanvas.height);
        const frameData = ctx.getImageData(0, 0, sampleCanvas.width, sampleCanvas.height).data;
        const meanLuminance = computeMeanLuminance(frameData, 2);
        const target = calculateAutoExposureFromLuminance(meanLuminance);
        const smoothed = smoothAutoExposure(remoteExposureRef.current, target, 0.28);
        remoteExposureRef.current = smoothed;
        setRemoteExposure(smoothed);
      } catch {
        // Ignore transient canvas read failure while video surface rebinds
      }
    };

    analyzeFrame();
    const timer = window.setInterval(analyzeFrame, 280);
    return () => window.clearInterval(timer);
  }, [isAutoExposureEnabled, hasRemoteVideo, swapStreams, isVideoEnabled, streamTick]);

  const handleAcceptIncomingCall = async () => {
    // Synchronously unlock audio & Web Audio DSP context before async signaling
    void remoteEnhancerRef.current?.resume();
    if (remoteAudioRef.current) {
      remoteAudioRef.current.muted = !isSpeakerOn;
      void remoteAudioRef.current.play().catch(() => {});
    }
    callStateRef.current = 'connecting';
    onCallAccepted?.(activeCall.id);
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
    rawMicTrackRef.current && (rawMicTrackRef.current.enabled = !next);
    localStreamRef.current?.getAudioTracks().forEach((t) => {
      t.enabled = !next;
    });
    syncPeerMetaChannel({ isMuted: next });
  };

  const handleSelectMicDevice = async (deviceId: string) => {
    setSelectedMicId(deviceId);
    setAudioTransferError(null);
    if (!navigator.mediaDevices?.getUserMedia) return;
    try {
      const nextStream = await navigator.mediaDevices.getUserMedia(
        buildMediaConstraints('audio', qualityPreset, facingMode, deviceId)
      );
      const newTrack = nextStream.getAudioTracks()[0];
      if (!newTrack) return;
      newTrack.enabled = !isMuted;

      const oldTrack = rawMicTrackRef.current || localStreamRef.current?.getAudioTracks()[0];
      if (oldTrack && oldTrack !== newTrack) {
        oldTrack.stop();
        localStreamRef.current?.removeTrack(oldTrack);
      }
      rawMicTrackRef.current = newTrack;
      if (!localStreamRef.current) {
        localStreamRef.current = new MediaStream();
      }
      localStreamRef.current.addTrack(newTrack);

      const audioSender = pcRef.current
        ?.getSenders()
        .find((s) => s.track?.kind === 'audio');
      if (audioSender && !mixedAudioRelayRef.current) {
        await audioSender.replaceTrack(newTrack);
        await applySenderQualityPreset(pcRef.current!, qualityPreset);
      }
      setStreamTick((t) => t + 1);
    } catch {
      setAudioTransferError('تعذر التبديل إلى الميكروفون المحدد.');
    }
  };

  const handleSelectSpeakerDevice = async (deviceId: string) => {
    setSelectedSpeakerId(deviceId);
    setAudioTransferError(null);
    const audioEl = remoteAudioRef.current as
      | (HTMLAudioElement & { setSinkId?: (id: string) => Promise<void> })
      | null;
    if (!audioEl || typeof audioEl.setSinkId !== 'function') {
      setAudioTransferError('تبديل مخرج السماعة غير مدعوم في هذا المتصفح.');
      return;
    }
    try {
      await audioEl.setSinkId(deviceId);
    } catch {
      setAudioTransferError('تعذر توجيه الصوت إلى السماعة المحددة.');
    }
  };

  const handleStopSharedAudioTransfer = async () => {
    mixedAudioRelayRef.current?.stop();
    mixedAudioRelayRef.current = null;
    if (sharedAudioElRef.current) {
      sharedAudioElRef.current.pause();
      sharedAudioElRef.current.removeAttribute('src');
    }
    if (sharedAudioObjectUrlRef.current) {
      URL.revokeObjectURL(sharedAudioObjectUrlRef.current);
      sharedAudioObjectUrlRef.current = null;
    }
    setSharedAudioClipName(null);
    syncPeerMetaChannel({ sharingAudioClip: null });

    const micTrack = rawMicTrackRef.current || localStreamRef.current?.getAudioTracks()[0] || null;
    const audioSender = pcRef.current?.getSenders().find((s) => s.track?.kind === 'audio');
    if (audioSender && micTrack) {
      await audioSender.replaceTrack(micTrack).catch(() => {});
    }
  };

  const handlePickAudioFileToTransfer = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setAudioTransferError(null);
    await handleStopSharedAudioTransfer();

    const audioEl = sharedAudioElRef.current;
    if (!audioEl) return;

    try {
      const objUrl = URL.createObjectURL(file);
      sharedAudioObjectUrlRef.current = objUrl;
      audioEl.src = objUrl;
      audioEl.loop = false;

      const micTrack = rawMicTrackRef.current || localStreamRef.current?.getAudioTracks()[0] || null;
      const relay = createMixedAudioRelay(micTrack, audioEl);
      if (!relay) {
        setAudioTransferError('تعذر بدء نقل الصوت المباشر عبر المتصفح.');
        URL.revokeObjectURL(objUrl);
        sharedAudioObjectUrlRef.current = null;
        return;
      }

      mixedAudioRelayRef.current = relay;
      const audioSender = pcRef.current?.getSenders().find((s) => s.track?.kind === 'audio');
      if (audioSender) {
        await audioSender.replaceTrack(relay.mixedTrack);
      } else if (pcRef.current) {
        pcRef.current.addTrack(relay.mixedTrack, new MediaStream([relay.mixedTrack]));
      }

      audioEl.onended = () => {
        void handleStopSharedAudioTransfer();
      };
      await audioEl.play();
      const shortName = file.name.slice(0, 36);
      setSharedAudioClipName(shortName);
      syncPeerMetaChannel({ sharingAudioClip: shortName });
    } catch {
      setAudioTransferError('تعذر تشغيل ونقل الملف الصوتي المختار.');
      await handleStopSharedAudioTransfer();
    }
  };

  const toggleVideo = async () => {
    const next = !isVideoEnabled;
    isVideoEnabledRef.current = next;
    setIsVideoEnabled(next);

    const existingTracks = (localStreamRef.current?.getVideoTracks() || []).filter(
      (t) => t.readyState === 'live'
    );
    if (existingTracks.length > 0) {
      existingTracks.forEach((t) => {
        t.enabled = next;
      });
      attachVideoStreams();
      return;
    }

    if (next && navigator.mediaDevices?.getUserMedia && activeCall.callType === 'video') {
      try {
        let camStream: MediaStream;
        try {
          camStream = await navigator.mediaDevices.getUserMedia(
            buildCameraSwitchConstraints(qualityPreset, {
              facingMode: facingModeRef.current,
              deviceId: selectedCameraId || undefined
            })
          );
        } catch {
          camStream = await navigator.mediaDevices.getUserMedia(
            buildCameraSwitchConstraints(qualityPreset, {
              facingMode: facingModeRef.current,
              relaxedResolution: true
            })
          );
        }
        camStream.getAudioTracks().forEach((t) => t.stop());
        const camTrack = camStream.getVideoTracks()[0];
        if (camTrack) {
          if (!localStreamRef.current) {
            localStreamRef.current = new MediaStream();
          }
          localStreamRef.current.getVideoTracks().forEach((t) => {
            t.stop();
            localStreamRef.current?.removeTrack(t);
          });
          localStreamRef.current.addTrack(camTrack);

          const videoSender = findVideoSender(pcRef.current);
          const videoTransceiver = pcRef.current
            ?.getTransceivers()
            .find((tr) => tr.receiver.track?.kind === 'video' || tr.sender === videoSender);
          if (videoSender) {
            await videoSender.replaceTrack(camTrack);
            if (videoTransceiver) {
              try {
                videoTransceiver.direction = 'sendrecv';
              } catch {
                // ignore
              }
            }
          } else if (videoTransceiver) {
            await videoTransceiver.sender.replaceTrack(camTrack);
            try {
              videoTransceiver.direction = 'sendrecv';
            } catch {
              // ignore
            }
          } else if (pcRef.current) {
            pcRef.current.addTrack(camTrack, localStreamRef.current);
          }

          if (pcRef.current) {
            await applySenderQualityPreset(pcRef.current, qualityPreset);
          }
          const resolvedFacing = resolveTrackFacingMode(camTrack, facingModeRef.current);
          facingModeRef.current = resolvedFacing;
          setFacingMode(resolvedFacing);
          const devId = camTrack.getSettings?.().deviceId;
          if (devId) setSelectedCameraId(devId);
          hasLocalVideoRef.current = true;
          setHasLocalVideo(true);
          setStreamTick((t) => t + 1);
          attachVideoStreams(true);
          void refreshAudioDevices();
        }
      } catch {
        isVideoEnabledRef.current = false;
        setIsVideoEnabled(false);
        showCameraNotice('تعذر فتح الكاميرا — تأكد من منح الصلاحية.', 'warn');
      }
    }
  };

  const replaceLocalCameraTrack = async (nextTrack: MediaStreamTrack) => {
    if (!localStreamRef.current) {
      localStreamRef.current = new MediaStream();
    }
    localStreamRef.current.getVideoTracks().forEach((t) => {
      if (t !== nextTrack) {
        t.stop();
        localStreamRef.current?.removeTrack(t);
      }
    });
    nextTrack.enabled = isVideoEnabledRef.current;
    if (!localStreamRef.current.getVideoTracks().includes(nextTrack)) {
      localStreamRef.current.addTrack(nextTrack);
    }

    const sender = findVideoSender(pcRef.current);
    if (sender) {
      await sender.replaceTrack(nextTrack);
      const tr = pcRef.current
        ?.getTransceivers()
        .find((t) => t.sender === sender || t.receiver.track?.kind === 'video');
      if (tr && tr.direction === 'recvonly') {
        try {
          tr.direction = 'sendrecv';
        } catch {
          // ignore
        }
      }
    } else if (pcRef.current) {
      pcRef.current.addTrack(nextTrack, localStreamRef.current);
    }
    if (pcRef.current) {
      await applySenderQualityPreset(pcRef.current, qualityPreset);
    }
  };

  const handleSwitchCamera = async (explicitDeviceId?: string) => {
    if (isSwitchingCameraRef.current) return;
    if (activeCall.callType !== 'video' && !hasLocalVideoRef.current) return;

    const previousFacing = facingModeRef.current;
    const targetFacing: CameraFacingMode =
      explicitDeviceId
        ? (() => {
            const dev = videoInputs.find((d) => d.deviceId === explicitDeviceId);
            if (!dev) return previousFacing;
            return /\b(front|user|facetime|selfie)\b|أمامي|أمامية/i.test(dev.label)
              ? 'user'
              : /\b(back|rear|environment|world)\b|خلفي|خلفية/i.test(dev.label)
                ? 'environment'
                : previousFacing;
          })()
        : previousFacing === 'user'
          ? 'environment'
          : 'user';

    if (!navigator.mediaDevices?.getUserMedia) {
      showCameraNotice('المتصفح الحالي لا يدعم تبديل الكاميرا.', 'warn');
      return;
    }

    // If camera is currently paused/off, update preferred lens cleanly without powering the sensor yet
    if (!isVideoEnabledRef.current && !explicitDeviceId) {
      facingModeRef.current = targetFacing;
      setFacingMode(targetFacing);
      showCameraNotice(
        targetFacing === 'environment'
          ? 'ستُفتح الكاميرا الخلفية عند تشغيل الفيديو'
          : 'ستُفتح الكاميرا الأمامية عند تشغيل الفيديو',
        'info'
      );
      return;
    }

    isSwitchingCameraRef.current = true;
    setIsSwitchingCamera(true);

    try {
      const activeTrack = localStreamRef.current?.getVideoTracks()[0];
      const currentDeviceId = activeTrack?.getSettings?.().deviceId || selectedCameraId || undefined;

      const result = await acquireCameraVideoTrack({
        presetId: qualityPreset,
        targetFacing,
        previousFacing,
        currentDeviceId,
        targetDeviceId: explicitDeviceId,
        videoInputs: videoInputs.map((d) => ({
          deviceId: d.deviceId,
          label: d.label,
          kind: d.kind
        })),
        onReleaseCurrentTrack: () => {
          localStreamRef.current?.getVideoTracks().forEach((t) => {
            t.stop();
            localStreamRef.current?.removeTrack(t);
          });
        }
      });

      if (result.track) {
        await replaceLocalCameraTrack(result.track);
        facingModeRef.current = result.resolvedFacing;
        setFacingMode(result.resolvedFacing);
        if (result.resolvedDeviceId) {
          setSelectedCameraId(result.resolvedDeviceId);
        }
        hasLocalVideoRef.current = true;
        setHasLocalVideo(true);
        setIsScreenSharing(false);
        setStreamTick((t) => t + 1);
        attachVideoStreams(true);
        void refreshAudioDevices();
        showCameraNotice(
          result.resolvedFacing === 'environment'
            ? 'تم التبديل إلى الكاميرا الخلفية'
            : 'تم التبديل إلى الكاميرا الأمامية',
          'info'
        );
        return;
      }

      if (result.recoveryTrack) {
        await replaceLocalCameraTrack(result.recoveryTrack);
        const recoveredFacing = resolveTrackFacingMode(result.recoveryTrack, previousFacing);
        facingModeRef.current = recoveredFacing;
        setFacingMode(recoveredFacing);
        const recDevId = result.recoveryTrack.getSettings?.().deviceId;
        if (recDevId) setSelectedCameraId(recDevId);
        setStreamTick((t) => t + 1);
        attachVideoStreams(true);
      } else {
        facingModeRef.current = result.resolvedFacing;
        setFacingMode(result.resolvedFacing);
      }

      if (result.errorCode === 'single-camera') {
        showCameraNotice('تتوفر كاميرا واحدة فقط على هذا الجهاز', 'warn');
      } else if (result.errorCode === 'permission-denied') {
        showCameraNotice('تم رفض صلاحية الوصول إلى الكاميرا', 'warn');
      } else if (result.errorCode === 'device-busy') {
        showCameraNotice('الكاميرا مشغولة حالياً — أعد المحاولة', 'warn');
      } else {
        showCameraNotice('تعذر التبديل إلى الكاميرا المطلوبة', 'warn');
      }
    } finally {
      isSwitchingCameraRef.current = false;
      setIsSwitchingCamera(false);
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
      if (
        typeof navigator.mediaDevices?.getUserMedia === 'function' &&
        activeCall.callType === 'video'
      ) {
        try {
          const result = await acquireCameraVideoTrack({
            presetId: qualityPreset,
            targetFacing: facingModeRef.current,
            previousFacing: facingModeRef.current,
            targetDeviceId: selectedCameraId || undefined,
            onReleaseCurrentTrack: () => {
              localStreamRef.current?.getVideoTracks().forEach((t) => {
                t.stop();
                localStreamRef.current?.removeTrack(t);
              });
            }
          });
          if (result.track) {
            await replaceLocalCameraTrack(result.track);
            facingModeRef.current = result.resolvedFacing;
            setFacingMode(result.resolvedFacing);
            hasLocalVideoRef.current = true;
            setHasLocalVideo(true);
            setStreamTick((t) => t + 1);
            attachVideoStreams(true);
          }
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
        const sender = findVideoSender(pcRef.current);
        if (sender) {
          await sender.replaceTrack(screenTrack);
        }
        localStreamRef.current?.getVideoTracks().forEach((t) => {
          t.stop();
          localStreamRef.current?.removeTrack(t);
        });
        if (!localStreamRef.current) {
          localStreamRef.current = new MediaStream();
        }
        localStreamRef.current.addTrack(screenTrack);
        hasLocalVideoRef.current = true;
        setHasLocalVideo(true);
        setIsScreenSharing(true);
        setStreamTick((t) => t + 1);
        attachVideoStreams(true);
        screenTrack.onended = () => {
          void toggleScreenShare();
        };
      }
    } catch {
      setIsScreenSharing(false);
    }
  };

  const activePresetMeta = CALL_QUALITY_PRESETS[qualityPreset];
  const localVideoActive = hasLocalVideo && isVideoEnabled;
  const showVideoStage = activeCall.callType === 'video' || hasRemoteVideo || localVideoActive;
  const isMainShowingLocal = swapStreams && hasRemoteVideo && localVideoActive;
  const isMainShowingVideo = hasRemoteVideo || isMainShowingLocal;
  const showPipVideo = localVideoActive || (swapStreams && hasRemoteVideo);
  const mirrorMainVideo = isMainShowingLocal && !isScreenSharing && facingMode === 'user';
  const mirrorPipVideo = !isMainShowingLocal && !isScreenSharing && facingMode === 'user';
  const remoteExposureStyle =
    isAutoExposureEnabled && hasRemoteVideo
      ? {
          filter: formatAutoExposureCssFilter(remoteExposure),
          transition: 'filter 260ms ease-out'
        }
      : undefined;
  const exposureDeltaPct = Math.round((remoteExposure.brightness - 1) * 100);
  const exposureLabel = !isAutoExposureEnabled
    ? 'معطّل'
    : !hasRemoteVideo
      ? 'في الانتظار'
      : exposureDeltaPct > 3
        ? `+${exposureDeltaPct}% (إضاءة ضعيفة)`
        : exposureDeltaPct < -3
          ? `${exposureDeltaPct}% (إضاءة ساطعة)`
          : 'إضاءة مثالية';

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`مكالمة ${activeCall.callType === 'video' ? 'مرئية' : 'صوتية'} مع ${peerName}`}
      className="fixed inset-0 z-[60] w-full max-w-full h-[100dvh] bg-[#0B141A] text-white flex flex-col justify-between p-4 sm:p-6 overflow-hidden select-none"
    >
      {/* Hidden Remote Audio Element (DSP-enhanced Stereo P2P) & Local Audio Transfer Element */}
      <audio ref={remoteAudioRef} autoPlay playsInline className="sr-only" />
      <audio ref={sharedAudioElRef} playsInline className="sr-only" />
      <input
        ref={sharedAudioInputRef}
        type="file"
        accept="audio/*"
        onChange={(e) => void handlePickAudioFileToTransfer(e)}
        className="hidden"
      />

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

        <div className="flex items-center gap-1.5 sm:gap-2 flex-wrap justify-end">
          {audioPlayBlocked && (
            <button
              type="button"
              onClick={() => {
                void remoteEnhancerRef.current?.resume();
                tryPlayRemoteAudio();
              }}
              className="min-h-[38px] px-3 py-1.5 rounded-full bg-amber-500 text-black text-xs font-bold flex items-center gap-1.5 shadow-md animate-pulse cursor-pointer"
            >
              <Volume2 className="w-3.5 h-3.5" aria-hidden="true" />
              <span>تفعيل السماع</span>
            </button>
          )}

          <button
            type="button"
            aria-label="نقل الصوت وتحسين السماع"
            aria-expanded={showAudioStudioPanel}
            onClick={() => {
              void remoteEnhancerRef.current?.resume();
              void refreshAudioDevices();
              setShowStatsHud(false);
              setShowAudioStudioPanel((v) => !v);
            }}
            className={`min-h-[38px] px-2.5 sm:px-3 py-1.5 rounded-full text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer ${
              showAudioStudioPanel || sharedAudioClipName
                ? 'bg-[#00A884] text-white'
                : isVoiceClarityOn
                  ? 'bg-[#00A884]/25 text-[#06CF9C] border border-[#06CF9C]/40 hover:bg-[#00A884]/35'
                  : 'bg-white/10 text-white/85 hover:bg-white/20'
            }`}
          >
            <Headphones className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
            <span className="hidden sm:inline">الصوت والنقل</span>
            <span className="font-mono-code text-[10px] opacity-90">
              {LISTENING_BOOST_PRESETS[listeningBoost].badge}
            </span>
          </button>

          {(activeCall.callType === 'video' || hasRemoteVideo) && (
            <button
              type="button"
              aria-label="تحسين الإضاءة التلقائي لفيديو الطرف الآخر"
              aria-pressed={isAutoExposureEnabled}
              title={
                isAutoExposureEnabled
                  ? `تحسين الإضاءة التلقائي مفعّل (${exposureLabel})`
                  : 'تفعيل تحسين الإضاءة التلقائي'
              }
              onClick={() => setIsAutoExposureEnabled((v) => !v)}
              className={`min-h-[38px] px-2.5 py-1.5 rounded-full text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer ${
                isAutoExposureEnabled
                  ? 'bg-[#00A884]/25 text-[#06CF9C] border border-[#06CF9C]/40 hover:bg-[#00A884]/35'
                  : 'bg-white/10 text-white/75 hover:bg-white/20'
              }`}
            >
              <SunMedium className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
              <span className="hidden sm:inline">تحسين الإضاءة</span>
            </button>
          )}

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
            onClick={() => {
              setShowAudioStudioPanel(false);
              setShowStatsHud((v) => !v);
            }}
            className={`min-h-[38px] min-w-[38px] rounded-full flex items-center justify-center transition-colors cursor-pointer ${
              showStatsHud ? 'bg-[var(--wa-accent)] text-white' : 'bg-white/10 hover:bg-white/20'
            }`}
          >
            <Activity className="w-4 h-4" aria-hidden="true" />
          </button>
        </div>

        {/* Audio Clarity, Boost, Device Routing & Live Peer Audio Transfer Drawer */}
        {showAudioStudioPanel && (
          <div className="absolute top-12 left-0 right-0 sm:right-auto w-full sm:w-88 max-w-[calc(100vw-2rem)] rounded-2xl bg-[#111B21]/95 backdrop-blur-md border border-white/15 p-4 text-xs space-y-3.5 shadow-2xl z-30">
            <div className="flex items-center justify-between border-b border-white/10 pb-2">
              <div className="flex items-center gap-2 font-bold text-[#06CF9C]">
                <AudioLines className="w-4 h-4" aria-hidden="true" />
                <span>تحسين السماع ونقل الصوت</span>
              </div>
              <button
                type="button"
                aria-label="إغلاق إعدادات الصوت"
                onClick={() => setShowAudioStudioPanel(false)}
                className="p-1 rounded-full hover:bg-white/10 text-white/70 cursor-pointer"
              >
                <X className="w-4 h-4" aria-hidden="true" />
              </button>
            </div>

            {/* DSP Voice Clarity Toggle */}
            <div className="flex items-center justify-between gap-3 bg-white/5 rounded-xl p-2.5">
              <div>
                <p className="font-semibold text-white flex items-center gap-1.5">
                  <Sparkles className="w-3.5 h-3.5 text-[#06CF9C]" aria-hidden="true" />
                  <span>تنقية ووضوح الصوت (DSP)</span>
                </p>
                <p className="text-[11px] text-white/60 mt-0.5">
                  عزل الضوضاء المنخفضة وتعزيز وضوح الكلام
                </p>
              </div>
              <button
                type="button"
                aria-pressed={isVoiceClarityOn}
                onClick={() => setIsVoiceClarityOn((v) => !v)}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors cursor-pointer shrink-0 ${
                  isVoiceClarityOn
                    ? 'bg-[#00A884] text-white'
                    : 'bg-white/10 text-white/70 hover:bg-white/20'
                }`}
              >
                {isVoiceClarityOn ? 'مفعّل' : 'إيقاف'}
              </button>
            </div>

            {/* Listening Volume Boost Presets */}
            <div className="space-y-1.5">
              <span className="block text-[11px] font-semibold text-white/80">
                مستوى تضخيم سماع الطرف الآخر
              </span>
              <div className="grid grid-cols-3 gap-1.5">
                {(['normal', 'clear', 'loud'] as ListeningBoostLevel[]).map((lvl) => {
                  const preset = LISTENING_BOOST_PRESETS[lvl];
                  const active = listeningBoost === lvl;
                  return (
                    <button
                      key={lvl}
                      type="button"
                      onClick={() => setListeningBoost(lvl)}
                      className={`py-2 px-2 rounded-lg text-[11px] font-bold transition-colors cursor-pointer ${
                        active
                          ? 'bg-[#00A884] text-white'
                          : 'bg-white/10 text-white/75 hover:bg-white/15'
                      }`}
                    >
                      {preset.label}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Live P2P Audio File Transfer */}
            <div className="space-y-2 bg-white/5 rounded-xl p-2.5">
              <div className="flex items-center justify-between gap-2">
                <span className="font-semibold text-white flex items-center gap-1.5">
                  <Music className="w-3.5 h-3.5 text-[#06CF9C]" aria-hidden="true" />
                  <span>نقل مقطع صوتي للطرف الآخر</span>
                </span>
                {sharedAudioClipName ? (
                  <button
                    type="button"
                    onClick={() => void handleStopSharedAudioTransfer()}
                    className="px-2.5 py-1 rounded-lg bg-red-500/80 hover:bg-red-500 text-white text-[11px] font-bold flex items-center gap-1 cursor-pointer"
                  >
                    <Square className="w-3 h-3 fill-current" aria-hidden="true" />
                    <span>إيقاف</span>
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => sharedAudioInputRef.current?.click()}
                    className="px-2.5 py-1 rounded-lg bg-[#00A884] hover:brightness-95 text-white text-[11px] font-bold cursor-pointer"
                  >
                    اختر صوتاً
                  </button>
                )}
              </div>
              <p className="text-[11px] text-white/60 leading-snug">
                {sharedAudioClipName
                  ? `جاري البث المزدوج مع الميكروفون: ${sharedAudioClipName}`
                  : 'بث ملف صوتي مباشر داخل المكالمة مع استمرار صوتك.'}
              </p>
            </div>

            {/* Mic & Speaker Device Routing */}
            {audioInputs.length > 0 && (
              <div className="space-y-1">
                <label className="block text-[11px] text-white/75">ميكروفون الإرسال</label>
                <select
                  aria-label="اختيار ميكروفون الإرسال"
                  value={selectedMicId}
                  onChange={(e) => void handleSelectMicDevice(e.target.value)}
                  className="w-full rounded-lg bg-[#1F2C33] border border-white/15 px-2.5 py-1.5 text-xs text-white focus:outline-none"
                >
                  <option value="">الميكروفون الافتراضي</option>
                  {audioInputs.map((dev, idx) => (
                    <option key={dev.deviceId || idx} value={dev.deviceId}>
                      {dev.label || `ميكروفون ${idx + 1}`}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {audioOutputs.length > 0 && (
              <div className="space-y-1">
                <label className="block text-[11px] text-white/75">مخرج السماع (السماعة)</label>
                <select
                  aria-label="اختيار مخرج السماع"
                  value={selectedSpeakerId}
                  onChange={(e) => void handleSelectSpeakerDevice(e.target.value)}
                  className="w-full rounded-lg bg-[#1F2C33] border border-white/15 px-2.5 py-1.5 text-xs text-white focus:outline-none"
                >
                  <option value="">السماعة الافتراضية</option>
                  {audioOutputs.map((dev, idx) => (
                    <option key={dev.deviceId || idx} value={dev.deviceId}>
                      {dev.label || `سماعة ${idx + 1}`}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {activeCall.callType === 'video' && videoInputs.length > 1 && (
              <div className="space-y-1">
                <label className="block text-[11px] text-white/75">الكاميرا المستخدمة</label>
                <select
                  aria-label="اختيار الكاميرا"
                  value={selectedCameraId}
                  disabled={isSwitchingCamera}
                  onChange={(e) => {
                    const nextId = e.target.value;
                    if (nextId) {
                      void handleSwitchCamera(nextId);
                    }
                  }}
                  className="w-full rounded-lg bg-[#1F2C33] border border-white/15 px-2.5 py-1.5 text-xs text-white focus:outline-none disabled:opacity-60"
                >
                  {videoInputs.map((dev, idx) => (
                    <option key={dev.deviceId || idx} value={dev.deviceId}>
                      {dev.label || `كاميرا ${idx + 1}`}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {audioTransferError && (
              <p className="text-[11px] text-amber-300 font-medium">{audioTransferError}</p>
            )}
          </div>
        )}

        {/* Collapsible Live WebRTC Stats Telemetry HUD */}
        {showStatsHud && (
          <div className="absolute top-12 left-0 w-72 rounded-2xl bg-[#111B21]/95 backdrop-blur-md border border-white/15 p-3.5 text-xs space-y-2 shadow-2xl z-30">
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
              {(activeCall.callType === 'video' || hasRemoteVideo) && (
                <div className="bg-white/5 rounded-lg p-2 col-span-2 flex items-center justify-between">
                  <span className="text-[10px] text-white/50">الإضاءة التلقائية</span>
                  <span className="font-bold text-[#06CF9C]">{exposureLabel}</span>
                </div>
              )}
            </div>
          </div>
        )}
      </header>

      {/* Main Video / Voice Stage */}
      <div className="flex-1 flex flex-col items-center justify-center relative my-3 min-h-0">
        {showVideoStage ? (
          <div className="w-full h-full max-w-4xl max-h-[70dvh] rounded-3xl overflow-hidden bg-[#111B21] border border-white/10 relative shadow-2xl flex items-center justify-center">
            <video
              ref={remoteVideoRef}
              autoPlay
              muted
              playsInline
              style={!isMainShowingLocal ? remoteExposureStyle : undefined}
              className={`w-full h-full object-cover ${
                isMainShowingVideo ? 'block' : 'hidden'
              } ${mirrorMainVideo ? '-scale-x-100' : ''}`}
            />

            {/* Remote participant avatar & waiting/voice indicator shown when remote video isn't streaming yet */}
            {!isMainShowingVideo && (
              <div className="flex flex-col items-center text-center px-4">
                <div className="relative">
                  <div
                    className={`absolute -inset-3 rounded-full border-2 border-[#00A884]/40 ${
                      callState !== 'connected' ? 'animate-ping' : ''
                    }`}
                  />
                  <Avatar src={peerAvatar} name={peerName} size="xl" />
                </div>
                <h2 className="mt-5 font-display text-xl sm:text-2xl font-bold">{peerName}</h2>
                <p className="mt-1.5 text-xs sm:text-sm text-[#06CF9C] font-medium">
                  {callState === 'ringing'
                    ? activeCall.direction === 'incoming'
                      ? 'مكالمة مرئية واردة...'
                      : 'جاري الرنين...'
                    : callState === 'connected'
                      ? 'بانتظار فيديو الطرف الآخر...'
                      : 'جاري ربط الصورة والصوت...'}
                </p>
              </div>
            )}

            {/* Camera Switch Status Notice */}
            {cameraSwitchNotice && (
              <div
                role="status"
                aria-live="polite"
                className={`absolute top-3 left-1/2 -translate-x-1/2 z-20 px-3.5 py-1.5 rounded-full text-xs font-semibold backdrop-blur-md shadow-lg border whitespace-nowrap ${
                  cameraSwitchNotice.tone === 'warn'
                    ? 'bg-amber-500/90 text-black border-amber-300/60'
                    : 'bg-black/70 text-white border-white/15'
                }`}
              >
                {cameraSwitchNotice.text}
              </div>
            )}

            {/* Quick Corner Camera Flip Control on Video Stage (44px mobile touch target) */}
            {localVideoActive && !isScreenSharing && (
              <button
                type="button"
                disabled={isSwitchingCamera}
                onClick={() => void handleSwitchCamera()}
                aria-label={
                  facingMode === 'user'
                    ? 'تدوير إلى الكاميرا الخلفية'
                    : 'تدوير إلى الكاميرا الأمامية'
                }
                title={facingMode === 'user' ? 'تبديل للخلفية' : 'تبديل للأمامية'}
                className="w-11 h-11 rounded-full bg-black/55 hover:bg-black/75 border border-white/20 backdrop-blur-md text-white flex items-center justify-center absolute top-3 left-3 z-20 transition-all cursor-pointer disabled:opacity-60"
              >
                {isSwitchingCamera ? (
                  <RefreshCw className="w-4 h-4 animate-spin" aria-hidden="true" />
                ) : (
                  <SwitchCamera className="w-5 h-5" aria-hidden="true" />
                )}
              </button>
            )}

            {/* Corner Local Self-View Picture-in-Picture (Tap to swap when both videos active) */}
            {showPipVideo && (
              <button
                type="button"
                onClick={() => {
                  if (hasRemoteVideo && localVideoActive) {
                    setSwapStreams((v) => !v);
                  }
                }}
                aria-label="تبديل عرض الكاميرا المحلية والبعيدة"
                className="w-28 sm:w-36 aspect-[3/4] sm:aspect-video rounded-2xl overflow-hidden border-2 border-white/40 shadow-xl bg-black absolute top-3 right-3 cursor-pointer hover:scale-[1.02] transition-transform z-10"
              >
                <video
                  ref={localVideoRef}
                  autoPlay
                  muted
                  playsInline
                  style={swapStreams && hasRemoteVideo ? remoteExposureStyle : undefined}
                  className={`w-full h-full object-cover ${mirrorPipVideo ? '-scale-x-100' : ''}`}
                />
                {!isMainShowingLocal && !isScreenSharing && (
                  <span className="absolute bottom-1.5 right-1.5 px-1.5 py-0.5 rounded-md bg-black/65 text-[10px] font-semibold text-white/90 pointer-events-none">
                    {facingMode === 'environment' ? 'خلفية' : 'أمامية'}
                  </span>
                )}
              </button>
            )}

            <div className="absolute bottom-3 right-3 left-3 flex flex-wrap items-center justify-between gap-2 pointer-events-none z-10">
              <div className="bg-black/60 backdrop-blur-md px-3.5 py-1.5 rounded-full text-xs font-medium flex items-center gap-2">
                <span
                  className={`w-2 h-2 rounded-full ${
                    isSpeechActiveFromLevels(remoteVoiceLevels)
                      ? 'bg-[#06CF9C] ring-4 ring-[#06CF9C]/30'
                      : 'bg-[#06CF9C]'
                  }`}
                />
                <span>
                  {peerName} · {callState === 'connected' ? formatCallDuration(elapsedSec) : 'جاري الاتصال...'}
                </span>
                {peerAudioState.isMuted && (
                  <span className="text-amber-300 text-[11px] font-semibold">· مكتوم</span>
                )}
              </div>
              <div className="flex items-center gap-1.5">
                {peerAudioState.sharingAudioClip && (
                  <span className="bg-[#00A884]/90 px-3 py-1 rounded-full text-[11px] font-bold flex items-center gap-1">
                    <Music className="w-3 h-3" aria-hidden="true" />
                    <span>ينقل لك صوتاً</span>
                  </span>
                )}
                {sharedAudioClipName && (
                  <span className="bg-indigo-600/90 px-3 py-1 rounded-full text-[11px] font-bold">
                    نقل صوت نشط
                  </span>
                )}
                {isScreenSharing && (
                  <span className="bg-[var(--wa-accent)] px-3 py-1 rounded-full text-[11px] font-bold">
                    مشاركة الشاشة نشطة
                  </span>
                )}
              </div>
            </div>
          </div>
        ) : (
          <div className="flex flex-col items-center text-center">
            <div className="relative">
              <div
                className={`absolute -inset-4 rounded-full border-2 ${
                  isSpeechActiveFromLevels(remoteVoiceLevels)
                    ? 'border-[#06CF9C] scale-105'
                    : 'border-[#00A884]/40'
                } transition-transform ${
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
              {activeCall.callType === 'video'
                ? 'مكالمة مرئية فائقة الدقة (HD)'
                : `مكالمة صوتية ستيريو Opus 48kHz${isVoiceClarityOn ? ' · نقاء DSP مفعّل' : ''}`}
            </p>

            {(peerAudioState.isMuted || peerAudioState.sharingAudioClip || sharedAudioClipName) && (
              <div className="mt-2.5 flex flex-wrap items-center justify-center gap-2 text-xs">
                {peerAudioState.isMuted && (
                  <span className="text-amber-300 font-semibold">
                    {peerName} كتم الميكروفون مؤقتاً
                  </span>
                )}
                {peerAudioState.sharingAudioClip && (
                  <span className="text-[#06CF9C] font-semibold">
                    ينقل لك صوتاً: {peerAudioState.sharingAudioClip}
                  </span>
                )}
                {sharedAudioClipName && (
                  <span className="text-sky-300 font-semibold">
                    تنقل للطرف الآخر: {sharedAudioClipName}
                  </span>
                )}
              </div>
            )}

            {/* Dual Real-time Local + Remote Peer Audio Waveform Bars */}
            {callState === 'connected' && (
              <div className="mt-6 flex items-center justify-center gap-8">
                <div className="flex flex-col items-center gap-1.5">
                  <div
                    aria-hidden="true"
                    className="flex items-end justify-center gap-1.5 h-10"
                  >
                    {remoteVoiceLevels.map((lvl, idx) => (
                      <span
                        key={idx}
                        style={{ height: `${lvl}%` }}
                        className="w-1.5 rounded-full bg-[#38BDF8] transition-all duration-100"
                      />
                    ))}
                  </div>
                  <span className="text-[11px] text-white/70">صوت {peerName}</span>
                </div>

                <div className="flex flex-col items-center gap-1.5">
                  <div
                    aria-hidden="true"
                    className="flex items-end justify-center gap-1.5 h-10"
                  >
                    {voiceLevels.map((lvl, idx) => (
                      <span
                        key={idx}
                        style={{ height: `${lvl}%` }}
                        className="w-1.5 rounded-full bg-[#06CF9C] transition-all duration-100"
                      />
                    ))}
                  </div>
                  <span className="text-[11px] text-white/70">
                    {isMuted ? 'صوتك (مكتوم)' : 'صوتك'}
                  </span>
                </div>
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
            onClick={() => {
              void remoteEnhancerRef.current?.resume();
              setIsSpeakerOn((v) => !v);
            }}
            className={`w-12 h-12 rounded-full flex items-center justify-center transition-colors cursor-pointer ${
              isSpeakerOn ? 'bg-white/15 hover:bg-white/25' : 'bg-white/5 text-white/50'
            }`}
          >
            {isSpeakerOn ? <Volume2 className="w-5 h-5" /> : <VolumeX className="w-5 h-5" />}
          </button>

          <button
            type="button"
            aria-label="نقل مقطع صوتي للطرف الآخر"
            title={
              sharedAudioClipName
                ? `إيقاف نقل: ${sharedAudioClipName}`
                : 'نقل صوت أو ملف صوتي للطرف الآخر'
            }
            onClick={() => {
              if (sharedAudioClipName) {
                void handleStopSharedAudioTransfer();
              } else {
                sharedAudioInputRef.current?.click();
              }
            }}
            className={`w-12 h-12 rounded-full flex items-center justify-center transition-colors cursor-pointer ${
              sharedAudioClipName
                ? 'bg-[#00A884] text-white'
                : 'bg-white/15 hover:bg-white/25'
            }`}
          >
            <Music className="w-5 h-5" aria-hidden="true" />
          </button>

          <button
            type="button"
            aria-label={isVideoEnabled ? 'إيقاف الكاميرا' : 'تشغيل الكاميرا'}
            onClick={() => void toggleVideo()}
            className={`w-12 h-12 rounded-full flex items-center justify-center transition-colors cursor-pointer ${
              isVideoEnabled ? 'bg-white/15 hover:bg-white/25' : 'bg-white/5 text-white/50'
            }`}
          >
            {isVideoEnabled ? <Video className="w-5 h-5" /> : <VideoOff className="w-5 h-5" />}
          </button>

          {(activeCall.callType === 'video' || hasLocalVideo) && (
            <button
              type="button"
              disabled={isSwitchingCamera}
              aria-label={
                facingMode === 'user'
                  ? 'التبديل إلى الكاميرا الخلفية'
                  : 'التبديل إلى الكاميرا الأمامية'
              }
              title={
                facingMode === 'user'
                  ? 'الكاميرا الأمامية نشطة — اضغط للتبديل للخلفية'
                  : 'الكاميرا الخلفية نشطة — اضغط للتبديل للأمامية'
              }
              onClick={() => void handleSwitchCamera()}
              className={`w-12 h-12 rounded-full flex items-center justify-center transition-colors cursor-pointer disabled:opacity-60 ${
                facingMode === 'environment'
                  ? 'bg-[#00A884] text-white hover:brightness-95'
                  : 'bg-white/15 hover:bg-white/25'
              }`}
            >
              {isSwitchingCamera ? (
                <RefreshCw className="w-5 h-5 animate-spin" aria-hidden="true" />
              ) : (
                <SwitchCamera className="w-5 h-5" aria-hidden="true" />
              )}
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
