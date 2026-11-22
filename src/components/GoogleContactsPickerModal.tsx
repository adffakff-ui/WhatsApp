import { useState, useMemo } from 'react';
import {
  X,
  Search,
  Check,
  CheckCheck,
  UserCheck,
  Phone,
  Mail,
  Filter,
  Users,
  Sparkles
} from 'lucide-react';
import { Avatar } from './Avatar';
import { HighlightText } from './HighlightText';
import type { UserProfile } from '../types/chat';

export interface RawGoogleContact {
  id: string;
  displayName: string;
  email: string;
  phone: string;
  photo: string;
}

interface GoogleContactsPickerModalProps {
  isOpen: boolean;
  onClose: () => void;
  rawContacts: RawGoogleContact[];
  onConfirmImport: (selectedContacts: UserProfile[]) => void;
}

type ContactFilter = 'all' | 'with-phone' | 'with-email' | 'selected';

export function GoogleContactsPickerModal({
  isOpen,
  onClose,
  rawContacts,
  onConfirmImport
}: GoogleContactsPickerModalProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [activeFilter, setActiveFilter] = useState<ContactFilter>('all');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // Reset or initialize when rawContacts change
  const totalCount = rawContacts.length;
  const withPhoneCount = useMemo(
    () => rawContacts.filter((c) => Boolean(c.phone)).length,
    [rawContacts]
  );
  const withEmailCount = useMemo(
    () => rawContacts.filter((c) => Boolean(c.email)).length,
    [rawContacts]
  );
  const selectedCount = selectedIds.size;

  // Filter and search
  const filteredContacts = useMemo(() => {
    let list = rawContacts;

    // Apply category filter
    if (activeFilter === 'with-phone') {
      list = list.filter((c) => Boolean(c.phone));
    } else if (activeFilter === 'with-email') {
      list = list.filter((c) => Boolean(c.email));
    } else if (activeFilter === 'selected') {
      list = list.filter((c) => selectedIds.has(c.id));
    }

    // Apply search query
    const q = searchQuery.trim().toLowerCase();
    if (q) {
      list = list.filter(
        (c) =>
          c.displayName.toLowerCase().includes(q) ||
          c.phone.toLowerCase().includes(q) ||
          c.email.toLowerCase().includes(q)
      );
    }

    return list;
  }, [rawContacts, activeFilter, searchQuery, selectedIds]);

  if (!isOpen) return null;

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const handleToggleSelectAllFiltered = () => {
    const allFilteredSelected =
      filteredContacts.length > 0 &&
      filteredContacts.every((c) => selectedIds.has(c.id));

    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (allFilteredSelected) {
        filteredContacts.forEach((c) => next.delete(c.id));
      } else {
        filteredContacts.forEach((c) => next.add(c.id));
      }
      return next;
    });
  };

  const handleImport = () => {
    const selectedList = rawContacts.filter((c) => selectedIds.has(c.id));
    if (selectedList.length === 0) return;

    const userProfiles: UserProfile[] = selectedList.map((c, index) => {
      const uid = `gcontact_${index}_${Math.random().toString(36).slice(2, 7)}`;
      return {
        uid,
        displayName: c.displayName,
        about: c.phone ? `هاتف: ${c.phone}` : c.email ? `بريد: ${c.email}` : 'جهة اتصال Google',
        avatarUrl: c.photo,
        email: c.email || undefined,
        phone: c.phone || undefined,
        publicKeyJwk: '',
        safetyCode: '00000 00000 00000 00000',
        isOnline: true,
        lastSeenMs: Date.now()
      };
    });

    onConfirmImport(userProfiles);
    onClose();
  };

  const isAllFilteredSelected =
    filteredContacts.length > 0 &&
    filteredContacts.every((c) => selectedIds.has(c.id));

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="اختيار جهات اتصال Google"
      className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 select-none animate-fade-in"
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg bg-white dark:bg-[#202C33] rounded-2xl shadow-2xl border border-[#E9EDEF] dark:border-[#374248] flex flex-col max-h-[90vh] overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <header className="px-5 py-4 border-b border-[#F0F2F5] dark:border-[#2A3942] flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-xl bg-[var(--wa-accent-soft)] text-[var(--wa-accent-strong)] flex items-center justify-center shrink-0 shadow-xs">
              <Sparkles className="w-5 h-5" aria-hidden="true" />
            </div>
            <div className="min-w-0">
              <h2 className="font-display text-base sm:text-lg font-bold text-[#111B21] dark:text-[#E9EDEF] truncate">
                اختيار جهات اتصال Google للاستيراد
              </h2>
              <p className="text-xs text-[#54656F] dark:text-[#8696A0] truncate">
                حدد جهات الاتصال المرغوبة بدقة بدلاً من استيراد القائمة كاملة
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="إغلاق النافذة"
            className="w-8 h-8 rounded-full hover:bg-[#F0F2F5] dark:hover:bg-[#182229] flex items-center justify-center text-[#54656F] dark:text-[#AEBAC1] transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </header>

        {/* Search Bar */}
        <div className="p-3.5 border-b border-[#F0F2F5] dark:border-[#2A3942] space-y-2.5 shrink-0 bg-[#F9FAFA] dark:bg-[#182229]/50">
          <div className="relative flex items-center">
            <Search className="w-4 h-4 text-[#54656F] dark:text-[#8696A0] absolute right-3 pointer-events-none" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="بحث بالاسم، رقم الهاتف أو البريد الإلكتروني..."
              className="w-full pl-9 pr-9 py-2 rounded-xl bg-white dark:bg-[#202C33] border border-[#E9EDEF] dark:border-[#374248] text-sm text-[#111B21] dark:text-[#E9EDEF] placeholder-[#8696A0] focus:outline-hidden focus:border-[var(--wa-accent)] focus:ring-1 focus:ring-[var(--wa-accent)] transition-all"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="absolute left-2.5 w-6 h-6 rounded-full hover:bg-black/5 dark:hover:bg-white/10 flex items-center justify-center text-[#8696A0] cursor-pointer"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {/* Filter Chips */}
          <div className="flex items-center gap-1.5 overflow-x-auto pb-0.5 text-xs">
            <button
              type="button"
              onClick={() => setActiveFilter('all')}
              className={`px-3 py-1 rounded-full whitespace-nowrap transition-colors cursor-pointer font-medium ${
                activeFilter === 'all'
                  ? 'bg-[var(--wa-accent)] text-white'
                  : 'bg-white dark:bg-[#202C33] text-[#54656F] dark:text-[#8696A0] border border-[#E9EDEF] dark:border-[#374248] hover:bg-[#F0F2F5]'
              }`}
            >
              الكل ({totalCount})
            </button>
            <button
              type="button"
              onClick={() => setActiveFilter('with-phone')}
              className={`px-3 py-1 rounded-full whitespace-nowrap transition-colors cursor-pointer font-medium flex items-center gap-1 ${
                activeFilter === 'with-phone'
                  ? 'bg-[var(--wa-accent)] text-white'
                  : 'bg-white dark:bg-[#202C33] text-[#54656F] dark:text-[#8696A0] border border-[#E9EDEF] dark:border-[#374248] hover:bg-[#F0F2F5]'
              }`}
            >
              <Phone className="w-3 h-3" />
              <span>مع هاتف ({withPhoneCount})</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveFilter('with-email')}
              className={`px-3 py-1 rounded-full whitespace-nowrap transition-colors cursor-pointer font-medium flex items-center gap-1 ${
                activeFilter === 'with-email'
                  ? 'bg-[var(--wa-accent)] text-white'
                  : 'bg-white dark:bg-[#202C33] text-[#54656F] dark:text-[#8696A0] border border-[#E9EDEF] dark:border-[#374248] hover:bg-[#F0F2F5]'
              }`}
            >
              <Mail className="w-3 h-3" />
              <span>مع بريد ({withEmailCount})</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveFilter('selected')}
              className={`px-3 py-1 rounded-full whitespace-nowrap transition-colors cursor-pointer font-medium flex items-center gap-1 ${
                activeFilter === 'selected'
                  ? 'bg-[var(--wa-accent)] text-white'
                  : 'bg-white dark:bg-[#202C33] text-[#54656F] dark:text-[#8696A0] border border-[#E9EDEF] dark:border-[#374248] hover:bg-[#F0F2F5]'
              }`}
            >
              <UserCheck className="w-3 h-3" />
              <span>المحددة ({selectedCount})</span>
            </button>
          </div>
        </div>

        {/* Selection Bar */}
        <div className="px-4 py-2 border-b border-[#F0F2F5] dark:border-[#2A3942] flex items-center justify-between text-xs text-[#54656F] dark:text-[#8696A0] shrink-0 bg-white dark:bg-[#202C33]">
          <button
            type="button"
            onClick={handleToggleSelectAllFiltered}
            disabled={filteredContacts.length === 0}
            className="flex items-center gap-1.5 font-semibold text-[var(--wa-accent-strong)] hover:underline disabled:opacity-50 cursor-pointer"
          >
            <div
              className={`w-4 h-4 rounded-md border flex items-center justify-center transition-colors ${
                isAllFilteredSelected
                  ? 'bg-[var(--wa-accent)] border-[var(--wa-accent)] text-white'
                  : 'border-[#8696A0]'
              }`}
            >
              {isAllFilteredSelected && <Check className="w-3 h-3 stroke-[3]" />}
            </div>
            <span>
              {isAllFilteredSelected ? 'إلغاء تحديد النتائج المعروضة' : 'تحديد الكل المعروض'}
            </span>
          </button>
          <div className="font-medium">
            <span>تم تحديد </span>
            <span className="font-bold text-[var(--wa-accent-strong)]">{selectedCount}</span>
            <span> من {totalCount}</span>
          </div>
        </div>

        {/* Contact List */}
        <div className="flex-1 overflow-y-auto p-3 space-y-1.5 divide-y divide-[#F0F2F5]/60 dark:divide-[#2A3942]/60">
          {filteredContacts.length === 0 ? (
            <div className="py-12 text-center text-sm text-[#8696A0] space-y-2">
              <Users className="w-10 h-10 mx-auto opacity-40 text-[#8696A0]" />
              <p className="font-semibold">لم يتم العثور على جهات اتصال مطابقة</p>
              <p className="text-xs opacity-75">جرب تعديل كلمة البحث أو تغيير الفلتر أعلاه</p>
            </div>
          ) : (
            filteredContacts.map((contact) => {
              const isSelected = selectedIds.has(contact.id);
              return (
                <div
                  key={contact.id}
                  onClick={() => toggleSelect(contact.id)}
                  className={`w-full p-2.5 rounded-xl flex items-center gap-3 transition-colors cursor-pointer select-none ${
                    isSelected
                      ? 'bg-[var(--wa-accent-soft)]/50 dark:bg-[#182229] border border-[var(--wa-accent)]/40 shadow-xs'
                      : 'hover:bg-[#F5F6F6] dark:hover:bg-[#182229]/60 border border-transparent'
                  }`}
                >
                  {/* Checkbox */}
                  <div
                    className={`w-5 h-5 rounded-lg border-2 flex items-center justify-center shrink-0 transition-colors ${
                      isSelected
                        ? 'bg-[var(--wa-accent)] border-[var(--wa-accent)] text-white shadow-xs'
                        : 'border-[#8696A0]/60 bg-transparent'
                    }`}
                  >
                    {isSelected && <Check className="w-3.5 h-3.5 stroke-[3]" />}
                  </div>

                  {/* Avatar */}
                  <div className="relative shrink-0">
                    <Avatar
                      src={contact.photo}
                      name={contact.displayName}
                      size="md"
                    />
                  </div>

                  {/* Contact Info */}
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-bold text-[#111B21] dark:text-[#E9EDEF] truncate">
                      <HighlightText text={contact.displayName} query={searchQuery} />
                    </p>
                    <div className="flex flex-wrap items-center gap-2 mt-0.5 text-xs text-[#54656F] dark:text-[#8696A0]">
                      {contact.phone && (
                        <span className="flex items-center gap-1 font-mono-code dir-ltr truncate">
                          <Phone className="w-3 h-3 text-emerald-600 dark:text-emerald-400 shrink-0" />
                          <HighlightText text={contact.phone} query={searchQuery} />
                        </span>
                      )}
                      {contact.email && (
                        <span className="flex items-center gap-1 truncate text-[11px]">
                          <Mail className="w-3 h-3 text-blue-500 shrink-0" />
                          <HighlightText text={contact.email} query={searchQuery} />
                        </span>
                      )}
                      {!contact.phone && !contact.email && (
                        <span className="text-[11px] opacity-75">بدون رقم أو بريد</span>
                      )}
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Footer Actions */}
        <footer className="p-4 border-t border-[#F0F2F5] dark:border-[#2A3942] flex items-center justify-between gap-3 shrink-0 bg-[#F9FAFA] dark:bg-[#182229]/50">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2.5 rounded-xl border border-[#E9EDEF] dark:border-[#374248] text-sm font-semibold text-[#54656F] dark:text-[#AEBAC1] hover:bg-[#F0F2F5] dark:hover:bg-[#202C33] transition-colors cursor-pointer"
          >
            إلغاء
          </button>

          <button
            type="button"
            onClick={handleImport}
            disabled={selectedCount === 0}
            className="flex-1 sm:flex-initial px-6 py-2.5 rounded-xl bg-[var(--wa-accent)] text-white text-sm font-bold shadow-md hover:brightness-95 disabled:opacity-50 disabled:cursor-not-allowed transition-all flex items-center justify-center gap-2 cursor-pointer"
          >
            <UserCheck className="w-4 h-4" />
            <span>استيراد جهات الاتصال المحددة ({selectedCount})</span>
          </button>
        </footer>
      </div>
    </div>
  );
}
