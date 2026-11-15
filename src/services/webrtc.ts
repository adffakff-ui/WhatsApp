/**
 * Browser-side WebRTC peer connection controller.
 *
 * This module handles media capture, SDP offer/answer, ICE trickle, remote
 * streams, and teardown. It deliberately accepts signaling callbacks rather
 * than writing to Firestore directly, so Firestore authorization/schema can be
 * tested independently. The caller must connect these callbacks to an
 * authenticated signaling transport that authorizes exactly the two call
 * participants.
 *
 * WebRTC encrypts media in transit with DTLS-SRTP. This is not a complete
 * end-to-end identity protocol by itself: authenticate/signaling-bind the
 * peer identity and verify the peer fingerprint out of band before claiming
 * protection against a malicious signaling service.
 */

export type WebRtcCallKind = 'audio' | 'video';
export type WebRtcConnectionState = RTCPeerConnectionState | 'closed';

export interface WebRtcPeerOptions {
  callId: string;
  callType: WebRtcCallKind;
  /** Persist this local candidate for the other authenticated call participant. */
  sendIceCandidate: (candidate: RTCIceCandidateInit) => Promise<void>;
  /** Attach an authenticated listener that forwards the other participant's candidates. */
  subscribeRemoteIceCandidates: (
    onCandidate: (candidate: RTCIceCandidateInit) => void,
    onError: (error: Error) => void
  ) => () => void;
  onLocalStream?: (stream: MediaStream) => void;
  onRemoteStream?: (stream: MediaStream) => void;
  onConnectionState?: (state: WebRtcConnectionState) => void;
  onIceConnectionState?: (state: RTCIceConnectionState) => void;
  onError?: (error: Error) => void;
  iceServers?: RTCIceServer[];
  mediaConstraints?: MediaStreamConstraints;
}

export interface WebRtcPeer {
  readonly peerConnection: RTCPeerConnection;
  readonly localStream: MediaStream | null;
  /** Get local media and create/set an SDP offer. Caller persists the returned offer. */
  createOffer(): Promise<RTCSessionDescriptionInit>;
  /** Apply a received offer, get local media, and create/set an SDP answer. */
  acceptOffer(offer: RTCSessionDescriptionInit): Promise<RTCSessionDescriptionInit>;
  /** Apply the caller's received SDP answer. */
  acceptAnswer(answer: RTCSessionDescriptionInit): Promise<void>;
  /** Receive a remote ICE candidate; candidates are queued until remote SDP exists. */
  addRemoteIceCandidate(candidate: RTCIceCandidateInit): Promise<void>;
  setMicrophoneEnabled(enabled: boolean): void;
  setCameraEnabled(enabled: boolean): void;
  close(): void;
}

const DEFAULT_ICE_SERVERS: RTCIceServer[] = [
  { urls: 'stun:stun.l.google.com:19302' }
];

function asError(error: unknown): Error {
  return error instanceof Error ? error : new Error(String(error));
}

function validateSdp(description: RTCSessionDescriptionInit, label: string): void {
  if (!description || (description.type !== 'offer' && description.type !== 'answer')) {
    throw new Error(`${label}: SDP type must be offer or answer.`);
  }
  if (typeof description.sdp !== 'string' || description.sdp.length === 0 || description.sdp.length > 32768) {
    throw new Error(`${label}: SDP is missing or exceeds the supported size.`);
  }
}

/** Create a single-call WebRTC controller. Call close() when leaving the call. */
export function createWebRtcPeer(options: WebRtcPeerOptions): WebRtcPeer {
  if (!options.callId.trim()) throw new Error('callId is required.');
  if (typeof RTCPeerConnection === 'undefined') {
    throw new Error('WebRTC is not supported in this browser.');
  }

  const pc = new RTCPeerConnection({
    iceServers: options.iceServers || DEFAULT_ICE_SERVERS,
    bundlePolicy: 'max-bundle'
  });
  let localStream: MediaStream | null = null;
  let closed = false;
  let remoteCandidateUnsubscribe: (() => void) | null = null;
  const pendingRemoteCandidates: RTCIceCandidateInit[] = [];
  const seenRemoteCandidates = new Set<string>();
  const remoteStream = new MediaStream();

  const reportError = (error: unknown) => {
    options.onError?.(asError(error));
  };

  const candidateKey = (candidate: RTCIceCandidateInit) =>
    `${candidate.sdpMid || ''}:${candidate.sdpMLineIndex ?? ''}:${candidate.candidate || ''}`;

  const applyCandidate = async (candidate: RTCIceCandidateInit) => {
    if (closed || !candidate.candidate) return;
    const key = candidateKey(candidate);
    if (seenRemoteCandidates.has(key)) return;
    seenRemoteCandidates.add(key);
    await pc.addIceCandidate(candidate);
  };

  const flushRemoteCandidates = async () => {
    while (pendingRemoteCandidates.length && pc.remoteDescription && !closed) {
      const candidate = pendingRemoteCandidates.shift();
      if (candidate) await applyCandidate(candidate);
    }
  };

  const attachRemoteCandidateListener = () => {
    if (remoteCandidateUnsubscribe) return;
    remoteCandidateUnsubscribe = options.subscribeRemoteIceCandidates(
      (candidate) => {
        void (async () => {
          try {
            if (!pc.remoteDescription) {
              pendingRemoteCandidates.push(candidate);
              return;
            }
            await applyCandidate(candidate);
          } catch (error) {
            reportError(error);
          }
        })();
      },
      reportError
    );
  };

  const ensureLocalMedia = async () => {
    if (localStream) return localStream;
    if (!navigator.mediaDevices?.getUserMedia) {
      throw new Error('المتصفح لا يدعم الوصول إلى الكاميرا أو الميكروفون.');
    }

    const constraints = options.mediaConstraints || {
      audio: true,
      video: options.callType === 'video'
        ? { width: { ideal: 1280, max: 1920 }, height: { ideal: 720, max: 1080 }, frameRate: { ideal: 24, max: 30 } }
        : false
    };
    localStream = await navigator.mediaDevices.getUserMedia(constraints);
    for (const track of localStream.getTracks()) {
      pc.addTrack(track, localStream);
    }
    options.onLocalStream?.(localStream);
    return localStream;
  };

  pc.onicecandidate = (event) => {
    if (!event.candidate || closed) return;
    void options.sendIceCandidate(event.candidate.toJSON()).catch(reportError);
  };

  pc.ontrack = (event) => {
    const incoming = event.streams[0];
    if (incoming) {
      options.onRemoteStream?.(incoming);
      return;
    }
    if (!remoteStream.getTracks().some((track) => track.id === event.track.id)) {
      remoteStream.addTrack(event.track);
    }
    options.onRemoteStream?.(remoteStream);
  };

  pc.onconnectionstatechange = () => {
    options.onConnectionState?.(pc.connectionState);
    if (pc.connectionState === 'failed') {
      reportError(new Error('تعذر إنشاء اتصال WebRTC. تحقق من الشبكة وإعدادات TURN.'));
    }
  };
  pc.oniceconnectionstatechange = () => {
    options.onIceConnectionState?.(pc.iceConnectionState);
  };

  attachRemoteCandidateListener();

  return {
    peerConnection: pc,
    get localStream() {
      return localStream;
    },

    async createOffer() {
      try {
        await ensureLocalMedia();
        const offer = await pc.createOffer();
        validateSdp(offer, 'offer');
        await pc.setLocalDescription(offer);
        return { type: 'offer', sdp: offer.sdp };
      } catch (error) {
        reportError(error);
        throw error;
      }
    },

    async acceptOffer(offer) {
      try {
        validateSdp(offer, 'offer');
        await ensureLocalMedia();
        await pc.setRemoteDescription(offer);
        await flushRemoteCandidates();
        const answer = await pc.createAnswer();
        validateSdp(answer, 'answer');
        await pc.setLocalDescription(answer);
        return { type: 'answer', sdp: answer.sdp };
      } catch (error) {
        reportError(error);
        throw error;
      }
    },

    async acceptAnswer(answer) {
      try {
        validateSdp(answer, 'answer');
        if (pc.signalingState !== 'have-local-offer') {
          throw new Error(`Unexpected signaling state for answer: ${pc.signalingState}`);
        }
        await pc.setRemoteDescription(answer);
        await flushRemoteCandidates();
      } catch (error) {
        reportError(error);
        throw error;
      }
    },

    async addRemoteIceCandidate(candidate) {
      if (closed) return;
      if (!candidate || typeof candidate.candidate !== 'string' || candidate.candidate.length > 2048) {
        throw new Error('ICE candidate is invalid or too large.');
      }
      if (!pc.remoteDescription) {
        pendingRemoteCandidates.push(candidate);
        return;
      }
      try {
        await applyCandidate(candidate);
      } catch (error) {
        reportError(error);
        throw error;
      }
    },

    setMicrophoneEnabled(enabled) {
      localStream?.getAudioTracks().forEach((track) => {
        track.enabled = enabled;
      });
    },

    setCameraEnabled(enabled) {
      localStream?.getVideoTracks().forEach((track) => {
        track.enabled = enabled;
      });
    },

    close() {
      if (closed) return;
      closed = true;
      remoteCandidateUnsubscribe?.();
      remoteCandidateUnsubscribe = null;
      pc.onicecandidate = null;
      pc.ontrack = null;
      pc.onconnectionstatechange = null;
      pc.oniceconnectionstatechange = null;
      localStream?.getTracks().forEach((track) => track.stop());
      remoteStream.getTracks().forEach((track) => track.stop());
      pc.close();
      options.onConnectionState?.('closed');
    }
  };
}
