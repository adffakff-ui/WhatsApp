import { useMemo, useState } from 'react';
import {
  Command,
  Keyboard,
  X,
  Search,
  MessageSquare,
  Shield,
  SendHorizontal,
  Smartphone,
  ChevronLeft
} from 'lucide-react';
import { HOTKEYS_CATALOG, isApplePlatform } from '../lib/hotkeys';

interface KeyboardShortcutsModalProps {
  open: boolean;
  onClose: () => void;
  onExecuteShortcut?: (shortcutId: string) => void;
}

const EXECUTABLE_SHORTCUT_IDS = new Set([
  'new-chat',
  'search-chats',
  'new-group',
  'next-chat',
  'prev-chat',
  'open-settings',
  'lock-app',
  'toggle-dnd'
]);

export function KeyboardShortcutsModal({
  open,
  onClose,
  onExecuteShortcut
}: KeyboardShortcutsModalProps) {
  const [filterQuery, setFilterQuery] = useState('');
  const isMac = useMemo(() => isApplePlatform(), []);

  const filteredShortcuts = useMemo(() => {
    const q = filterQuery.trim().toLowerCase();
    if (!q) return HOTKEYS_CATALOG;
    return HOTKEYS_CATALOG.filter(
      (item) =>
        item.label.toLowerCase().includes(q) ||
        item.description.toLowerCase().includes(q) ||
        item.keys.join(' ').toLowerCase().includes(q) ||
        (item.slashCommand || '').toLowerCase().includes(q)
    );
  }, [filterQuery]);

  const categories = useMemo(() => {
    return [
      {
        id: 'chats',
        title: 'المحادثات والتنقل',
        icon: <MessageSquare className="w-4 h-4 text-[var(--wa-accent)]" />,
        items: filteredShortcuts.filter((s) => s.category === 'chats')
      },
      {
        id: 'messaging',
        title: 'داخل صندوق الدردشة',
        icon: <SendHorizontal className="w-4 h-4 text-emerald-500" />,
        items: filteredShortcuts.filter((s) => s.category === 'messaging')
      },
      {
        id: 'system',
        title: 'النظام والأمان والتطبيق',
        icon: <Shield className="w-4 h-4 text-amber-500" />,
        items: filteredShortcuts.filter((s) => s.category === 'system')
      }
    ].filter((cat) => cat.items.length > 0);
  }, [filteredShortcuts]);

  if (!open) return null;

  return (
    <div
      dir="rtl"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 p-0 sm:p-4 backdrop-blur-xs animate-fadeIn"
      role="dialog"
      aria-modal="true"
      aria-labelledby="hotkeys-modal-title"
    >
      <div className="w-full sm:max-w-lg rounded-t-3xl sm:rounded-3xl bg-white dark:bg-[#111B21] border border-[#E2E8EE] dark:border-[#222D34] shadow-2xl overflow-hidden flex flex-col max-h-[90dvh]">
        {/* Mobile Grab Handle */}
        <div className="sm:hidden pt-2.5 pb-1 bg-[#F8FAFB] dark:bg-[#202C33]">
          <div className="w-10 h-1.5 bg-[#D1D7DB] dark:bg-[#374248] rounded-full mx-auto" />
        </div>

        {/* Header */}
        <div className="px-4 sm:px-5 py-3.5 sm:py-4 border-b border-[#E9EDEF] dark:border-[#222D34] flex items-center justify-between gap-3 bg-[#F8FAFB] dark:bg-[#202C33]">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-10 h-10 rounded-2xl bg-[var(--wa-accent-soft)] text-[var(--wa-accent-strong)] flex items-center justify-center shrink-0">
              <Command className="w-5 h-5" aria-hidden="true" />
            </div>
            <div className="min-w-0">
              <h2 id="hotkeys-modal-title" className="font-display text-base font-bold truncate">
                الاختصارات والأوامر السريعة
              </h2>
              <p className="text-[11px] text-[#54656F] dark:text-[#8696A0] truncate">
                انقر على أي أمر لتنفيذه فوراً على الجوال أو استخدم لوحة المفاتيح
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="إغلاق"
            className="w-11 h-11 rounded-xl bg-white dark:bg-[#111B21] border border-[#E2E8EE] dark:border-[#374248] flex items-center justify-center text-[#54656F] dark:text-[#AEBAC1] hover:text-[#111B21] dark:hover:text-white shrink-0 cursor-pointer transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Mobile Tip Banner */}
        <div className="px-4 sm:px-5 pt-3 pb-2 bg-[#F8FAFB]/60 dark:bg-[#182229]/60 border-b border-[#F0F2F5] dark:border-[#222D34] space-y-2.5">
          <div className="flex items-start gap-2 text-[11px] text-[#54656F] dark:text-[#AEBAC1] leading-relaxed">
            <Smartphone className="w-4 h-4 text-[var(--wa-accent)] shrink-0 mt-0.5" aria-hidden="true" />
            <span>
              على الجوال: المس أي اختصار أدناه للتنفيذ الفوري، أو اكتب{' '}
              <code className="px-1.5 py-0.5 rounded bg-[var(--wa-accent-soft)] text-[var(--wa-accent-strong)] font-mono-code font-bold" dir="ltr">
                /
              </code>{' '}
              داخل أي محادثة لعرض أوامر <strong className="font-bold">/lock</strong> و{' '}
              <strong className="font-bold">/search</strong> و{' '}
              <strong className="font-bold">/dnd</strong> من لوحة مفاتيح الهاتف.
            </span>
          </div>

          {/* Search inside shortcuts */}
          <div className="flex items-center gap-2 px-3 min-h-[42px] rounded-xl bg-[#F0F2F5] dark:bg-[#202C33] border border-[#E9EDEF] dark:border-[#374248]">
            <Search className="w-4 h-4 text-[#667781] dark:text-[#8696A0] shrink-0" />
            <input
              type="text"
              value={filterQuery}
              onChange={(e) => setFilterQuery(e.target.value)}
              placeholder="ابحث عن اختصار، أمر (/lock)، أو وظيفة..."
              className="w-full bg-transparent text-xs text-[#111B21] dark:text-[#E9EDEF] placeholder:text-[#667781] dark:placeholder:text-[#8696A0] focus:outline-none"
            />
            {filterQuery && (
              <button
                type="button"
                onClick={() => setFilterQuery('')}
                className="text-xs font-semibold text-[#667781] hover:text-[#111B21] dark:hover:text-white cursor-pointer"
              >
                مسح
              </button>
            )}
          </div>
        </div>

        {/* Shortcuts Categories List */}
        <div className="p-4 sm:p-5 overflow-y-auto space-y-5 no-scrollbar">
          {categories.length === 0 ? (
            <div className="py-8 text-center text-xs text-[#54656F] dark:text-[#8696A0]">
              لا توجد اختصارات تطابق بحثك.
            </div>
          ) : (
            categories.map((cat) => (
              <div key={cat.id} className="space-y-2.5">
                <div className="flex items-center gap-1.5 text-xs font-bold text-[#54656F] dark:text-[#8696A0]">
                  {cat.icon}
                  <span>{cat.title}</span>
                </div>
                <div className="rounded-2xl border border-[#E9EDEF] dark:border-[#2A3942] divide-y divide-[#E9EDEF] dark:divide-[#2A3942] overflow-hidden bg-white dark:bg-[#111B21]">
                  {cat.items.map((item) => {
                    const keysToDisplay = isMac && item.macKeys ? item.macKeys : item.keys;
                    const isExecutable =
                      Boolean(onExecuteShortcut) && EXECUTABLE_SHORTCUT_IDS.has(item.id);

                    const content = (
                      <>
                        <div className="min-w-0 text-right flex-1">
                          <div className="flex items-center gap-2 min-w-0">
                            <span className="font-bold text-[#111B21] dark:text-[#E9EDEF] truncate">
                              {item.label}
                            </span>
                            {item.slashCommand && (
                              <span
                                dir="ltr"
                                className="px-1.5 py-0.5 rounded bg-[var(--wa-accent-soft)]/70 dark:bg-[#202C33] font-mono-code text-[10px] font-bold text-[var(--wa-accent-strong)] dark:text-[var(--wa-accent)] shrink-0"
                              >
                                {item.slashCommand}
                              </span>
                            )}
                          </div>
                          <span className="text-[11px] text-[#54656F] dark:text-[#8696A0] truncate block mt-0.5">
                            {item.description}
                          </span>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <div className="hidden sm:flex items-center gap-1" dir="ltr">
                            {keysToDisplay.map((k, idx) => (
                              <kbd
                                key={idx}
                                className="px-2 py-1 rounded-lg border border-[#D1D7DB] dark:border-[#374248] bg-[#F8FAFB] dark:bg-[#202C33] font-mono-code text-[11px] font-bold text-[#111B21] dark:text-[#E9EDEF] shadow-2xs"
                              >
                                {k}
                              </kbd>
                            ))}
                          </div>
                          {isExecutable ? (
                            <span className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-[var(--wa-accent)]/12 text-[var(--wa-accent-strong)] dark:text-[var(--wa-accent)] text-[11px] font-bold">
                              <span>تشغيل</span>
                              <ChevronLeft className="w-3.5 h-3.5" aria-hidden="true" />
                            </span>
                          ) : (
                            item.mobileActionLabel && (
                              <span className="sm:hidden text-[10px] font-semibold text-[#667781] dark:text-[#8696A0]">
                                {item.mobileActionLabel}
                              </span>
                            )
                          )}
                        </div>
                      </>
                    );

                    if (isExecutable) {
                      return (
                        <button
                          key={item.id}
                          type="button"
                          onClick={() => {
                            onClose();
                            onExecuteShortcut?.(item.id);
                          }}
                          className="w-full min-h-[52px] px-3.5 py-2.5 flex items-center justify-between gap-3 text-xs hover:bg-[#F8FAFB] dark:hover:bg-[#202C33]/60 active:bg-[var(--wa-accent-soft)]/30 transition-colors cursor-pointer"
                        >
                          {content}
                        </button>
                      );
                    }

                    return (
                      <div
                        key={item.id}
                        className="min-h-[48px] px-3.5 py-2.5 flex items-center justify-between gap-3 text-xs"
                      >
                        {content}
                      </div>
                    );
                  })}
                </div>
              </div>
            ))
          )}
        </div>

        {/* Footer Hint */}
        <div className="px-4 sm:px-5 py-3 pb-safe border-t border-[#E9EDEF] dark:border-[#222D34] bg-[#F8FAFB] dark:bg-[#202C33] flex items-center justify-between gap-3 text-[11px] text-[#54656F] dark:text-[#8696A0]">
          <span className="hidden sm:inline">
            اضغط على{' '}
            <kbd
              className="px-1.5 py-0.5 rounded border border-[#D1D7DB] dark:border-[#374248] font-mono-code font-bold bg-white dark:bg-[#111B21]"
              dir="ltr"
            >
              {isMac ? '⌘ /' : 'Ctrl /'}
            </kbd>{' '}
            في أي وقت أو استخدم{' '}
            <Keyboard className="w-3.5 h-3.5 inline-block mx-0.5" aria-hidden="true" /> لوحة الأوامر.
          </span>
          <span className="sm:hidden truncate">
            تدعم لوحات المفاتيح العربية والإنجليزية والبلوتوث
          </span>
          <button
            type="button"
            onClick={onClose}
            className="min-h-[40px] px-4 py-1.5 rounded-xl bg-[var(--wa-accent)] text-white text-xs font-bold hover:brightness-95 cursor-pointer shadow-2xs shrink-0"
          >
            إغلاق
          </button>
        </div>
      </div>
    </div>
  );
}

