const DEVICE_ID_STORAGE_KEY = 'wasil_device_id_v1';
const VALID_DEVICE_ID_REGEX = /^[a-zA-Z0-9_-]{8,128}$/;

export interface ClientDeviceMetadata {
  deviceName: string;
  platform: string;
}

export function detectClientDeviceInfo(rawUserAgent?: string): ClientDeviceMetadata {
  const ua =
    rawUserAgent ??
    (typeof navigator !== 'undefined' && navigator.userAgent ? navigator.userAgent : '');

  let platform = 'Web';
  if (/Android/i.test(ua)) {
    platform = 'Android';
  } else if (/iPhone/i.test(ua)) {
    platform = 'iPhone';
  } else if (/iPad/i.test(ua)) {
    platform = 'iPad';
  } else if (/Windows/i.test(ua)) {
    platform = 'Windows';
  } else if (/Mac OS X|Macintosh/i.test(ua)) {
    platform = 'macOS';
  } else if (/Linux/i.test(ua)) {
    platform = 'Linux';
  }

  let browser = 'متصفح الويب';
  if (/Edg\//i.test(ua)) {
    browser = 'Edge';
  } else if (/Chrome\//i.test(ua) && !/Edg\//i.test(ua)) {
    browser = 'Chrome';
  } else if (/Firefox\//i.test(ua)) {
    browser = 'Firefox';
  } else if (/Safari\//i.test(ua) && !/Chrome\//i.test(ua)) {
    browser = 'Safari';
  }

  const deviceName = `${browser} · ${platform}`.slice(0, 100);
  return {
    deviceName,
    platform: platform.slice(0, 40)
  };
}

export function getOrCreateLocalDeviceId(): string {
  try {
    const existing = localStorage.getItem(DEVICE_ID_STORAGE_KEY);
    if (existing && VALID_DEVICE_ID_REGEX.test(existing)) {
      return existing;
    }
  } catch {
    // Ignore storage restriction
  }

  let randomPart = '';
  if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
    const bytes = new Uint8Array(12);
    crypto.getRandomValues(bytes);
    randomPart = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
  } else {
    randomPart = `${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
  }

  const generated = `dev_${randomPart}`.slice(0, 64);
  try {
    localStorage.setItem(DEVICE_ID_STORAGE_KEY, generated);
  } catch {
    // Ignore storage restriction
  }
  return generated;
}

export function isDeviceSessionActive(lastActiveAtMs: number, nowMs = Date.now()): boolean {
  return Math.abs(nowMs - lastActiveAtMs) <= 10 * 60 * 1000;
}

export function formatDeviceLastActive(
  lastActiveAtMs: number,
  isOnline: boolean,
  nowMs = Date.now()
): string {
  if (isOnline && isDeviceSessionActive(lastActiveAtMs, nowMs)) {
    return 'متصل ونشط الآن';
  }
  const diffMin = Math.max(0, Math.floor((nowMs - lastActiveAtMs) / 60_000));
  if (diffMin < 1) return 'نشط منذ لحظات';
  if (diffMin < 60) return `آخر نشاط منذ ${diffMin} دقيقة`;
  const diffHours = Math.floor(diffMin / 60);
  if (diffHours < 24) return `آخر نشاط منذ ${diffHours} ساعة`;
  const diffDays = Math.floor(diffHours / 24);
  return `آخر نشاط منذ ${diffDays} يوم`;
}
