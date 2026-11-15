import { useEffect, useRef, useState } from 'react';
import {
  RecaptchaVerifier,
  signInWithPhoneNumber,
  type ConfirmationResult
} from 'firebase/auth';
import { auth } from '../lib/firebase';
import { generateIdentityKeyPair, type IdentityKeys } from '../lib/crypto';

interface PhoneSignInProps {
  onAuthenticated?: () => void;
}

const IDENTITY_KEYS_STORAGE_KEY = 'wasil_identity_keys_v1';

function normalizePhoneNumber(value: string): string {
  return value.replace(/[\s()-]/g, '');
}

async function ensureLocalIdentityKeys(): Promise<void> {
  const stored = localStorage.getItem(IDENTITY_KEYS_STORAGE_KEY);
  if (stored) {
    try {
      const keys = JSON.parse(stored) as Partial<IdentityKeys>;
      if (keys.publicKeyJwk && keys.privateKeyJwk && keys.safetyCode) return;
    } catch {
      // Do not silently replace a possibly-used identity keypair. That could
      // make previously encrypted conversations unreadable on this device.
      throw new Error('بيانات مفاتيح التشفير المحلية تالفة. استعدها قبل تسجيل الدخول.');
    }
    throw new Error('زوج مفاتيح التشفير المحلي غير مكتمل. استعده قبل تسجيل الدخول.');
  }

  const identity = await generateIdentityKeyPair();
  // Persist only after the user has passed Firebase's SMS verification.
  localStorage.setItem(IDENTITY_KEYS_STORAGE_KEY, JSON.stringify(identity));
}

export function PhoneSignIn({ onAuthenticated }: PhoneSignInProps) {
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [confirmation, setConfirmation] = useState<ConfirmationResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const recaptchaContainerRef = useRef<HTMLDivElement>(null);
  const verifierRef = useRef<RecaptchaVerifier | null>(null);

  useEffect(() => {
    return () => {
      verifierRef.current?.clear();
      verifierRef.current = null;
    };
  }, []);

  const getVerifier = () => {
    if (!recaptchaContainerRef.current) throw new Error('تعذر تهيئة التحقق الأمني. أعد تحميل الصفحة.');
    if (!verifierRef.current) {
      verifierRef.current = new RecaptchaVerifier(auth, recaptchaContainerRef.current, {
        size: 'invisible',
        callback: () => setError(null),
        'expired-callback': () => setError('انتهت صلاحية التحقق. حاول إرسال الرمز مجددًا.')
      });
    }
    return verifierRef.current;
  };

  const sendCode = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    const e164 = normalizePhoneNumber(phone);
    if (!/^\+[1-9]\d{7,14}$/.test(e164)) {
      setError('أدخل رقم الهاتف بصيغة دولية، مثل ‎+9665xxxxxxxx.');
      return;
    }

    setBusy(true);
    try {
      const result = await signInWithPhoneNumber(auth, e164, getVerifier());
      setConfirmation(result);
      setCode('');
    } catch (reason) {
      verifierRef.current?.clear();
      verifierRef.current = null;
      setError(reason instanceof Error ? reason.message : 'تعذر إرسال رمز التحقق.');
    } finally {
      setBusy(false);
    }
  };

  const verifyCode = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!confirmation) return;
    const cleanCode = code.replace(/\s/g, '');
    if (!/^\d{6}$/.test(cleanCode)) {
      setError('أدخل رمز التحقق المكوّن من 6 أرقام.');
      return;
    }

    setBusy(true);
    setError(null);
    try {
      // Firebase Auth establishes the phone-authenticated session only after
      // the SMS code is accepted. App's onAuthStateChanged listener then syncs
      // the verified Firebase UID and profile with Firestore.
      await confirmation.confirm(cleanCode);
      await ensureLocalIdentityKeys();
      setConfirmation(null);
      onAuthenticated?.();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'تعذر إكمال تسجيل الدخول عبر الهاتف.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="w-full space-y-3" aria-label="تسجيل الدخول برقم الهاتف">
      <div ref={recaptchaContainerRef} />
      {error && <p role="alert" className="text-xs text-red-600 dark:text-red-400">{error}</p>}
      {!confirmation ? (
        <form onSubmit={(event) => void sendCode(event)} className="flex flex-col sm:flex-row gap-2">
          <label className="sr-only" htmlFor="phone-sign-in-number">رقم الهاتف مع رمز الدولة</label>
          <input
            id="phone-sign-in-number"
            type="tel"
            inputMode="tel"
            autoComplete="tel"
            required
            value={phone}
            onChange={(event) => setPhone(event.target.value)}
            placeholder="رقم الهاتف مع رمز الدولة، مثل +9665xxxxxxxx"
            className="min-h-[46px] flex-1 rounded-full border border-[#D1D7DB] dark:border-[#374248] bg-white dark:bg-[#202C33] px-4 text-sm outline-none focus:ring-2 focus:ring-[#00A884]"
          />
          <button
            type="submit"
            disabled={busy}
            className="min-h-[46px] px-5 rounded-full bg-[#128C7E] hover:bg-[#075E54] text-white text-sm font-semibold disabled:opacity-60"
          >
            {busy ? 'جارٍ إرسال الرمز…' : 'إرسال رمز SMS'}
          </button>
        </form>
      ) : (
        <form onSubmit={(event) => void verifyCode(event)} className="flex flex-col sm:flex-row gap-2">
          <label className="sr-only" htmlFor="phone-sign-in-code">رمز التحقق</label>
          <input
            id="phone-sign-in-code"
            type="text"
            inputMode="numeric"
            autoComplete="one-time-code"
            pattern="[0-9]{6}"
            maxLength={6}
            required
            value={code}
            onChange={(event) => setCode(event.target.value.replace(/\D/g, '').slice(0, 6))}
            placeholder="رمز التحقق المكوّن من 6 أرقام"
            className="min-h-[46px] flex-1 rounded-full border border-[#D1D7DB] dark:border-[#374248] bg-white dark:bg-[#202C33] px-4 text-sm outline-none focus:ring-2 focus:ring-[#00A884]"
          />
          <button
            type="submit"
            disabled={busy}
            className="min-h-[46px] px-5 rounded-full bg-[#128C7E] hover:bg-[#075E54] text-white text-sm font-semibold disabled:opacity-60"
          >
            {busy ? 'جارٍ التحقق…' : 'تأكيد الرمز'}
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => {
              setConfirmation(null);
              setCode('');
              setError(null);
            }}
            className="min-h-[46px] px-4 rounded-full text-sm text-[#54656F] dark:text-[#AEBAC1] hover:bg-black/5 disabled:opacity-60"
          >
            تغيير الرقم
          </button>
        </form>
      )}
      <p className="text-[11px] leading-relaxed text-[#667781] dark:text-[#8696A0]">
        ستُرسل Google Firebase رمز تحقق برسالة نصية. قد تُطبق رسوم شركة الاتصالات. لا تشارك الرمز مع أي شخص.
      </p>
    </section>
  );
}
