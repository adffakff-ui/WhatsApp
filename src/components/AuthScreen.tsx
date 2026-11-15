import { Lock, ShieldCheck, Video, MessageSquareLock, ArrowLeft } from 'lucide-react';

interface AuthScreenProps {
  onGoogleSignIn: () => Promise<void>;
  onEnterDemo: () => void;
  isSigningIn: boolean;
  authError: string | null;
}

export function AuthScreen({
  onGoogleSignIn,
  onEnterDemo,
  isSigningIn,
  authError
}: AuthScreenProps) {
  return (
    <div className="min-h-screen w-full bg-[#EAE6DF] dark:bg-[#0C1317] text-[#111B21] dark:text-[#E9EDEF] flex flex-col">
      {/* Top WhatsApp emerald header strip */}
      <div className="w-full h-44 bg-[#00A884] dark:bg-[#008069] px-6 py-6 flex items-start justify-center">
        <div className="w-full max-w-5xl flex items-center justify-between">
          <div className="flex items-center gap-3 text-white">
            <div className="w-10 h-10 rounded-full bg-white/15 flex items-center justify-center">
              <MessageSquareLock className="w-6 h-6" aria-hidden="true" />
            </div>
            <span className="font-display text-xl font-bold tracking-tight whitespace-nowrap">
              تواصل · Wasil
            </span>
          </div>
          <div className="text-white/90 text-xs font-medium flex items-center gap-2 whitespace-nowrap">
            <Lock className="w-3.5 h-3.5" aria-hidden="true" />
            <span>تشفير تام AES-GCM-256</span>
          </div>
        </div>
      </div>

      {/* Main elevated auth card */}
      <main className="flex-1 px-4 -mt-24 pb-10 flex items-start justify-center">
        <div className="w-full max-w-4xl bg-white dark:bg-[#111B21] rounded-2xl shadow-xl border border-[#E9EDEF] dark:border-[#222D34] overflow-hidden grid grid-cols-1 md:grid-cols-12">
          <div className="md:col-span-7 p-8 md:p-10 flex flex-col justify-between gap-6">
            <div>
              <h1 className="font-display text-2xl md:text-3xl font-bold text-[#111B21] dark:text-[#E9EDEF] leading-snug">
                تواصل بخصوصية وأمان تام عبر جميع أجهزتك
              </h1>
              <p className="mt-3 text-sm md:text-base text-[#54656F] dark:text-[#8696A0] leading-relaxed">
                أرسل رسائلك، مقاطعك الصوتية، واستطلاعاتك مع تشفير فعلي بين الطرفين ومزامنة لحظية مدعومة بقاعدة بيانات Firebase Firestore ومكالمات صوتية ومرئية عبر WebRTC.
              </p>

              <ul className="mt-6 space-y-3 text-sm text-[#3B4A54] dark:text-[#D1D7DB]">
                <li className="flex items-center gap-3">
                  <ShieldCheck className="w-5 h-5 text-[#00A884] shrink-0" aria-hidden="true" />
                  <span>مفاتيح ECDH P-256 وتشفير AES-GCM 256-bit على جهازك</span>
                </li>
                <li className="flex items-center gap-3">
                  <Video className="w-5 h-5 text-[#00A884] shrink-0" aria-hidden="true" />
                  <span>مكالمات صوتية ومرئية مباشرة مع مؤشر التحقق الأمني</span>
                </li>
                <li className="flex items-center gap-3">
                  <Lock className="w-5 h-5 text-[#00A884] shrink-0" aria-hidden="true" />
                  <span>مزامنة فورية عبر السحابة مع حفظ تفضيلات المحادثات</span>
                </li>
              </ul>
            </div>

            {authError && (
              <div
                role="alert"
                className="p-3 rounded-lg bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900 text-xs text-red-700 dark:text-red-300"
              >
                {authError}
              </div>
            )}

            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 pt-2">
              <button
                type="button"
                onClick={() => void onGoogleSignIn()}
                disabled={isSigningIn}
                className="min-h-[46px] px-6 py-2.5 rounded-full bg-[#00A884] hover:bg-[#008069] active:scale-[0.99] text-white font-semibold text-sm transition-all flex items-center justify-center gap-2.5 disabled:opacity-60 whitespace-nowrap cursor-pointer"
              >
                <span>{isSigningIn ? 'جاري الاتصال بـ Google...' : 'تسجيل الدخول عبر Google'}</span>
                <ArrowLeft className="w-4 h-4" aria-hidden="true" />
              </button>

              <button
                type="button"
                onClick={onEnterDemo}
                className="min-h-[46px] px-5 py-2.5 rounded-full border border-[#D1D7DB] dark:border-[#374248] hover:bg-[#F5F6F6] dark:hover:bg-[#202C33] text-[#008069] dark:text-[#06CF9C] font-medium text-sm transition-colors whitespace-nowrap cursor-pointer"
              >
                معاينة تفاعلية فورية
              </button>
            </div>
          </div>

          <div className="md:col-span-5 bg-[#F7F8FA] dark:bg-[#202C33] p-8 flex flex-col items-center justify-center border-t md:border-t-0 md:border-r border-[#E9EDEF] dark:border-[#222D34] text-center">
            <div className="w-44 h-44 rounded-2xl bg-white dark:bg-[#111B21] p-4 shadow-sm border border-[#E9EDEF] dark:border-[#2A3942] flex flex-col items-center justify-center">
              {/* Deterministic geometric SVG security matrix */}
              <svg viewBox="0 0 120 120" className="w-32 h-32 text-[#111B21] dark:text-[#E9EDEF]" aria-hidden="true">
                <rect x="8" y="8" width="32" height="32" rx="4" fill="none" stroke="currentColor" strokeWidth="6" />
                <rect x="18" y="18" width="12" height="12" rx="2" fill="#00A884" />
                <rect x="80" y="8" width="32" height="32" rx="4" fill="none" stroke="currentColor" strokeWidth="6" />
                <rect x="90" y="18" width="12" height="12" rx="2" fill="currentColor" />
                <rect x="8" y="80" width="32" height="32" rx="4" fill="none" stroke="currentColor" strokeWidth="6" />
                <rect x="18" y="90" width="12" height="12" rx="2" fill="currentColor" />
                <rect x="52" y="12" width="16" height="16" rx="2" fill="currentColor" />
                <rect x="52" y="52" width="16" height="16" rx="3" fill="#00A884" />
                <rect x="12" y="52" width="16" height="16" rx="2" fill="currentColor" />
                <rect x="88" y="52" width="20" height="16" rx="2" fill="currentColor" />
                <rect x="52" y="88" width="18" height="20" rx="2" fill="currentColor" />
                <rect x="84" y="84" width="24" height="24" rx="4" fill="none" stroke="#00A884" strokeWidth="5" />
              </svg>
            </div>
            <p className="mt-5 text-sm font-semibold text-[#111B21] dark:text-[#E9EDEF]">
              هوية تشفير محلية آمنة
            </p>
            <p className="mt-1.5 text-xs text-[#54656F] dark:text-[#8696A0] max-w-[230px] leading-relaxed">
              تُحفظ مفاتيحك الخاصة على متصفحك فقط، ولا تُخزن الرسائل كنص صريح على الخادم أبداً.
            </p>
          </div>
        </div>
      </main>
    </div>
  );
}
