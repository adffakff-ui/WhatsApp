export const MAX_VOICE_RECORDING_SECONDS = 90;
export const MAX_VOICE_DATA_URL_CHARS = 285_000;
export const VOICE_WAVEFORM_BAR_COUNT = 28;
export const VOICE_PLAYBACK_RATES = [1, 1.5, 2] as const;

export type VoicePlaybackRate = (typeof VOICE_PLAYBACK_RATES)[number];

export const SUPPORTED_VOICE_MIME_TYPES = [
  'audio/webm;codecs=opus',
  'audio/webm',
  'audio/ogg;codecs=opus',
  'audio/mp4',
  'audio/aac'
] as const;

const DEFAULT_WAVEFORM = [
  28, 46, 68, 42, 86, 62, 48, 78, 92, 58, 44, 72, 82, 38,
  56, 34, 52, 74, 46, 64, 88, 54, 40, 70, 60, 44, 52, 32
];

export function isVoiceRecordingSupported(): boolean {
  return (
    typeof navigator !== 'undefined' &&
    Boolean(navigator.mediaDevices?.getUserMedia) &&
    typeof MediaRecorder !== 'undefined'
  );
}

export function pickSupportedVoiceMimeType(): string | undefined {
  if (
    typeof MediaRecorder === 'undefined' ||
    typeof MediaRecorder.isTypeSupported !== 'function'
  ) {
    return undefined;
  }
  return SUPPORTED_VOICE_MIME_TYPES.find((mime) => {
    try {
      return MediaRecorder.isTypeSupported(mime);
    } catch {
      return false;
    }
  });
}

export function computeAudioLevelPercent(timeDomainData: Uint8Array): number {
  if (!timeDomainData || timeDomainData.length === 0) return 18;
  let sumSq = 0;
  for (let i = 0; i < timeDomainData.length; i += 1) {
    const centered = (timeDomainData[i] - 128) / 128;
    sumSq += centered * centered;
  }
  const rms = Math.sqrt(sumSq / timeDomainData.length);
  const boosted = Math.round(Math.min(100, Math.max(12, rms * 340)));
  return boosted;
}

export function downsampleWaveform(
  samples: number[],
  targetCount = VOICE_WAVEFORM_BAR_COUNT
): number[] {
  const safeCount = Math.max(8, Math.min(64, Math.floor(targetCount)));
  if (!Array.isArray(samples) || samples.length === 0) {
    return DEFAULT_WAVEFORM.slice(0, safeCount);
  }

  const out: number[] = [];
  const step = samples.length / safeCount;
  for (let i = 0; i < safeCount; i += 1) {
    const start = Math.floor(i * step);
    const end = Math.max(start + 1, Math.floor((i + 1) * step));
    let peak = 0;
    let total = 0;
    let count = 0;
    for (let j = start; j < end && j < samples.length; j += 1) {
      const val = Number.isFinite(samples[j]) ? samples[j] : 24;
      if (val > peak) peak = val;
      total += val;
      count += 1;
    }
    const blended = count > 0 ? Math.round((peak * 0.65 + (total / count) * 0.35)) : 24;
    out.push(Math.max(16, Math.min(96, blended)));
  }
  return out;
}

export function normalizeVoiceWaveform(
  waveform?: number[],
  targetCount = VOICE_WAVEFORM_BAR_COUNT
): number[] {
  if (!Array.isArray(waveform) || waveform.length === 0) {
    return DEFAULT_WAVEFORM.slice(0, targetCount);
  }
  return downsampleWaveform(waveform, targetCount);
}

export function getNextVoicePlaybackRate(current: VoicePlaybackRate): VoicePlaybackRate {
  const idx = VOICE_PLAYBACK_RATES.indexOf(current);
  if (idx === -1 || idx === VOICE_PLAYBACK_RATES.length - 1) {
    return VOICE_PLAYBACK_RATES[0];
  }
  return VOICE_PLAYBACK_RATES[idx + 1];
}

export function mapMicrophoneErrorToArabic(error: unknown): string {
  if (typeof window !== 'undefined' && window.isSecureContext === false) {
    return 'يتطلب تسجيل الصوت اتصالاً آمناً (HTTPS) وصلاحية الميكروفون.';
  }

  const errName =
    error && typeof error === 'object' && 'name' in error
      ? String((error as { name?: unknown }).name || '')
      : '';
  const errMsg =
    error instanceof Error
      ? error.message.toLowerCase()
      : typeof error === 'string'
        ? error.toLowerCase()
        : '';

  if (
    errName === 'NotAllowedError' ||
    errName === 'PermissionDeniedError' ||
    errMsg.includes('permission') ||
    errMsg.includes('denied')
  ) {
    return 'تم رفض إذن الميكروفون. فعّل إذن الميكروفون من إعدادات المتصفح أو التطبيق ثم حاول مجدداً.';
  }

  if (
    errName === 'NotFoundError' ||
    errName === 'DevicesNotFoundError' ||
    errMsg.includes('requested device not found')
  ) {
    return 'لم يتم العثور على ميكروفون متصل بهذا الجهاز.';
  }

  if (
    errName === 'NotReadableError' ||
    errName === 'TrackStartError' ||
    errMsg.includes('could not start audio source')
  ) {
    return 'الميكروفون مستخدم حالياً من تطبيق آخر. أغلقه ثم أعد المحاولة.';
  }

  if (errName === 'SecurityError' || errMsg.includes('secure context')) {
    return 'يتطلب الوصول إلى الميكروفون اتصالاً آمناً (HTTPS).';
  }

  if (errName === 'NotSupportedError' || errMsg.includes('mediarecorder')) {
    return 'المتصفح الحالي لا يدعم تسجيل الرسائل الصوتية عبر MediaRecorder.';
  }

  return 'تعذر بدء تسجيل الصوت عبر الميكروفون. تأكد من صلاحيات الصوت ثم أعد المحاولة.';
}

export function formatVoiceSizeLabel(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '1 KB';
  const kb = Math.max(1, Math.round(bytes / 1024));
  if (kb >= 1024) return `${(kb / 1024).toFixed(1)} MB`;
  return `${kb} KB`;
}

export function formatVoiceDownloadName(createdAtMs: number, mimeOrDataUrl?: string): string {
  const date = new Date(createdAtMs || Date.now());
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  const lower = (mimeOrDataUrl || '').toLowerCase();
  const ext = lower.includes('ogg')
    ? 'ogg'
    : lower.includes('mp4') || lower.includes('aac') || lower.includes('m4a')
      ? 'm4a'
      : 'webm';
  return `wasil-voice-${y}${m}${d}.${ext}`;
}

export function blobToAudioDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('تعذر تحويل المقطع الصوتي للإرسال.'));
    reader.onloadend = () => {
      const result = typeof reader.result === 'string' ? reader.result : '';
      if (!result || !result.startsWith('data:')) {
        reject(new Error('تنسيق المقطع الصوتي المسجل غير صالح.'));
        return;
      }
      resolve(result);
    };
    reader.readAsDataURL(blob);
  });
}
