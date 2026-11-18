export interface BiometricEnrollmentResult {
  credentialId: string;
  createdAtMs: number;
  label: string;
}

export function toArrayBuffer(view: Uint8Array): ArrayBuffer {
  const copy = new Uint8Array(view.byteLength);
  copy.set(view);
  return copy.buffer;
}

export function arrayBufferToBase64Url(buffer: ArrayBuffer | Uint8Array): string {
  const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i += 1) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

export function base64UrlToUint8Array(base64url: string): Uint8Array {
  const normalized = base64url.replace(/-/g, '+').replace(/_/g, '/');
  const padLength = (4 - (normalized.length % 4)) % 4;
  const padded = normalized + '='.repeat(padLength);
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

export function generateWebAuthnChallenge(byteLength = 32): Uint8Array {
  const challenge = new Uint8Array(byteLength);
  if (typeof globalThis.crypto !== 'undefined' && typeof globalThis.crypto.getRandomValues === 'function') {
    globalThis.crypto.getRandomValues(challenge);
  } else {
    for (let i = 0; i < byteLength; i += 1) {
      challenge[i] = Math.floor(Math.random() * 256);
    }
  }
  return challenge;
}

export function resolveSafeRpId(hostname?: string): string | undefined {
  const raw = (hostname ?? (typeof window !== 'undefined' ? window.location.hostname : '')).trim();
  if (!raw) return undefined;
  // IPv4 or IPv6 hosts are rejected as rpId by the WebAuthn specification
  const isIpV4 = /^\d{1,3}(\.\d{1,3}){3}$/.test(raw);
  const isIpV6 = raw.includes(':');
  if (isIpV4 || isIpV6) return undefined;
  return raw;
}

export function detectBiometricLabel(): string {
  if (typeof navigator === 'undefined') return 'البصمة الحيوية للجهاز';
  const ua = navigator.userAgent || '';
  if (/iPhone|iPad|Macintosh/i.test(ua)) return 'Face ID / Touch ID';
  if (/Android/i.test(ua)) return 'بصمة الإصبع أو فتح القفل بالوجه';
  if (/Windows/i.test(ua)) return 'Windows Hello (البصمة / الوجه)';
  return 'المصادقة الحيوية للجهاز (WebAuthn)';
}

export function isWebAuthnSupported(): boolean {
  if (typeof window === 'undefined' || typeof navigator === 'undefined') return false;
  if (window.isSecureContext === false) return false;
  return (
    typeof window.PublicKeyCredential === 'function' &&
    Boolean(navigator.credentials) &&
    typeof navigator.credentials.create === 'function' &&
    typeof navigator.credentials.get === 'function'
  );
}

export async function isPlatformAuthenticatorAvailable(): Promise<boolean> {
  if (!isWebAuthnSupported()) return false;
  if (typeof window.PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable !== 'function') {
    return false;
  }
  try {
    return await window.PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable();
  } catch {
    return false;
  }
}

export function buildBiometricRegistrationOptions(params: {
  userId: string;
  userName: string;
  displayName: string;
  rpId?: string;
  rpName?: string;
  challenge?: Uint8Array;
}): PublicKeyCredentialCreationOptions {
  const challengeBytes = params.challenge || generateWebAuthnChallenge(32);
  const userIdBytes = new TextEncoder().encode((params.userId || 'wasil_user').slice(0, 64));
  const rpId = resolveSafeRpId(params.rpId);

  return {
    challenge: toArrayBuffer(challengeBytes),
    rp: {
      name: params.rpName || 'تواصل - Wasil Messenger',
      ...(rpId ? { id: rpId } : {})
    },
    user: {
      id: toArrayBuffer(userIdBytes),
      name: params.userName || params.userId || 'wasil_user',
      displayName: params.displayName || 'مستخدم تواصل'
    },
    pubKeyCredParams: [
      { type: 'public-key', alg: -7 }, // ES256
      { type: 'public-key', alg: -257 } // RS256
    ],
    authenticatorSelection: {
      authenticatorAttachment: 'platform',
      residentKey: 'preferred',
      userVerification: 'required'
    },
    timeout: 60000,
    attestation: 'none'
  };
}

export function buildBiometricAuthenticationOptions(params: {
  credentialIdBase64Url: string;
  rpId?: string;
  challenge?: Uint8Array;
}): PublicKeyCredentialRequestOptions {
  const challengeBytes = params.challenge || generateWebAuthnChallenge(32);
  const credentialIdBytes = base64UrlToUint8Array(params.credentialIdBase64Url);
  const rpId = resolveSafeRpId(params.rpId);

  return {
    challenge: toArrayBuffer(challengeBytes),
    ...(rpId ? { rpId } : {}),
    allowCredentials: [
      {
        id: toArrayBuffer(credentialIdBytes),
        type: 'public-key',
        transports: ['internal']
      }
    ],
    userVerification: 'required',
    timeout: 60000
  };
}

export function mapWebAuthnErrorToArabic(err: unknown): string {
  const name =
    err && typeof err === 'object' && 'name' in err
      ? String((err as { name: unknown }).name)
      : '';
  switch (name) {
    case 'NotAllowedError':
    case 'AbortError':
      return 'تم إلغاء التحقق الحيوي أو انتهت المهلة. يمكنك المحاولة مجدداً أو استخدام رمز PIN.';
    case 'NotSupportedError':
      return 'جهازك أو المتصفح الحالي لا يدعم مستشعر البصمة أو الوجه لهذا النطاق.';
    case 'SecurityError':
      return 'يتطلب التحقق الحيوي سياقاً آمناً (HTTPS أو localhost) أو إذناً في الإطار الحالي.';
    case 'InvalidStateError':
      return 'بيانات البصمة مسجلة مسبقاً على هذا الجهاز.';
    default:
      return err instanceof Error && err.message
        ? err.message
        : 'تعذر إتمام المصادقة الحيوية. تأكد من تفعيل قفل الشاشة في جهازك أو استخدم رمز PIN.';
  }
}

export async function registerBiometricCredential(params: {
  userId: string;
  userName: string;
  displayName: string;
}): Promise<BiometricEnrollmentResult> {
  if (!isWebAuthnSupported()) {
    throw new Error('متصفحك الحالي لا يدعم واجهة المصادقة عبر الويب (Web Authentication API).');
  }

  const publicKey = buildBiometricRegistrationOptions(params);
  try {
    const credential = (await navigator.credentials.create({
      publicKey
    })) as PublicKeyCredential | null;

    if (!credential || !credential.rawId) {
      throw new Error('لم يتم إنشاء مفتاح المصادقة الحيوية.');
    }

    return {
      credentialId: arrayBufferToBase64Url(credential.rawId),
      createdAtMs: Date.now(),
      label: detectBiometricLabel()
    };
  } catch (err) {
    throw new Error(mapWebAuthnErrorToArabic(err));
  }
}

export async function verifyBiometricCredential(credentialIdBase64Url: string): Promise<boolean> {
  if (!isWebAuthnSupported()) {
    throw new Error('متصفحك الحالي لا يدعم التحقق عبر Web Authentication API.');
  }
  if (!credentialIdBase64Url) {
    throw new Error('لا توجد بصمة أو بيانات وجه مسجلة بعد.');
  }

  const publicKey = buildBiometricAuthenticationOptions({ credentialIdBase64Url });
  try {
    const assertion = (await navigator.credentials.get({
      publicKey
    })) as PublicKeyCredential | null;

    if (!assertion || !assertion.response) {
      return false;
    }
    return true;
  } catch (err) {
    throw new Error(mapWebAuthnErrorToArabic(err));
  }
}
