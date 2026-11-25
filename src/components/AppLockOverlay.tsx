import { useEffect, useRef } from 'react';
import {
  Clock,
  Delete,
  Fingerprint,
  KeyRound,
  Lock,
  ScanFace,
  ShieldCheck,
  X
} from 'lucide-react';

interface TouchPinPadProps {
  value: string;
  onChange: (nextPin: string) => void;
  onSubmitPin: (pin: string) => void;
  error: string | null;
  hasBiometricOption?: boolean;
  onSwitchToBiometric?: () => void;
  compact?: boolean;
  disabled?: boolean;
}

function triggerHapticTap() {
  if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
    try {
      navigator.vibrate(10);
    } catch {
      // Ignore vibration errors
    }
  }
}

export function TouchPinPad({
  value,
  onChange,
  onSubmitPin,
  error,
  hasBiometricOption = false,
  onSwitchToBiometric,
  compact = false,
  disabled = false
}: TouchPinPadProps) {
  const latestRef = useRef({ value, onChange, onSubmitPin, disabled });
  latestRef.current = { value, onChange, onSubmitPin, disabled };

  // Support physical/Bluetooth keyboard digit entry seamlessly without focusing a mobile input
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const { value: current, onChange: update, onSubmitPin: submit, disabled: isOff } =
        latestRef.current;
      if (isOff) return;
      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)
      ) {
        return;
      }

      if (/^[0-9]$/.test(e.key)) {
        e.preventDefault();
        if (current.length >= 4) return;
        const next = `${current}${e.key}`;
        update(next);
        if (next.length === 4) {
          window.setTimeout(() => submit(next), 90);
        }
      } else if (e.key === 'Backspace') {
        e.preventDefault();
        if (current.length > 0) {
          update(current.slice(0, -1));
        }
      } else if (e.key === 'Enter' && current.length === 4) {
        e.preventDefault();
        submit(current);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const handleDigitTap = (digit: string) => {
    if (disabled || value.length >= 4) return;
    triggerHapticTap();
    const next = `${value}${digit}`;
    onChange(next);
    if (next.length === 4) {
      window.setTimeout(() => onSubmitPin(next), 110);
    }
  };

  const handleBackspaceTap = () => {
    if (disabled || value.length === 0) return;
    triggerHapticTap();
    onChange(value.slice(0, -1));
  };

  const digitRows = [
    ['1', '2', '3'],
    ['4', '5', '6'],
    ['7', '8', '9']
  ];

  return (
    <div className="space-y-4 select-none">
      {/* 4-dot PIN indicator */}
      <div
        role="status"
        aria-label={`تم إدخال ${value.length} من 4 أرقام`}
        className="flex items-center justify-center gap-3.5 py-2"
        dir="ltr"
      >
        {[0, 1, 2, 3].map((idx) => {
          const filled = idx < value.length;
          return (
            <span
              key={idx}
              className={`w-4 h-4 rounded-full transition-all duration-150 ${
                error
                  ? 'bg-red-500 scale-105'
                  : filled
                    ? 'bg-[var(--wa-accent)] scale-110 shadow-xs'
                    : 'bg-[#D1D7DB] dark:bg-[#374248]'
              }`}
            />
          );
        })}
      </div>

      {error && (
        <p role="alert" className="text-xs font-medium text-red-600 dark:text-red-400 text-center">
          {error}
        </p>
      )}

      {/* Touch Keypad Grid (always LTR 1-9 layout for standard phone dialing familiarity) */}
      <div dir="ltr" className="grid grid-cols-3 gap-2.5 max-w-[260px] mx-auto">
        {digitRows.flat().map((digit) => (
          <button
            key={digit}
            type="button"
            disabled={disabled}
            onClick={() => handleDigitTap(digit)}
            className={`${
              compact ? 'h-12' : 'h-14'
            } min-w-[56px] rounded-2xl bg-[#F0F2F5] dark:bg-[#111B21] border border-[#E9EDEF] dark:border-[#2A3942] font-mono-code tabular-nums text-xl font-bold text-[#111B21] dark:text-[#E9EDEF] hover:bg-[#E4E8EB] dark:hover:bg-[#182229] active:scale-95 active:bg-[var(--wa-accent-soft)] transition-all flex items-center justify-center cursor-pointer disabled:opacity-50`}
          >
            {digit}
          </button>
        ))}

        {/* Bottom-left slot: Biometric shortcut if enrolled, or spacer */}
        {hasBiometricOption && onSwitchToBiometric ? (
          <button
            type="button"
            aria-label="الفتح بالبصمة أو الوجه"
            title="الفتح بالبصمة أو الوجه"
            onClick={onSwitchToBiometric}
            className={`${
              compact ? 'h-12' : 'h-14'
            } min-w-[56px] rounded-2xl bg-[var(--wa-accent-soft)]/70 dark:bg-[#111B21] border border-[var(--wa-accent)]/30 text-[var(--wa-accent-strong)] dark:text-[var(--wa-accent)] hover:brightness-95 active:scale-95 transition-all flex items-center justify-center cursor-pointer`}
          >
            <Fingerprint className="w-6 h-6" aria-hidden="true" />
          </button>
        ) : (
          <div aria-hidden="true" />
        )}

        <button
          type="button"
          disabled={disabled}
          onClick={() => handleDigitTap('0')}
          className={`${
            compact ? 'h-12' : 'h-14'
          } min-w-[56px] rounded-2xl bg-[#F0F2F5] dark:bg-[#111B21] border border-[#E9EDEF] dark:border-[#2A3942] font-mono-code tabular-nums text-xl font-bold text-[#111B21] dark:text-[#E9EDEF] hover:bg-[#E4E8EB] dark:hover:bg-[#182229] active:scale-95 active:bg-[var(--wa-accent-soft)] transition-all flex items-center justify-center cursor-pointer disabled:opacity-50`}
        >
          0
        </button>

        <button
          type="button"
          disabled={disabled || value.length === 0}
          aria-label="حذف آخر رقم"
          onClick={handleBackspaceTap}
          className={`${
            compact ? 'h-12' : 'h-14'
          } min-w-[56px] rounded-2xl bg-[#F0F2F5]/70 dark:bg-[#111B21]/70 text-[#54656F] dark:text-[#AEBAC1] hover:bg-[#E4E8EB] dark:hover:bg-[#182229] active:scale-95 transition-all flex items-center justify-center cursor-pointer disabled:opacity-35`}
        >
          <Delete className="w-5 h-5" aria-hidden="true" />
        </button>
      </div>
    </div>
  );
}

interface AppLockScreenProps {
  hasBiometricConfigured: boolean;
  usePinFallback: boolean;
  biometricDeviceLabel?: string;
  biometricBusy: boolean;
  biometricError: string | null;
  autoLockedNotice: string | null;
  pinInput: string;
  pinError: string | null;
  onPinChange: (pin: string) => void;
  onVerifyPin: (pin: string) => void;
  onUnlockBiometric: () => void;
  onSwitchToPinFallback: () => void;
  onSwitchToBiometric: () => void;
  onSignOut: () => void;
}

export function AppLockScreen({
  hasBiometricConfigured,
  usePinFallback,
  biometricDeviceLabel,
  biometricBusy,
  biometricError,
  autoLockedNotice,
  pinInput,
  pinError,
  onPinChange,
  onVerifyPin,
  onUnlockBiometric,
  onSwitchToPinFallback,
  onSwitchToBiometric,
  onSignOut
}: AppLockScreenProps) {
  const showBiometric = hasBiometricConfigured && !usePinFallback;

  return (
    <div
      dir="rtl"
      className="min-h-[100dvh] w-full bg-[#EAE6DF] dark:bg-[#0C1317] flex items-end sm:items-center justify-center p-0 sm:p-4"
    >
      <div className="w-full sm:max-w-sm bg-white dark:bg-[#202C33] rounded-t-3xl sm:rounded-3xl p-6 pb-safe sm:p-7 shadow-2xl border border-[#E9EDEF] dark:border-[#374248] text-center space-y-5">
        <div className="w-14 h-14 sm:w-16 sm:h-16 rounded-full bg-[var(--wa-accent-soft)] dark:bg-[#111B21] text-[var(--wa-accent)] flex items-center justify-center mx-auto">
          {showBiometric ? (
            <Fingerprint className="w-7 h-7 sm:w-8 sm:h-8" aria-hidden="true" />
          ) : (
            <Lock className="w-7 h-7 sm:w-8 sm:h-8" aria-hidden="true" />
          )}
        </div>

        <div>
          <h1 className="font-display text-lg sm:text-xl font-bold text-[#111B21] dark:text-[#E9EDEF]">
            {showBiometric ? 'تطبيق تواصل محمي بالبصمة' : 'تطبيق تواصل مقفل'}
          </h1>
          <p className="text-xs text-[#54656F] dark:text-[#8696A0] mt-1 leading-relaxed">
            {showBiometric
              ? `تحقق عبر ${biometricDeviceLabel || 'البصمة أو التعرف على الوجه'} للوصول إلى محادثاتك المشفرة`
              : 'أدخل رمز الحماية المكون من ٤ أرقام لفتح المحادثات'}
          </p>
        </div>

        {autoLockedNotice && (
          <div
            role="status"
            className="flex items-start gap-2 rounded-2xl bg-amber-500/12 border border-amber-500/30 px-3 py-2.5 text-right text-[11px] font-semibold text-amber-800 dark:text-amber-300 leading-relaxed"
          >
            <Clock className="w-4 h-4 shrink-0 mt-0.5" aria-hidden="true" />
            <span>{autoLockedNotice}</span>
          </div>
        )}

        {showBiometric ? (
          <div className="space-y-3 pt-1">
            {biometricError && (
              <p role="alert" className="text-xs text-red-600 dark:text-red-400 leading-relaxed">
                {biometricError}
              </p>
            )}
            <button
              type="button"
              disabled={biometricBusy}
              aria-label="الفتح بالبصمة أو التعرف على الوجه"
              onClick={onUnlockBiometric}
              className="w-full min-h-[48px] rounded-2xl bg-[var(--wa-accent)] text-white text-sm font-bold hover:brightness-95 active:scale-[0.99] disabled:opacity-60 flex items-center justify-center gap-2 cursor-pointer transition-all"
            >
              <ScanFace className="w-5 h-5" aria-hidden="true" />
              <span>
                {biometricBusy ? 'بانتظار التحقق الحيوي...' : 'الفتح بالبصمة أو الوجه'}
              </span>
            </button>
            <button
              type="button"
              onClick={onSwitchToPinFallback}
              className="w-full min-h-[44px] rounded-2xl bg-[#F0F2F5] dark:bg-[#111B21] text-xs font-semibold text-[#111B21] dark:text-[#E9EDEF] flex items-center justify-center gap-1.5 hover:brightness-95 cursor-pointer"
            >
              <KeyRound className="w-4 h-4" aria-hidden="true" />
              <span>استخدام لوحة أرقام PIN بدلاً من ذلك</span>
            </button>
          </div>
        ) : (
          <TouchPinPad
            value={pinInput}
            onChange={onPinChange}
            onSubmitPin={onVerifyPin}
            error={pinError}
            hasBiometricOption={hasBiometricConfigured}
            onSwitchToBiometric={onSwitchToBiometric}
          />
        )}

        <button
          type="button"
          onClick={onSignOut}
          className="w-full min-h-[44px] rounded-xl text-xs font-semibold text-[#54656F] dark:text-[#AEBAC1] hover:underline cursor-pointer"
        >
          تسجيل الخروج والعودة لشاشة الدخول
        </button>
      </div>
    </div>
  );
}

interface LockedChatPinModalProps {
  hasBiometricConfigured: boolean;
  usePinFallback: boolean;
  biometricDeviceLabel?: string;
  biometricBusy: boolean;
  biometricError: string | null;
  pinInput: string;
  pinError: string | null;
  onPinChange: (pin: string) => void;
  onVerifyPin: (pin: string) => void;
  onUnlockBiometric: () => void;
  onSwitchToPinFallback: () => void;
  onSwitchToBiometric: () => void;
  onClose: () => void;
}

export function LockedChatPinModal({
  hasBiometricConfigured,
  usePinFallback,
  biometricDeviceLabel,
  biometricBusy,
  biometricError,
  pinInput,
  pinError,
  onPinChange,
  onVerifyPin,
  onUnlockBiometric,
  onSwitchToPinFallback,
  onSwitchToBiometric,
  onClose
}: LockedChatPinModalProps) {
  const showBiometric = hasBiometricConfigured && !usePinFallback;

  return (
    <div
      dir="rtl"
      role="dialog"
      aria-modal="true"
      aria-label="إدخال رمز قفل المحادثة"
      className="fixed inset-0 z-50 bg-black/55 backdrop-blur-xs flex items-end sm:items-center justify-center p-0 sm:p-4"
    >
      <div className="w-full sm:max-w-sm bg-white dark:bg-[#202C33] rounded-t-3xl sm:rounded-2xl p-5 pb-safe sm:p-6 shadow-2xl border border-[#E9EDEF] dark:border-[#374248] space-y-4 text-center">
        <div className="w-10 h-1.5 bg-[#D1D7DB] dark:bg-[#374248] rounded-full mx-auto sm:hidden" />

        <div className="flex items-center justify-between">
          <div className="w-9 h-9" aria-hidden="true" />
          <div className="w-12 h-12 rounded-full bg-[var(--wa-accent)]/15 text-[var(--wa-accent)] flex items-center justify-center">
            {showBiometric ? (
              <Fingerprint className="w-6 h-6" aria-hidden="true" />
            ) : (
              <Lock className="w-6 h-6 text-amber-500" aria-hidden="true" />
            )}
          </div>
          <button
            type="button"
            aria-label="إغلاق"
            onClick={onClose}
            className="w-10 h-10 rounded-full flex items-center justify-center text-[#54656F] dark:text-[#AEBAC1] hover:bg-black/5 dark:hover:bg-white/10 cursor-pointer"
          >
            <X className="w-5 h-5" aria-hidden="true" />
          </button>
        </div>

        <div>
          <h3 className="font-display text-lg font-bold text-[#111B21] dark:text-[#E9EDEF]">
            {showBiometric ? 'محادثة محمية بالبصمة' : 'محادثة مقفلة برمز سري'}
          </h3>
          <p className="text-xs text-[#54656F] dark:text-[#8696A0] mt-1 leading-relaxed">
            {showBiometric
              ? `تحقق عبر ${biometricDeviceLabel || 'البصمة أو الوجه'} لفتح هذه المحادثة المقفلة`
              : 'أدخل رمز القفل المكون من ٤ أرقام لفتح المحادثة'}
          </p>
        </div>

        {showBiometric ? (
          <div className="space-y-2.5 pt-1">
            {biometricError && (
              <p role="alert" className="text-xs text-red-600 dark:text-red-400">
                {biometricError}
              </p>
            )}
            <button
              type="button"
              disabled={biometricBusy}
              aria-label="فتح المحادثة بالبصمة أو التعرف على الوجه"
              onClick={onUnlockBiometric}
              className="w-full min-h-[48px] px-5 py-2.5 rounded-2xl bg-[var(--wa-accent)] text-white text-xs font-bold hover:brightness-95 disabled:opacity-60 flex items-center justify-center gap-1.5 cursor-pointer"
            >
              <ScanFace className="w-4 h-4" aria-hidden="true" />
              <span>{biometricBusy ? 'جاري التحقق...' : 'فتح بالبصمة أو الوجه'}</span>
            </button>
            <button
              type="button"
              onClick={onSwitchToPinFallback}
              className="w-full min-h-[44px] py-2 rounded-2xl bg-[#F0F2F5] dark:bg-[#111B21] text-xs font-semibold text-[#111B21] dark:text-[#E9EDEF] cursor-pointer"
            >
              استخدام لوحة أرقام PIN
            </button>
          </div>
        ) : (
          <TouchPinPad
            value={pinInput}
            onChange={onPinChange}
            onSubmitPin={onVerifyPin}
            error={pinError}
            hasBiometricOption={hasBiometricConfigured}
            onSwitchToBiometric={onSwitchToBiometric}
            compact
          />
        )}
      </div>
    </div>
  );
}

export function PrivacyBlurCurtain() {
  return (
    <div
      dir="rtl"
      aria-hidden="true"
      className="fixed inset-0 z-[90] bg-[#EAE6DF]/95 dark:bg-[#0C1317]/95 backdrop-blur-2xl flex flex-col items-center justify-center p-6 text-center select-none"
    >
      <div className="w-16 h-16 rounded-full bg-[var(--wa-accent-soft)] dark:bg-[#202C33] text-[var(--wa-accent)] flex items-center justify-center mb-3 shadow-lg">
        <ShieldCheck className="w-8 h-8" />
      </div>
      <p className="font-display text-lg font-bold text-[#111B21] dark:text-[#E9EDEF]">
        تواصل محمي
      </p>
      <p className="text-xs text-[#54656F] dark:text-[#8696A0] mt-1">
        يتم إخفاء محتوى المحادثات لحماية خصوصيتك
      </p>
    </div>
  );
}
