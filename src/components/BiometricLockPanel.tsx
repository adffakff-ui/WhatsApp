import { useEffect, useState } from 'react';
import {
  Check,
  Fingerprint,
  KeyRound,
  Lock,
  ScanFace,
  ShieldCheck,
  Trash2
} from 'lucide-react';
import {
  isPlatformAuthenticatorAvailable,
  isWebAuthnSupported,
  registerBiometricCredential,
  verifyBiometricCredential
} from '../lib/webauthn';
import type { OmarSettings, UserProfile } from '../types/chat';

interface BiometricLockPanelProps {
  settings: OmarSettings;
  currentUser: UserProfile;
  onUpdateSettings: (patch: Partial<OmarSettings>) => void;
  onLockAppNow?: () => void;
  onShowToast?: (message: string) => void;
  compact?: boolean;
}

export function BiometricLockPanel({
  settings,
  currentUser,
  onUpdateSettings,
  onLockAppNow,
  onShowToast,
  compact = false
}: BiometricLockPanelProps) {
  const webAuthnSupported = isWebAuthnSupported();
  const [platformAvailable, setPlatformAvailable] = useState<boolean | null>(null);
  const [isBusy, setIsBusy] = useState(false);
  const [statusMessage, setStatusMessage] = useState<{
    type: 'success' | 'error';
    text: string;
  } | null>(null);

  useEffect(() => {
    let mounted = true;
    void isPlatformAuthenticatorAvailable().then((avail) => {
      if (mounted) setPlatformAvailable(avail);
    });
    return () => {
      mounted = false;
    };
  }, []);

  const hasCredential = Boolean(settings.biometricCredentialId);
  const activeMethod: 'pin' | 'biometric' =
    settings.lockMethod === 'biometric' && hasCredential ? 'biometric' : 'pin';

  const handleEnrollBiometric = async () => {
    if (isBusy) return;
    setIsBusy(true);
    setStatusMessage(null);
    try {
      const result = await registerBiometricCredential({
        userId: currentUser.uid || 'wasil_user',
        userName: currentUser.email || currentUser.phone || currentUser.uid || 'wasil_user',
        displayName: currentUser.displayName || 'مستخدم تواصل'
      });
      onUpdateSettings({
        lockMethod: 'biometric',
        biometricCredentialId: result.credentialId,
        biometricEnrolledAtMs: result.createdAtMs,
        biometricDeviceLabel: result.label,
        appLockOnLaunch: true
      });
      const msg = 'تم تسجيل البصمة / التعرف على الوجه وتفعيل قفل التطبيق بنجاح.';
      setStatusMessage({ type: 'success', text: msg });
      onShowToast?.(msg);
    } catch (err) {
      setStatusMessage({
        type: 'error',
        text: err instanceof Error ? err.message : 'تعذر تسجيل البصمة.'
      });
    } finally {
      setIsBusy(false);
    }
  };

  const handleTestBiometric = async () => {
    if (isBusy || !settings.biometricCredentialId) return;
    setIsBusy(true);
    setStatusMessage(null);
    try {
      const verified = await verifyBiometricCredential(settings.biometricCredentialId);
      if (verified) {
        const msg = 'تم التحقق من البصمة / الوجه بنجاح ✓';
        setStatusMessage({ type: 'success', text: msg });
        onShowToast?.(msg);
      } else {
        setStatusMessage({ type: 'error', text: 'فشل التحقق الحيوي. يرجى المحاولة مرة أخرى.' });
      }
    } catch (err) {
      setStatusMessage({
        type: 'error',
        text: err instanceof Error ? err.message : 'تعذر إجراء التحقق الحيوي.'
      });
    } finally {
      setIsBusy(false);
    }
  };

  const handleRemoveBiometric = () => {
    onUpdateSettings({
      lockMethod: 'pin',
      biometricCredentialId: '',
      biometricEnrolledAtMs: 0,
      biometricDeviceLabel: ''
    });
    const msg = 'تمت إزالة البصمة والعودة إلى رمز PIN.';
    setStatusMessage({ type: 'success', text: msg });
    onShowToast?.(msg);
  };

  const handleSelectMethod = (method: 'pin' | 'biometric') => {
    setStatusMessage(null);
    if (method === 'pin') {
      onUpdateSettings({ lockMethod: 'pin' });
      return;
    }
    if (hasCredential) {
      onUpdateSettings({ lockMethod: 'biometric' });
      return;
    }
    void handleEnrollBiometric();
  };

  return (
    <div
      className={`rounded-2xl bg-[#F0F2F5] dark:bg-[#202C33] border border-[#E9EDEF] dark:border-[#2A3942] space-y-3.5 ${
        compact ? 'p-3.5' : 'p-4'
      }`}
    >
      <div className="flex items-start justify-between gap-2.5 min-w-0">
        <div className="flex items-start gap-2.5 min-w-0">
          <div className="w-9 h-9 rounded-xl bg-[var(--wa-accent)]/15 text-[var(--wa-accent-strong)] dark:text-[var(--wa-accent)] flex items-center justify-center shrink-0">
            <Fingerprint className="w-5 h-5" aria-hidden="true" />
          </div>
          <div className="min-w-0">
            <h3 className="text-sm font-bold text-[#111B21] dark:text-[#E9EDEF] flex items-center gap-1.5 flex-wrap">
              <span>قفل التطبيق والمحادثات بالبصمة</span>
              {activeMethod === 'biometric' && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 text-[10px] font-bold">
                  <ShieldCheck className="w-3 h-3" aria-hidden="true" />
                  <span>WebAuthn نشط</span>
                </span>
              )}
            </h3>
            <p className="text-[11px] text-[#54656F] dark:text-[#8696A0] leading-relaxed mt-0.5">
              استخدم بصمة الإصبع أو التعرف على الوجه (Web Authentication API) لفتح التطبيق والمحادثات المقفلة بدلاً من PIN.
            </p>
          </div>
        </div>
      </div>

      {/* App Lock on Launch Switch */}
      <label className="w-full p-3 rounded-xl bg-white dark:bg-[#111B21] border border-[#E9EDEF] dark:border-[#2A3942] flex items-center justify-between gap-3 cursor-pointer min-w-0">
        <div className="min-w-0">
          <p className="text-xs font-bold text-[#111B21] dark:text-[#E9EDEF]">
            قفل التطبيق تلقائياً عند الفتح
          </p>
          <p className="text-[11px] text-[#54656F] dark:text-[#8696A0]">
            يطلب المصادقة قبل عرض أي محادثة عند تشغيل التطبيق
          </p>
        </div>
        <input
          type="checkbox"
          aria-label="تفعيل قفل التطبيق تلقائياً عند الفتح"
          checked={Boolean(settings.appLockOnLaunch)}
          onChange={(e) => onUpdateSettings({ appLockOnLaunch: e.target.checked })}
          className="w-4 h-4 accent-[var(--wa-accent)] shrink-0"
        />
      </label>

      {/* Authentication Method Selector */}
      <div className="space-y-1.5">
        <p className="text-[11px] font-bold text-[#54656F] dark:text-[#8696A0]">
          طريقة القفل الأساسية
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          <button
            type="button"
            disabled={isBusy}
            aria-pressed={activeMethod === 'biometric'}
            onClick={() => handleSelectMethod('biometric')}
            className={`p-3 rounded-xl border text-right flex items-center justify-between gap-2 transition-all cursor-pointer disabled:opacity-60 ${
              activeMethod === 'biometric'
                ? 'border-[var(--wa-accent)] bg-[var(--wa-accent-soft)]/50 dark:bg-[#111B21] text-[#111B21] dark:text-[#E9EDEF]'
                : 'border-[#E9EDEF] dark:border-[#2A3942] bg-white dark:bg-[#182229] text-[#54656F] dark:text-[#AEBAC1] hover:border-[var(--wa-accent)]/50'
            }`}
          >
            <div className="flex items-center gap-2 min-w-0">
              <ScanFace
                className={`w-4 h-4 shrink-0 ${
                  activeMethod === 'biometric' ? 'text-[var(--wa-accent)]' : ''
                }`}
                aria-hidden="true"
              />
              <div className="min-w-0">
                <p className="text-xs font-bold truncate">البصمة / الوجه</p>
                <p className="text-[10px] opacity-80 truncate">Web Authentication</p>
              </div>
            </div>
            {activeMethod === 'biometric' && (
              <Check className="w-4 h-4 text-[var(--wa-accent)] shrink-0" aria-hidden="true" />
            )}
          </button>

          <button
            type="button"
            disabled={isBusy}
            aria-pressed={activeMethod === 'pin'}
            onClick={() => handleSelectMethod('pin')}
            className={`p-3 rounded-xl border text-right flex items-center justify-between gap-2 transition-all cursor-pointer disabled:opacity-60 ${
              activeMethod === 'pin'
                ? 'border-[var(--wa-accent)] bg-[var(--wa-accent-soft)]/50 dark:bg-[#111B21] text-[#111B21] dark:text-[#E9EDEF]'
                : 'border-[#E9EDEF] dark:border-[#2A3942] bg-white dark:bg-[#182229] text-[#54656F] dark:text-[#AEBAC1] hover:border-[var(--wa-accent)]/50'
            }`}
          >
            <div className="flex items-center gap-2 min-w-0">
              <KeyRound
                className={`w-4 h-4 shrink-0 ${
                  activeMethod === 'pin' ? 'text-[var(--wa-accent)]' : ''
                }`}
                aria-hidden="true"
              />
              <div className="min-w-0">
                <p className="text-xs font-bold truncate">رمز PIN التقليدي</p>
                <p className="text-[10px] opacity-80 truncate">٤ أرقام سرية</p>
              </div>
            </div>
            {activeMethod === 'pin' && (
              <Check className="w-4 h-4 text-[var(--wa-accent)] shrink-0" aria-hidden="true" />
            )}
          </button>
        </div>
      </div>

      {/* WebAuthn Enrollment & Device Info */}
      <div className="p-3 rounded-xl bg-white dark:bg-[#111B21] border border-[#E9EDEF] dark:border-[#2A3942] space-y-2.5">
        <div className="flex flex-wrap items-center justify-between gap-2 text-[11px]">
          <span className="font-semibold text-[#111B21] dark:text-[#E9EDEF]">
            حالة المصادقة الحيوية:
          </span>
          <span
            className={`font-bold ${
              hasCredential
                ? 'text-emerald-600 dark:text-emerald-400'
                : webAuthnSupported
                  ? 'text-amber-600 dark:text-amber-400'
                  : 'text-red-600 dark:text-red-400'
            }`}
          >
            {hasCredential
              ? `مسجلة (${settings.biometricDeviceLabel || 'البصمة الحيوية'}) ✓`
              : webAuthnSupported
                ? platformAvailable === false
                  ? 'مستشعر الجهاز غير مكتشف (يمكن التجربة أو استخدام PIN)'
                  : 'جاهزة للتسجيل على هذا الجهاز'
                : 'المتصفح لا يدعم WebAuthn'}
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            disabled={isBusy || !webAuthnSupported}
            onClick={() => void handleEnrollBiometric()}
            className="flex-1 min-w-[160px] min-h-[38px] px-3 py-2 rounded-xl bg-[var(--wa-accent)] text-white text-xs font-bold flex items-center justify-center gap-1.5 hover:brightness-95 disabled:opacity-50 cursor-pointer"
          >
            <Fingerprint className="w-4 h-4 shrink-0" aria-hidden="true" />
            <span>
              {isBusy
                ? 'بانتظار البصمة...'
                : hasCredential
                  ? 'إعادة تسجيل البصمة / الوجه'
                  : 'تسجيل وتفعيل البصمة / الوجه'}
            </span>
          </button>

          {hasCredential && (
            <>
              <button
                type="button"
                disabled={isBusy}
                onClick={() => void handleTestBiometric()}
                className="min-h-[38px] px-3 py-2 rounded-xl bg-[#F0F2F5] dark:bg-[#202C33] text-[#111B21] dark:text-[#E9EDEF] text-xs font-semibold hover:brightness-95 disabled:opacity-50 cursor-pointer"
              >
                تجربة التحقق
              </button>
              <button
                type="button"
                disabled={isBusy}
                aria-label="إزالة البصمة المسجلة"
                onClick={handleRemoveBiometric}
                className="min-h-[38px] px-2.5 py-2 rounded-xl bg-red-50 dark:bg-red-950/30 text-red-600 dark:text-red-400 text-xs font-semibold flex items-center gap-1 hover:brightness-95 disabled:opacity-50 cursor-pointer"
              >
                <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
                <span>إزالة</span>
              </button>
            </>
          )}
        </div>

        {statusMessage && (
          <p
            role={statusMessage.type === 'error' ? 'alert' : 'status'}
            className={`text-[11px] leading-relaxed ${
              statusMessage.type === 'error'
                ? 'text-red-600 dark:text-red-400'
                : 'text-emerald-600 dark:text-emerald-400'
            }`}
          >
            {statusMessage.text}
          </p>
        )}
      </div>

      {/* Instant Lock App Button */}
      {onLockAppNow && (
        <button
          type="button"
          onClick={onLockAppNow}
          className="w-full min-h-[40px] px-4 py-2 rounded-xl bg-[#111B21] dark:bg-white/10 text-white text-xs font-bold flex items-center justify-center gap-2 hover:brightness-110 transition-all cursor-pointer"
        >
          <Lock className="w-3.5 h-3.5" aria-hidden="true" />
          <span>قفل التطبيق الآن</span>
        </button>
      )}
    </div>
  );
}
