import { useEffect, useRef, useState } from 'react';
import {
  Mic,
  MicOff,
  Video,
  VideoOff,
  PhoneOff,
  Volume2,
  VolumeX,
  MonitorUp,
  Lock
} from 'lucide-react';
import { Avatar } from './Avatar';
import { formatCallDuration } from '../lib/chatLogic';
import type { CallRecord } from '../types/chat';

interface CallOverlayProps {
  activeCall: CallRecord;
  onEndCall: (durationSeconds: number) => void;
}

export function CallOverlay({ activeCall, onEndCall }: CallOverlayProps) {
  const [callState, setCallState] = useState<'ringing' | 'connected'>('ringing');
  const [elapsedSec, setElapsedSec] = useState(0);
  const [isMuted, setIsMuted] = useState(false);
  const [isVideoEnabled, setIsVideoEnabled] = useState(activeCall.callType === 'video');
  const [isSpeakerOn, setIsSpeakerOn] = useState(true);
  const [isScreenSharing, setIsScreenSharing] = useState(false);
  const [hasCameraStream, setHasCameraStream] = useState(false);

  const localVideoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const pcRef = useRef<RTCPeerConnection | null>(null);

  const peerName =
    activeCall.direction === 'outgoing' ? activeCall.calleeName : activeCall.callerName;
  const peerAvatar =
    activeCall.direction === 'outgoing' ? activeCall.calleeAvatar : activeCall.callerAvatar;

  useEffect(() => {
    let cancelled = false;

    async function initWebRtc() {
      try {
        const pc = new RTCPeerConnection({
          iceServers: [{ urls: 'stun:stun.l.google.com:19302' }]
        });
        pcRef.current = pc;

        if (navigator.mediaDevices?.getUserMedia) {
          const stream = await navigator.mediaDevices.getUserMedia({
            audio: true,
            video: activeCall.callType === 'video'
          });
          if (cancelled) {
            stream.getTracks().forEach((t) => t.stop());
            return;
          }
          streamRef.current = stream;
          stream.getTracks().forEach((track) => pc.addTrack(track, stream));
          if (localVideoRef.current && activeCall.callType === 'video') {
            localVideoRef.current.srcObject = stream;
            setHasCameraStream(true);
          }
        }
      } catch {
        // Headless environment or permission denied: keep clean avatar + animated wave UI active
        setHasCameraStream(false);
      }
    }

    void initWebRtc();

    const connectTimer = window.setTimeout(() => {
      if (!cancelled) {
        setCallState('connected');
      }
    }, 1800);

    return () => {
      cancelled = true;
      window.clearTimeout(connectTimer);
      streamRef.current?.getTracks().forEach((t) => t.stop());
      pcRef.current?.close();
    };
  }, [activeCall.id, activeCall.callType]);

  useEffect(() => {
    if (callState !== 'connected') return;
    const timer = window.setInterval(() => {
      setElapsedSec((s) => s + 1);
    }, 1000);
    return () => window.clearInterval(timer);
  }, [callState]);

  const toggleMute = () => {
    const next = !isMuted;
    setIsMuted(next);
    streamRef.current?.getAudioTracks().forEach((t) => {
      t.enabled = !next;
    });
  };

  const toggleVideo = async () => {
    const next = !isVideoEnabled;
    setIsVideoEnabled(next);
    streamRef.current?.getVideoTracks().forEach((t) => {
      t.enabled = next;
    });
  };

  const toggleScreenShare = async () => {
    if (isScreenSharing) {
      setIsScreenSharing(false);
      return;
    }
    try {
      if (navigator.mediaDevices?.getDisplayMedia) {
        const displayStream = await navigator.mediaDevices.getDisplayMedia({ video: true });
        if (localVideoRef.current) {
          localVideoRef.current.srcObject = displayStream;
          setHasCameraStream(true);
        }
        setIsScreenSharing(true);
        displayStream.getVideoTracks()[0].onended = () => {
          setIsScreenSharing(false);
        };
      }
    } catch {
      setIsScreenSharing(false);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`مكالمة ${activeCall.callType === 'video' ? 'مرئية' : 'صوتية'} مع ${peerName}`}
      className="fixed inset-0 z-50 bg-[#0B141A] text-white flex flex-col justify-between p-6"
    >
      {/* Top Encryption & Status Bar */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-xs text-white/80">
          <Lock className="w-3.5 h-3.5 text-[#06CF9C]" aria-hidden="true" />
          <span>مشفرة تماماً بين الطرفين · WebRTC DTLS</span>
        </div>
        <span className="text-xs font-mono-code text-white/70">
          {activeCall.encryptionFingerprint}
        </span>
      </div>

      {/* Main Stage */}
      <div className="flex-1 flex flex-col items-center justify-center relative my-4">
        {isVideoEnabled && hasCameraStream ? (
          <div className="w-full max-w-3xl aspect-video rounded-2xl overflow-hidden bg-[#111B21] border border-white/10 relative shadow-2xl">
            <video
              ref={localVideoRef}
              autoPlay
              muted
              playsInline
              className="w-full h-full object-cover"
            />
            <div className="absolute bottom-4 right-4 bg-black/60 backdrop-blur-xs px-3 py-1.5 rounded-lg text-xs">
              {peerName} · {callState === 'ringing' ? 'جاري الاتصال...' : formatCallDuration(elapsedSec)}
            </div>
          </div>
        ) : (
          <div className="flex flex-col items-center text-center">
            <div className="relative">
              <div
                className={`absolute -inset-3 rounded-full border-2 border-[#00A884]/40 ${
                  callState === 'ringing' ? 'animate-ping' : ''
                }`}
              />
              <Avatar src={peerAvatar} name={peerName} size="xl" />
            </div>
            <h2 className="mt-6 font-display text-2xl font-bold">{peerName}</h2>
            <p className="mt-2 text-sm text-[#06CF9C] font-mono-code">
              {callState === 'ringing'
                ? 'جاري الرنين...'
                : `متصل · ${formatCallDuration(elapsedSec)}`}
            </p>
            <p className="mt-1 text-xs text-white/60">
              {activeCall.callType === 'video' ? 'مكالمة مرئية' : 'مكالمة صوتية'}
            </p>
          </div>
        )}
      </div>

      {/* Call Controls Bar */}
      <div className="flex items-center justify-center gap-4 pb-4">
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
          onClick={() => void toggleVideo()}
          className={`w-12 h-12 rounded-full flex items-center justify-center transition-colors cursor-pointer ${
            isVideoEnabled ? 'bg-white/15 hover:bg-white/25' : 'bg-white/5 text-white/50'
          }`}
        >
          {isVideoEnabled ? <Video className="w-5 h-5" /> : <VideoOff className="w-5 h-5" />}
        </button>

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
          aria-label="مشاركة الشاشة"
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
          onClick={() => onEndCall(elapsedSec)}
          className="w-14 h-12 rounded-full bg-red-600 hover:bg-red-700 text-white flex items-center justify-center transition-colors cursor-pointer"
        >
          <PhoneOff className="w-5 h-5" aria-hidden="true" />
        </button>
      </div>
    </div>
  );
}
