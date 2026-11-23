import { useCallback, useEffect, useState } from 'react';
import {
  RefreshCw,
  X,
  ShieldCheck,
  Layers,
  CheckCircle2,
  AlertTriangle,
  RotateCcw,
  Sparkles
} from 'lucide-react';
import {
  clearServiceWorkerAndWorkboxCache,
  getServiceWorkerCacheDetails,
  type ServiceWorkerCacheDetails
} from '../lib/pwaCacheManager';

interface ClearSwCacheModalProps {
  open: boolean;
  onClose: () => void;
  onShowToast?: (msg: string) => void;
}

export function ClearSwCacheModal({ open, onClose, onShowToast }: ClearSwCacheModalProps) {
  const [details, setDetails] = useState<ServiceWorkerCacheDetails | null>(null);
  const [loading, setLoading] = useState(false);
  const [clearing, setClearing] = useState(false);
  const [clearedNotice, setClearedNotice] = useState<string | null>(null);

  const loadDetails = useCallback(async () => {
    setLoading(true);
    try {
      const data = await getServiceWorkerCacheDetails();
      setDetails(data);
    } catch {
      onShowToast?.('تعذر قراءة تفاصيل ذاكرة Service Worker.');
    } finally {
      setLoading(false);
    }
  }, [onShowToast]);

  useEffect(() => {
    if (open) {
      setClearedNotice(null);
      void loadDetails();
    }
  }, [open, loadDetails]);

  const handleClear = async (withReload: boolean) => {
    setClearing(true);
    setClearedNotice(null);
    try {
      const result = await clearServiceWorkerAndWorkboxCache({
        unregister: false,
        reload: withReload
      });

      if (result.success) {
        const count = result.deletedCaches.length;
        const msg = withReload
          ? `تم مسح ${count} ذاكرة مؤقتة بنجاح! جاري إعادة تشغيل التطبيق بأحدث نسخة...`
          : `تم مسح ${count} ذاكرة مؤقتة وتحديث Service Worker بنجاح.`;
        setClearedNotice(msg);
        onShowToast?.(msg);
        if (!withReload) {
          void loadDetails();
        }
      } else {
        const err = result.error || 'حدث خطأ أثناء مسح الكاش.';
        onShowToast?.(err);
      }
    } catch {
      onShowToast?.('تعذر مسح ذاكرة Service Worker.');
    } finally {
      if (!withReload) {
        setClearing(false);
      }
    }
  };

  if (!open) return null;

  return (
    <div
      dir="rtl"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs animate-fadeIn"
      role="dialog"
      aria-modal="true"
      aria-labelledby="clear-sw-cache-title"
    >
      <div className="w-full max-w-lg rounded-3xl bg-white dark:bg-[#111B21] border border-[#E2E8EE] dark:border-[#222D34] shadow-2xl overflow-hidden flex flex-col max-h-[92dvh]">
        {/* Header */}
        <div className="px-5 py-4 border-b border-[#E9EDEF] dark:border-[#222D34] flex items-center justify-between gap-3 bg-[#F8FAFB] dark:bg-[#202C33]">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-10 h-10 rounded-2xl bg-amber-500/15 text-amber-600 dark:text-amber-400 flex items-center justify-center shrink-0">
              <RefreshCw className="w-5 h-5" aria-hidden="true" />
            </div>
            <div className="min-w-0">
              <h2 id="clear-sw-cache-title" className="font-display text-base font-bold truncate">
                مسح ذاكرة Service Worker و Workbox
              </h2>
              <p className="text-[11px] text-[#54656F] dark:text-[#8696A0] truncate">
                إصلاح مشاكل التحديث والتزامن مع الخادم
              </p>
            </div>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            <button
              type="button"
              disabled={loading || clearing}
              onClick={() => void loadDetails()}
              aria-label="تحديث الفحص"
              className="w-9 h-9 rounded-xl bg-white dark:bg-[#111B21] border border-[#E2E8EE] dark:border-[#374248] flex items-center justify-center text-[#54656F] dark:text-[#AEBAC1] hover:text-[#111B21] dark:hover:text-white cursor-pointer disabled:opacity-50 transition-colors"
            >
              <RotateCcw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            </button>
            <button
              type="button"
              onClick={onClose}
              disabled={clearing}
              aria-label="إغلاق"
              className="w-9 h-9 rounded-xl bg-white dark:bg-[#111B21] border border-[#E2E8EE] dark:border-[#374248] flex items-center justify-center text-[#54656F] dark:text-[#AEBAC1] hover:text-[#111B21] dark:hover:text-white cursor-pointer transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="p-5 overflow-y-auto space-y-4 no-scrollbar">
          {/* Safe Reassurance Banner */}
          <div className="p-3.5 rounded-2xl bg-emerald-500/10 border border-emerald-500/25 flex items-start gap-2.5">
            <ShieldCheck className="w-5 h-5 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
            <div className="text-xs text-emerald-900 dark:text-emerald-200 leading-relaxed">
              <span className="font-bold block mb-0.5">آمن تماماً وغير مفقود للبيانات:</span>
              هذا الإجراء يقوم فقط بحذف الملفات البرمجية المخبأة (JavaScript, CSS, HTML) وإعادة طلب أحدث نسخة من السيرفر. 
              <strong className="mx-1">لن يتم حذف</strong> محادثاتك أو رسائلك أو جهات اتصالك أو مفاتيح التشفير الخاصة بك المخزنة في جهازك.
            </div>
          </div>

          {/* When to use note */}
          <div className="p-3.5 rounded-2xl bg-[#F8FAFB] dark:bg-[#202C33] border border-[#E9EDEF] dark:border-[#2A3942] space-y-1.5 text-xs text-[#54656F] dark:text-[#8696A0]">
            <span className="font-bold text-[#111B21] dark:text-[#E9EDEF] flex items-center gap-1.5">
              <Sparkles className="w-4 h-4 text-amber-500" />
              <span>متى يُفضل استخدام هذا الخيار؟</span>
            </span>
            <ul className="list-disc list-inside space-y-1 text-[11px] leading-relaxed">
              <li>إذا صدر تحديث جديد للتطبيق ولم يظهر على جهازك بعد.</li>
              <li>إذا واجهت تعليقاً في مزامنة الرسائل أو شاشة بيضاء ناتجة عن حزم قديمة مخبأة.</li>
              <li>إذا أردت التأكد من أنك تعمل بأحدث ملفات السيرفر دون الحاجة لمسح بيانات المتصفح بالكامل.</li>
            </ul>
          </div>

          {/* Current Status Overview */}
          {loading && !details ? (
            <div className="py-6 text-center text-xs text-[#54656F] dark:text-[#8696A0]">
              جاري فحص ذاكرة Service Worker و Workbox...
            </div>
          ) : details ? (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-2.5">
                <div className="p-3 rounded-2xl bg-[#F8FAFB] dark:bg-[#202C33] border border-[#E9EDEF] dark:border-[#2A3942]">
                  <span className="text-[11px] text-[#54656F] dark:text-[#8696A0] block">حالة Service Worker</span>
                  <span className="text-xs font-bold text-[#111B21] dark:text-[#E9EDEF] mt-0.5 flex items-center gap-1">
                    {details.serviceWorkerState === 'active' ? (
                      <>
                        <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                        <span>نشط ومثبت ({details.serviceWorkersCount})</span>
                      </>
                    ) : details.serviceWorkerState === 'waiting' ? (
                      <>
                        <span className="w-2 h-2 rounded-full bg-amber-500" />
                        <span>هناك تحديث قيد الانتظار</span>
                      </>
                    ) : (
                      <span>متاح وجاهز للتحديث</span>
                    )}
                  </span>
                </div>

                <div className="p-3 rounded-2xl bg-[#F8FAFB] dark:bg-[#202C33] border border-[#E9EDEF] dark:border-[#2A3942]">
                  <span className="text-[11px] text-[#54656F] dark:text-[#8696A0] block">الكاشات النشطة المكتشفة</span>
                  <span className="text-xs font-bold text-[#111B21] dark:text-[#E9EDEF] mt-0.5 flex items-center gap-1">
                    <Layers className="w-3.5 h-3.5 text-amber-500" />
                    <span>{details.cacheNames.length} كاش ({details.totalEntries} ملف)</span>
                  </span>
                </div>
              </div>

              {/* Cache Names List */}
              {details.cacheNames.length > 0 && (
                <div className="space-y-1.5">
                  <span className="text-[11px] font-bold text-[#54656F] dark:text-[#8696A0]">
                    قوائم التخزين المؤقت التي سيتم تفريغها:
                  </span>
                  <div className="rounded-xl border border-[#E9EDEF] dark:border-[#2A3942] max-h-36 overflow-y-auto divide-y divide-[#E9EDEF] dark:divide-[#2A3942]">
                    {details.cacheNames.map((name) => (
                      <div
                        key={name}
                        className="px-3 py-2 text-[11px] font-mono-code text-[#111B21] dark:text-[#E9EDEF] bg-white dark:bg-[#111B21] flex items-center justify-between"
                        dir="ltr"
                      >
                        <span className="truncate">{name}</span>
                        {name.toLowerCase().includes('workbox') && (
                          <span className="ml-2 px-1.5 py-0.5 rounded text-[9px] font-sans font-bold bg-amber-500/15 text-amber-700 dark:text-amber-300">
                            Workbox
                          </span>
                        )}
                        {name.startsWith('wasil-') && (
                          <span className="ml-2 px-1.5 py-0.5 rounded text-[9px] font-sans font-bold bg-[#00A884]/15 text-[#008069] dark:text-[#06CF9C]">
                            SWR Core
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="py-4 text-center text-xs text-red-600 dark:text-red-400 flex items-center justify-center gap-1.5">
              <AlertTriangle className="w-4 h-4" />
              <span>لم يتم العثور على دعم CacheStorage في هذا المتصفح.</span>
            </div>
          )}

          {/* Feedback message */}
          {clearedNotice && (
            <div className="p-3 rounded-2xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-800 dark:text-emerald-200 text-xs font-semibold flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
              <span>{clearedNotice}</span>
            </div>
          )}

          {/* Action Buttons */}
          <div className="space-y-2 pt-2">
            <button
              type="button"
              disabled={clearing}
              onClick={() => void handleClear(true)}
              className="w-full min-h-[46px] px-4 py-2.5 rounded-xl bg-amber-600 hover:bg-amber-700 active:bg-amber-800 text-white text-xs font-bold flex items-center justify-center gap-2 transition-colors cursor-pointer disabled:opacity-50 shadow-xs"
            >
              <RefreshCw className={`w-4 h-4 ${clearing ? 'animate-spin' : ''}`} />
              <span>
                {clearing
                  ? 'جاري تفريغ الكاش وإعادة التشغيل...'
                  : 'مسح الكاش وإعادة تشغيل التطبيق فوراً (موصى به)'}
              </span>
            </button>

            <button
              type="button"
              disabled={clearing}
              onClick={() => void handleClear(false)}
              className="w-full min-h-[42px] px-4 py-2.5 rounded-xl bg-[#F0F2F5] dark:bg-[#202C33] hover:bg-[#E9EDEF] dark:hover:bg-[#2A3942] text-[#111B21] dark:text-[#E9EDEF] text-xs font-semibold flex items-center justify-center gap-2 transition-colors cursor-pointer disabled:opacity-50 border border-[#E9EDEF] dark:border-[#374248]"
            >
              <RotateCcw className="w-3.5 h-3.5 text-[#54656F] dark:text-[#8696A0]" />
              <span>مسح الكاش في الخلفية فقط (بدون إعادة تشغيل)</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
