import type { CallQualityPreset } from '../types/chat';

export interface QualityPresetConfig {
  id: CallQualityPreset;
  label: string;
  badge: string;
  width: number;
  height: number;
  frameRate: number;
  videoMaxBitrateKbps: number;
  audioMaxBitrateKbps: number;
}

export const CALL_QUALITY_PRESETS: Record<CallQualityPreset, QualityPresetConfig> = {
  ultra: {
    id: 'ultra',
    label: 'فائقة الدقة (Full HD 1080p)',
    badge: '1080p HD',
    width: 1920,
    height: 1080,
    frameRate: 30,
    videoMaxBitrateKbps: 2500,
    audioMaxBitrateKbps: 128
  },
  balanced: {
    id: 'balanced',
    label: 'متوازنة عالية (HD 720p)',
    badge: '720p HD',
    width: 1280,
    height: 720,
    frameRate: 30,
    videoMaxBitrateKbps: 1200,
    audioMaxBitrateKbps: 96
  },
  saver: {
    id: 'saver',
    label: 'توفير البيانات (480p)',
    badge: '480p',
    width: 854,
    height: 480,
    frameRate: 24,
    videoMaxBitrateKbps: 550,
    audioMaxBitrateKbps: 48
  }
};

function readEnvVar(name: string): string {
  try {
    const metaEnv = (import.meta as unknown as { env?: Record<string, unknown> })?.env;
    const val = metaEnv?.[name];
    return typeof val === 'string' ? val.trim() : '';
  } catch {
    return '';
  }
}

export function buildRtcConfiguration(): RTCConfiguration {
  const iceServers: RTCIceServer[] = [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun2.l.google.com:19302' },
    { urls: 'stun:stun3.l.google.com:19302' },
    { urls: 'stun:stun4.l.google.com:19302' },
    { urls: 'stun:stun.cloudflare.com:3478' },
    { urls: 'stun:stun.services.mozilla.com' }
  ];

  const customTurnUrl = readEnvVar('VITE_TURN_URL');
  const customTurnUser = readEnvVar('VITE_TURN_USERNAME');
  const customTurnCred = readEnvVar('VITE_TURN_CREDENTIAL');
  if (customTurnUrl) {
    iceServers.push({
      urls: customTurnUrl.split(',').map((s) => s.trim()).filter(Boolean),
      ...(customTurnUser ? { username: customTurnUser } : {}),
      ...(customTurnCred ? { credential: customTurnCred } : {})
    });
  }

  // Public Metered OpenRelay TURN fallback for symmetric NAT / cellular carrier traversal
  iceServers.push(
    {
      urls: [
        'turn:openrelay.metered.ca:80',
        'turn:openrelay.metered.ca:80?transport=tcp',
        'turn:openrelay.metered.ca:443',
        'turn:openrelay.metered.ca:443?transport=tcp',
        'turns:openrelay.metered.ca:443?transport=tcp'
      ],
      username: 'openrelayproject',
      credential: 'openrelayproject'
    }
  );

  return {
    iceServers,
    iceCandidatePoolSize: 10,
    iceTransportPolicy: 'all',
    bundlePolicy: 'max-bundle',
    rtcpMuxPolicy: 'require'
  };
}

export const WEBRTC_RTC_CONFIG: RTCConfiguration = buildRtcConfiguration();

export function buildMediaConstraints(
  callType: 'audio' | 'video',
  presetId: CallQualityPreset = 'ultra',
  facingMode: 'user' | 'environment' = 'user',
  audioDeviceId?: string
): MediaStreamConstraints {
  const preset = CALL_QUALITY_PRESETS[presetId];
  const audio: MediaTrackConstraints = {
    echoCancellation: true,
    noiseSuppression: true,
    autoGainControl: true,
    channelCount: 2,
    sampleRate: 48000,
    ...(audioDeviceId ? { deviceId: { exact: audioDeviceId } } : {})
  };

  if (callType === 'audio') {
    return { audio, video: false };
  }

  return {
    audio,
    video: {
      width: { ideal: preset.width, max: preset.width },
      height: { ideal: preset.height, max: preset.height },
      frameRate: { ideal: preset.frameRate, max: 60 },
      facingMode
    }
  };
}

export async function acquireCallMediaStream(
  callType: 'audio' | 'video',
  presetId: CallQualityPreset = 'ultra',
  facingMode: 'user' | 'environment' = 'user'
): Promise<{
  stream: MediaStream | null;
  hasVideo: boolean;
  hasAudio: boolean;
  fallbackAudioOnly: boolean;
}> {
  if (!navigator.mediaDevices?.getUserMedia) {
    return { stream: null, hasVideo: false, hasAudio: false, fallbackAudioOnly: false };
  }

  try {
    const stream = await navigator.mediaDevices.getUserMedia(
      buildMediaConstraints(callType, presetId, facingMode)
    );
    return {
      stream,
      hasVideo: stream.getVideoTracks().length > 0,
      hasAudio: stream.getAudioTracks().length > 0,
      fallbackAudioOnly: false
    };
  } catch {
    // Relax strict resolution / sample-rate constraints on mobile cameras before falling back to audio-only
    if (callType === 'video') {
      try {
        const relaxedStream = await navigator.mediaDevices.getUserMedia({
          audio: {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true
          },
          video: { facingMode }
        });
        return {
          stream: relaxedStream,
          hasVideo: relaxedStream.getVideoTracks().length > 0,
          hasAudio: relaxedStream.getAudioTracks().length > 0,
          fallbackAudioOnly: false
        };
      } catch {
        // Ignore and try audio-only next
      }

      try {
        const audioOnlyStream = await navigator.mediaDevices.getUserMedia({
          audio: {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true
          },
          video: false
        });
        return {
          stream: audioOnlyStream,
          hasVideo: false,
          hasAudio: audioOnlyStream.getAudioTracks().length > 0,
          fallbackAudioOnly: true
        };
      } catch {
        return { stream: null, hasVideo: false, hasAudio: false, fallbackAudioOnly: false };
      }
    }

    try {
      const relaxedAudio = await navigator.mediaDevices.getUserMedia({
        audio: true,
        video: false
      });
      return {
        stream: relaxedAudio,
        hasVideo: false,
        hasAudio: relaxedAudio.getAudioTracks().length > 0,
        fallbackAudioOnly: false
      };
    } catch {
      return { stream: null, hasVideo: false, hasAudio: false, fallbackAudioOnly: false };
    }
  }
}

/**
 * Enhances an SDP offer/answer string to prioritize Studio-grade Opus stereo audio
 * with FEC (forward error correction) and raise video target bandwidth.
 */
export function enhanceSdpMediaQuality(
  sdp: string,
  presetId: CallQualityPreset = 'ultra'
): string {
  if (!sdp) return sdp;
  const preset = CALL_QUALITY_PRESETS[presetId];
  const lines = sdp.split(/\r?\n/);

  // Locate Opus payload type
  let opusPayload: string | null = null;
  for (const line of lines) {
    const match = /^a=rtpmap:(\d+)\s+opus\/48000/i.exec(line);
    if (match) {
      opusPayload = match[1];
      break;
    }
  }

  const out: string[] = [];
  let inVideoSection = false;
  let videoBandwidthInserted = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    if (line.startsWith('m=video')) {
      inVideoSection = true;
      videoBandwidthInserted = false;
      out.push(line);
      continue;
    }
    if (line.startsWith('m=')) {
      inVideoSection = false;
      out.push(line);
      continue;
    }

    if (inVideoSection && line.startsWith('c=IN') && !videoBandwidthInserted) {
      out.push(line);
      out.push(`b=AS:${preset.videoMaxBitrateKbps}`);
      videoBandwidthInserted = true;
      continue;
    }

    if (opusPayload && line.startsWith(`a=fmtp:${opusPayload} `)) {
      const audioBps = preset.audioMaxBitrateKbps * 1000;
      let updated = line;
      if (!updated.includes('maxaveragebitrate=')) {
        updated += `;maxaveragebitrate=${audioBps}`;
      }
      if (!updated.includes('stereo=')) {
        updated += ';stereo=1;sprop-stereo=1';
      }
      if (!updated.includes('useinbandfec=')) {
        updated += ';useinbandfec=1;usedtx=0';
      }
      if (!updated.includes('maxplaybackrate=')) {
        updated += ';maxplaybackrate=48000';
      }
      out.push(updated);
      continue;
    }

    out.push(line);
  }

  return out.join('\r\n');
}

export async function applySenderQualityPreset(
  pc: RTCPeerConnection,
  presetId: CallQualityPreset
): Promise<void> {
  const preset = CALL_QUALITY_PRESETS[presetId];
  const senders = pc.getSenders();
  for (const sender of senders) {
    if (!sender.track) continue;
    try {
      const params = sender.getParameters();
      if (!params.encodings || params.encodings.length === 0) {
        params.encodings = [{}];
      }
      if (sender.track.kind === 'video') {
        params.encodings[0].maxBitrate = preset.videoMaxBitrateKbps * 1000;
        params.encodings[0].maxFramerate = preset.frameRate;
        params.degradationPreference = 'maintain-framerate';
      } else if (sender.track.kind === 'audio') {
        params.encodings[0].maxBitrate = preset.audioMaxBitrateKbps * 1000;
        params.encodings[0].priority = 'high';
        params.encodings[0].networkPriority = 'high';
      }
      await sender.setParameters(params);
    } catch {
      // Browser may restrict updating certain sender params dynamically
    }
  }
}

export function prioritizeOpusAudioCodec(pc: RTCPeerConnection): void {
  try {
    if (typeof RTCRtpReceiver === 'undefined' || !RTCRtpReceiver.getCapabilities) return;
    const caps = RTCRtpReceiver.getCapabilities('audio');
    if (!caps?.codecs?.length) return;
    const opusCodecs = caps.codecs.filter((c) => c.mimeType.toLowerCase() === 'audio/opus');
    const otherCodecs = caps.codecs.filter((c) => c.mimeType.toLowerCase() !== 'audio/opus');
    if (opusCodecs.length === 0) return;
    const ordered = [...opusCodecs, ...otherCodecs];
    for (const transceiver of pc.getTransceivers()) {
      const kind = transceiver.receiver.track?.kind || transceiver.sender.track?.kind;
      if (kind === 'audio' && typeof transceiver.setCodecPreferences === 'function') {
        transceiver.setCodecPreferences(ordered);
      }
    }
  } catch {
    // Ignore on browsers that disallow setCodecPreferences before negotiation
  }
}

export interface CallTelemetryStats {
  rttMs: number | null;
  packetLossPct: number | null;
  resolution: string | null;
  fps: number | null;
  audioCodec: string | null;
  videoCodec: string | null;
}

export function extractTelemetryFromRtcStats(
  stats: RTCStatsReport
): CallTelemetryStats {
  let rttMs: number | null = null;
  let packetsLost = 0;
  let packetsTotal = 0;
  let resolution: string | null = null;
  let fps: number | null = null;
  let audioCodec: string | null = null;
  let videoCodec: string | null = null;
  const codecsById = new Map<string, string>();

  stats.forEach((report) => {
    if (report.type === 'codec' && typeof report.mimeType === 'string') {
      codecsById.set(report.id, report.mimeType.replace(/^(audio|video)\//, '').toUpperCase());
    }
  });

  stats.forEach((report) => {
    if (report.type === 'candidate-pair' && report.state === 'succeeded') {
      if (typeof report.currentRoundTripTime === 'number') {
        rttMs = Math.round(report.currentRoundTripTime * 1000);
      }
    }
    if (report.type === 'inbound-rtp' || report.type === 'outbound-rtp') {
      if (typeof report.packetsLost === 'number') packetsLost += Math.max(0, report.packetsLost);
      if (typeof report.packetsReceived === 'number') packetsTotal += report.packetsReceived;
      if (typeof report.packetsSent === 'number') packetsTotal += report.packetsSent;
      if (report.kind === 'video') {
        if (typeof report.frameWidth === 'number' && typeof report.frameHeight === 'number') {
          resolution = `${report.frameWidth}×${report.frameHeight}`;
        }
        if (typeof report.framesPerSecond === 'number') {
          fps = Math.round(report.framesPerSecond);
        }
        if (typeof report.codecId === 'string' && codecsById.has(report.codecId)) {
          videoCodec = codecsById.get(report.codecId) || null;
        }
      }
      if (report.kind === 'audio' && typeof report.codecId === 'string' && codecsById.has(report.codecId)) {
        audioCodec = codecsById.get(report.codecId) || null;
      }
    }
  });

  const packetLossPct =
    packetsTotal > 0 ? Math.min(100, Math.round((packetsLost / (packetsTotal + packetsLost)) * 1000) / 10) : null;

  return {
    rttMs,
    packetLossPct,
    resolution,
    fps,
    audioCodec,
    videoCodec
  };
}
