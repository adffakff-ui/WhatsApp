import { useEffect, useMemo, useRef, useState } from 'react';
import { RecaptchaVerifier, signInWithPhoneNumber, type ConfirmationResult } from 'firebase/auth';
import {
  ArrowLeft,
  ArrowRight,
  Camera,
  Check,
  CheckCircle2,
  ChevronDown,
  Eye,
  EyeOff,
  FileUp,
  Globe,
  KeyRound,
  Lock,
  Mail,
  MessageSquareLock,
  Moon,
  Palette,
  Phone,
  QrCode,
  Shield,
  ShieldCheck,
  Sun,
  UserCheck,
  Video,
  X
} from 'lucide-react';
import { auth } from '../lib/firebase';
import { AUTH_COUNTRIES, type AuthCountry } from '../lib/authCountries';
import {
  compressAvatarFileToDataUrl,
  formatPhoneDisplay,
  mapFirebaseAuthErrorToArabic,
  normalizePhoneToE164,
  validateEmailAddress,
  validatePasswordStrength
} from '../lib/authHelpers';
import { OMAR_THEMES } from '../lib/omarConfig';
import { CountryPickerModal } from './CountryPickerModal';
import { PWAInstallButton } from './PWAInstallButton';
import type { OmarSettings, OmarThemeId, ThemeMode, UserProfile } from '../types/chat';

export type AuthStep = 'welcome' | 'auth' | 'profile';
export type AuthMethodTab = 'phone' | 'email' | 'google_qr';
export type EmailSubMode = 'login' | 'register' | 'reset';

export interface OnboardingCompletionPayload {
  displayName: string;
  about: string;
  avatarUrl: string;
  phone?: string;
  chatLockPin: string;
  appLockOnLaunch: boolean;
}

interface AuthScreenProps {
  theme: ThemeMode;
  omarSettings: OmarSettings;
  currentUser: UserProfile;
  isSigningIn: boolean;
  authError: string | null;
  onClearAuthError: () => void;
  onToggleTheme: () => void;
  onUpdateOmarSettings: (patch: Partial<OmarSettings>) => void;
  onGoogleSignIn: () => Promise<boolean>;
  onEmailSignIn: (email: string, password: string) => Promise<boolean>;
  onEmailSignUp: (
    displayName: string,
    email: string,
    password: string,
    deferEntryForProfileSetup?: boolean
  ) => Promise<boolean>;
  onResetPassword: (email: string) => Promise<boolean>;
  onPhoneAuthSuccess: (phoneE164: string, uid?: string) => void;
  onCompleteOnboarding: (payload: OnboardingCompletionPayload) => Promise<void>;
  onRestoreBackupJson: (rawJson: string) => Promise<void>;
}

const BIO_PRESETS = [
  'متاح · رسائلي مشفرة تماماً 🔐',
  'في العمل 💼',
  'الحمد لله دائماً 🌿',
  'مشغول حالياً · سأرد لاحقاً 🌙'
];

declare global {
  interface Window {
    wasilRecaptchaVerifier?: RecaptchaVerifier;
  }
}

export function AuthScreen({
  theme,
  omarSettings,
  currentUser,
  isSigningIn,
  authError,
  onClearAuthError,
  onToggleTheme,
  onUpdateOmarSettings,
  onGoogleSignIn,
  onEmailSignIn,
  onEmailSignUp,
  onResetPassword,
  onPhoneAuthSuccess,
  onCompleteOnboarding,
  onRestoreBackupJson
}: AuthScreenProps) {
  const [step, setStep] = useState<AuthStep>('welcome');
  const [methodTab, setMethodTab] = useState<AuthMethodTab>('phone');
  const [acceptedTerms, setAcceptedTerms] = useState(true);
  const [showPolicyModal, setShowPolicyModal] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  const [localSuccess, setLocalSuccess] = useState<string | null>(null);

  // Backup restore input ref
  const backupFileRef = useRef<HTMLInputElement>(null);

  // Step 2: Phone Auth state
  const [selectedCountry, setSelectedCountry] = useState<AuthCountry>(AUTH_COUNTRIES[0]);
  const [showCountryPicker, setShowCountryPicker] = useState(false);
  const [phoneInput, setPhoneInput] = useState('');
  const [showConfirmPhoneModal, setShowConfirmPhoneModal] = useState(false);
  const [phonePhase, setPhonePhase] = useState<'input' | 'otp'>('input');
  const [pendingE164, setPendingE164] = useState('');
  const [confirmationResult, setConfirmationResult] = useState<ConfirmationResult | null>(null);
  const [otpDigits, setOtpDigits] = useState<string[]>(['', '', '', '', '', '']);
  const [otpCountdown, setOtpCountdown] = useState(0);
  const [phoneBusy, setPhoneBusy] = useState(false);
  const otpRefs = useRef<(HTMLInputElement | null)[]>([]);

  // Step 2: Email Auth state
  const [emailSubMode, setEmailSubMode] = useState<EmailSubMode>('login');
  const [emailAddress, setEmailAddress] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [registerName, setRegisterName] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [emailBusy, setEmailBusy] = useState(false);

  // Step 3: Profile & Security setup
  const [profileName, setProfileName] = useState(currentUser.displayName || 'مستخدم تواصل');
  const [profileAbout, setProfileAbout] = useState(currentUser.about || BIO_PRESETS[0]);
  const [profileAvatar, setProfileAvatar] = useState(currentUser.avatarUrl || '');
  const [enableAppPin, setEnableAppPin] = useState(Boolean(omarSettings.appLockOnLaunch));
  const [setupPin, setSetupPin] = useState(omarSettings.chatLockPin || '1234');
  const [completingProfile, setCompletingProfile] = useState(false);
  const avatarFileRef = useRef<HTMLInputElement>(null);

  const phoneCheck = useMemo(
    () =>
      normalizePhoneToE164(
        selectedCountry.dialCode,
        phoneInput,
        selectedCountry.minDigits,
        selectedCountry.maxDigits
      ),
    [selectedCountry, phoneInput]
  );

  const passwordStrength = useMemo(() => validatePasswordStrength(password), [password]);
  const activeOmarTheme = useMemo(
    () => OMAR_THEMES.find((t) => t.id === omarSettings.omarTheme) || OMAR_THEMES[0],
    [omarSettings.omarTheme]
  );

  const combinedError = localError || authError;

  useEffect(() => {
    if (otpCountdown <= 0) return;
    const timer = window.setInterval(() => {
      setOtpCountdown((c) => (c > 0 ? c - 1 : 0));
    }, 1000);
    return () => window.clearInterval(timer);
  }, [otpCountdown]);

  useEffect(() => {
    return () => {
      try {
        window.wasilRecaptchaVerifier?.clear();
        window.wasilRecaptchaVerifier = undefined;
      } catch {
        // Ignore cleanup failure
      }
    };
  }, []);

  const clearNotices = () => {
    setLocalError(null);
    setLocalSuccess(null);
    onClearAuthError();
  };

  const handleContinueFromWelcome = () => {
    clearNotices();
    if (!acceptedTerms) {
      setLocalError('يرجى الموافقة على شروط الخدمة وسياسة الخصوصية للمتابعة.');
      return;
    }
    setStep('auth');
  };

  const handleRestoreFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    clearNotices();
    try {
      const text = await file.text();
      await onRestoreBackupJson(text);
    } catch (err) {
      setLocalError(err instanceof Error ? err.message : 'تعذر قراءة ملف النسخة الاحتياطية.');
    }
  };

  const handleTriggerPhoneVerifyModal = (e: React.FormEvent) => {
    e.preventDefault();
    clearNotices();
    if (!phoneCheck.valid) {
      setLocalError(phoneCheck.error || 'رقم الهاتف غير صالح.');
      return;
    }
    setShowConfirmPhoneModal(true);
  };

  const dispatchFirebasePhoneOtp = async (e164: string) => {
    setPhoneBusy(true);
    clearNotices();
    try {
      if (window.wasilRecaptchaVerifier) {
        try {
          window.wasilRecaptchaVerifier.clear();
        } catch {
          // ignore
        }
        window.wasilRecaptchaVerifier = undefined;
      }
      const verifier = new RecaptchaVerifier(auth, 'wasil-recaptcha-container', {
        size: 'invisible'
      });
      window.wasilRecaptchaVerifier = verifier;
      const result = await signInWithPhoneNumber(auth, e164, verifier);
      setConfirmationResult(result);
      setPendingE164(e164);
      setPhonePhase('otp');
      setOtpDigits(['', '', '', '', '', '']);
      setOtpCountdown(60);
      setLocalSuccess(`تم إرسال رمز التحقق المكوّن من ٦ أرقام إلى ${e164}`);
      window.setTimeout(() => otpRefs.current[0]?.focus(), 120);
    } catch (err) {
      setLocalError(mapFirebaseAuthErrorToArabic(err));
    } finally {
      setPhoneBusy(false);
    }
  };

  const handleConfirmPhoneAndSendOtp = async () => {
    setShowConfirmPhoneModal(false);
    await dispatchFirebasePhoneOtp(phoneCheck.e164);
  };

  const handleOtpInputChange = (index: number, rawVal: string) => {
    const cleaned = rawVal.replace(/\D/g, '');
    if (cleaned.length > 1) {
      // Handle full 6-digit paste
      const next = [...otpDigits];
      cleaned
        .slice(0, 6)
        .split('')
        .forEach((ch, idx) => {
          if (idx < 6) next[idx] = ch;
        });
      setOtpDigits(next);
      const focusIdx = Math.min(5, cleaned.length - 1);
      otpRefs.current[focusIdx]?.focus();
      return;
    }

    const next = [...otpDigits];
    next[index] = cleaned;
    setOtpDigits(next);
    if (cleaned && index < 5) {
      otpRefs.current[index + 1]?.focus();
    }
  };

  const handleOtpKeyDown = (index: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Backspace' && !otpDigits[index] && index > 0) {
      otpRefs.current[index - 1]?.focus();
    }
  };

  const handleVerifyOtpSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    clearNotices();
    const code = otpDigits.join('');
    if (code.length < 6) {
      setLocalError('أدخل رمز التحقق المكوّن من ٦ أرقام بالكامل.');
      return;
    }
    if (!confirmationResult) {
      setLocalError('انتهت جلسة التحقق. أعد إرسال الرمز أو اختر طريقة دخول أخرى.');
      return;
    }
    setPhoneBusy(true);
    try {
      const cred = await confirmationResult.confirm(code);
      onPhoneAuthSuccess(pendingE164, cred.user.uid);
      setProfileName(cred.user.displayName || 'مستخدم تواصل');
      setStep('profile');
    } catch (err) {
      setLocalError(mapFirebaseAuthErrorToArabic(err));
    } finally {
      setPhoneBusy(false);
    }
  };

  const handleEmailFormSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    clearNotices();
    const trimmedEmail = emailAddress.trim();

    if (!validateEmailAddress(trimmedEmail)) {
      setLocalError('يرجى إدخال بريد إلكتروني صحيح.');
      return;
    }

    if (emailSubMode === 'reset') {
      setEmailBusy(true);
      try {
        const ok = await onResetPassword(trimmedEmail);
        if (ok) {
          setLocalSuccess(
            `تم إرسال رابط إعادة تعيين كلمة المرور إلى ${trimmedEmail}. تفقد بريدك الوارد أو الرسائل غير المرغوب فيها.`
          );
        }
      } finally {
        setEmailBusy(false);
      }
      return;
    }

    if (password.length < 6) {
      setLocalError('كلمة المرور يجب أن تتكون من ٦ أحرف على الأقل.');
      return;
    }

    if (emailSubMode === 'register') {
      if (registerName.trim().length < 2) {
        setLocalError('يرجى إدخال اسمك الكامل (حرفان على الأقل).');
        return;
      }
      if (password !== confirmPassword) {
        setLocalError('كلمتا المرور غير متطابقتين.');
        return;
      }
      setEmailBusy(true);
      try {
        const ok = await onEmailSignUp(registerName.trim(), trimmedEmail, password, true);
        if (ok) {
          setProfileName(registerName.trim());
          setLocalSuccess('تم إنشاء الحساب بنجاح! أكمل تهيئة ملفك الشخصي ورمز الأمان.');
          setStep('profile');
        }
      } finally {
        setEmailBusy(false);
      }
      return;
    }

    // Login mode
    setEmailBusy(true);
    try {
      await onEmailSignIn(trimmedEmail, password);
    } finally {
      setEmailBusy(false);
    }
  };

  const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    try {
      const compressed = await compressAvatarFileToDataUrl(file);
      setProfileAvatar(compressed);
    } catch (err) {
      setLocalError(err instanceof Error ? err.message : 'تعذر رفع الصورة.');
    }
  };

  const handleFinishProfileStep = async (e: React.FormEvent) => {
    e.preventDefault();
    clearNotices();
    const cleanedName = profileName.trim();
    if (cleanedName.length < 2) {
      setLocalError('يرجى إدخال اسم ظاهر من حرفين على الأقل.');
      return;
    }
    const cleanPin = setupPin.replace(/\D/g, '').slice(0, 4);
    if (enableAppPin && cleanPin.length !== 4) {
      setLocalError('رمز قفل التطبيق يجب أن يتكون من ٤ أرقام.');
      return;
    }
    setCompletingProfile(true);
    try {
      await onCompleteOnboarding({
        displayName: cleanedName,
        about: profileAbout.trim() || BIO_PRESETS[0],
        avatarUrl: profileAvatar,
        phone: pendingE164 || currentUser.phone,
        chatLockPin: cleanPin.length === 4 ? cleanPin : omarSettings.chatLockPin || '1234',
        appLockOnLaunch: enableAppPin
      });
    } finally {
      setCompletingProfile(false);
    }
  };

  return (
    <div className="min-h-[100dvh] w-full overflow-y-auto overflow-x-hidden bg-[#EAE6DF] dark:bg-[#0C1317] text-[#111B21] dark:text-[#E9EDEF] flex flex-col">
      {/* Invisible reCAPTCHA mount node for Firebase Phone Auth */}
      <div id="wasil-recaptcha-container" className="sr-only" aria-hidden="true" />

      {/* Top WhatsApp Omar Brand & Live Theme Switcher Bar */}
      <header className="w-full bg-[var(--wa-accent)] dark:bg-[var(--wa-accent-strong)] text-white px-4 sm:px-6 pt-5 pb-28 sm:pb-32 transition-colors">
        <div className="w-full max-w-5xl mx-auto flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-full bg-white/15 flex items-center justify-center shrink-0">
              <MessageSquareLock className="w-5 h-5" aria-hidden="true" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="font-display text-lg sm:text-xl font-bold tracking-tight whitespace-nowrap">
                  تواصل · Wasil
                </span>
                <span className="hidden sm:inline-block text-[11px] font-medium text-white/85">
                  إصدار عمر المطوّر
                </span>
              </div>
              <p className="text-[11px] text-white/85 flex items-center gap-1 min-w-0 truncate sm:whitespace-nowrap">
                <Lock className="w-3 h-3 shrink-0" aria-hidden="true" />
                <span className="truncate">تشفير AES-GCM-256 · ثيم {activeOmarTheme.name}</span>
              </p>
            </div>
          </div>

          {/* Live Theme Dots & Light/Dark Toggle */}
          <div className="flex items-center gap-2">
            <div
              role="group"
              aria-label="ثيمات واتساب عمر الفورية"
              className="flex items-center gap-1.5 bg-black/15 px-2.5 py-1.5 rounded-full"
            >
              {OMAR_THEMES.map((t) => {
                const selected = omarSettings.omarTheme === t.id;
                return (
                  <button
                    key={t.id}
                    type="button"
                    title={t.name}
                    aria-label={`تطبيق ثيم ${t.name}`}
                    aria-pressed={selected}
                    onClick={() => onUpdateOmarSettings({ omarTheme: t.id as OmarThemeId })}
                    className={`w-6 h-6 rounded-full flex items-center justify-center transition-transform cursor-pointer ${
                      selected ? 'ring-2 ring-white scale-110' : 'opacity-80 hover:opacity-100'
                    }`}
                    style={{ backgroundColor: t.primaryHex }}
                  >
                    {selected && <Check className="w-3.5 h-3.5 text-white" aria-hidden="true" />}
                  </button>
                );
              })}
            </div>

            <button
              type="button"
              onClick={onToggleTheme}
              aria-label={theme === 'dark' ? 'التبديل إلى الوضع النهاري' : 'التبديل إلى الوضع الليلي'}
              className="min-h-[44px] min-w-[44px] rounded-full bg-white/15 hover:bg-white/25 flex items-center justify-center transition-colors cursor-pointer"
            >
              {theme === 'dark' ? (
                <Sun className="w-5 h-5 text-amber-200" aria-hidden="true" />
              ) : (
                <Moon className="w-5 h-5 text-white" aria-hidden="true" />
              )}
            </button>
          </div>
        </div>

        {/* 3-Step Onboarding Progress Indicator */}
        <nav
          aria-label="مراحل تسجيل الدخول"
          className="w-full max-w-5xl mx-auto mt-5 flex items-center justify-start gap-1.5 sm:gap-4 text-xs overflow-x-auto no-scrollbar pb-1"
        >
          {[
            { id: 'welcome' as AuthStep, num: '١', label: 'الترحيب والشروط' },
            { id: 'auth' as AuthStep, num: '٢', label: 'التحقق والدخول' },
            { id: 'profile' as AuthStep, num: '٣', label: 'الملف والأمان' }
          ].map((item, idx) => {
            const isCurrent = step === item.id;
            const isCompleted =
              (item.id === 'welcome' && (step === 'auth' || step === 'profile')) ||
              (item.id === 'auth' && step === 'profile');
            return (
              <div key={item.id} className="flex items-center gap-2">
                <button
                  type="button"
                  disabled={item.id === 'profile' && step !== 'profile'}
                  onClick={() => {
                    clearNotices();
                    if (item.id === 'welcome' || item.id === 'auth') {
                      if (item.id === 'auth' && !acceptedTerms) {
                        setAcceptedTerms(true);
                      }
                      setStep(item.id);
                    }
                  }}
                  className={`min-h-[36px] px-3 py-1 rounded-full flex items-center gap-2 font-medium transition-colors whitespace-nowrap ${
                    isCurrent
                      ? 'bg-white text-[#111B21] shadow-sm font-bold'
                      : isCompleted
                        ? 'bg-white/25 text-white hover:bg-white/35 cursor-pointer'
                        : 'bg-white/10 text-white/75'
                  }`}
                >
                  <span className="w-5 h-5 rounded-full bg-black/10 flex items-center justify-center text-[11px] font-bold">
                    {isCompleted ? <Check className="w-3 h-3" aria-hidden="true" /> : item.num}
                  </span>
                  <span className="hidden xs:inline sm:inline">{item.label}</span>
                </button>
                {idx < 2 && <span className="text-white/40" aria-hidden="true">/</span>}
              </div>
            );
          })}
        </nav>
      </header>

      {/* Main Elevated Responsive Auth Card */}
      <main className="flex-1 w-full max-w-full min-w-0 px-3 sm:px-6 -mt-20 pb-8 pb-safe flex items-start justify-center">
        <div className="w-full max-w-5xl bg-white dark:bg-[#111B21] rounded-3xl shadow-2xl border border-[#E9EDEF] dark:border-[#222D34] overflow-hidden grid grid-cols-1 lg:grid-cols-12">
          {/* Primary Interactive Column */}
          <section className="lg:col-span-7 min-w-0 max-w-full p-4 sm:p-8 flex flex-col justify-between gap-5">
            {/* Shared Alert Banners */}
            {combinedError && (
              <div
                role="alert"
                className="p-3.5 rounded-2xl bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900/70 text-xs sm:text-sm text-red-700 dark:text-red-300 flex items-start justify-between gap-3"
              >
                <span className="leading-relaxed">{combinedError}</span>
                <button
                  type="button"
                  aria-label="إغلاق التنبيه"
                  onClick={clearNotices}
                  className="shrink-0 p-1 rounded-full hover:bg-red-100 dark:hover:bg-red-900/50 cursor-pointer"
                >
                  <X className="w-4 h-4" aria-hidden="true" />
                </button>
              </div>
            )}

            {localSuccess && (
              <div
                role="status"
                className="p-3.5 rounded-2xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-900/70 text-xs sm:text-sm text-emerald-800 dark:text-emerald-300 flex items-start gap-2.5"
              >
                <CheckCircle2 className="w-4 h-4 mt-0.5 shrink-0" aria-hidden="true" />
                <span className="leading-relaxed">{localSuccess}</span>
              </div>
            )}

            {/* ==================== STEP 1: WELCOME & TERMS ==================== */}
            {step === 'welcome' && (
              <div className="space-y-6">
                <div className="flex items-start gap-4">
                  <div className="w-16 h-16 rounded-2xl bg-[var(--wa-accent-soft)] dark:bg-[#202C33] text-[var(--wa-accent)] flex items-center justify-center shrink-0 shadow-xs">
                    <ShieldCheck className="w-8 h-8" aria-hidden="true" />
                  </div>
                  <div className="min-w-0">
                    <h1 className="font-display text-xl sm:text-2xl font-bold text-[#111B21] dark:text-[#E9EDEF] leading-snug">
                      مرحباً بك في تواصل · نظام واتساب عمر المتكامل
                    </h1>
                    <p className="mt-1.5 text-sm text-[#54656F] dark:text-[#8696A0] leading-relaxed">
                      بنية دخول متكاملة تدعم التحقق عبر رقم الهاتف، البريد الإلكتروني، أو حساب Google مع تشفير فعلي بين الطرفين وثيمات حصرية.
                    </p>
                  </div>
                </div>

                {/* Live Theme Selection Cards (WhatsApp Omar Signature) */}
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-bold text-[#3B4A54] dark:text-[#D1D7DB] flex items-center gap-1.5">
                      <Palette className="w-4 h-4 text-[var(--wa-accent)]" aria-hidden="true" />
                      <span>اختر مظهرك المفضل قبل الدخول:</span>
                    </span>
                    <span className="text-[11px] font-medium text-[var(--wa-accent)]">
                      {activeOmarTheme.name}
                    </span>
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
                    {OMAR_THEMES.map((t) => {
                      const active = omarSettings.omarTheme === t.id;
                      return (
                        <button
                          key={t.id}
                          type="button"
                          onClick={() => onUpdateOmarSettings({ omarTheme: t.id })}
                          className={`min-h-[48px] px-2.5 py-2 rounded-xl border text-right transition-all flex items-center gap-2 cursor-pointer ${
                            active
                              ? 'border-[var(--wa-accent)] bg-[var(--wa-accent-soft)]/50 dark:bg-[#202C33] shadow-xs'
                              : 'border-[#E9EDEF] dark:border-[#2A3942] hover:bg-[#F7F8FA] dark:hover:bg-[#182229]'
                          }`}
                        >
                          <span
                            className="w-4 h-4 rounded-full shrink-0 border border-black/10"
                            style={{ backgroundColor: t.primaryHex }}
                          />
                          <span className="text-[11px] font-semibold truncate">{t.name.split(' ')[0]}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Language & Key Highlights */}
                <div className="p-4 rounded-2xl bg-[#F7F8FA] dark:bg-[#202C33] border border-[#E9EDEF] dark:border-[#2A3942] space-y-3">
                  <div className="flex items-center justify-between gap-2 pb-2.5 border-b border-[#E9EDEF] dark:border-[#2A3942]">
                    <span className="text-xs font-semibold text-[#3B4A54] dark:text-[#D1D7DB] flex items-center gap-2">
                      <Globe className="w-4 h-4 text-[var(--wa-accent)]" aria-hidden="true" />
                      <span>لغة التطبيق</span>
                    </span>
                    <span className="text-xs font-bold text-[var(--wa-accent)]">العربية (RTL الافتراضية)</span>
                  </div>

                  <ul className="space-y-2 text-xs text-[#3B4A54] dark:text-[#D1D7DB]">
                    <li className="flex items-center gap-2.5">
                      <CheckCircle2 className="w-4 h-4 text-[var(--wa-accent)] shrink-0" aria-hidden="true" />
                      <span>تشفير محلي لمفاتيح ECDH P-256 وحفظ خصوصية جهات اتصالك</span>
                    </li>
                    <li className="flex items-center gap-2.5">
                      <CheckCircle2 className="w-4 h-4 text-[var(--wa-accent)] shrink-0" aria-hidden="true" />
                      <span>منع حذف الرسائل والحالات، إخفاء الظهور، وقفل المحادثات برمز PIN</span>
                    </li>
                    <li className="flex items-center gap-2.5">
                      <CheckCircle2 className="w-4 h-4 text-[var(--wa-accent)] shrink-0" aria-hidden="true" />
                      <span>استعادة سريعة لمحادثاتك عبر النسخ الاحتياطي المشفر أو سحابة Firebase</span>
                    </li>
                  </ul>
                </div>

                {/* Terms Acceptance Checkbox */}
                <div className="flex items-start gap-3">
                  <button
                    type="button"
                    role="checkbox"
                    aria-checked={acceptedTerms}
                    aria-label="الموافقة على شروط الخدمة وسياسة الخصوصية"
                    onClick={() => {
                      setAcceptedTerms((v) => !v);
                      setLocalError(null);
                    }}
                    className={`mt-0.5 min-w-[24px] min-h-[24px] w-6 h-6 rounded-lg border flex items-center justify-center transition-colors cursor-pointer ${
                      acceptedTerms
                        ? 'bg-[var(--wa-accent)] border-[var(--wa-accent)] text-white'
                        : 'border-[#8696A0] bg-white dark:bg-[#111B21]'
                    }`}
                  >
                    {acceptedTerms && <Check className="w-4 h-4" aria-hidden="true" />}
                  </button>
                  <p className="text-xs text-[#54656F] dark:text-[#8696A0] leading-relaxed">
                    بالمتابعة فإنك تقر بالموافقة على{' '}
                    <button
                      type="button"
                      onClick={() => setShowPolicyModal(true)}
                      className="text-[var(--wa-accent)] font-bold underline underline-offset-2 cursor-pointer"
                    >
                      سياسة الخصوصية وشروط الاستخدام
                    </button>{' '}
                    الخاصة بمنصة تواصل.
                  </p>
                </div>

                {/* Step 1 Action Buttons */}
                <div className="space-y-3 pt-1">
                  <button
                    type="button"
                    onClick={handleContinueFromWelcome}
                    className="w-full min-h-[48px] px-6 py-3 rounded-full bg-[var(--wa-accent)] hover:brightness-95 active:scale-[0.99] text-white font-bold text-sm transition-all flex items-center justify-center gap-2 shadow-md cursor-pointer"
                  >
                    <span>الموافقة والمتابعة لتسجيل الدخول</span>
                    <ArrowLeft className="w-4 h-4" aria-hidden="true" />
                  </button>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                    <button
                      type="button"
                      onClick={() => backupFileRef.current?.click()}
                      className="min-h-[44px] px-4 py-2 rounded-full border border-[#D1D7DB] dark:border-[#374248] hover:bg-[#F5F6F6] dark:hover:bg-[#202C33] text-[#3B4A54] dark:text-[#D1D7DB] font-semibold text-xs transition-colors flex items-center justify-center gap-2 cursor-pointer"
                    >
                      <FileUp className="w-4 h-4 shrink-0" aria-hidden="true" />
                      <span>استعادة نسخة احتياطية (JSON)</span>
                    </button>
                    <PWAInstallButton variant="pill" className="w-full" />
                    <input
                      ref={backupFileRef}
                      type="file"
                      accept="application/json,.json"
                      onChange={(e) => void handleRestoreFileChange(e)}
                      className="hidden"
                    />
                  </div>
                </div>
              </div>
            )}

            {/* ==================== STEP 2: MULTI-METHOD AUTH PORTAL ==================== */}
            {step === 'auth' && (
              <div className="space-y-5">
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <h1 className="font-display text-xl sm:text-2xl font-bold text-[#111B21] dark:text-[#E9EDEF]">
                      التحقق وتسجيل الدخول
                    </h1>
                    <p className="text-xs sm:text-sm text-[#54656F] dark:text-[#8696A0] mt-0.5">
                      اختر الطريقة المناسبة لربط حسابك وتفعيل التشفير السحابي
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      clearNotices();
                      setStep('welcome');
                    }}
                    className="min-h-[44px] px-3 rounded-xl text-xs font-semibold text-[#54656F] dark:text-[#AEBAC1] hover:bg-[#F5F6F6] dark:hover:bg-[#202C33] flex items-center gap-1.5 shrink-0 cursor-pointer"
                  >
                    <ArrowRight className="w-4 h-4" aria-hidden="true" />
                    <span>رجوع</span>
                  </button>
                </div>

                {/* Method Segmented Tabs */}
                <div
                  role="tablist"
                  aria-label="طرق تسجيل الدخول"
                  className="grid grid-cols-3 gap-1.5 p-1.5 rounded-2xl bg-[#F0F2F5] dark:bg-[#202C33]"
                >
                  {[
                    { id: 'phone' as AuthMethodTab, label: 'رقم الهاتف', icon: Phone },
                    { id: 'email' as AuthMethodTab, label: 'البريد الإلكتروني', icon: Mail },
                    { id: 'google_qr' as AuthMethodTab, label: 'Google و QR', icon: QrCode }
                  ].map((tab) => {
                    const Icon = tab.icon;
                    const active = methodTab === tab.id;
                    return (
                      <button
                        key={tab.id}
                        type="button"
                        role="tab"
                        aria-selected={active}
                        onClick={() => {
                          clearNotices();
                          setMethodTab(tab.id);
                        }}
                        className={`min-h-[44px] px-2 py-2 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
                          active
                            ? 'bg-white dark:bg-[#111B21] text-[var(--wa-accent)] shadow-xs'
                            : 'text-[#54656F] dark:text-[#8696A0] hover:text-[#111B21] dark:hover:text-[#E9EDEF]'
                        }`}
                      >
                        <Icon className="w-4 h-4 shrink-0" aria-hidden="true" />
                        <span className="truncate">{tab.label}</span>
                      </button>
                    );
                  })}
                </div>

                {/* TAB 1: PHONE NUMBER + OTP */}
                {methodTab === 'phone' && (
                  <div className="space-y-4">
                    {phonePhase === 'input' ? (
                      <form onSubmit={handleTriggerPhoneVerifyModal} className="space-y-4">
                        <p className="text-xs text-[#54656F] dark:text-[#8696A0] leading-relaxed">
                          أدخل رقم هاتفك الدولي للتحقق من هويتك عبر رسالة نصية (SMS OTP) تماماً كما في نظام واتساب عمر الأصلي.
                        </p>

                        {/* Country Selector Row */}
                        <div>
                          <label className="block text-xs font-bold text-[#3B4A54] dark:text-[#D1D7DB] mb-1.5">
                            الدولة ومفتاح الاتصال
                          </label>
                          <button
                            type="button"
                            onClick={() => setShowCountryPicker(true)}
                            className="w-full min-h-[48px] px-4 py-2.5 rounded-xl bg-[#F7F8FA] dark:bg-[#202C33] border border-[#E9EDEF] dark:border-[#2A3942] hover:border-[var(--wa-accent)] flex items-center justify-between gap-3 text-right transition-colors cursor-pointer"
                          >
                            <div className="flex items-center gap-3 min-w-0">
                              <span className="text-xl leading-none" aria-hidden="true">
                                {selectedCountry.flag}
                              </span>
                              <span className="text-sm font-semibold truncate">
                                {selectedCountry.nameAr}
                              </span>
                            </div>
                            <div className="flex items-center gap-2 shrink-0">
                              <span dir="ltr" className="font-mono-code text-xs font-bold text-[var(--wa-accent)]">
                                {selectedCountry.dialCode}
                              </span>
                              <ChevronDown className="w-4 h-4 text-[#667781]" aria-hidden="true" />
                            </div>
                          </button>
                        </div>

                        {/* Dial Code + Phone Number Field */}
                        <div>
                          <label
                            htmlFor="phone-number-input"
                            className="block text-xs font-bold text-[#3B4A54] dark:text-[#D1D7DB] mb-1.5"
                          >
                            رقم الهاتف
                          </label>
                          <div className="flex items-stretch gap-2" dir="ltr">
                            <div className="min-h-[48px] px-3.5 rounded-xl bg-[#F0F2F5] dark:bg-[#202C33] border border-[#E9EDEF] dark:border-[#2A3942] flex items-center justify-center font-mono-code text-sm font-bold text-[#3B4A54] dark:text-[#D1D7DB] shrink-0">
                              {selectedCountry.dialCode}
                            </div>
                            <input
                              id="phone-number-input"
                              type="tel"
                              inputMode="tel"
                              dir="ltr"
                              value={phoneInput}
                              onChange={(e) => {
                                clearNotices();
                                setPhoneInput(e.target.value);
                              }}
                              placeholder={selectedCountry.placeholder}
                              className="flex-1 min-w-0 min-h-[48px] px-4 rounded-xl bg-[#F7F8FA] dark:bg-[#202C33] border border-[#E9EDEF] dark:border-[#2A3942] font-mono-code text-base tracking-wide text-[#111B21] dark:text-[#E9EDEF] focus:outline-none focus:ring-2 focus:ring-[var(--wa-accent)]"
                            />
                          </div>
                          {phoneInput.trim().length > 0 && (
                            <p className="mt-1.5 text-[11px] text-[#54656F] dark:text-[#8696A0] flex items-center justify-between">
                              <span>المعاينة الدولية:</span>
                              <span dir="ltr" className="font-mono-code font-semibold text-[var(--wa-accent)]">
                                {formatPhoneDisplay(selectedCountry.dialCode, phoneCheck.nationalDigits)}
                              </span>
                            </p>
                          )}
                        </div>

                        <button
                          type="submit"
                          disabled={phoneBusy}
                          className="w-full min-h-[48px] px-6 py-3 rounded-full bg-[var(--wa-accent)] hover:brightness-95 text-white font-bold text-sm transition-all flex items-center justify-center gap-2 disabled:opacity-60 cursor-pointer"
                        >
                          <span>{phoneBusy ? 'جاري التحقق وإرسال الرمز...' : 'التالي'}</span>
                          <ArrowLeft className="w-4 h-4" aria-hidden="true" />
                        </button>
                      </form>
                    ) : (
                      /* OTP Verification View */
                      <form onSubmit={(e) => void handleVerifyOtpSubmit(e)} className="space-y-4">
                        <div className="p-3.5 rounded-2xl bg-[#F7F8FA] dark:bg-[#202C33] border border-[#E9EDEF] dark:border-[#2A3942] flex items-center justify-between gap-2">
                          <div>
                            <p className="text-xs font-bold text-[#111B21] dark:text-[#E9EDEF]">
                              التحقق من{' '}
                              <span dir="ltr" className="font-mono-code text-[var(--wa-accent)]">
                                {pendingE164}
                              </span>
                            </p>
                            <p className="text-[11px] text-[#54656F] dark:text-[#8696A0] mt-0.5">
                              أدخل الرمز المرسل إليك عبر الرسائل النصية SMS
                            </p>
                          </div>
                          <button
                            type="button"
                            onClick={() => {
                              setPhonePhase('input');
                              clearNotices();
                            }}
                            className="min-h-[36px] px-2.5 rounded-lg text-xs font-bold text-[var(--wa-accent)] hover:bg-[var(--wa-accent-soft)]/50 cursor-pointer"
                          >
                            رقم خاطئ؟
                          </button>
                        </div>

                        <div dir="ltr" className="grid grid-cols-6 gap-2">
                          {otpDigits.map((digit, idx) => (
                            <input
                              key={idx}
                              ref={(el) => {
                                otpRefs.current[idx] = el;
                              }}
                              type="text"
                              inputMode="numeric"
                              maxLength={6}
                              value={digit}
                              aria-label={`الرقم ${idx + 1} من رمز التحقق`}
                              onChange={(e) => handleOtpInputChange(idx, e.target.value)}
                              onKeyDown={(e) => handleOtpKeyDown(idx, e)}
                              className="min-h-[52px] w-full rounded-xl bg-[#F7F8FA] dark:bg-[#202C33] border border-[#D1D7DB] dark:border-[#374248] text-center font-mono-code text-lg font-bold text-[#111B21] dark:text-[#E9EDEF] focus:outline-none focus:ring-2 focus:ring-[var(--wa-accent)]"
                            />
                          ))}
                        </div>

                        <div className="flex items-center justify-between text-xs">
                          <span className="text-[#54656F] dark:text-[#8696A0]">
                            لم يصلك الرمز؟
                          </span>
                          {otpCountdown > 0 ? (
                            <span className="font-mono-code font-semibold text-[#54656F] dark:text-[#8696A0]">
                              إعادة الإرسال خلال {otpCountdown} ث
                            </span>
                          ) : (
                            <button
                              type="button"
                              disabled={phoneBusy}
                              onClick={() => void dispatchFirebasePhoneOtp(pendingE164)}
                              className="font-bold text-[var(--wa-accent)] hover:underline cursor-pointer"
                            >
                              إعادة إرسال رمز جديد
                            </button>
                          )}
                        </div>

                        <button
                          type="submit"
                          disabled={phoneBusy}
                          className="w-full min-h-[48px] px-6 py-3 rounded-full bg-[var(--wa-accent)] hover:brightness-95 text-white font-bold text-sm transition-all flex items-center justify-center gap-2 disabled:opacity-60 cursor-pointer"
                        >
                          <span>{phoneBusy ? 'جاري تأكيد الرمز...' : 'تأكيد الرمز والمتابعة'}</span>
                          <Check className="w-4 h-4" aria-hidden="true" />
                        </button>
                      </form>
                    )}

                    <div className="pt-2 border-t border-[#E9EDEF] dark:border-[#222D34] flex flex-wrap items-center justify-between gap-2 text-xs">
                      <span className="text-[#667781] dark:text-[#8696A0]">
                        تفضل طريقة أخرى سريعة؟
                      </span>
                      <div className="flex items-center gap-3">
                        <button
                          type="button"
                          onClick={() => {
                            clearNotices();
                            setMethodTab('email');
                          }}
                          className="font-bold text-[var(--wa-accent)] hover:underline cursor-pointer"
                        >
                          الدخول بالبريد
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            clearNotices();
                            setMethodTab('google_qr');
                          }}
                          className="font-bold text-[#3B4A54] dark:text-[#D1D7DB] hover:underline cursor-pointer"
                        >
                          الدخول عبر Google
                        </button>
                      </div>
                    </div>
                  </div>
                )}

                {/* TAB 2: EMAIL & PASSWORD (LOGIN / REGISTER / RESET) */}
                {methodTab === 'email' && (
                  <form onSubmit={(e) => void handleEmailFormSubmit(e)} className="space-y-4">
                    <div className="flex flex-wrap items-center gap-2">
                      {[
                        { id: 'login' as EmailSubMode, label: 'تسجيل الدخول' },
                        { id: 'register' as EmailSubMode, label: 'حساب جديد' },
                        { id: 'reset' as EmailSubMode, label: 'نسيت كلمة المرور؟' }
                      ].map((mode) => (
                        <button
                          key={mode.id}
                          type="button"
                          onClick={() => {
                            clearNotices();
                            setEmailSubMode(mode.id);
                          }}
                          className={`min-h-[38px] px-3.5 py-1.5 rounded-full text-xs font-bold transition-colors cursor-pointer ${
                            emailSubMode === mode.id
                              ? 'bg-[var(--wa-accent)] text-white'
                              : 'bg-[#F0F2F5] dark:bg-[#202C33] text-[#54656F] dark:text-[#AEBAC1] hover:bg-[#E9EDEF] dark:hover:bg-[#2A3942]'
                          }`}
                        >
                          {mode.label}
                        </button>
                      ))}
                    </div>

                    {emailSubMode === 'register' && (
                      <div>
                        <label
                          htmlFor="auth-register-name"
                          className="block text-xs font-bold text-[#3B4A54] dark:text-[#D1D7DB] mb-1.5"
                        >
                          الاسم الكامل
                        </label>
                        <input
                          id="auth-register-name"
                          type="text"
                          required
                          value={registerName}
                          onChange={(e) => setRegisterName(e.target.value)}
                          placeholder="مثال: عمر الحربي"
                          className="w-full min-h-[46px] px-4 rounded-xl bg-[#F7F8FA] dark:bg-[#202C33] border border-[#E9EDEF] dark:border-[#2A3942] text-sm text-[#111B21] dark:text-[#E9EDEF] focus:outline-none focus:ring-2 focus:ring-[var(--wa-accent)]"
                        />
                      </div>
                    )}

                    <div>
                      <label
                        htmlFor="auth-email-input"
                        className="block text-xs font-bold text-[#3B4A54] dark:text-[#D1D7DB] mb-1.5"
                      >
                        البريد الإلكتروني
                      </label>
                      <input
                        id="auth-email-input"
                        type="email"
                        dir="ltr"
                        required
                        value={emailAddress}
                        onChange={(e) => setEmailAddress(e.target.value)}
                        placeholder="name@example.com"
                        className="w-full min-h-[46px] px-4 rounded-xl bg-[#F7F8FA] dark:bg-[#202C33] border border-[#E9EDEF] dark:border-[#2A3942] text-sm text-[#111B21] dark:text-[#E9EDEF] focus:outline-none focus:ring-2 focus:ring-[var(--wa-accent)]"
                      />
                    </div>

                    {emailSubMode !== 'reset' && (
                      <div>
                        <label
                          htmlFor="auth-password-input"
                          className="block text-xs font-bold text-[#3B4A54] dark:text-[#D1D7DB] mb-1.5"
                        >
                          كلمة المرور
                        </label>
                        <div className="relative">
                          <input
                            id="auth-password-input"
                            type={showPassword ? 'text' : 'password'}
                            dir="ltr"
                            required
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            placeholder="••••••••"
                            className="w-full min-h-[46px] pl-12 pr-4 rounded-xl bg-[#F7F8FA] dark:bg-[#202C33] border border-[#E9EDEF] dark:border-[#2A3942] text-sm text-[#111B21] dark:text-[#E9EDEF] focus:outline-none focus:ring-2 focus:ring-[var(--wa-accent)]"
                          />
                          <button
                            type="button"
                            aria-label={showPassword ? 'إخفاء كلمة المرور' : 'إظهار كلمة المرور'}
                            onClick={() => setShowPassword((v) => !v)}
                            className="min-w-[44px] min-h-[44px] absolute left-1 top-1/2 -translate-y-1/2 flex items-center justify-center text-[#667781] hover:text-[#111B21] dark:hover:text-white cursor-pointer"
                          >
                            {showPassword ? (
                              <EyeOff className="w-4 h-4" aria-hidden="true" />
                            ) : (
                              <Eye className="w-4 h-4" aria-hidden="true" />
                            )}
                          </button>
                        </div>

                        {emailSubMode === 'register' && password.length > 0 && (
                          <div className="mt-2 space-y-1">
                            <div className="grid grid-cols-4 gap-1.5">
                              {[1, 2, 3, 4].map((lvl) => (
                                <span
                                  key={lvl}
                                  className={`h-1.5 rounded-full transition-colors ${
                                    passwordStrength.score >= lvl
                                      ? passwordStrength.score <= 1
                                        ? 'bg-red-500'
                                        : passwordStrength.score === 2
                                          ? 'bg-amber-500'
                                          : 'bg-emerald-500'
                                      : 'bg-[#E9EDEF] dark:bg-[#2A3942]'
                                  }`}
                                />
                              ))}
                            </div>
                            <p className="text-[11px] text-[#54656F] dark:text-[#8696A0]">
                              قوة كلمة المرور:{' '}
                              <span className="font-bold text-[#111B21] dark:text-[#E9EDEF]">
                                {passwordStrength.label}
                              </span>
                            </p>
                          </div>
                        )}
                      </div>
                    )}

                    {emailSubMode === 'register' && (
                      <div>
                        <label
                          htmlFor="auth-confirm-password"
                          className="block text-xs font-bold text-[#3B4A54] dark:text-[#D1D7DB] mb-1.5"
                        >
                          تأكيد كلمة المرور
                        </label>
                        <input
                          id="auth-confirm-password"
                          type={showPassword ? 'text' : 'password'}
                          dir="ltr"
                          required
                          value={confirmPassword}
                          onChange={(e) => setConfirmPassword(e.target.value)}
                          placeholder="••••••••"
                          className="w-full min-h-[46px] px-4 rounded-xl bg-[#F7F8FA] dark:bg-[#202C33] border border-[#E9EDEF] dark:border-[#2A3942] text-sm text-[#111B21] dark:text-[#E9EDEF] focus:outline-none focus:ring-2 focus:ring-[var(--wa-accent)]"
                        />
                      </div>
                    )}

                    <button
                      type="submit"
                      disabled={emailBusy || isSigningIn}
                      className="w-full min-h-[48px] px-6 py-3 rounded-full bg-[var(--wa-accent)] hover:brightness-95 text-white font-bold text-sm transition-all flex items-center justify-center gap-2 disabled:opacity-60 cursor-pointer"
                    >
                      <span>
                        {emailBusy
                          ? 'جاري المعالجة...'
                          : emailSubMode === 'login'
                            ? 'دخول بالبريد الإلكتروني'
                            : emailSubMode === 'register'
                              ? 'إنشاء الحساب والمتابعة'
                              : 'إرسال رابط استعادة كلمة المرور'}
                      </span>
                      <ArrowLeft className="w-4 h-4" aria-hidden="true" />
                    </button>
                  </form>
                )}

                {/* TAB 3: GOOGLE OAUTH & LINKED-DEVICE QR */}
                {methodTab === 'google_qr' && (
                  <div className="space-y-4">
                    <div className="p-4 rounded-2xl bg-[#F7F8FA] dark:bg-[#202C33] border border-[#E9EDEF] dark:border-[#2A3942] flex flex-col sm:flex-row items-center gap-4">
                      <div className="w-28 h-28 rounded-2xl bg-white dark:bg-[#111B21] p-2.5 shadow-xs border border-[#E9EDEF] dark:border-[#2A3942] shrink-0 flex items-center justify-center">
                        <svg viewBox="0 0 120 120" className="w-full h-full text-[#111B21] dark:text-[#E9EDEF]" aria-hidden="true">
                          <rect x="8" y="8" width="32" height="32" rx="4" fill="none" stroke="currentColor" strokeWidth="6" />
                          <rect x="18" y="18" width="12" height="12" rx="2" fill="var(--wa-accent)" />
                          <rect x="80" y="8" width="32" height="32" rx="4" fill="none" stroke="currentColor" strokeWidth="6" />
                          <rect x="90" y="18" width="12" height="12" rx="2" fill="currentColor" />
                          <rect x="8" y="80" width="32" height="32" rx="4" fill="none" stroke="currentColor" strokeWidth="6" />
                          <rect x="18" y="90" width="12" height="12" rx="2" fill="currentColor" />
                          <rect x="52" y="12" width="16" height="16" rx="2" fill="currentColor" />
                          <rect x="52" y="52" width="16" height="16" rx="3" fill="var(--wa-accent)" />
                          <rect x="12" y="52" width="16" height="16" rx="2" fill="currentColor" />
                          <rect x="88" y="52" width="20" height="16" rx="2" fill="currentColor" />
                          <rect x="52" y="88" width="18" height="20" rx="2" fill="currentColor" />
                          <rect x="84" y="84" width="24" height="24" rx="4" fill="none" stroke="var(--wa-accent)" strokeWidth="5" />
                        </svg>
                      </div>
                      <div className="space-y-1.5 text-center sm:text-right">
                        <h2 className="text-sm font-bold text-[#111B21] dark:text-[#E9EDEF]">
                          ربط الجهاز أو الدخول الفوري بحساب Google
                        </h2>
                        <ol className="text-xs text-[#54656F] dark:text-[#8696A0] space-y-1">
                          <li>١. اضغط على تسجيل الدخول عبر Google للمزامنة ومشاركة جهات الاتصال</li>
                          <li>٢. أو استخدم رقم الهاتف أو البريد الإلكتروني لتأمين حسابك ومحادثاتك</li>
                        </ol>
                      </div>
                    </div>

                    <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
                      <button
                        type="button"
                        onClick={() => void onGoogleSignIn()}
                        disabled={isSigningIn}
                        className="flex-1 min-h-[48px] px-6 py-2.5 rounded-full bg-[var(--wa-accent)] hover:brightness-95 active:scale-[0.99] text-white font-bold text-sm transition-all flex items-center justify-center gap-2.5 disabled:opacity-60 whitespace-nowrap cursor-pointer"
                      >
                        <span>{isSigningIn ? 'جاري الاتصال بـ Google...' : 'تسجيل الدخول عبر Google'}</span>
                        <ArrowLeft className="w-4 h-4" aria-hidden="true" />
                      </button>

                      <button
                        type="button"
                        onClick={() => {
                          clearNotices();
                          setMethodTab('email');
                        }}
                        className="min-h-[48px] px-5 py-2.5 rounded-full border border-[#D1D7DB] dark:border-[#374248] hover:bg-[#F5F6F6] dark:hover:bg-[#202C33] text-[var(--wa-accent-strong)] dark:text-[var(--wa-accent)] font-semibold text-sm transition-colors whitespace-nowrap cursor-pointer"
                      >
                        الدخول بالبريد الإلكتروني
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* ==================== STEP 3: PROFILE & SECURITY SETUP ==================== */}
            {step === 'profile' && (
              <form onSubmit={(e) => void handleFinishProfileStep(e)} className="space-y-5">
                <div>
                  <h1 className="font-display text-xl sm:text-2xl font-bold text-[#111B21] dark:text-[#E9EDEF]">
                    تهيئة ملفك الشخصي وقفل الأمان
                  </h1>
                  <p className="text-xs sm:text-sm text-[#54656F] dark:text-[#8696A0] mt-1">
                    اللمسة الأخيرة قبل الدخول — حدد اسمك الظاهر وحالتك ورمز القفل الاختياري
                  </p>
                </div>

                {/* Avatar Upload & Preview */}
                <div className="flex items-center gap-4">
                  <div className="relative">
                    {profileAvatar ? (
                      <img
                        src={profileAvatar}
                        alt={profileName}
                        referrerPolicy="no-referrer"
                        className="w-20 h-20 rounded-full object-cover border-2 border-[var(--wa-accent)]"
                      />
                    ) : (
                      <div className="w-20 h-20 rounded-full bg-[var(--wa-accent-soft)] dark:bg-[#202C33] text-[var(--wa-accent)] flex items-center justify-center font-display text-2xl font-bold border-2 border-[var(--wa-accent)]">
                        {(profileName.trim() || 'ت').charAt(0)}
                      </div>
                    )}
                    <button
                      type="button"
                      aria-label="رفع صورة شخصية"
                      onClick={() => avatarFileRef.current?.click()}
                      className="w-8 h-8 rounded-full bg-[var(--wa-accent)] text-white flex items-center justify-center absolute bottom-0 left-0 shadow-md border-2 border-white dark:border-[#111B21] cursor-pointer"
                    >
                      <Camera className="w-4 h-4" aria-hidden="true" />
                    </button>
                    <input
                      ref={avatarFileRef}
                      type="file"
                      accept="image/*"
                      onChange={(e) => void handleAvatarUpload(e)}
                      className="hidden"
                    />
                  </div>
                  <div className="space-y-1">
                    <p className="text-sm font-bold text-[#111B21] dark:text-[#E9EDEF]">
                      صورة الملف الشخصي
                    </p>
                    <p className="text-xs text-[#54656F] dark:text-[#8696A0]">
                      يمكنك رفع صورة من جهازك أو استخدام الأحرف الأولى
                    </p>
                    {profileAvatar && (
                      <button
                        type="button"
                        onClick={() => setProfileAvatar('')}
                        className="text-xs font-semibold text-red-600 dark:text-red-400 hover:underline cursor-pointer"
                      >
                        إزالة الصورة
                      </button>
                    )}
                  </div>
                </div>

                <div>
                  <label
                    htmlFor="onboarding-display-name"
                    className="block text-xs font-bold text-[#3B4A54] dark:text-[#D1D7DB] mb-1.5"
                  >
                    الاسم الظاهر في المحادثات
                  </label>
                  <input
                    id="onboarding-display-name"
                    type="text"
                    required
                    value={profileName}
                    onChange={(e) => setProfileName(e.target.value)}
                    placeholder="اكتب اسمك..."
                    className="w-full min-h-[46px] px-4 rounded-xl bg-[#F7F8FA] dark:bg-[#202C33] border border-[#E9EDEF] dark:border-[#2A3942] text-sm text-[#111B21] dark:text-[#E9EDEF] focus:outline-none focus:ring-2 focus:ring-[var(--wa-accent)]"
                  />
                </div>

                <div>
                  <label
                    htmlFor="onboarding-about"
                    className="block text-xs font-bold text-[#3B4A54] dark:text-[#D1D7DB] mb-1.5"
                  >
                    النبذة والحالة
                  </label>
                  <input
                    id="onboarding-about"
                    type="text"
                    value={profileAbout}
                    onChange={(e) => setProfileAbout(e.target.value)}
                    className="w-full min-h-[46px] px-4 rounded-xl bg-[#F7F8FA] dark:bg-[#202C33] border border-[#E9EDEF] dark:border-[#2A3942] text-sm text-[#111B21] dark:text-[#E9EDEF] focus:outline-none focus:ring-2 focus:ring-[var(--wa-accent)]"
                  />
                  <div className="flex flex-wrap gap-1.5 mt-2">
                    {BIO_PRESETS.map((preset) => (
                      <button
                        key={preset}
                        type="button"
                        onClick={() => setProfileAbout(preset)}
                        className="px-2.5 py-1 rounded-full bg-[#F0F2F5] dark:bg-[#202C33] hover:bg-[var(--wa-accent-soft)] dark:hover:bg-[#2A3942] text-[11px] font-medium text-[#3B4A54] dark:text-[#D1D7DB] transition-colors cursor-pointer"
                      >
                        {preset}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Optional App Lock PIN */}
                <div className="p-4 rounded-2xl bg-[#F7F8FA] dark:bg-[#202C33] border border-[#E9EDEF] dark:border-[#2A3942] space-y-3">
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2.5">
                      <KeyRound className="w-4 h-4 text-[var(--wa-accent)] shrink-0" aria-hidden="true" />
                      <div>
                        <p className="text-xs font-bold text-[#111B21] dark:text-[#E9EDEF]">
                          تفعيل قفل التطبيق عند التشغيل (PIN)
                        </p>
                        <p className="text-[11px] text-[#54656F] dark:text-[#8696A0]">
                          يطلب رمزاً من ٤ أرقام لحماية محادثاتك عند الفتح
                        </p>
                      </div>
                    </div>
                    <button
                      type="button"
                      role="switch"
                      aria-checked={enableAppPin}
                      aria-label="تفعيل قفل التطبيق برمز سري"
                      onClick={() => setEnableAppPin((v) => !v)}
                      className={`w-11 h-6 rounded-full transition-colors relative shrink-0 cursor-pointer ${
                        enableAppPin ? 'bg-[var(--wa-accent)]' : 'bg-[#CBD5E1] dark:bg-[#374248]'
                      }`}
                    >
                      <span
                        className={`block w-4 h-4 rounded-full bg-white shadow-xs transition-transform ${
                          enableAppPin ? '-translate-x-6' : '-translate-x-1'
                        }`}
                      />
                    </button>
                  </div>

                  {enableAppPin && (
                    <div className="flex items-center justify-between gap-3 pt-2 border-t border-[#E9EDEF] dark:border-[#2A3942]">
                      <label htmlFor="onboarding-pin" className="text-xs font-semibold text-[#3B4A54] dark:text-[#D1D7DB]">
                        رمز القفل (٤ أرقام):
                      </label>
                      <input
                        id="onboarding-pin"
                        type="password"
                        inputMode="numeric"
                        dir="ltr"
                        maxLength={4}
                        value={setupPin}
                        onChange={(e) => setSetupPin(e.target.value.replace(/\D/g, '').slice(0, 4))}
                        className="w-32 min-h-[42px] px-3 rounded-xl bg-white dark:bg-[#111B21] border border-[#D1D7DB] dark:border-[#374248] text-center font-mono-code text-base tracking-[0.4em] focus:outline-none focus:ring-2 focus:ring-[var(--wa-accent)]"
                      />
                    </div>
                  )}
                </div>

                <button
                  type="submit"
                  disabled={completingProfile}
                  className="w-full min-h-[48px] px-6 py-3 rounded-full bg-[var(--wa-accent)] hover:brightness-95 text-white font-bold text-sm transition-all flex items-center justify-center gap-2 disabled:opacity-60 cursor-pointer"
                >
                  <UserCheck className="w-4 h-4" aria-hidden="true" />
                  <span>{completingProfile ? 'جاري تجهيز المساحة...' : 'دخول إلى المحادثات'}</span>
                </button>
              </form>
            )}
          </section>

          {/* Secondary Preview / Omar Cryptographic Status Column */}
          <aside className="lg:col-span-5 min-w-0 max-w-full bg-[#F7F8FA] dark:bg-[#202C33] p-4 sm:p-8 flex flex-col justify-between gap-6 border-t lg:border-t-0 lg:border-r border-[#E9EDEF] dark:border-[#222D34]">
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-[var(--wa-accent)] flex items-center gap-1.5">
                  <Shield className="w-4 h-4" aria-hidden="true" />
                  <span>مظهر المحادثة والتشفير الحي</span>
                </span>
                <span className="font-mono-code text-[11px] text-[#667781] dark:text-[#8696A0]">
                  ECDH P-256
                </span>
              </div>

              {/* Live WhatsApp Omar Bubble Theme Preview */}
              <div className="rounded-2xl overflow-hidden border border-[#E9EDEF] dark:border-[#2A3942] bg-[#EFEAE2] dark:bg-[#0B141A] p-4 space-y-3 shadow-xs">
                <div className="flex items-center justify-between pb-2 border-b border-black/5 dark:border-white/5">
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-full bg-[var(--wa-accent)] text-white flex items-center justify-center text-xs font-bold">
                      ت
                    </div>
                    <div>
                      <p className="text-xs font-bold text-[#111B21] dark:text-[#E9EDEF]">
                        مجموعة عمر الملكية
                      </p>
                      <p className="text-[10px] text-[var(--wa-accent)] font-medium">
                        متصل الآن · مشفر تماماً
                      </p>
                    </div>
                  </div>
                  <Video className="w-4 h-4 text-[#54656F] dark:text-[#8696A0]" aria-hidden="true" />
                </div>

                <div className="space-y-2">
                  <div className="max-w-[85%] rounded-2xl rounded-tr-xs bg-white dark:bg-[#202C33] px-3 py-2 text-xs text-[#111B21] dark:text-[#E9EDEF] shadow-2xs">
                    أهلاً بك! تم تجهيز مفاتيح التشفير بنجاح على متصفحك.
                  </div>
                  <div className="mr-auto max-w-[85%] rounded-2xl rounded-tl-xs bg-[var(--wa-outgoing-bg)] px-3 py-2 text-xs text-[#111B21] dark:text-[#E9EDEF] shadow-2xs">
                    رائع، ثيم {activeOmarTheme.name} متناسق وسريع جداً!
                  </div>
                </div>
              </div>
            </div>

            <div className="space-y-2.5 text-center lg:text-right">
              <p className="text-xs font-bold text-[#111B21] dark:text-[#E9EDEF]">
                هوية تشفير محلية آمنة 100%
              </p>
              <p className="text-xs text-[#54656F] dark:text-[#8696A0] leading-relaxed">
                تُنشأ مفاتيحك الخاصة وتُحفظ داخل متصفحك فقط، مع دعم القفل برمز PIN، إخفاء صحين القراءة، ومنع حذف الرسائل.
              </p>
            </div>
          </aside>
        </div>
      </main>

      {/* Phone Number Confirmation Modal (WhatsApp Omar Classic Prompt) */}
      {showConfirmPhoneModal && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="تأكيد رقم الهاتف"
          className="fixed inset-0 z-50 bg-black/55 backdrop-blur-xs flex items-center justify-center p-4"
        >
          <div className="w-full max-w-sm bg-white dark:bg-[#202C33] rounded-2xl p-6 shadow-2xl border border-[#E9EDEF] dark:border-[#374248] space-y-4">
            <h2 className="font-display text-base font-bold text-[#111B21] dark:text-[#E9EDEF]">
              هل أدخلت رقم الهاتف الصحيح؟
            </h2>
            <p
              dir="ltr"
              className="py-2.5 px-4 rounded-xl bg-[#F7F8FA] dark:bg-[#111B21] font-mono-code text-lg font-bold text-center text-[var(--wa-accent)]"
            >
              {formatPhoneDisplay(selectedCountry.dialCode, phoneCheck.nationalDigits)}
            </p>
            <p className="text-xs text-[#54656F] dark:text-[#8696A0] leading-relaxed">
              سنقوم بإرسال رسالة نصية SMS تحتوي على رمز التحقق إلى هذا الرقم، أو يمكنك تعديله إذا أردت.
            </p>
            <div className="flex items-center justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={() => setShowConfirmPhoneModal(false)}
                className="min-h-[44px] px-4 py-2 rounded-xl text-xs font-bold text-[#54656F] dark:text-[#AEBAC1] hover:bg-[#F5F6F6] dark:hover:bg-[#182229] cursor-pointer"
              >
                تعديل
              </button>
              <button
                type="button"
                onClick={() => void handleConfirmPhoneAndSendOtp()}
                className="min-h-[44px] px-6 py-2 rounded-xl bg-[var(--wa-accent)] text-white text-xs font-bold hover:brightness-95 cursor-pointer"
              >
                موافق
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Privacy & Terms Policy Modal */}
      {showPolicyModal && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="سياسة الخصوصية وشروط الاستخدام"
          className="fixed inset-0 z-50 bg-black/55 backdrop-blur-xs flex items-center justify-center p-4"
        >
          <div className="w-full max-w-md bg-white dark:bg-[#202C33] rounded-2xl shadow-2xl border border-[#E9EDEF] dark:border-[#374248] overflow-hidden flex flex-col max-h-[82dvh]">
            <header className="px-5 py-4 bg-[var(--wa-accent-strong)] text-white flex items-center justify-between">
              <h2 className="font-display text-base font-bold">سياسة الخصوصية وشروط الخدمة</h2>
              <button
                type="button"
                aria-label="إغلاق نافذة السياسة"
                onClick={() => setShowPolicyModal(false)}
                className="min-h-[40px] min-w-[40px] rounded-full hover:bg-white/15 flex items-center justify-center cursor-pointer"
              >
                <X className="w-5 h-5" aria-hidden="true" />
              </button>
            </header>
            <div className="p-5 overflow-y-auto space-y-3 text-xs sm:text-sm text-[#3B4A54] dark:text-[#D1D7DB] leading-relaxed">
              <p>
                <strong className="text-[#111B21] dark:text-white">١. التشفير التام بين الطرفين:</strong>{' '}
                جميع الرسائل والملفات تُشفّر محلياً باستخدام خوارزمية AES-GCM-256 ومفاتيح ECDH P-256 قبل مغادرة جهازك.
              </p>
              <p>
                <strong className="text-[#111B21] dark:text-white">٢. خصوصية الحساب:</strong>{' '}
                تُستخدم بيانات الدخول عبر رقم الهاتف أو البريد الإلكتروني أو Google للمزامنة السحابية الآمنة فقط ولا تتم مشاركتها مع أطراف ثالثة.
              </p>
              <p>
                <strong className="text-[#111B21] dark:text-white">٣. التحكم الكامل بالنسخ الاحتياطي:</strong>{' '}
                يمكنك تصدير واستعادة محادثاتك وإعداداتك في أي وقت بصيغة JSON محلية.
              </p>
            </div>
            <footer className="p-4 border-t border-[#E9EDEF] dark:border-[#2A3942] flex justify-end">
              <button
                type="button"
                onClick={() => {
                  setAcceptedTerms(true);
                  setShowPolicyModal(false);
                }}
                className="min-h-[44px] px-6 py-2 rounded-full bg-[var(--wa-accent)] text-white text-xs font-bold hover:brightness-95 cursor-pointer"
              >
                فهمت وأوافق
              </button>
            </footer>
          </div>
        </div>
      )}

      {/* Searchable Country Dial Code Picker Modal */}
      <CountryPickerModal
        isOpen={showCountryPicker}
        selectedIso={selectedCountry.iso}
        onSelect={(c) => {
          setSelectedCountry(c);
          clearNotices();
        }}
        onClose={() => setShowCountryPicker(false)}
      />
    </div>
  );
}
