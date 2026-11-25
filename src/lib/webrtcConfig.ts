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

export type CameraFacingMode = 'user' | 'environment';

export interface VideoDeviceCandidate {
  deviceId: string;
  label: string;
  kind?: string;
}

export interface CameraSwitchConstraintOptions {
  facingMode?: CameraFacingMode;
  deviceId?: string;
  exactFacing?: boolean;
  relaxedResolution?: boolean;
}

export function buildCameraSwitchConstraints(
  presetId: CallQualityPreset = 'ultra',
  options: CameraSwitchConstraintOptions = {}
): MediaStreamConstraints {
  const preset = CALL_QUALITY_PRESETS[presetId];
  const facing = options.facingMode ?? 'user';

  const targetConstraint: MediaTrackConstraints = options.deviceId
    ? { deviceId: { exact: options.deviceId } }
    : {
        facingMode: options.exactFacing ? { exact: facing } : facing
      };

  if (options.relaxedResolution) {
    return {
      audio: false,
      video: targetConstraint
    };
  }

  return {
    audio: false,
    video: {
      width: { ideal: preset.width, max: preset.width },
      height: { ideal: preset.height, max: preset.height },
      frameRate: { ideal: preset.frameRate, max: 60 },
      ...targetConstraint
    }
  };
}

export function inferFacingModeFromLabel(label: string): CameraFacingMode | null {
  if (!label) return null;
  if (/\b(front|user|facetime|selfie)\b|أمامي|أمامية/i.test(label)) {
    return 'user';
  }
  if (/\b(back|rear|environment|world)\b|خلفي|خلفية/i.test(label)) {
    return 'environment';
  }
  return null;
}

function isSecondaryRearLensLabel(label: string): boolean {
  return /\b(ultra[\s-]?wide|0\.5x|macro|telephoto|depth|tof|ir)\b/i.test(label);
}

export function pickNextVideoInputDevice(
  devices: VideoDeviceCandidate[],
  currentDeviceId: string | undefined,
  targetFacing: CameraFacingMode
): VideoDeviceCandidate | null {
  const videoDevices = devices.filter(
    (d) => Boolean(d.deviceId) && (!d.kind || d.kind === 'videoinput')
  );
  if (videoDevices.length === 0) return null;

  const nonCurrent = currentDeviceId
    ? videoDevices.filter((d) => d.deviceId !== currentDeviceId)
    : videoDevices;

  const matchingTarget = nonCurrent.filter(
    (d) => inferFacingModeFromLabel(d.label) === targetFacing
  );
  if (matchingTarget.length > 0) {
    const primaryLens = matchingTarget.find((d) => !isSecondaryRearLensLabel(d.label));
    return primaryLens || matchingTarget[0];
  }

  if (videoDevices.length >= 2) {
    const currentIndex = currentDeviceId
      ? videoDevices.findIndex((d) => d.deviceId === currentDeviceId)
      : -1;
    return videoDevices[(currentIndex + 1) % videoDevices.length];
  }

  return null;
}

export function resolveTrackFacingMode(
  track: { label?: string; getSettings?: () => MediaTrackSettings } | null | undefined,
  fallbackFacing: CameraFacingMode
): CameraFacingMode {
  if (!track) return fallbackFacing;
  try {
    const settingsFacing = track.getSettings?.().facingMode;
    if (settingsFacing === 'user' || settingsFacing === 'environment') {
      return settingsFacing;
    }
  } catch {
    // Ignore getSettings errors on mock/ended tracks
  }
  const inferred = inferFacingModeFromLabel(track.label || '');
  return inferred ?? fallbackFacing;
}

export function findVideoSender(pc: RTCPeerConnection | null): RTCRtpSender | null {
  if (!pc) return null;
  const senderByTrack = pc.getSenders().find((s) => s.track?.kind === 'video');
  if (senderByTrack) return senderByTrack;
  const transceiver = pc
    .getTransceivers?.()
    .find(
      (tr) =>
        tr.sender?.track?.kind === 'video' || tr.receiver?.track?.kind === 'video'
    );
  return transceiver?.sender || null;
}

export interface SwitchCameraTrackOptions {
  presetId?: CallQualityPreset;
  targetFacing: CameraFacingMode;
  previousFacing?: CameraFacingMode;
  currentDeviceId?: string;
  targetDeviceId?: string;
  videoInputs?: VideoDeviceCandidate[];
  onReleaseCurrentTrack?: () => void | Promise<void>;
  mediaDevices?: Pick<MediaDevices, 'getUserMedia'> &
    Partial<Pick<MediaDevices, 'enumerateDevices'>>;
  releaseDelayMs?: number;
}

export interface SwitchCameraTrackResult {
  track: MediaStreamTrack | null;
  stream: MediaStream | null;
  recoveryTrack: MediaStreamTrack | null;
  recoveryStream: MediaStream | null;
  resolvedFacing: CameraFacingMode;
  resolvedDeviceId?: string;
  releasedPreviousTrack: boolean;
  errorCode:
    | 'none'
    | 'unsupported'
    | 'permission-denied'
    | 'single-camera'
    | 'device-busy'
    | 'unavailable';
}

function getErrorName(err: unknown): string {
  if (err && typeof err === 'object' && 'name' in err) {
    return String((err as { name?: unknown }).name || '');
  }
  return '';
}

function waitMs(ms: number): Promise<void> {
  if (ms <= 0) return Promise.resolve();
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function acquireCameraVideoTrack(
  options: SwitchCameraTrackOptions
): Promise<SwitchCameraTrackResult> {
  const {
    presetId = 'ultra',
    targetFacing,
    previousFacing = targetFacing === 'user' ? 'environment' : 'user',
    currentDeviceId,
    targetDeviceId,
    onReleaseCurrentTrack,
    releaseDelayMs = 80
  } = options;

  const md =
    options.mediaDevices ??
    (typeof navigator !== 'undefined' ? navigator.mediaDevices : undefined);

  if (!md?.getUserMedia) {
    return {
      track: null,
      stream: null,
      recoveryTrack: null,
      recoveryStream: null,
      resolvedFacing: previousFacing,
      releasedPreviousTrack: false,
      errorCode: 'unsupported'
    };
  }

  let videoInputs = options.videoInputs || [];
  if (videoInputs.length === 0 && md.enumerateDevices) {
    try {
      const all = await md.enumerateDevices();
      videoInputs = all
        .filter((d) => d.kind === 'videoinput' && Boolean(d.deviceId))
        .map((d) => ({ deviceId: d.deviceId, label: d.label, kind: d.kind }));
    } catch {
      // Ignore enumerateDevices errors
    }
  }

  const candidateDevice = targetDeviceId
    ? { deviceId: targetDeviceId, label: '' }
    : pickNextVideoInputDevice(videoInputs, currentDeviceId, targetFacing);

  const attemptList: MediaStreamConstraints[] = targetDeviceId
    ? [
        buildCameraSwitchConstraints(presetId, { deviceId: targetDeviceId }),
        buildCameraSwitchConstraints(presetId, {
          deviceId: targetDeviceId,
          relaxedResolution: true
        })
      ]
    : [
        buildCameraSwitchConstraints(presetId, {
          facingMode: targetFacing,
          exactFacing: true
        }),
        buildCameraSwitchConstraints(presetId, {
          facingMode: targetFacing,
          exactFacing: true,
          relaxedResolution: true
        }),
        ...(candidateDevice
          ? [
              buildCameraSwitchConstraints(presetId, {
                deviceId: candidateDevice.deviceId
              }),
              buildCameraSwitchConstraints(presetId, {
                deviceId: candidateDevice.deviceId,
                relaxedResolution: true
              })
            ]
          : [])
      ];

  let lastErrorName = '';
  const tryConstraints = async (
    constraints: MediaStreamConstraints,
    allowSameDeviceIfFacingMatches = true
  ): Promise<{ stream: MediaStream; track: MediaStreamTrack } | null> => {
    try {
      const stream = await md.getUserMedia(constraints);
      stream.getAudioTracks().forEach((t) => t.stop());
      const track = stream.getVideoTracks()[0];
      if (!track) return null;

      const settings = track.getSettings?.() || {};
      const newDeviceId = settings.deviceId;
      const resolvedFacing = resolveTrackFacingMode(track, targetFacing);

      if (
        !targetDeviceId &&
        currentDeviceId &&
        newDeviceId &&
        newDeviceId === currentDeviceId &&
        (!allowSameDeviceIfFacingMatches || resolvedFacing !== targetFacing)
      ) {
        track.stop();
        return null;
      }

      return { stream, track };
    } catch (err) {
      lastErrorName = getErrorName(err);
      return null;
    }
  };

  for (const constraints of attemptList) {
    const acquired = await tryConstraints(constraints, true);
    if (acquired) {
      const resolvedFacing = resolveTrackFacingMode(acquired.track, targetFacing);
      const resolvedDeviceId =
        acquired.track.getSettings?.().deviceId || candidateDevice?.deviceId;
      return {
        track: acquired.track,
        stream: acquired.stream,
        recoveryTrack: null,
        recoveryStream: null,
        resolvedFacing,
        resolvedDeviceId,
        releasedPreviousTrack: false,
        errorCode: 'none'
      };
    }
    if (lastErrorName === 'NotAllowedError' || lastErrorName === 'SecurityError') {
      return {
        track: null,
        stream: null,
        recoveryTrack: null,
        recoveryStream: null,
        resolvedFacing: previousFacing,
        releasedPreviousTrack: false,
        errorCode: 'permission-denied'
      };
    }
  }

  // If the device only exposes one camera and we aren't selecting a different explicit deviceId,
  // avoid disrupting the active camera track.
  if (!targetDeviceId && videoInputs.length === 1) {
    return {
      track: null,
      stream: null,
      recoveryTrack: null,
      recoveryStream: null,
      resolvedFacing: previousFacing,
      releasedPreviousTrack: false,
      errorCode: 'single-camera'
    };
  }

  // Mobile hardware (iOS Safari / Android WebView) often requires releasing the active camera track
  // before opening the opposite lens.
  let releasedPreviousTrack = false;
  if (onReleaseCurrentTrack) {
    await onReleaseCurrentTrack();
    releasedPreviousTrack = true;
    await waitMs(releaseDelayMs);

    const retryList: MediaStreamConstraints[] = [
      ...attemptList,
      ...(!targetDeviceId
        ? [
            buildCameraSwitchConstraints(presetId, {
              facingMode: targetFacing,
              exactFacing: false,
              relaxedResolution: true
            })
          ]
        : [])
    ];

    for (const constraints of retryList) {
      const acquired = await tryConstraints(constraints, false);
      if (acquired) {
        const resolvedFacing = resolveTrackFacingMode(acquired.track, targetFacing);
        const resolvedDeviceId =
          acquired.track.getSettings?.().deviceId || candidateDevice?.deviceId;
        return {
          track: acquired.track,
          stream: acquired.stream,
          recoveryTrack: null,
          recoveryStream: null,
          resolvedFacing,
          resolvedDeviceId,
          releasedPreviousTrack: true,
          errorCode: 'none'
        };
      }
      if (lastErrorName === 'NotAllowedError' || lastErrorName === 'SecurityError') {
        break;
      }
    }
  }

  // Attempt to restore the previous camera if we released it so the user is never left with black video
  let recoveryStream: MediaStream | null = null;
  let recoveryTrack: MediaStreamTrack | null = null;
  if (releasedPreviousTrack) {
    const recoveryConstraints = currentDeviceId
      ? buildCameraSwitchConstraints(presetId, {
          deviceId: currentDeviceId,
          relaxedResolution: true
        })
      : buildCameraSwitchConstraints(presetId, {
          facingMode: previousFacing,
          exactFacing: false,
          relaxedResolution: true
        });
    try {
      const restored = await md.getUserMedia(recoveryConstraints);
      restored.getAudioTracks().forEach((t) => t.stop());
      const track = restored.getVideoTracks()[0];
      if (track) {
        recoveryStream = restored;
        recoveryTrack = track;
      }
    } catch {
      // Recovery failed too
    }
  }

  const errorCode =
    lastErrorName === 'NotAllowedError' || lastErrorName === 'SecurityError'
      ? 'permission-denied'
      : lastErrorName === 'NotReadableError' || lastErrorName === 'AbortError'
        ? 'device-busy'
        : videoInputs.length <= 1
          ? 'single-camera'
          : 'unavailable';

  return {
    track: null,
    stream: null,
    recoveryTrack,
    recoveryStream,
    resolvedFacing: previousFacing,
    releasedPreviousTrack,
    errorCode
  };
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
