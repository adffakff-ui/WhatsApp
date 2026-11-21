export type ListeningBoostLevel = 'normal' | 'clear' | 'loud';

export interface ListeningBoostPreset {
  id: ListeningBoostLevel;
  label: string;
  gain: number;
  badge: string;
}

export const LISTENING_BOOST_PRESETS: Record<ListeningBoostLevel, ListeningBoostPreset> = {
  normal: {
    id: 'normal',
    label: 'عادي (100%)',
    gain: 1.0,
    badge: '100%'
  },
  clear: {
    id: 'clear',
    label: 'واضح (135%)',
    gain: 1.35,
    badge: '135%'
  },
  loud: {
    id: 'loud',
    label: 'معزز (175%)',
    gain: 1.75,
    badge: '175%'
  }
};

export const VOICE_CLARITY_DSP_CONFIG = {
  highPassHz: 85,
  highPassQ: 0.7,
  warmthShelfHz: 220,
  warmthGainDb: -1.5,
  presenceHz: 2800,
  presenceQ: 1.1,
  presenceGainDb: 4.0,
  compressorThresholdDb: -22,
  compressorKneeDb: 18,
  compressorRatio: 3.5,
  compressorAttackSec: 0.005,
  compressorReleaseSec: 0.16
} as const;

export function getBoostGainValue(
  level: ListeningBoostLevel,
  voiceClarityEnabled: boolean
): number {
  const base = LISTENING_BOOST_PRESETS[level]?.gain ?? 1.0;
  return voiceClarityEnabled ? base : Math.min(1.5, base);
}

export function computeNormalizedBandLevels(
  frequencyBytes: Uint8Array,
  bandCount = 5,
  floor = 16
): number[] {
  if (!frequencyBytes || frequencyBytes.length === 0 || bandCount <= 0) {
    return Array.from({ length: Math.max(1, bandCount) }, () => floor);
  }
  const usableLen = Math.max(bandCount, Math.min(frequencyBytes.length, 24));
  const step = Math.max(1, Math.floor(usableLen / bandCount));
  const out: number[] = [];
  for (let b = 0; b < bandCount; b++) {
    let sum = 0;
    let count = 0;
    const start = b * step;
    const end = Math.min(usableLen, start + step);
    for (let i = start; i < end; i++) {
      sum += frequencyBytes[i] || 0;
      count++;
    }
    const avg = count > 0 ? sum / count : 0;
    out.push(Math.max(floor, Math.min(100, Math.round((avg / 255) * 100))));
  }
  return out;
}

export function isSpeechActiveFromLevels(levels: number[], threshold = 24): boolean {
  return levels.some((lvl) => lvl >= threshold);
}

export interface RemoteAudioEnhancerHandle {
  updateStream: (stream: MediaStream | null) => void;
  setOptions: (opts: { clarityEnabled: boolean; boostLevel: ListeningBoostLevel }) => void;
  getProcessedStream: () => MediaStream | null;
  getBandLevels: () => number[];
  resume: () => Promise<void>;
  dispose: () => void;
}

/**
 * Creates a real-time Web Audio DSP graph for incoming peer audio:
 * HighPass (85Hz rumble removal) -> Warmth Trim -> Vocal Presence Boost (2.8kHz)
 * -> Dynamics Compressor -> Boost Gain -> MediaStreamDestination + Analyser.
 */
export function createRemoteAudioEnhancer(initialOpts: {
  clarityEnabled: boolean;
  boostLevel: ListeningBoostLevel;
}): RemoteAudioEnhancerHandle | null {
  if (typeof window === 'undefined') return null;
  const AudioCtx =
    window.AudioContext ||
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AudioCtx) return null;

  let ctx: AudioContext;
  try {
    ctx = new AudioCtx({ latencyHint: 'interactive' });
  } catch {
    try {
      ctx = new AudioCtx();
    } catch {
      return null;
    }
  }

  const highPass = ctx.createBiquadFilter();
  highPass.type = 'highpass';
  highPass.frequency.value = VOICE_CLARITY_DSP_CONFIG.highPassHz;
  highPass.Q.value = VOICE_CLARITY_DSP_CONFIG.highPassQ;

  const warmth = ctx.createBiquadFilter();
  warmth.type = 'lowshelf';
  warmth.frequency.value = VOICE_CLARITY_DSP_CONFIG.warmthShelfHz;

  const presence = ctx.createBiquadFilter();
  presence.type = 'peaking';
  presence.frequency.value = VOICE_CLARITY_DSP_CONFIG.presenceHz;
  presence.Q.value = VOICE_CLARITY_DSP_CONFIG.presenceQ;

  const compressor = ctx.createDynamicsCompressor();
  compressor.threshold.value = VOICE_CLARITY_DSP_CONFIG.compressorThresholdDb;
  compressor.knee.value = VOICE_CLARITY_DSP_CONFIG.compressorKneeDb;
  compressor.ratio.value = VOICE_CLARITY_DSP_CONFIG.compressorRatio;
  compressor.attack.value = VOICE_CLARITY_DSP_CONFIG.compressorAttackSec;
  compressor.release.value = VOICE_CLARITY_DSP_CONFIG.compressorReleaseSec;

  const gainNode = ctx.createGain();
  const analyser = ctx.createAnalyser();
  analyser.fftSize = 64;
  analyser.smoothingTimeConstant = 0.72;

  const destination = ctx.createMediaStreamDestination();
  const freqBytes = new Uint8Array(analyser.frequencyBinCount);

  highPass.connect(warmth);
  warmth.connect(presence);
  presence.connect(compressor);
  compressor.connect(gainNode);
  gainNode.connect(analyser);
  gainNode.connect(destination);

  let currentSource: MediaStreamAudioSourceNode | null = null;
  let boundTrackIdsKey = '';
  let currentClarity = initialOpts.clarityEnabled;
  let currentBoost = initialOpts.boostLevel;

  const applyFilterSettings = () => {
    const now = ctx.currentTime;
    highPass.frequency.setTargetAtTime(
      currentClarity ? VOICE_CLARITY_DSP_CONFIG.highPassHz : 20,
      now,
      0.03
    );
    warmth.gain.setTargetAtTime(
      currentClarity ? VOICE_CLARITY_DSP_CONFIG.warmthGainDb : 0,
      now,
      0.03
    );
    presence.gain.setTargetAtTime(
      currentClarity ? VOICE_CLARITY_DSP_CONFIG.presenceGainDb : 0,
      now,
      0.03
    );
    compressor.ratio.setTargetAtTime(
      currentClarity ? VOICE_CLARITY_DSP_CONFIG.compressorRatio : 1,
      now,
      0.03
    );
    gainNode.gain.setTargetAtTime(
      getBoostGainValue(currentBoost, currentClarity),
      now,
      0.03
    );
  };

  applyFilterSettings();

  return {
    updateStream(stream: MediaStream | null) {
      const audioTracks = stream ? stream.getAudioTracks().filter((t) => t.readyState === 'live') : [];
      const nextKey = audioTracks.map((t) => t.id).sort().join(',');
      if (nextKey === boundTrackIdsKey && currentSource) return;
      boundTrackIdsKey = nextKey;

      if (currentSource) {
        try {
          currentSource.disconnect();
        } catch {
          // ignore disconnect errors
        }
        currentSource = null;
      }

      if (!stream || audioTracks.length === 0) return;

      try {
        // Bind a stream wrapper containing live audio tracks so AudioContext processes cleanly
        const audioOnlyStream = new MediaStream(audioTracks);
        currentSource = ctx.createMediaStreamSource(audioOnlyStream);
        currentSource.connect(highPass);
        if (ctx.state === 'suspended') {
          void ctx.resume().catch(() => {});
        }
      } catch {
        currentSource = null;
      }
    },

    setOptions(opts) {
      currentClarity = opts.clarityEnabled;
      currentBoost = opts.boostLevel;
      applyFilterSettings();
    },

    getProcessedStream() {
      return destination.stream;
    },

    getBandLevels() {
      if (!currentSource) return [16, 18, 20, 18, 16];
      analyser.getByteFrequencyData(freqBytes);
      return computeNormalizedBandLevels(freqBytes, 5, 16);
    },

    async resume() {
      if (ctx.state === 'suspended') {
        await ctx.resume().catch(() => {});
      }
    },

    dispose() {
      if (currentSource) {
        try {
          currentSource.disconnect();
        } catch {
          // ignore
        }
        currentSource = null;
      }
      void ctx.close().catch(() => {});
    }
  };
}

export interface MixedAudioRelaySession {
  mixedTrack: MediaStreamTrack;
  stop: () => void;
}

/**
 * Mixes a playing <audio> element (transferred sound clip) with the user's microphone
 * track into a single WebRTC-ready MediaStreamTrack so the remote participant hears
 * both the user's voice and the shared audio cleanly.
 */
export function createMixedAudioRelay(
  micTrack: MediaStreamTrack | null,
  audioElement: HTMLAudioElement
): MixedAudioRelaySession | null {
  if (typeof window === 'undefined') return null;
  const AudioCtx =
    window.AudioContext ||
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AudioCtx) return null;

  let ctx: AudioContext;
  try {
    ctx = new AudioCtx({ latencyHint: 'interactive' });
  } catch {
    return null;
  }

  const dest = ctx.createMediaStreamDestination();
  const sources: AudioNode[] = [];

  try {
    const mediaElSource = ctx.createMediaElementSource(audioElement);
    const clipSendGain = ctx.createGain();
    clipSendGain.gain.value = 0.85;
    mediaElSource.connect(clipSendGain);
    clipSendGain.connect(dest);
    // Also monitor locally at gentle volume so the sender hears what they are transferring
    const localMonitorGain = ctx.createGain();
    localMonitorGain.gain.value = 0.45;
    mediaElSource.connect(localMonitorGain);
    localMonitorGain.connect(ctx.destination);
    sources.push(mediaElSource);

    if (micTrack && micTrack.readyState === 'live') {
      const micSource = ctx.createMediaStreamSource(new MediaStream([micTrack]));
      const micGain = ctx.createGain();
      micGain.gain.value = 1.0;
      micSource.connect(micGain);
      micGain.connect(dest);
      sources.push(micSource);
    }

    if (ctx.state === 'suspended') {
      void ctx.resume().catch(() => {});
    }
  } catch {
    void ctx.close().catch(() => {});
    return null;
  }

  const mixedTrack = dest.stream.getAudioTracks()[0];
  if (!mixedTrack) {
    void ctx.close().catch(() => {});
    return null;
  }

  return {
    mixedTrack,
    stop() {
      for (const node of sources) {
        try {
          node.disconnect();
        } catch {
          // ignore
        }
      }
      mixedTrack.stop();
      void ctx.close().catch(() => {});
    }
  };
}
