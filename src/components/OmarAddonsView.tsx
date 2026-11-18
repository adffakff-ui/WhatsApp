import { useState } from 'react';
import {
  Palette,
  Shield,
  Lock,
  MessageSquareText,
  Moon,
  Sun,
  Check,
  EyeOff,
  Trash2,
  Plus,
  Plane,
  Sparkles,
  KeyRound,
  Unlock
} from 'lucide-react';
import { BiometricLockPanel } from './BiometricLockPanel';
import {
  BUBBLE_STYLES,
  FONT_SIZE_OPTIONS,
  OMAR_THEMES,
  WALLPAPERS
} from '../lib/omarConfig';
import type { ChatRoom, OmarSettings, ThemeMode, UserProfile } from '../types/chat';

interface OmarAddonsViewProps {
  settings: OmarSettings;
  theme: ThemeMode;
  chats: ChatRoom[];
  currentUser: UserProfile;
  onUpdateSettings: (patch: Partial<OmarSettings>) => void;
  onToggleTheme: () => void;
  onToggleLockChat: (chatId: string) => void;
  onResetDefaults: () => void;
  onLockAppNow?: () => void;
  onShowToast?: (message: string) => void;
}

type AddonSection = 'themes' | 'privacy' | 'lock' | 'autoreply';

export function OmarAddonsView({
  settings,
  theme,
  chats,
  currentUser,
  onUpdateSettings,
  onToggleTheme,
  onToggleLockChat,
  onResetDefaults,
  onLockAppNow,
  onShowToast
}: OmarAddonsViewProps) {
  const [section, setSection] = useState<AddonSection>('themes');
  const [newTemplate, setNewTemplate] = useState('');
  const [pinDraft, setPinDraft] = useState(settings.chatLockPin);
  const [pinSaved, setPinSaved] = useState(false);
  const [pinError, setPinError] = useState<string | null>(null);

  const sectionTabs: { id: AddonSection; label: string; icon: typeof Palette }[] = [
    { id: 'themes', label: 'الثيمات والمظهر', icon: Palette },
    { id: 'privacy', label: 'الخصوصية المتقدمة', icon: Shield },
    { id: 'lock', label: 'قفل الدردشات', icon: Lock },
    { id: 'autoreply', label: 'الرد التلقائي والقوالب', icon: MessageSquareText }
  ];

  const handleAddTemplate = (e: React.FormEvent) => {
    e.preventDefault();
    const cleaned = newTemplate.trim();
    if (!cleaned || settings.quickTemplates.includes(cleaned)) return;
    onUpdateSettings({
      quickTemplates: [...settings.quickTemplates, cleaned]
    });
    setNewTemplate('');
  };

  const handleRemoveTemplate = (idx: number) => {
    onUpdateSettings({
      quickTemplates: settings.quickTemplates.filter((_, i) => i !== idx)
    });
  };

  const handleSavePin = (e: React.FormEvent) => {
    e.preventDefault();
    const cleaned = pinDraft.trim();
    if (!/^\d{4}$/.test(cleaned)) {
      setPinError('يرجى إدخال رمز مكون من ٤ أرقام فقط.');
      return;
    }
    setPinError(null);
    onUpdateSettings({ chatLockPin: cleaned });
    setPinSaved(true);
    window.setTimeout(() => setPinSaved(false), 2000);
  };

  const activeThemeMeta = OMAR_THEMES.find((t) => t.id === settings.omarTheme) || OMAR_THEMES[0];

  return (
    <div className="flex-1 min-w-0 w-full max-w-full overflow-hidden flex flex-col md:flex-row h-full bg-white dark:bg-[#111B21]">
      {/* Left Main Control Column */}
      <div className="w-full max-w-full min-w-0 md:w-[500px] md:shrink-0 border-l border-[#E9EDEF] dark:border-[#222D34] flex flex-col h-full overflow-hidden">
        <header className="h-16 px-3 sm:px-4 flex items-center justify-between gap-2 border-b border-[#F0F2F5] dark:border-[#222D34] shrink-0 min-w-0">
          <div className="flex items-center gap-2 sm:gap-2.5 min-w-0">
            <div className="w-9 h-9 rounded-xl bg-[var(--wa-accent)] text-white flex items-center justify-center shrink-0">
              <Sparkles className="w-5 h-5" aria-hidden="true" />
            </div>
            <div className="min-w-0">
              <h1 className="font-display text-base sm:text-lg font-bold text-[#111B21] dark:text-[#E9EDEF] truncate">
                إضافات وثيمات أكرم
              </h1>
              <p className="text-[11px] text-[#54656F] dark:text-[#8696A0] truncate">
                تخصيص كامل للخصوصية، المظهر، والردود السريعة
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onResetDefaults}
            className="px-2.5 sm:px-3 py-1.5 rounded-lg bg-[#F0F2F5] dark:bg-[#202C33] text-[11px] sm:text-xs font-medium text-[#54656F] dark:text-[#AEBAC1] hover:text-[#111B21] dark:hover:text-white transition-colors shrink-0 whitespace-nowrap cursor-pointer"
          >
            استعادة الافتراضي
          </button>
        </header>

        {/* Horizontal Sub-Navigation Tabs */}
        <div className="w-full max-w-full min-w-0 px-3 py-2.5 border-b border-[#F0F2F5] dark:border-[#222D34] flex items-center gap-1.5 overflow-x-auto no-scrollbar shrink-0 bg-[#F8FAFB] dark:bg-[#111B21]">
          {sectionTabs.map((tab) => {
            const Icon = tab.icon;
            const active = section === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setSection(tab.id)}
                className={`px-3 py-2 rounded-xl text-xs font-semibold flex items-center gap-1.5 whitespace-nowrap shrink-0 transition-colors cursor-pointer ${
                  active
                    ? 'bg-[var(--wa-accent)] text-white shadow-xs'
                    : 'bg-white dark:bg-[#202C33] text-[#54656F] dark:text-[#AEBAC1] hover:bg-[#F0F2F5] dark:hover:bg-[#2A3942]'
                }`}
              >
                <Icon className="w-3.5 h-3.5" aria-hidden="true" />
                <span>{tab.label}</span>
              </button>
            );
          })}
        </div>

        {/* Scrollable Content Body */}
        <div className="flex-1 min-w-0 overflow-y-auto overflow-x-hidden p-3.5 sm:p-4 md:p-5 space-y-6 pb-24 md:pb-6">
          {section === 'themes' && (
            <>
              {/* 5 Signature Omar Themes */}
              <div className="space-y-2.5">
                <h2 className="text-xs font-bold text-[#54656F] dark:text-[#8696A0]">
                  ثيمات الألوان الحصرية
                </h2>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  {OMAR_THEMES.map((item) => {
                    const selected = settings.omarTheme === item.id;
                    return (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => onUpdateSettings({ omarTheme: item.id })}
                        className={`p-3 rounded-xl border text-right flex items-center gap-3 transition-all cursor-pointer ${
                          selected
                            ? 'border-[var(--wa-accent)] bg-[var(--wa-accent-soft)]/50 dark:bg-[#202C33]'
                            : 'border-[#E9EDEF] dark:border-[#222D34] bg-[#F8FAFB] dark:bg-[#182229] hover:border-[#D1D7DB]'
                        }`}
                      >
                        <span
                          className="w-8 h-8 rounded-full shrink-0 flex items-center justify-center text-white shadow-xs"
                          style={{ backgroundColor: item.primaryHex }}
                        >
                          {selected && <Check className="w-4 h-4" aria-hidden="true" />}
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="text-xs font-bold text-[#111B21] dark:text-[#E9EDEF] truncate">
                            {item.name}
                          </p>
                          <p className="text-[11px] text-[#54656F] dark:text-[#8696A0] truncate">
                            {item.subtitle}
                          </p>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Light / Dark Mode Switch */}
              <div className="space-y-2.5">
                <h2 className="text-xs font-bold text-[#54656F] dark:text-[#8696A0]">
                  وضع الإضاءة والعرض
                </h2>
                <button
                  type="button"
                  onClick={onToggleTheme}
                  className="w-full p-3.5 rounded-xl bg-[#F0F2F5] dark:bg-[#202C33] flex items-center justify-between text-sm text-[#111B21] dark:text-[#E9EDEF] cursor-pointer"
                >
                  <span className="flex items-center gap-3 font-medium">
                    {theme === 'dark' ? (
                      <Sun className="w-4 h-4 text-amber-400" aria-hidden="true" />
                    ) : (
                      <Moon className="w-4 h-4 text-[#54656F]" aria-hidden="true" />
                    )}
                    <span>المظهر العام للتطبيق</span>
                  </span>
                  <span className="text-xs font-bold text-[var(--wa-accent-strong)]">
                    {theme === 'dark' ? 'الوضع الليلي' : 'الوضع النهاري'}
                  </span>
                </button>
              </div>

              {/* Chat Wallpaper Picker */}
              <div className="space-y-2.5">
                <h2 className="text-xs font-bold text-[#54656F] dark:text-[#8696A0]">
                  خلفية شاشة المحادثات
                </h2>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  {WALLPAPERS.map((wp) => {
                    const active = settings.wallpaper === wp.id;
                    return (
                      <button
                        key={wp.id}
                        type="button"
                        onClick={() => onUpdateSettings({ wallpaper: wp.id })}
                        className={`p-2.5 rounded-xl border text-right flex items-center gap-2.5 transition-all cursor-pointer ${
                          active
                            ? 'border-[var(--wa-accent)] bg-[var(--wa-accent-soft)]/40 dark:bg-[#202C33]'
                            : 'border-[#E9EDEF] dark:border-[#222D34] bg-[#F8FAFB] dark:bg-[#182229]'
                        }`}
                      >
                        <span
                          className="w-6 h-6 rounded-lg border border-black/10 shrink-0"
                          style={{ backgroundColor: wp.swatch }}
                        />
                        <span className="text-xs font-medium text-[#111B21] dark:text-[#E9EDEF] truncate">
                          {wp.name}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Bubble Style & Font Size */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <h2 className="text-xs font-bold text-[#54656F] dark:text-[#8696A0]">
                    شكل فقاعات الرسائل
                  </h2>
                  <div className="flex flex-col gap-1.5">
                    {BUBBLE_STYLES.map((b) => (
                      <button
                        key={b.id}
                        type="button"
                        onClick={() => onUpdateSettings({ bubbleStyle: b.id })}
                        className={`px-3 py-2 rounded-xl border text-right flex items-center justify-between text-xs cursor-pointer ${
                          settings.bubbleStyle === b.id
                            ? 'border-[var(--wa-accent)] bg-[var(--wa-accent-soft)]/40 dark:bg-[#202C33] font-bold text-[var(--wa-accent-strong)]'
                            : 'border-[#E9EDEF] dark:border-[#222D34] text-[#111B21] dark:text-[#E9EDEF]'
                        }`}
                      >
                        <span>{b.name}</span>
                        <span className="text-[11px] font-normal text-[#54656F] dark:text-[#8696A0]">
                          {b.desc}
                        </span>
                      </button>
                    ))}
                  </div>
                </div>

                <div className="space-y-2">
                  <h2 className="text-xs font-bold text-[#54656F] dark:text-[#8696A0]">
                    حجم خط الرسائل
                  </h2>
                  <div className="flex flex-col gap-1.5">
                    {FONT_SIZE_OPTIONS.map((f) => (
                      <button
                        key={f.id}
                        type="button"
                        onClick={() => onUpdateSettings({ fontSize: f.id })}
                        className={`px-3 py-2 rounded-xl border text-right flex items-center justify-between text-xs cursor-pointer ${
                          settings.fontSize === f.id
                            ? 'border-[var(--wa-accent)] bg-[var(--wa-accent-soft)]/40 dark:bg-[#202C33] font-bold text-[var(--wa-accent-strong)]'
                            : 'border-[#E9EDEF] dark:border-[#222D34] text-[#111B21] dark:text-[#E9EDEF]'
                        }`}
                      >
                        <span>{f.name}</span>
                        <span className={f.className}>أهلاً بك</span>
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* Extra Home Screen UI Toggles */}
              <div className="space-y-2">
                <h2 className="text-xs font-bold text-[#54656F] dark:text-[#8696A0]">
                  خيارات الشاشة الرئيسية
                </h2>
                <label className="w-full p-3.5 rounded-xl bg-[#F0F2F5] dark:bg-[#202C33] flex items-center justify-between gap-3 cursor-pointer min-w-0">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-[#111B21] dark:text-[#E9EDEF]">
                      شريط الحالات السريع أعلى الدردشات
                    </p>
                    <p className="text-[11px] text-[#54656F] dark:text-[#8696A0]">
                      عرض الحالات النشطة على شكل دوائر متصلة أعلى قائمة المحادثات
                    </p>
                  </div>
                  <input
                    type="checkbox"
                    checked={settings.showStoriesTray}
                    onChange={(e) => onUpdateSettings({ showStoriesTray: e.target.checked })}
                    className="w-4 h-4 accent-[var(--wa-accent)] shrink-0"
                  />
                </label>

                <label className="w-full p-3.5 rounded-xl bg-[#F0F2F5] dark:bg-[#202C33] flex items-center justify-between gap-3 cursor-pointer min-w-0">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-[#111B21] dark:text-[#E9EDEF] flex items-center gap-1.5">
                      <Plane className="w-4 h-4 text-[var(--wa-accent)] shrink-0" aria-hidden="true" />
                      <span>وضع عدم الإزعاج (وضع الطيران للتطبيق)</span>
                    </p>
                    <p className="text-[11px] text-[#54656F] dark:text-[#8696A0]">
                      كتم الإشعارات الفورية وإخفاء النشاط أثناء التركيز
                    </p>
                  </div>
                  <input
                    type="checkbox"
                    checked={settings.dndMode}
                    onChange={(e) => onUpdateSettings({ dndMode: e.target.checked })}
                    className="w-4 h-4 accent-[var(--wa-accent)] shrink-0"
                  />
                </label>
              </div>
            </>
          )}

          {section === 'privacy' && (
            <div className="space-y-3">
              <div className="p-3.5 rounded-xl bg-[var(--wa-accent-soft)]/50 dark:bg-[#202C33] border border-[var(--wa-accent)]/25 flex items-start gap-2.5 text-xs">
                <EyeOff className="w-4 h-4 text-[var(--wa-accent-strong)] shrink-0 mt-0.5" aria-hidden="true" />
                <p className="text-[#111B21] dark:text-[#E9EDEF] leading-relaxed">
                  تمنحك إعدادات خصوصية أكرم تحكماً كاملاً في الظهور، مشاهدة الحالات، ومنع حذف الرسائل من محادثاتك.
                </p>
              </div>

              {[
                {
                  key: 'freezeLastSeen' as const,
                  title: 'تجميد آخر ظهور',
                  desc: 'تثبيت وقت آخر ظهور لك ومنع تحديثه للآخرين أثناء تصفح التطبيق'
                },
                {
                  key: 'antiDeleteMessages' as const,
                  title: 'منع حذف الرسائل (Anti-Delete)',
                  desc: 'الاحتفاظ بمحتوى الرسائل التي يحذفها المرسل مع إظهار علامة توضيحية'
                },
                {
                  key: 'antiDeleteStatuses' as const,
                  title: 'منع حذف الحالات',
                  desc: 'إبقاء الحالات المنشورة متاحة للمشاهدة خلال ٢٤ ساعة حتى لو قام صاحبها بحذفها'
                },
                {
                  key: 'hideReadTicks' as const,
                  title: 'إخفاء صحين القراءة الزرقاء',
                  desc: 'تظهر علامة القراءة الزرقاء للطرف الآخر فقط عند قيامك بالرد'
                },
                {
                  key: 'hideViewStatus' as const,
                  title: 'إخفاء مشاهدة الحالات',
                  desc: 'تصفح حالات جهات اتصالك بسرية تامة دون ظهور اسمك في قائمة المشاهدين'
                },
                {
                  key: 'hideTypingIndicator' as const,
                  title: 'إخفاء جاري الكتابة والتسجيل',
                  desc: 'منع إرسال حالة "يكتب الآن..." أو "يسجل صوتاً..." أثناء كتابتك'
                }
              ].map((item) => (
                <label
                  key={item.key}
                  className="w-full p-3.5 rounded-xl bg-[#F0F2F5] dark:bg-[#202C33] flex items-center justify-between gap-3 cursor-pointer"
                >
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-[#111B21] dark:text-[#E9EDEF]">
                      {item.title}
                    </p>
                    <p className="text-[11px] text-[#54656F] dark:text-[#8696A0] leading-relaxed mt-0.5">
                      {item.desc}
                    </p>
                  </div>
                  <input
                    type="checkbox"
                    checked={Boolean(settings[item.key])}
                    onChange={(e) => onUpdateSettings({ [item.key]: e.target.checked })}
                    className="w-4 h-4 accent-[var(--wa-accent)] shrink-0"
                  />
                </label>
              ))}
            </div>
          )}

          {section === 'lock' && (
            <div className="space-y-5">
              {/* Biometric / Face ID / WebAuthn App & Chat Lock */}
              <BiometricLockPanel
                settings={settings}
                currentUser={currentUser}
                onUpdateSettings={onUpdateSettings}
                onLockAppNow={onLockAppNow}
                onShowToast={onShowToast}
              />

              {/* PIN Configuration */}
              <form
                onSubmit={handleSavePin}
                className="p-4 rounded-xl bg-[#F0F2F5] dark:bg-[#202C33] space-y-3"
              >
                <div className="flex items-center gap-2 text-sm font-bold text-[#111B21] dark:text-[#E9EDEF]">
                  <KeyRound className="w-4 h-4 text-[var(--wa-accent)]" aria-hidden="true" />
                  <span>رمز قفل المحادثات (٤ أرقام)</span>
                </div>
                <p className="text-xs text-[#54656F] dark:text-[#8696A0]">
                  يُستخدم هذا الرمز لحماية المحادثات المقفلة وإخفائها من القائمة الرئيسية.
                </p>
                <div className="flex items-center gap-2 min-w-0">
                  <input
                    type="password"
                    inputMode="numeric"
                    maxLength={4}
                    value={pinDraft}
                    onChange={(e) => setPinDraft(e.target.value.replace(/\D/g, '').slice(0, 4))}
                    aria-label="رمز القفل المكون من ٤ أرقام"
                    className="flex-1 min-w-0 w-full rounded-lg bg-white dark:bg-[#111B21] border border-[#E9EDEF] dark:border-[#374248] px-3 py-2 text-sm font-mono-code text-center tracking-[0.4em] text-[#111B21] dark:text-[#E9EDEF] focus:outline-none focus:ring-2 focus:ring-[var(--wa-accent)]"
                  />
                  <button
                    type="submit"
                    className="px-3.5 sm:px-4 py-2 rounded-lg bg-[var(--wa-accent)] text-white text-xs font-semibold hover:brightness-95 cursor-pointer shrink-0 whitespace-nowrap"
                  >
                    {pinSaved ? 'تم الحفظ ✓' : 'حفظ الرمز'}
                  </button>
                </div>
                {pinError && (
                  <p role="alert" className="text-xs text-red-600 dark:text-red-400">
                    {pinError}
                  </p>
                )}
              </form>

              {/* Chats Lock List */}
              <div className="space-y-2">
                <h2 className="text-xs font-bold text-[#54656F] dark:text-[#8696A0]">
                  إدارة المحادثات المقفلة ({settings.lockedChatIds.length})
                </h2>
                <ul className="space-y-1.5">
                  {chats.map((chat) => {
                    const isLocked = settings.lockedChatIds.includes(chat.id);
                    return (
                      <li
                        key={chat.id}
                        className="p-3 rounded-xl bg-[#F8FAFB] dark:bg-[#182229] border border-[#E9EDEF] dark:border-[#222D34] flex items-center justify-between gap-2.5 min-w-0"
                      >
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-semibold text-[#111B21] dark:text-[#E9EDEF] truncate">
                            {chat.title}
                          </p>
                          <p className="text-[11px] text-[#54656F] dark:text-[#8696A0] truncate">
                            {isLocked ? 'مقفلة ومحمية برمز سري' : 'مفتوحة في القائمة'}
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={() => onToggleLockChat(chat.id)}
                          className={`px-2.5 sm:px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 cursor-pointer transition-colors shrink-0 whitespace-nowrap ${
                            isLocked
                              ? 'bg-amber-500/15 text-amber-700 dark:text-amber-300'
                              : 'bg-[#F0F2F5] dark:bg-[#202C33] text-[#111B21] dark:text-[#E9EDEF]'
                          }`}
                        >
                          {isLocked ? (
                            <>
                              <Unlock className="w-3.5 h-3.5" aria-hidden="true" />
                              <span>إلغاء القفل</span>
                            </>
                          ) : (
                            <>
                              <Lock className="w-3.5 h-3.5" aria-hidden="true" />
                              <span>قفل الدردشة</span>
                            </>
                          )}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </div>
            </div>
          )}

          {section === 'autoreply' && (
            <div className="space-y-5">
              {/* Auto-Reply Config */}
              <div className="p-4 rounded-xl bg-[#F0F2F5] dark:bg-[#202C33] space-y-3">
                <label className="flex items-center justify-between gap-3 cursor-pointer">
                  <div>
                    <p className="text-sm font-bold text-[#111B21] dark:text-[#E9EDEF]">
                      تفعيل الرد التلقائي الذكي
                    </p>
                    <p className="text-[11px] text-[#54656F] dark:text-[#8696A0]">
                      إرسال رد تلقائي فوري عند استلام رسائل جديدة في المحادثات النشطة
                    </p>
                  </div>
                  <input
                    type="checkbox"
                    checked={settings.autoReplyEnabled}
                    onChange={(e) => onUpdateSettings({ autoReplyEnabled: e.target.checked })}
                    className="w-4 h-4 accent-[var(--wa-accent)] shrink-0"
                  />
                </label>

                <div>
                  <label htmlFor="auto-reply-msg" className="block text-xs font-semibold text-[#54656F] dark:text-[#8696A0] mb-1">
                    نص رسالة الرد التلقائي
                  </label>
                  <textarea
                    id="auto-reply-msg"
                    rows={2}
                    maxLength={240}
                    value={settings.autoReplyMessage}
                    onChange={(e) => onUpdateSettings({ autoReplyMessage: e.target.value })}
                    className="w-full rounded-lg bg-white dark:bg-[#111B21] border border-[#E9EDEF] dark:border-[#374248] px-3 py-2 text-xs text-[#111B21] dark:text-[#E9EDEF] resize-none focus:outline-none focus:ring-2 focus:ring-[var(--wa-accent)]"
                  />
                </div>
              </div>

              {/* Quick Reply Templates */}
              <div className="space-y-3">
                <h2 className="text-xs font-bold text-[#54656F] dark:text-[#8696A0]">
                  قوالب الرسائل السريعة (تظهر داخل شريط الكتابة)
                </h2>
                <form onSubmit={handleAddTemplate} className="flex items-center gap-2 min-w-0">
                  <input
                    type="text"
                    value={newTemplate}
                    onChange={(e) => setNewTemplate(e.target.value)}
                    placeholder="أضف عبارة سريعة جديدة..."
                    maxLength={140}
                    className="flex-1 min-w-0 w-full rounded-xl bg-[#F0F2F5] dark:bg-[#202C33] px-3 py-2 text-xs text-[#111B21] dark:text-[#E9EDEF] focus:outline-none focus:ring-2 focus:ring-[var(--wa-accent)]"
                  />
                  <button
                    type="submit"
                    className="px-3 sm:px-3.5 py-2 rounded-xl bg-[var(--wa-accent)] text-white text-xs font-semibold flex items-center gap-1 cursor-pointer shrink-0 whitespace-nowrap"
                  >
                    <Plus className="w-3.5 h-3.5" aria-hidden="true" />
                    <span>إضافة</span>
                  </button>
                </form>

                <ul className="space-y-2">
                  {settings.quickTemplates.map((tpl, idx) => (
                    <li
                      key={`${idx}_${tpl}`}
                      className="p-3 rounded-xl bg-[#F8FAFB] dark:bg-[#182229] border border-[#E9EDEF] dark:border-[#222D34] flex items-center justify-between gap-2 text-xs min-w-0"
                    >
                      <span className="text-[#111B21] dark:text-[#E9EDEF] leading-relaxed min-w-0 flex-1 break-words">{tpl}</span>
                      <button
                        type="button"
                        aria-label="حذف القالب"
                        onClick={() => handleRemoveTemplate(idx)}
                        className="p-1.5 rounded-lg text-red-500 hover:bg-red-50 dark:hover:bg-red-950/30 shrink-0 cursor-pointer"
                      >
                        <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Right Live Preview Pane (Desktop) */}
      <div className="hidden md:flex flex-1 items-center justify-center bg-[#F0F2F5] dark:bg-[#0B141A] p-8">
        <div className="w-full max-w-md space-y-4">
          <div className="bg-white dark:bg-[#111B21] rounded-2xl border border-[#E9EDEF] dark:border-[#222D34] overflow-hidden shadow-sm">
            <div className="px-5 py-3.5 bg-[var(--wa-accent-strong)] text-white flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Palette className="w-4 h-4" aria-hidden="true" />
                <span className="font-display text-sm font-bold">معاينة حية: {activeThemeMeta.name}</span>
              </div>
              <span className="text-[11px] opacity-90">
                {theme === 'dark' ? 'الوضع الليلي' : 'الوضع النهاري'}
              </span>
            </div>

            <div className={`p-5 space-y-3 wa-wallpaper-${settings.wallpaper}`}>
              <div className="flex justify-end">
                <div
                  className={`max-w-[80%] px-3.5 py-2 bg-white dark:bg-[#202C33] text-[#111B21] dark:text-[#E9EDEF] shadow-xs ${
                    settings.bubbleStyle === 'rounded'
                      ? 'rounded-2xl'
                      : settings.bubbleStyle === 'modern'
                        ? 'rounded-xl rounded-tl-xs'
                        : 'rounded-lg'
                  }`}
                >
                  <p className={FONT_SIZE_OPTIONS.find((f) => f.id === settings.fontSize)?.className}>
                    مرحباً! ما أخبار تحديث واجهة تواصل الجديدة؟
                  </p>
                  <span className="block text-left text-[10px] text-[#8696A0] font-mono-code mt-1">
                    ٠٩:٤١ م
                  </span>
                </div>
              </div>

              <div className="flex justify-start">
                <div
                  className={`max-w-[80%] px-3.5 py-2 bg-[var(--wa-outgoing-bg)] text-[#111B21] dark:text-[#E9EDEF] shadow-xs ${
                    settings.bubbleStyle === 'rounded'
                      ? 'rounded-2xl'
                      : settings.bubbleStyle === 'modern'
                        ? 'rounded-xl rounded-tr-xs'
                        : 'rounded-lg'
                  }`}
                >
                  <p className={FONT_SIZE_OPTIONS.find((f) => f.id === settings.fontSize)?.className}>
                    التصميم مرن وأنيق مع خصوصية أكرم والثيمات المباشرة ✨
                  </p>
                  <span className="block text-left text-[10px] text-[#54656F] dark:text-[#AEBAC1] font-mono-code mt-1">
                    ٠٩:٤٢ م ✓✓
                  </span>
                </div>
              </div>
            </div>
          </div>

          <div className="bg-white dark:bg-[#111B21] rounded-2xl p-4 border border-[#E9EDEF] dark:border-[#222D34] grid grid-cols-2 gap-3 text-xs">
            <div className="p-2.5 rounded-xl bg-[#F0F2F5] dark:bg-[#202C33]">
              <span className="text-[#54656F] dark:text-[#8696A0] block text-[11px]">منع حذف الرسائل</span>
              <span className="font-bold text-[var(--wa-accent-strong)]">
                {settings.antiDeleteMessages ? 'مفعّل ✓' : 'معطّل'}
              </span>
            </div>
            <div className="p-2.5 rounded-xl bg-[#F0F2F5] dark:bg-[#202C33]">
              <span className="text-[#54656F] dark:text-[#8696A0] block text-[11px]">تجميد آخر ظهور</span>
              <span className="font-bold text-[var(--wa-accent-strong)]">
                {settings.freezeLastSeen ? 'مفعّل ✓' : 'معطّل'}
              </span>
            </div>
            <div className="p-2.5 rounded-xl bg-[#F0F2F5] dark:bg-[#202C33]">
              <span className="text-[#54656F] dark:text-[#8696A0] block text-[11px]">إخفاء مشاهدة الحالات</span>
              <span className="font-bold text-[var(--wa-accent-strong)]">
                {settings.hideViewStatus ? 'مفعّل ✓' : 'معطّل'}
              </span>
            </div>
            <div className="p-2.5 rounded-xl bg-[#F0F2F5] dark:bg-[#202C33]">
              <span className="text-[#54656F] dark:text-[#8696A0] block text-[11px]">المحادثات المقفلة</span>
              <span className="font-bold text-[var(--wa-accent-strong)] font-mono-code">
                {settings.lockedChatIds.length} محادثة
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
