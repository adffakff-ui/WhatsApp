import type {
  CallRecord,
  ChatRoom,
  DecryptedMessage,
  OmarSettings,
  PrivacySettings,
  StatusItem,
  UserProfile
} from '../types/chat';

export interface PhoneValidationResult {
  valid: boolean;
  e164: string;
  nationalDigits: string;
  error?: string;
}

/**
 * Strips formatting/leading trunk zero and normalizes dial code + local digits into E.164 format.
 */
export function normalizePhoneToE164(
  dialCode: string,
  rawNumber: string,
  minDigits = 7,
  maxDigits = 12
): PhoneValidationResult {
  const cleanDial = dialCode.startsWith('+') ? `+${dialCode.replace(/\D/g, '')}` : `+${dialCode.replace(/\D/g, '')}`;
  let digits = rawNumber.replace(/\D/g, '');

  // Strip country code prefix if pasted twice (e.g. 966501234567 with +966 selected)
  const dialDigits = cleanDial.slice(1);
  if (digits.startsWith(`00${dialDigits}`)) {
    digits = digits.slice(2 + dialDigits.length);
  } else if (digits.startsWith(dialDigits) && digits.length > maxDigits) {
    digits = digits.slice(dialDigits.length);
  }

  // Strip single leading trunk zero (e.g. 0501234567 -> 501234567)
  while (digits.startsWith('0')) {
    digits = digits.slice(1);
  }

  if (digits.length < minDigits) {
    return {
      valid: false,
      e164: `${cleanDial}${digits}`,
      nationalDigits: digits,
      error: `رقم الهاتف قصير جداً (يجب أن يكون ${minDigits} أرقام على الأقل بدون الصفر الأول).`
    };
  }

  if (digits.length > maxDigits) {
    return {
      valid: false,
      e164: `${cleanDial}${digits}`,
      nationalDigits: digits,
      error: `رقم الهاتف أطول من المسموح (${maxDigits} أرقام كحد أقصى).`
    };
  }

  return {
    valid: true,
    e164: `${cleanDial}${digits}`,
    nationalDigits: digits
  };
}

export function formatPhoneDisplay(dialCode: string, nationalDigits: string): string {
  const clean = nationalDigits.replace(/\D/g, '');
  if (!clean) return dialCode;
  const groups = clean.match(/.{1,3}/g) || [clean];
  return `${dialCode} ${groups.join(' ')}`;
}

/**
 * Strips whitespace, non-breaking spaces, and invisible Unicode bidi/zero-width marks
 * that mobile Arabic/autocomplete keyboards frequently inject around email addresses.
 */
export function sanitizeEmailInput(rawEmail: string): string {
  return rawEmail.replace(/[\s\u00A0\u200B-\u200F\u202A-\u202E\u2060\uFEFF]/g, '');
}

export function validateEmailAddress(email: string): boolean {
  const cleaned = sanitizeEmailInput(email);
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(cleaned);
}

/**
 * Detects embedded Android WebView (`wv` token in User-Agent) where Google OAuth popups
 * are disallowed by Google policy and Firebase Auth handler popups cannot communicate back.
 */
export function isEmbeddedAndroidWebView(): boolean {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent || '';
  return /\bAndroid\b/i.test(ua) && /\bwv\b/i.test(ua);
}

export interface PasswordStrengthResult {
  score: 0 | 1 | 2 | 3 | 4;
  label: string;
  hasMinLength: boolean;
  hasUppercaseOrSymbol: boolean;
  hasNumber: boolean;
}

export function validatePasswordStrength(password: string): PasswordStrengthResult {
  const hasMinLength = password.length >= 8;
  const hasNumber = /\d/.test(password);
  const hasLetter = /[a-zA-Z\u0600-\u06FF]/.test(password);
  const hasUppercaseOrSymbol = /[A-Z!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?]/.test(password);

  let rawScore = 0;
  if (password.length >= 6) rawScore += 1;
  if (hasMinLength && hasLetter) rawScore += 1;
  if (hasNumber) rawScore += 1;
  if (hasUppercaseOrSymbol && password.length >= 8) rawScore += 1;

  const score = Math.min(4, Math.max(0, rawScore)) as 0 | 1 | 2 | 3 | 4;
  const labels = ['فارغة', 'ضعيفة', 'متوسطة', 'جيدة', 'قوية جداً'];

  return {
    score,
    label: password.length === 0 ? labels[0] : labels[score],
    hasMinLength,
    hasUppercaseOrSymbol,
    hasNumber
  };
}

export function mapFirebaseAuthErrorToArabic(error: unknown): string {
  const code =
    typeof error === 'object' && error !== null && 'code' in error
      ? String((error as { code?: unknown }).code || '')
      : '';
  const msg = error instanceof Error ? error.message : String(error || '');
  const combined = `${code} ${msg}`.toLowerCase();

  if (combined.includes('auth/invalid-credential') || combined.includes('auth/wrong-password')) {
    return 'بيانات الدخول غير صحيحة. تأكد من البريد الإلكتروني وكلمة المرور.';
  }
  if (combined.includes('auth/user-not-found')) {
    return 'لا يوجد حساب مسجل بهذا البريد الإلكتروني. يمكنك إنشاء حساب جديد.';
  }
  if (combined.includes('auth/email-already-in-use')) {
    return 'هذا البريد الإلكتروني مسجل مسبقاً. انتقل إلى تبويب تسجيل الدخول.';
  }
  if (combined.includes('auth/weak-password')) {
    return 'كلمة المرور ضعيفة جداً. يُنصح باستخدام 8 أحرف وأرقام على الأقل.';
  }
  if (combined.includes('auth/invalid-email')) {
    return 'صيغة البريد الإلكتروني غير صحيحة.';
  }
  if (combined.includes('auth/popup-blocked')) {
    return 'تم حظر النافذة المنبثقة من المتصفح. اسمح بالنوافذ المنبثقة أو استخدم الدخول بالبريد الإلكتروني أو رقم الهاتف.';
  }
  if (combined.includes('auth/popup-closed-by-user')) {
    return 'تم إغلاق نافذة المصادقة قبل إتمام تسجيل الدخول.';
  }
  if (combined.includes('auth/too-many-requests')) {
    return 'تم إرسال عدد كبير من المحاولات. يرجى الانتظار قليلاً ثم المحاولة مجدداً.';
  }
  if (combined.includes('auth/invalid-verification-code')) {
    return 'رمز التحقق (OTP) غير صحيح. يرجى مراجعة الرمز والمحاولة مجدداً.';
  }
  if (combined.includes('auth/code-expired')) {
    return 'انتهت صلاحية رمز التحقق. اطلب إعادة إرسال رمز جديد.';
  }
  if (combined.includes('auth/invalid-phone-number') || combined.includes('auth/missing-phone-number')) {
    return 'رقم الهاتف غير صالح. تأكد من اختيار رمز الدولة الصحيح وإدخال الرقم كاملاً.';
  }
  if (combined.includes('auth/unauthorized-domain')) {
    const currentHost =
      typeof window !== 'undefined' && window.location?.hostname
        ? window.location.hostname
        : 'النطاق الحالي';
    return `النطاق (${currentHost}) غير مضاف ضمن النطاقات المصرح بها (Authorized domains) في Firebase Authentication. يمكنك تسجيل الدخول بالبريد الإلكتروني مباشرة، أو إضافة هذا النطاق في لوحة تحكم Firebase لتفعيل Google و Drive.`;
  }
  if (
    combined.includes('auth/invalid-action-code') ||
    combined.includes('auth/expired-action-code') ||
    combined.includes('requested action is invalid')
  ) {
    return 'انتهت صلاحية رابط التحقق أو أن الطلب غير صالح. أعد طلب رابط جديد أو استخدم تسجيل الدخول بالبريد الإلكتروني.';
  }
  if (combined.includes('auth/cancelled-popup-request')) {
    return 'تم إلغاء نافذة المصادقة بسبب طلب تسجيل دخول آخر قيد التنفيذ.';
  }
  if (combined.includes('auth/web-storage-unsupported')) {
    return 'المتصفح الحالي يعطّل التخزين المحلي المطلوب للمصادقة. فعّل ملفات تعريف الارتباط أو افتح التطبيق في Chrome.';
  }
  if (combined.includes('auth/user-disabled')) {
    return 'تم تعطيل هذا الحساب من قبل مسؤول المشروع في Firebase.';
  }
  if (combined.includes('auth/operation-not-allowed')) {
    return 'طريقة الدخول هذه غير مفعّلة في إعدادات مشروع Firebase حالياً. يمكنك الدخول عبر Google أو البريد الإلكتروني.';
  }
  if (combined.includes('auth/captcha-check-failed') || combined.includes('recaptcha')) {
    return 'تعذر إتمام التحقق الأمني (reCAPTCHA) في هذا النطاق. استخدم تسجيل الدخول عبر Google أو البريد الإلكتروني.';
  }
  if (combined.includes('auth/network-request-failed')) {
    return 'تعذر الاتصال بالخادم. تحقق من اتصال الإنترنت وحاول مرة أخرى.';
  }
  return msg || 'حدث خطأ غير متوقع أثناء المصادقة. حاول مرة أخرى.';
}

export interface ParsedWasilBackup {
  profile?: Partial<UserProfile>;
  omarSettings?: Partial<OmarSettings>;
  privacySettings?: Partial<PrivacySettings>;
  chats?: ChatRoom[];
  messages?: Record<string, DecryptedMessage[]>;
  statuses?: StatusItem[];
  calls?: CallRecord[];
}

export function parseWasilBackupJson(rawJson: string): ParsedWasilBackup {
  let parsed: unknown;
  try {
    parsed = JSON.parse(rawJson);
  } catch {
    throw new Error('ملف النسخة الاحتياطية غير صالح (تنسيق JSON غير صحيح).');
  }

  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('بنية ملف النسخة الاحتياطية غير مدعومة.');
  }

  const obj = parsed as Record<string, unknown>;
  const hasKnownKey =
    'chats' in obj ||
    'messages' in obj ||
    'omarSettings' in obj ||
    'profile' in obj ||
    'statuses' in obj;

  if (!hasKnownKey) {
    throw new Error('هذا الملف لا يحتوي على بيانات نسخة احتياطية خاصة بتطبيق تواصل.');
  }

  return {
    profile: obj.profile && typeof obj.profile === 'object' ? (obj.profile as Partial<UserProfile>) : undefined,
    omarSettings:
      obj.omarSettings && typeof obj.omarSettings === 'object'
        ? (obj.omarSettings as Partial<OmarSettings>)
        : undefined,
    privacySettings:
      obj.privacySettings && typeof obj.privacySettings === 'object'
        ? (obj.privacySettings as Partial<PrivacySettings>)
        : undefined,
    chats: Array.isArray(obj.chats) ? (obj.chats as ChatRoom[]) : undefined,
    messages:
      obj.messages && typeof obj.messages === 'object' && !Array.isArray(obj.messages)
        ? (obj.messages as Record<string, DecryptedMessage[]>)
        : undefined,
    statuses: Array.isArray(obj.statuses) ? (obj.statuses as StatusItem[]) : undefined,
    calls: Array.isArray(obj.calls) ? (obj.calls as CallRecord[]) : undefined
  };
}

export async function compressAvatarFileToDataUrl(file: File, maxSize = 256): Promise<string> {
  if (!file.type.startsWith('image/')) {
    throw new Error('يرجى اختيار ملف صورة صالح.');
  }

  const bitmapUrl = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error('تعذر قراءة ملف الصورة.'));
      el.src = bitmapUrl;
    });

    const scale = Math.min(1, maxSize / Math.max(img.width || maxSize, img.height || maxSize));
    const targetW = Math.max(1, Math.round(img.width * scale));
    const targetH = Math.max(1, Math.round(img.height * scale));

    const canvas = document.createElement('canvas');
    canvas.width = targetW;
    canvas.height = targetH;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('تعذر معالجة الصورة.');

    ctx.drawImage(img, 0, 0, targetW, targetH);
    return canvas.toDataURL('image/jpeg', 0.82);
  } finally {
    URL.revokeObjectURL(bitmapUrl);
  }
}
