import { useCallback, useEffect, useState } from 'react';
import {
  Database,
  HardDrive,
  RefreshCw,
  Trash2,
  X,
  PieChart,
  Layers,
  CheckCircle2,
  AlertTriangle
} from 'lucide-react';
import { collectStorageStats, formatBytes, type StorageStatsReport } from '../lib/storageStats';

interface StorageStatsModalProps {
  open: boolean;
  onClose: () => void;
  onShowToast?: (msg: string) => void;
}

export function StorageStatsModal({ open, onClose, onShowToast }: StorageStatsModalProps) {
  const [report, setReport] = useState<StorageStatsReport | null>(null);
  const [loading, setLoading] = useState(false);
  const [clearing, setClearing] = useState(false);

  const loadStats = useCallback(async () => {
    setLoading(true);
    try {
      const data = await collectStorageStats();
      setReport(data);
    } catch {
      onShowToast?.('تعذر قراءة إحصائيات التخزين المحلية.');
    } finally {
      setLoading(false);
    }
  }, [onShowToast]);

  useEffect(() => {
    if (open) {
      void loadStats();
    }
  }, [open, loadStats]);

  const handleClearCaches = async () => {
    if (!window.confirm('هل أنت متأكد من مسح جميع الملفات المخبأة في Service Worker؟ سيتم إعادة تحميلها تلقائياً عند الحاجة.')) {
      return;
    }
    setClearing(true);
    try {
      if ('caches' in window) {
        const keys = await caches.keys();
        await Promise.all(keys.map((k) => caches.delete(k)));
      }
      onShowToast?.('تم مسح الملفات المخبأة بنجاح.');
      void loadStats();
    } catch {
      onShowToast?.('تعذر مسح الملفات المخبأة.');
    } finally {
      setClearing(false);
    }
  };

  if (!open) return null;

  return (
    <div
      dir="rtl"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs animate-fadeIn"
    >
      <div className="w-full max-w-lg rounded-3xl bg-white dark:bg-[#111B21] border border-[#E2E8EE] dark:border-[#222D34] shadow-2xl overflow-hidden flex flex-col max-h-[90dvh]">
        {/* Header */}
        <div className="px-5 py-4 border-b border-[#E9EDEF] dark:border-[#222D34] flex items-center justify-between gap-3 bg-[#F8FAFB] dark:bg-[#202C33]">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-10 h-10 rounded-2xl bg-[#00A884]/15 text-[#008069] dark:text-[#06CF9C] flex items-center justify-center shrink-0">
              <Database className="w-5 h-5" aria-hidden="true" />
            </div>
            <div className="min-w-0">
              <h2 className="font-display text-base font-bold truncate">إحصائيات التخزين المحلي والموارد</h2>
              <p className="text-[11px] text-[#54656F] dark:text-[#8696A0] truncate">
                متابعة استهلاك مساحة التخزين في المتصفح وذاكرة التخزين المؤقت
              </p>
            </div>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            <button
              type="button"
              disabled={loading}
              onClick={() => void loadStats()}
              aria-label="تحديث الإحصائيات"
              className="w-9 h-9 rounded-xl bg-white dark:bg-[#111B21] border border-[#E2E8EE] dark:border-[#374248] flex items-center justify-center text-[#54656F] dark:text-[#AEBAC1] hover:text-[#111B21] dark:hover:text-white cursor-pointer disabled:opacity-50 transition-colors"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            </button>
            <button
              type="button"
              onClick={onClose}
              aria-label="إغلاق"
              className="w-9 h-9 rounded-xl bg-white dark:bg-[#111B21] border border-[#E2E8EE] dark:border-[#374248] flex items-center justify-center text-[#54656F] dark:text-[#AEBAC1] hover:text-[#111B21] dark:hover:text-white cursor-pointer transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="p-5 overflow-y-auto space-y-5 no-scrollbar">
          {loading && !report ? (
            <div className="py-12 text-center text-xs text-[#54656F] dark:text-[#8696A0]">
              جاري فحص مساحة التخزين والذاكرة المؤقتة...
            </div>
          ) : report ? (
            <>
              {/* Storage Quota Progress Card */}
              <div className="p-4 rounded-2xl bg-[#F8FAFB] dark:bg-[#202C33] border border-[#E9EDEF] dark:border-[#2A3942] space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold flex items-center gap-1.5">
                    <PieChart className="w-4 h-4 text-[#00A884]" aria-hidden="true" />
                    <span>مساحة المتصفح الكلية المخصصة للتطبيق</span>
                  </span>
                  <span className="text-xs font-mono-code font-bold">
                    {formatBytes(report.usageBytes)} / {report.quotaBytes > 0 ? formatBytes(report.quotaBytes) : 'غير محدود'}
                  </span>
                </div>

                {report.quotaBytes > 0 && (
                  <div className="w-full h-2.5 rounded-full bg-[#E2E8EE] dark:bg-[#111B21] overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all duration-500 ${
                        report.quotaPercentage > 85 ? 'bg-red-500' : report.quotaPercentage > 50 ? 'bg-amber-500' : 'bg-[#00A884]'
                      }`}
                      style={{ width: `${Math.max(2, report.quotaPercentage)}%` }}
                    />
                  </div>
                )}

                <div className="flex items-center justify-between text-[11px] text-[#54656F] dark:text-[#8696A0]">
                  <span>نسبة الاستهلاك: {report.quotaPercentage}%</span>
                  <span className="flex items-center gap-1 text-[#008069] dark:text-[#06CF9C]">
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    <span>التخزين آمن ومحمي محلياً</span>
                  </span>
                </div>
              </div>

              {/* Summary Cards Grid */}
              <div className="grid grid-cols-2 gap-3">
                <div className="p-3.5 rounded-2xl bg-[#F8FAFB] dark:bg-[#202C33] border border-[#E9EDEF] dark:border-[#2A3942] space-y-1">
                  <div className="flex items-center gap-1.5 text-[11px] text-[#54656F] dark:text-[#8696A0]">
                    <HardDrive className="w-3.5 h-3.5 text-[#00A884]" />
                    <span>مساحة LocalStorage</span>
                  </div>
                  <p className="text-base font-bold font-mono-code" dir="ltr">
                    {formatBytes(report.localStorageTotalBytes)}
                  </p>
                  <p className="text-[10px] text-[#54656F] dark:text-[#8696A0]">
                    {report.localStorageKeyCount} مفتاح تخزين
                  </p>
                </div>

                <div className="p-3.5 rounded-2xl bg-[#F8FAFB] dark:bg-[#202C33] border border-[#E9EDEF] dark:border-[#2A3942] space-y-1">
                  <div className="flex items-center gap-1.5 text-[11px] text-[#54656F] dark:text-[#8696A0]">
                    <Layers className="w-3.5 h-3.5 text-[#00A884]" />
                    <span>مساحة Service Worker Caches</span>
                  </div>
                  <p className="text-base font-bold font-mono-code" dir="ltr">
                    {formatBytes(report.cacheStorageBytes)}
                  </p>
                  <p className="text-[10px] text-[#54656F] dark:text-[#8696A0]">
                    {report.cacheNames.length} ذاكرة تخزين مؤقت نشطة
                  </p>
                </div>
              </div>

              {/* Detailed LocalStorage Keys Table */}
              <div className="space-y-2">
                <h3 className="text-xs font-bold text-[#111B21] dark:text-[#E9EDEF] flex items-center justify-between">
                  <span>تفاصيل مفاتيح التخزين المحلي (LocalStorage)</span>
                  <span className="text-[10px] font-mono-code text-[#54656F] dark:text-[#8696A0]">
                    مرتبة حسب الحجم
                  </span>
                </h3>
                <div className="rounded-2xl border border-[#E9EDEF] dark:border-[#2A3942] overflow-hidden max-h-56 overflow-y-auto divide-y divide-[#E9EDEF] dark:divide-[#2A3942]">
                  {report.localStorageKeys.map((item) => (
                    <div
                      key={item.key}
                      className="px-3.5 py-2.5 flex items-center justify-between gap-3 text-xs bg-white dark:bg-[#111B21] hover:bg-[#F8FAFB] dark:hover:bg-[#202C33]/50 transition-colors"
                    >
                      <div className="min-w-0">
                        <span className="font-mono-code font-bold truncate block" dir="ltr">
                          {item.key}
                        </span>
                        {item.itemCount !== undefined && (
                          <span className="text-[10px] text-[#54656F] dark:text-[#8696A0]">
                            {item.itemCount} عنصر داخلي
                          </span>
                        )}
                      </div>
                      <span className="font-mono-code text-xs font-bold text-[#008069] dark:text-[#06CF9C] shrink-0" dir="ltr">
                        {formatBytes(item.sizeBytes)}
                      </span>
                    </div>
                  ))}
                  {report.localStorageKeys.length === 0 && (
                    <div className="py-6 text-center text-xs text-[#54656F] dark:text-[#8696A0]">
                      لا توجد بيانات مخزنة حالياً في LocalStorage.
                    </div>
                  )}
                </div>
              </div>

              {/* Cache Actions */}
              <div className="pt-2 flex flex-col sm:flex-row items-center gap-2.5">
                <button
                  type="button"
                  disabled={clearing || report.cacheNames.length === 0}
                  onClick={() => void handleClearCaches()}
                  className="w-full min-h-[42px] px-4 py-2.5 rounded-xl bg-red-500/10 hover:bg-red-500/15 border border-red-500/30 text-red-700 dark:text-red-300 text-xs font-bold flex items-center justify-center gap-2 transition-colors cursor-pointer disabled:opacity-50"
                >
                  <Trash2 className="w-4 h-4" />
                  <span>{clearing ? 'جاري مسح الكاش...' : 'تنظيف ومسح ملفات Service Worker Caches'}</span>
                </button>
              </div>
            </>
          ) : (
            <div className="py-12 text-center text-xs text-red-600 dark:text-red-400 flex items-center justify-center gap-2">
              <AlertTriangle className="w-4 h-4" />
              <span>تعذر تحميل إحصائيات التخزين.</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
