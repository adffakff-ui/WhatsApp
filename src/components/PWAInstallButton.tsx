import { useState } from 'react';
import { Download, Smartphone, WifiOff } from 'lucide-react';
import { useOnlineStatus, usePWAInstall } from '../hooks/usePWAInstall';

export function PWAInstallButton() {
  const { isInstallable, isInstalled, isIOS, install } = usePWAInstall();
  const [showIOSGuide, setShowIOSGuide] = useState(false);

  if (isInstalled) {
    return null;
  }

  if (isInstallable) {
    return (
      <button
        type="button"
        onClick={() => void install()}
        className="w-full py-2.5 px-4 rounded-xl bg-[#F0F2F5] dark:bg-[#202C33] text-[#008069] dark:text-[#06CF9C] text-sm font-semibold flex items-center justify-center gap-2 hover:brightness-95 transition-all cursor-pointer"
      >
        <Download className="w-4 h-4" aria-hidden="true" />
        <span>تثبيت التطبيق على الجهاز (PWA)</span>
      </button>
    );
  }

  if (isIOS) {
    return (
      <>
        <button
          type="button"
          onClick={() => setShowIOSGuide(true)}
          className="w-full py-2.5 px-4 rounded-xl bg-[#F0F2F5] dark:bg-[#202C33] text-[#008069] dark:text-[#06CF9C] text-sm font-semibold flex items-center justify-center gap-2 hover:brightness-95 transition-all cursor-pointer"
        >
          <Smartphone className="w-4 h-4" aria-hidden="true" />
          <span>تثبيت التطبيق على iPhone / iPad</span>
        </button>

        {showIOSGuide && (
          <div
            role="dialog"
            aria-modal="true"
            aria-label="إرشادات التثبيت على iOS"
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          >
            <div className="w-full max-w-sm rounded-2xl bg-white dark:bg-[#202C33] p-6 shadow-xl border border-[#E9EDEF] dark:border-[#374248]">
              <h3 className="font-display text-base font-bold text-[#111B21] dark:text-[#E9EDEF]">
                تثبيت تواصل على iPhone / iPad
              </h3>
              <p className="mt-2 text-xs text-[#54656F] dark:text-[#8696A0] leading-relaxed">
                ١. اضغط على زر <strong>المشاركة (Share)</strong> في شريط متصفح Safari.
                <br />
                ٢. مرر للأسفل واختر <strong>إضافة إلى الشاشة الرئيسية (Add to Home Screen)</strong>.
              </p>
              <button
                type="button"
                onClick={() => setShowIOSGuide(false)}
                className="mt-4 w-full rounded-xl bg-[#00A884] py-2 text-xs font-semibold text-white hover:bg-[#008069] cursor-pointer"
              >
                حسناً
              </button>
            </div>
          </div>
        )}
      </>
    );
  }

  return null;
}

export function OfflineIndicator() {
  const isOnline = useOnlineStatus();
  if (isOnline) return null;

  return (
    <div
      role="status"
      className="fixed bottom-4 left-4 z-50 flex items-center gap-2 rounded-xl bg-amber-500 px-3.5 py-2 text-xs font-semibold text-white shadow-lg"
    >
      <WifiOff className="w-3.5 h-3.5" aria-hidden="true" />
      <span>وضع عدم الاتصال — يتم استخدام البيانات المخزنة محلياً</span>
    </div>
  );
}
