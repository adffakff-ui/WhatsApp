import { useState } from 'react';
import { X, Clock, Calendar, SendHorizontal, Zap } from 'lucide-react';

interface ScheduleMessageModalProps {
  chatId: string;
  initialText?: string;
  onClose: () => void;
  onConfirmSchedule: (sendAtMs: number, text: string) => Promise<void>;
}

export function ScheduleMessageModal({
  chatId,
  initialText = '',
  onClose,
  onConfirmSchedule
}: ScheduleMessageModalProps) {
  const [text, setText] = useState(initialText);
  const now = new Date(Date.now() + 15 * 60 * 1000); // 15 mins from now default
  const defaultDateStr = now.toISOString().slice(0, 10);
  const defaultTimeStr = now.toTimeString().slice(0, 5);

  const [dateStr, setDateStr] = useState(defaultDateStr);
  const [timeStr, setTimeStr] = useState(defaultTimeStr);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const handlePreset = (minutes: number) => {
    setErrorMessage(null);
    const target = new Date(Date.now() + minutes * 60 * 1000);
    setDateStr(target.toISOString().slice(0, 10));
    setTimeStr(target.toTimeString().slice(0, 5));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!text.trim()) {
      setErrorMessage('يرجى كتابة نص الرسالة أولاً.');
      return;
    }
    const targetMs = new Date(`${dateStr}T${timeStr}:00`).getTime();
    if (isNaN(targetMs) || targetMs <= Date.now()) {
      setErrorMessage('يرجى تحديد وقت في المستقبل للرسالة المجدولة.');
      return;
    }

    setErrorMessage(null);
    setIsSubmitting(true);
    try {
      await onConfirmSchedule(targetMs, text.trim());
      onClose();
    } catch {
      setErrorMessage('تعذر جدولة الرسالة. يرجى المحاولة مرة أخرى.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="جدولة رسالة"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-2xl bg-white dark:bg-[#202C33] p-5 sm:p-6 shadow-2xl border border-[#E9EDEF] dark:border-[#374248] space-y-4 text-right"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-2">
          <h3 className="font-display text-base font-bold text-[#111B21] dark:text-[#E9EDEF] flex items-center gap-2">
            <Clock className="w-5 h-5 text-[var(--wa-accent)]" />
            <span>جدولة رسالة تلقائية</span>
          </h3>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-full flex items-center justify-center text-[#54656F] dark:text-[#8696A0] hover:bg-[#F0F2F5] dark:hover:bg-[#111B21] cursor-pointer"
            aria-label="إغلاق النافذة"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {errorMessage && (
          <div className="p-2.5 rounded-xl bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-800 text-xs text-red-600 dark:text-red-400 font-medium">
            {errorMessage}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <label className="text-xs font-bold text-[#54656F] dark:text-[#8696A0]">
              نص الرسالة المجدولة
            </label>
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="اكتب رسالتك ليتم إرسالها في الوقت المحدد..."
              rows={3}
              className="w-full rounded-xl bg-[#F0F2F5] dark:bg-[#111B21] border border-[#E9EDEF] dark:border-[#374248] p-3 text-xs sm:text-sm text-[#111B21] dark:text-[#E9EDEF] focus:outline-none focus:ring-2 focus:ring-[var(--wa-accent)] resize-none"
              required
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-[11px] font-bold text-[#54656F] dark:text-[#8696A0] flex items-center gap-1">
                <Calendar className="w-3.5 h-3.5 text-[var(--wa-accent)]" />
                <span>تاريخ الإرسال</span>
              </label>
              <input
                type="date"
                value={dateStr}
                onChange={(e) => setDateStr(e.target.value)}
                className="w-full rounded-xl bg-[#F0F2F5] dark:bg-[#111B21] border border-[#E9EDEF] dark:border-[#374248] px-3 py-2 text-xs text-[#111B21] dark:text-[#E9EDEF] focus:outline-none focus:ring-2 focus:ring-[var(--wa-accent)] font-mono-code"
                required
              />
            </div>
            <div className="space-y-1">
              <label className="text-[11px] font-bold text-[#54656F] dark:text-[#8696A0] flex items-center gap-1">
                <Clock className="w-3.5 h-3.5 text-[var(--wa-accent)]" />
                <span>وقت الإرسال</span>
              </label>
              <input
                type="time"
                value={timeStr}
                onChange={(e) => setTimeStr(e.target.value)}
                className="w-full rounded-xl bg-[#F0F2F5] dark:bg-[#111B21] border border-[#E9EDEF] dark:border-[#374248] px-3 py-2 text-xs text-[#111B21] dark:text-[#E9EDEF] focus:outline-none focus:ring-2 focus:ring-[var(--wa-accent)] font-mono-code"
                required
              />
            </div>
          </div>

          {/* Quick Presets */}
          <div className="space-y-1.5">
            <span className="text-[11px] text-[#54656F] dark:text-[#8696A0] font-medium flex items-center gap-1">
              <Zap className="w-3 h-3 text-amber-500" />
              <span>اختصارات سريعة:</span>
            </span>
            <div className="flex flex-wrap gap-1.5">
              <button
                type="button"
                onClick={() => handlePreset(10)}
                className="px-2.5 py-1 rounded-lg bg-[#F0F2F5] dark:bg-[#111B21] text-[11px] text-[#111B21] dark:text-[#E9EDEF] hover:bg-[var(--wa-accent-soft)] transition-colors cursor-pointer"
              >
                بعد ١٠ دقائق
              </button>
              <button
                type="button"
                onClick={() => handlePreset(60)}
                className="px-2.5 py-1 rounded-lg bg-[#F0F2F5] dark:bg-[#111B21] text-[11px] text-[#111B21] dark:text-[#E9EDEF] hover:bg-[var(--wa-accent-soft)] transition-colors cursor-pointer"
              >
                بعد ساعة
              </button>
              <button
                type="button"
                onClick={() => handlePreset(1440)}
                className="px-2.5 py-1 rounded-lg bg-[#F0F2F5] dark:bg-[#111B21] text-[11px] text-[#111B21] dark:text-[#E9EDEF] hover:bg-[var(--wa-accent-soft)] transition-colors cursor-pointer"
              >
                غداً في مثل هذا الوقت
              </button>
            </div>
          </div>

          <div className="pt-2 flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl bg-[#F0F2F5] dark:bg-[#374248] text-[#111B21] dark:text-[#E9EDEF] text-xs font-semibold hover:brightness-95 cursor-pointer"
            >
              إلغاء
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="px-4 py-2 rounded-xl bg-[var(--wa-accent)] text-white text-xs font-bold hover:brightness-95 flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
            >
              <SendHorizontal className="w-3.5 h-3.5" />
              <span>{isSubmitting ? 'جاري الجدولة...' : 'جدولة الرسالة'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
