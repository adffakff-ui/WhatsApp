import { useMemo, useState } from 'react';
import {
  Keyboard,
  X,
  Search,
  MessageSquare,
  Shield,
  SendHorizontal
} from 'lucide-react';
import { HOTKEYS_CATALOG, isApplePlatform } from '../lib/hotkeys';

interface KeyboardShortcutsModalProps {
  open: boolean;
  onClose: () => void;
}

export function KeyboardShortcutsModal({ open, onClose }: KeyboardShortcutsModalProps) {
  const [filterQuery, setFilterQuery] = useState('');
  const isMac = useMemo(() => isApplePlatform(), []);

  const filteredShortcuts = useMemo(() => {
    const q = filterQuery.trim().toLowerCase();
    if (!q) return HOTKEYS_CATALOG;
    return HOTKEYS_CATALOG.filter(
      (item) =>
        item.label.toLowerCase().includes(q) ||
        item.description.toLowerCase().includes(q) ||
        item.keys.join(' ').toLowerCase().includes(q)
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
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs animate-fadeIn"
      role="dialog"
      aria-modal="true"
      aria-labelledby="hotkeys-modal-title"
    >
      <div className="w-full max-w-lg rounded-3xl bg-white dark:bg-[#111B21] border border-[#E2E8EE] dark:border-[#222D34] shadow-2xl overflow-hidden flex flex-col max-h-[88dvh]">
        {/* Header */}
        <div className="px-5 py-4 border-b border-[#E9EDEF] dark:border-[#222D34] flex items-center justify-between gap-3 bg-[#F8FAFB] dark:bg-[#202C33]">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-10 h-10 rounded-2xl bg-[var(--wa-accent-soft)] text-[var(--wa-accent-strong)] flex items-center justify-center shrink-0">
              <Keyboard className="w-5 h-5" aria-hidden="true" />
            </div>
            <div className="min-w-0">
              <h2 id="hotkeys-modal-title" className="font-display text-base font-bold truncate">
                اختصارات لوحة المفاتيح
              </h2>
              <p className="text-[11px] text-[#54656F] dark:text-[#8696A0] truncate">
                تحكم فوري وسرعة فائقة في المراسلة على أجهزة الكمبيوتر
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="إغلاق"
            className="w-9 h-9 rounded-xl bg-white dark:bg-[#111B21] border border-[#E2E8EE] dark:border-[#374248] flex items-center justify-center text-[#54656F] dark:text-[#AEBAC1] hover:text-[#111B21] dark:hover:text-white cursor-pointer transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Search inside shortcuts */}
        <div className="px-5 pt-3 pb-2 border-b border-[#F0F2F5] dark:border-[#222D34]">
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-[#F0F2F5] dark:bg-[#202C33] border border-[#E9EDEF] dark:border-[#374248]">
            <Search className="w-4 h-4 text-[#667781] dark:text-[#8696A0] shrink-0" />
            <input
              type="text"
              value={filterQuery}
              onChange={(e) => setFilterQuery(e.target.value)}
              placeholder="ابحث عن اختصار أو وظيفة..."
              className="w-full bg-transparent text-xs text-[#111B21] dark:text-[#E9EDEF] placeholder:text-[#667781] dark:placeholder:text-[#8696A0] focus:outline-none"
            />
            {filterQuery && (
              <button
                type="button"
                onClick={() => setFilterQuery('')}
                className="text-xs text-[#667781] hover:text-[#111B21] dark:hover:text-white cursor-pointer"
              >
                مسح
              </button>
            )}
          </div>
        </div>

        {/* Shortcuts Categories List */}
        <div className="p-5 overflow-y-auto space-y-5 no-scrollbar">
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
                    return (
                      <div
                        key={item.id}
                        className="px-3.5 py-2.5 flex items-center justify-between gap-3 text-xs hover:bg-[#F8FAFB] dark:hover:bg-[#202C33]/50 transition-colors"
                      >
                        <div className="min-w-0">
                          <span className="font-bold text-[#111B21] dark:text-[#E9EDEF] block truncate">
                            {item.label}
                          </span>
                          <span className="text-[11px] text-[#54656F] dark:text-[#8696A0] truncate block">
                            {item.description}
                          </span>
                        </div>
                        <div className="flex items-center gap-1 shrink-0" dir="ltr">
                          {keysToDisplay.map((k, idx) => (
                            <kbd
                              key={idx}
                              className="px-2 py-1 rounded-lg border border-[#D1D7DB] dark:border-[#374248] bg-[#F8FAFB] dark:bg-[#202C33] font-mono-code text-[11px] font-bold text-[#111B21] dark:text-[#E9EDEF] shadow-2xs"
                            >
                              {k}
                            </kbd>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))
          )}
        </div>

        {/* Footer Hint */}
        <div className="px-5 py-3 border-t border-[#E9EDEF] dark:border-[#222D34] bg-[#F8FAFB] dark:bg-[#202C33] flex items-center justify-between text-[11px] text-[#54656F] dark:text-[#8696A0]">
          <span>
            اضغط على <kbd className="px-1.5 py-0.5 rounded border border-[#D1D7DB] dark:border-[#374248] font-mono-code font-bold bg-white dark:bg-[#111B21]" dir="ltr">{isMac ? '⌘ /' : 'Ctrl /'}</kbd> في أي وقت لفتح هذه اللائحة.
          </span>
          <button
            type="button"
            onClick={onClose}
            className="px-3 py-1 rounded-lg bg-[var(--wa-accent)] text-white text-xs font-bold hover:brightness-95 cursor-pointer shadow-2xs"
          >
            حسناً
          </button>
        </div>
      </div>
    </div>
  );
}
