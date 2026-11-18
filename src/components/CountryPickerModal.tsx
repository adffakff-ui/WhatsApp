import { useMemo, useState } from 'react';
import { Check, Search, X } from 'lucide-react';
import { filterAuthCountries, type AuthCountry } from '../lib/authCountries';

interface CountryPickerModalProps {
  isOpen: boolean;
  selectedIso: string;
  onSelect: (country: AuthCountry) => void;
  onClose: () => void;
}

export function CountryPickerModal({
  isOpen,
  selectedIso,
  onSelect,
  onClose
}: CountryPickerModalProps) {
  const [query, setQuery] = useState('');

  const filtered = useMemo(() => filterAuthCountries(query), [query]);

  if (!isOpen) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="اختيار رمز الدولة"
      className="fixed inset-0 z-50 bg-black/55 backdrop-blur-xs flex items-end sm:items-center justify-center sm:p-4"
    >
      <div className="w-full sm:max-w-md bg-white dark:bg-[#111B21] rounded-t-3xl sm:rounded-2xl shadow-2xl border border-[#E9EDEF] dark:border-[#2A3942] overflow-hidden flex flex-col max-h-[82dvh]">
        {/* Drag handle on mobile */}
        <div className="sm:hidden pt-2.5 flex justify-center">
          <div className="w-10 h-1.5 rounded-full bg-[#D1D7DB] dark:bg-[#374248]" />
        </div>

        <header className="px-4 py-3.5 bg-[var(--wa-accent-strong)] text-white flex items-center justify-between gap-2 shrink-0">
          <h2 className="font-display text-base font-bold">اختر الدولة ومفتاح الاتصال</h2>
          <button
            type="button"
            aria-label="إغلاق قائمة الدول"
            onClick={onClose}
            className="min-h-[44px] min-w-[44px] -ml-2 rounded-full hover:bg-white/15 flex items-center justify-center cursor-pointer"
          >
            <X className="w-5 h-5" aria-hidden="true" />
          </button>
        </header>

        <div className="p-3 border-b border-[#E9EDEF] dark:border-[#222D34] bg-[#F7F8FA] dark:bg-[#202C33]">
          <div className="relative">
            <Search
              className="w-4 h-4 text-[#667781] absolute right-3.5 top-1/2 -translate-y-1/2 pointer-events-none"
              aria-hidden="true"
            />
            <input
              type="search"
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="ابحث باسم الدولة أو الرمز (مثل 966 أو اليمن)..."
              aria-label="البحث عن دولة"
              className="w-full min-h-[44px] rounded-xl bg-white dark:bg-[#111B21] pr-10 pl-3 py-2 text-sm text-[#111B21] dark:text-[#E9EDEF] border border-[#E9EDEF] dark:border-[#2A3942] focus:outline-none focus:ring-2 focus:ring-[var(--wa-accent)]"
            />
          </div>
        </div>

        <ul className="flex-1 overflow-y-auto divide-y divide-[#F0F2F5] dark:divide-[#202C33]">
          {filtered.length === 0 ? (
            <li className="p-8 text-center text-sm text-[#667781] dark:text-[#8696A0]">
              لا توجد نتائج مطابقة للبحث &quot;{query}&quot;
            </li>
          ) : (
            filtered.map((country) => {
              const active = country.iso === selectedIso;
              return (
                <li key={country.iso}>
                  <button
                    type="button"
                    onClick={() => {
                      onSelect(country);
                      setQuery('');
                      onClose();
                    }}
                    className={`w-full min-h-[52px] px-4 py-2.5 flex items-center justify-between gap-3 text-right transition-colors cursor-pointer ${
                      active
                        ? 'bg-[var(--wa-accent-soft)]/50 dark:bg-[#202C33]'
                        : 'hover:bg-[#F5F6F6] dark:hover:bg-[#182229]'
                    }`}
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <span className="text-xl leading-none shrink-0" aria-hidden="true">
                        {country.flag}
                      </span>
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-[#111B21] dark:text-[#E9EDEF] truncate">
                          {country.nameAr}
                        </p>
                        <p className="text-[11px] text-[#667781] dark:text-[#8696A0] truncate">
                          {country.nameEn}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <span
                        dir="ltr"
                        className="font-mono-code text-xs font-bold text-[#3B4A54] dark:text-[#D1D7DB]"
                      >
                        {country.dialCode}
                      </span>
                      {active && (
                        <Check
                          className="w-4 h-4 text-[var(--wa-accent)]"
                          aria-hidden="true"
                        />
                      )}
                    </div>
                  </button>
                </li>
              );
            })
          )}
        </ul>
      </div>
    </div>
  );
}
