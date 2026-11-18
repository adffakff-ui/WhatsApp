import { X, Clock, Trash2, Calendar, Send } from 'lucide-react';
import type { ScheduledMessage } from '../types/chat';

interface ScheduledMessagesModalProps {
  scheduledMessages: ScheduledMessage[];
  onCancelSchedule: (msgId: string) => Promise<void>;
  onClose: () => void;
}

export function ScheduledMessagesModal({
  scheduledMessages,
  onCancelSchedule,
  onClose
}: ScheduledMessagesModalProps) {
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="الرسائل المجدولة"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg rounded-2xl bg-white dark:bg-[#202C33] p-5 sm:p-6 shadow-2xl border border-[#E9EDEF] dark:border-[#374248] space-y-4 text-right max-h-[85vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-2 shrink-0">
          <h3 className="font-display text-base font-bold text-[#111B21] dark:text-[#E9EDEF] flex items-center gap-2">
            <Clock className="w-5 h-5 text-[var(--wa-accent)]" />
            <span>الرسائل المجدولة قيد الانتظار ({scheduledMessages.length})</span>
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

        <div className="flex-1 overflow-y-auto space-y-3 py-1">
          {scheduledMessages.length === 0 ? (
            <div className="text-center py-12 space-y-2">
              <Clock className="w-12 h-12 text-[#8696A0] mx-auto opacity-40" />
              <p className="text-sm font-semibold text-[#54656F] dark:text-[#8696A0]">
                لا توجد رسائل مجدولة قيد الانتظار حالياً.
              </p>
              <p className="text-xs text-[#8696A0]">
                يمكنك جدولة أي رسالة من داخل نافذة الدردشة عبر زر الإضافات.
              </p>
            </div>
          ) : (
            scheduledMessages.map((m) => {
              const dateStr = new Date(m.sendAtMs).toLocaleString('ar-SA', {
                dateStyle: 'medium',
                timeStyle: 'short'
              });
              return (
                <div
                  key={m.id}
                  className="p-3.5 rounded-xl bg-[#F0F2F5] dark:bg-[#111B21] border border-[#E9EDEF] dark:border-[#374248] flex items-start justify-between gap-3"
                >
                  <div className="space-y-1.5 min-w-0 flex-1">
                    <p className="text-xs sm:text-sm font-semibold text-[#111B21] dark:text-[#E9EDEF] break-words">
                      {m.payload.text}
                    </p>
                    <div className="flex items-center gap-2 text-[11px] text-[#54656F] dark:text-[#8696A0]">
                      <span className="flex items-center gap-1 font-mono-code">
                        <Calendar className="w-3.5 h-3.5 text-[var(--wa-accent)]" />
                        <span>وقت الإرسال: {dateStr}</span>
                      </span>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => void onCancelSchedule(m.id)}
                    className="p-2 rounded-xl text-red-500 hover:bg-red-50 dark:hover:bg-red-950/30 transition-colors cursor-pointer shrink-0"
                    title="إلغاء الجدولة"
                    aria-label="إلغاء الجدولة"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              );
            })
          )}
        </div>

        <div className="pt-2 border-t border-[#E9EDEF] dark:border-[#2A3942] flex justify-end shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-xl bg-[var(--wa-accent)] text-white text-xs font-semibold hover:brightness-95 cursor-pointer"
          >
            إغلاق
          </button>
        </div>
      </div>
    </div>
  );
}
