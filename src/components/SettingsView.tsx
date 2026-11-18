import { useEffect, useRef, useState } from 'react';
import {
  Lock,
  Moon,
  Sun,
  LogOut,
  Check,
  Shield,
  Copy,
  Camera,
  Trash2,
  Eye,
  UserCheck,
  Download,
  Palette,
  ChevronLeft
} from 'lucide-react';
import { Avatar } from './Avatar';
import { BiometricLockPanel } from './BiometricLockPanel';
import { PWAInstallButton } from './PWAInstallButton';
import { PRESET_AVATARS } from '../data/assets';
import { getVisibilityLabel, validateAvatarUrl, validateProfileInput } from '../lib/chatLogic';
import type {
  OmarSettings,
  PrivacySettings,
  ThemeMode,
  UserProfile,
  VisibilityScope
} from '../types/chat';

interface SettingsViewProps {
  currentUser: UserProfile;
  privacySettings: PrivacySettings;
  theme: ThemeMode;
  isCloudSynced: boolean;
  omarSettings?: OmarSettings;
  onUpdateOmarSettings?: (patch: Partial<OmarSettings>) => void;
  onLockAppNow?: () => void;
  onShowToast?: (message: string) => void;
  onToggleTheme: () => void;
  onSaveProfile: (displayName: string, about: string, avatarUrl: string) => Promise<void>;
  onUpdatePrivacy: (nextPrivacy: PrivacySettings) => Promise<void>;
  onSignOut: () => void;
  isSigningOut?: boolean;
  onGoogleSignIn: () => Promise<void | boolean>;
  onOpenOmarAddons?: () => void;
}

async function compressImageToAvatarDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('تعذر قراءة الصورة المختارة.'));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error('الملف المختار ليس صورة صالحة.'));
      img.onload = () => {
        const size = 160;
        const canvas = document.createElement('canvas');
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          reject(new Error('تعذر معالجة الصورة.'));
          return;
        }
        const minSide = Math.min(img.width, img.height);
        const sx = (img.width - minSide) / 2;
        const sy = (img.height - minSide) / 2;
        ctx.drawImage(img, sx, sy, minSide, minSide, 0, 0, size, size);
        const compressed = canvas.toDataURL('image/jpeg', 0.78);
        resolve(compressed);
      };
      img.src = reader.result as string;
    };
    reader.readAsDataURL(file);
  });
}

export function SettingsView({
  currentUser,
  privacySettings,
  theme,
  isCloudSynced,
  omarSettings,
  onUpdateOmarSettings,
  onLockAppNow,
  onShowToast,
  onToggleTheme,
  onSaveProfile,
  onUpdatePrivacy,
  onSignOut,
  isSigningOut = false,
  onGoogleSignIn,
  onOpenOmarAddons
}: SettingsViewProps) {
  const [displayName, setDisplayName] = useState(currentUser.displayName);
  const [about, setAbout] = useState(currentUser.about);
  const [avatarUrl, setAvatarUrl] = useState(currentUser.avatarUrl);
  const [privacy, setPrivacy] = useState<PrivacySettings>(privacySettings);
  const [savedNotice, setSavedNotice] = useState(false);
  const [privacySavedNotice, setPrivacySavedNotice] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [copiedUid, setCopiedUid] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setDisplayName(currentUser.displayName);
    setAbout(currentUser.about);
    setAvatarUrl(currentUser.avatarUrl);
  }, [currentUser.displayName, currentUser.about, currentUser.avatarUrl]);

  useEffect(() => {
    setPrivacy(privacySettings);
  }, [privacySettings]);

  const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    try {
      setErrorMsg(null);
      const dataUrl = await compressImageToAvatarDataUrl(file);
      if (!validateAvatarUrl(dataUrl)) {
        setErrorMsg('حجم الصورة كبير جداً بعد الضغط، يرجى اختيار صورة أخرى.');
        return;
      }
      setAvatarUrl(dataUrl);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'تعذر رفع الصورة.');
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    const validation = validateProfileInput(displayName, about);
    if (!validation.valid) {
      setErrorMsg(validation.error || 'بيانات غير صالحة');
      return;
    }
    if (!validateAvatarUrl(avatarUrl)) {
      setErrorMsg('حجم الصورة الشخصية يتجاوز الحد المسموح.');
      return;
    }
    setErrorMsg(null);
    setIsSaving(true);
    try {
      await onSaveProfile(displayName.trim(), about.trim(), avatarUrl);
      setSavedNotice(true);
      window.setTimeout(() => setSavedNotice(false), 2500);
    } finally {
      setIsSaving(false);
    }
  };

  const handlePrivacyChange = async (patch: Partial<PrivacySettings>) => {
    const next = { ...privacy, ...patch };
    setPrivacy(next);
    await onUpdatePrivacy(next);
    setPrivacySavedNotice(true);
    window.setTimeout(() => setPrivacySavedNotice(false), 2000);
  };

  const visibilityOptions: { value: VisibilityScope; label: string }[] = [
    { value: 'everyone', label: 'الجميع' },
    { value: 'contacts', label: 'جهات الاتصال فقط' },
    { value: 'nobody', label: 'لا أحد' }
  ];

  return (
    <div className="flex-1 min-w-0 w-full max-w-full overflow-hidden flex flex-col md:flex-row h-full bg-white dark:bg-[#111B21]">
      <div className="w-full max-w-full min-w-0 md:w-[460px] md:shrink-0 border-l border-[#E9EDEF] dark:border-[#222D34] flex flex-col h-full overflow-hidden">
        <header className="h-16 px-3 sm:px-4 flex items-center justify-between gap-2 border-b border-[#F0F2F5] dark:border-[#222D34] shrink-0 min-w-0">
          <div className="min-w-0">
            <h1 className="font-display text-base sm:text-xl font-bold text-[#111B21] dark:text-[#E9EDEF] truncate">
              الملف الشخصي والخصوصية
            </h1>
            <span className="text-[11px] text-[var(--wa-accent)] font-medium block truncate">
              {isCloudSynced ? 'مزامنة Firebase نشطة' : 'حفظ محلي فوري'}
            </span>
          </div>
          <button
            type="button"
            onClick={onSignOut}
            disabled={isSigningOut}
            aria-label="تسجيل الخروج السريع"
            className="shrink-0 px-2.5 py-1.5 rounded-full border border-red-200 dark:border-red-900/60 text-red-600 dark:text-red-400 text-xs font-semibold flex items-center gap-1.5 hover:bg-red-50 dark:hover:bg-red-950/30 disabled:opacity-50 transition-colors cursor-pointer"
          >
            <LogOut className="w-3.5 h-3.5" aria-hidden="true" />
            <span>خروج</span>
          </button>
        </header>

        <div className="flex-1 min-w-0 overflow-y-auto overflow-x-hidden p-3.5 sm:p-5 space-y-5 sm:space-y-6 pb-24 md:pb-6">
          {/* Omar Add-ons Shortcut Card */}
          {onOpenOmarAddons && (
            <button
              type="button"
              onClick={onOpenOmarAddons}
              className="w-full p-4 rounded-2xl bg-[var(--wa-accent-soft)]/70 dark:bg-[#202C33] border border-[var(--wa-accent)]/30 flex items-center justify-between gap-3 text-right hover:brightness-95 transition-all cursor-pointer"
            >
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-10 h-10 rounded-xl bg-[var(--wa-accent)] text-white flex items-center justify-center shrink-0">
                  <Palette className="w-5 h-5" aria-hidden="true" />
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-bold text-[#111B21] dark:text-[#E9EDEF] truncate">
                    ثيمات وإضافات أكرم المتقدمة
                  </p>
                  <p className="text-[11px] text-[#54656F] dark:text-[#8696A0] truncate">
                    الثيم العنابي، منع حذف الرسائل، قفل الدردشات، والرد التلقائي
                  </p>
                </div>
              </div>
              <ChevronLeft className="w-5 h-5 text-[var(--wa-accent-strong)] shrink-0" aria-hidden="true" />
            </button>
          )}

          {/* Profile Editor & Avatar Upload */}
          <form onSubmit={(e) => void handleSave(e)} className="space-y-4 pb-6 border-b border-[#F0F2F5] dark:border-[#222D34]">
            <div className="flex items-center gap-4">
              <div className="relative group">
                <Avatar src={avatarUrl} name={displayName || currentUser.displayName} size="xl" isOnline />
                <button
                  type="button"
                  aria-label="رفع صورة شخصية جديدة"
                  onClick={() => fileInputRef.current?.click()}
                  className="absolute bottom-0 left-0 w-8 h-8 rounded-full bg-[var(--wa-accent)] text-white flex items-center justify-center shadow-md hover:brightness-95 transition-all cursor-pointer"
                >
                  <Camera className="w-4 h-4" aria-hidden="true" />
                </button>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  aria-label="اختيار ملف الصورة الشخصية"
                  onChange={(e) => void handleAvatarUpload(e)}
                  className="hidden"
                />
              </div>

              <div className="min-w-0 flex-1">
                <p className="font-display text-base font-bold text-[#111B21] dark:text-[#E9EDEF] truncate">
                  {displayName || currentUser.displayName}
                </p>
                <p className="text-xs text-[#54656F] dark:text-[#8696A0] truncate">
                  {currentUser.email || currentUser.phone || 'حساب محلي غير مرتبط بالسحابة'}
                </p>
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="px-2.5 py-1 rounded-md bg-[#F0F2F5] dark:bg-[#202C33] text-[11px] font-medium text-[var(--wa-accent-strong)] hover:brightness-95 cursor-pointer"
                  >
                    رفع صورة
                  </button>
                  {avatarUrl && (
                    <button
                      type="button"
                      aria-label="حذف الصورة الشخصية"
                      onClick={() => setAvatarUrl('')}
                      className="px-2.5 py-1 rounded-md bg-red-50 dark:bg-red-950/30 text-[11px] font-medium text-red-600 dark:text-red-400 flex items-center gap-1 cursor-pointer"
                    >
                      <Trash2 className="w-3 h-3" aria-hidden="true" />
                      <span>إزالة</span>
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => {
                      void navigator.clipboard?.writeText(currentUser.uid);
                      setCopiedUid(true);
                      window.setTimeout(() => setCopiedUid(false), 2000);
                    }}
                    className="inline-flex items-center gap-1 text-[11px] font-mono-code text-[#54656F] dark:text-[#8696A0] hover:text-[var(--wa-accent-strong)] cursor-pointer"
                  >
                    <Copy className="w-3 h-3" aria-hidden="true" />
                    <span>{copiedUid ? 'تم النسخ!' : currentUser.uid.slice(0, 10)}</span>
                  </button>
                </div>
              </div>
            </div>

            {/* Quick Avatar Presets */}
            <div className="flex flex-wrap items-center gap-2 pt-1 min-w-0">
              <span className="text-[11px] text-[#54656F] dark:text-[#8696A0]">صور سريعة:</span>
              {PRESET_AVATARS.map((preset, idx) => (
                <button
                  key={preset}
                  type="button"
                  aria-label={`اختيار الصورة الرمزية ${idx + 1}`}
                  onClick={() => setAvatarUrl(preset)}
                  className={`rounded-full p-0.5 transition-all cursor-pointer ${
                    avatarUrl === preset ? 'ring-2 ring-[var(--wa-accent)]' : 'opacity-80 hover:opacity-100'
                  }`}
                >
                  <Avatar src={preset} name={`صورة ${idx + 1}`} size="sm" />
                </button>
              ))}
            </div>

            {errorMsg && (
              <p role="alert" className="text-xs text-red-600 dark:text-red-400">
                {errorMsg}
              </p>
            )}

            <div>
              <label htmlFor="profile-name" className="block text-xs font-medium text-[var(--wa-accent-strong)] mb-1">
                الاسم الظاهر
              </label>
              <input
                id="profile-name"
                type="text"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                maxLength={80}
                className="w-full rounded-lg bg-[#F0F2F5] dark:bg-[#202C33] px-3 py-2 text-sm text-[#111B21] dark:text-[#E9EDEF] focus:outline-none focus:ring-2 focus:ring-[var(--wa-accent)]"
              />
            </div>

            <div>
              <div className="flex items-center justify-between mb-1">
                <label htmlFor="profile-about" className="block text-xs font-medium text-[var(--wa-accent-strong)]">
                  النبذة التعريفية (Bio)
                </label>
                <span className="text-[11px] font-mono-code text-[#667781] dark:text-[#8696A0]">
                  {about.length}/200
                </span>
              </div>
              <textarea
                id="profile-about"
                rows={2}
                value={about}
                onChange={(e) => setAbout(e.target.value)}
                maxLength={200}
                placeholder="اكتب نبذة قصيرة عنك..."
                className="w-full rounded-lg bg-[#F0F2F5] dark:bg-[#202C33] px-3 py-2 text-sm text-[#111B21] dark:text-[#E9EDEF] resize-none focus:outline-none focus:ring-2 focus:ring-[var(--wa-accent)]"
              />
            </div>

            <button
              type="submit"
              disabled={isSaving}
              className="px-4 py-2 rounded-lg bg-[var(--wa-accent)] text-white text-xs font-semibold hover:brightness-95 transition-all flex items-center gap-1.5 disabled:opacity-60 cursor-pointer"
            >
              {savedNotice ? (
                <>
                  <Check className="w-4 h-4" aria-hidden="true" />
                  <span>تم حفظ الملف الشخصي</span>
                </>
              ) : isSaving ? (
                <span>جاري الحفظ...</span>
              ) : (
                <span>حفظ الملف الشخصي</span>
              )}
            </button>
          </form>

          {/* Privacy & Appearance Settings */}
          <div className="space-y-3 pb-6 border-b border-[#F0F2F5] dark:border-[#222D34]">
            <div className="flex items-center justify-between">
              <h2 className="text-xs font-semibold text-[#54656F] dark:text-[#8696A0] flex items-center gap-1.5">
                <Eye className="w-3.5 h-3.5 text-[var(--wa-accent)]" aria-hidden="true" />
                <span>إعدادات الخصوصية والمظهر</span>
              </h2>
              {privacySavedNotice && (
                <span className="text-[11px] text-[var(--wa-accent)] font-medium">تم تحديث الخصوصية ✓</span>
              )}
            </div>

            <button
              type="button"
              onClick={onToggleTheme}
              className="w-full p-3 rounded-xl bg-[#F0F2F5] dark:bg-[#202C33] flex items-center justify-between text-sm text-[#111B21] dark:text-[#E9EDEF] cursor-pointer"
            >
              <span className="flex items-center gap-3">
                {theme === 'dark' ? (
                  <Sun className="w-4 h-4 text-amber-400" aria-hidden="true" />
                ) : (
                  <Moon className="w-4 h-4 text-[#54656F]" aria-hidden="true" />
                )}
                <span>المظهر الحالي</span>
              </span>
              <span className="text-xs font-semibold text-[var(--wa-accent-strong)]">
                {theme === 'dark' ? 'الوضع الداكن' : 'الوضع الفاتح'}
              </span>
            </button>

            <label className="w-full p-3 rounded-xl bg-[#F0F2F5] dark:bg-[#202C33] flex items-center justify-between text-sm text-[#111B21] dark:text-[#E9EDEF] cursor-pointer">
              <span>مؤشرات قراءة الرسائل (✓✓)</span>
              <input
                type="checkbox"
                checked={privacy.readReceipts}
                onChange={(e) => void handlePrivacyChange({ readReceipts: e.target.checked })}
                className="w-4 h-4 accent-[#00A884]"
              />
            </label>

            <div className="p-3 rounded-xl bg-[#F0F2F5] dark:bg-[#202C33] flex items-center justify-between gap-2 min-w-0">
              <label htmlFor="privacy-last-seen" className="text-xs sm:text-sm text-[#111B21] dark:text-[#E9EDEF] min-w-0 flex-1 truncate">
                آخر ظهور ومتصل الآن
              </label>
              <select
                id="privacy-last-seen"
                value={privacy.lastSeenMode}
                onChange={(e) =>
                  void handlePrivacyChange({ lastSeenMode: e.target.value as VisibilityScope })
                }
                className="shrink-0 max-w-[46%] rounded-lg bg-white dark:bg-[#111B21] border border-[#E9EDEF] dark:border-[#374248] px-2.5 py-1.5 text-xs text-[#111B21] dark:text-[#E9EDEF] focus:outline-none"
              >
                {visibilityOptions.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="p-3 rounded-xl bg-[#F0F2F5] dark:bg-[#202C33] flex items-center justify-between gap-2 min-w-0">
              <label htmlFor="privacy-photo" className="text-xs sm:text-sm text-[#111B21] dark:text-[#E9EDEF] min-w-0 flex-1 truncate">
                رؤية الصورة الشخصية
              </label>
              <select
                id="privacy-photo"
                value={privacy.profilePhotoVisibility}
                onChange={(e) =>
                  void handlePrivacyChange({
                    profilePhotoVisibility: e.target.value as VisibilityScope
                  })
                }
                className="shrink-0 max-w-[46%] rounded-lg bg-white dark:bg-[#111B21] border border-[#E9EDEF] dark:border-[#374248] px-2.5 py-1.5 text-xs text-[#111B21] dark:text-[#E9EDEF] focus:outline-none"
              >
                {visibilityOptions.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="p-3 rounded-xl bg-[#F0F2F5] dark:bg-[#202C33] flex items-center justify-between gap-2 min-w-0">
              <label htmlFor="privacy-bio" className="text-xs sm:text-sm text-[#111B21] dark:text-[#E9EDEF] min-w-0 flex-1 truncate">
                رؤية النبذة التعريفية
              </label>
              <select
                id="privacy-bio"
                value={privacy.bioVisibility}
                onChange={(e) =>
                  void handlePrivacyChange({ bioVisibility: e.target.value as VisibilityScope })
                }
                className="shrink-0 max-w-[46%] rounded-lg bg-white dark:bg-[#111B21] border border-[#E9EDEF] dark:border-[#374248] px-2.5 py-1.5 text-xs text-[#111B21] dark:text-[#E9EDEF] focus:outline-none"
              >
                {visibilityOptions.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Biometric & App Lock Security Section */}
          {omarSettings && onUpdateOmarSettings && (
            <div className="space-y-2.5 pb-6 border-b border-[#F0F2F5] dark:border-[#222D34]">
              <h2 className="text-xs font-semibold text-[#54656F] dark:text-[#8696A0] flex items-center gap-1.5">
                <Lock className="w-3.5 h-3.5 text-[var(--wa-accent)]" aria-hidden="true" />
                <span>قفل التطبيق والمصادقة الحيوية (WebAuthn)</span>
              </h2>
              <BiometricLockPanel
                settings={omarSettings}
                currentUser={currentUser}
                onUpdateSettings={onUpdateOmarSettings}
                onLockAppNow={onLockAppNow}
                onShowToast={onShowToast}
                compact
              />
            </div>
          )}

          {/* Installation & Mobile Packages */}
          <div className="space-y-2.5 pb-6 border-b border-[#F0F2F5] dark:border-[#222D34]">
            <h2 className="text-xs font-semibold text-[#54656F] dark:text-[#8696A0] flex items-center gap-1.5">
              <Download className="w-3.5 h-3.5 text-[var(--wa-accent)]" aria-hidden="true" />
              <span>تثبيت التطبيق وحزم الأجهزة (PWA & APK)</span>
            </h2>
            <PWAInstallButton />
          </div>

          {/* Account Actions */}
          <div className="space-y-2.5">
            {!isCloudSynced && (
              <button
                type="button"
                onClick={() => void onGoogleSignIn()}
                className="w-full py-2.5 px-4 rounded-xl bg-[var(--wa-accent)] text-white text-sm font-semibold hover:brightness-95 transition-all cursor-pointer"
              >
                الربط بحساب Google للمزامنة السحابية
              </button>
            )}

            <button
              type="button"
              onClick={onSignOut}
              disabled={isSigningOut}
              className="w-full py-2.5 px-4 rounded-xl border border-red-200 dark:border-red-900/60 bg-red-50/50 dark:bg-red-950/20 text-red-600 dark:text-red-400 text-sm font-semibold flex items-center justify-center gap-2 hover:bg-red-50 dark:hover:bg-red-950/40 disabled:opacity-50 transition-colors cursor-pointer"
            >
              <LogOut className="w-4 h-4" aria-hidden="true" />
              <span>{isSigningOut ? 'جاري تسجيل الخروج...' : 'تسجيل الخروج'}</span>
            </button>
          </div>
        </div>
      </div>

      {/* Right Profile Preview & Security Details */}
      <div className="hidden md:flex flex-1 items-center justify-center bg-[#F0F2F5] dark:bg-[#0B141A] p-8">
        <div className="w-full max-w-md space-y-4">
          <div className="bg-white dark:bg-[#111B21] rounded-2xl p-6 border border-[#E9EDEF] dark:border-[#222D34] space-y-4">
            <div className="flex items-center justify-between text-xs text-[#54656F] dark:text-[#8696A0]">
              <span className="flex items-center gap-1.5 font-semibold text-[var(--wa-accent-strong)]">
                <UserCheck className="w-4 h-4" aria-hidden="true" />
                <span>معاينة بطاقة ملفك الشخصي</span>
              </span>
              <span>{privacy.lastSeenMode !== 'nobody' ? 'متصل الآن' : 'مخفي'}</span>
            </div>

            <div className="flex items-center gap-4 pt-1">
              <Avatar
                src={privacy.profilePhotoVisibility !== 'nobody' ? avatarUrl : ''}
                name={displayName || currentUser.displayName}
                size="lg"
                isOnline={privacy.lastSeenMode !== 'nobody'}
              />
              <div className="min-w-0">
                <h2 className="font-display text-lg font-bold text-[#111B21] dark:text-[#E9EDEF] truncate">
                  {displayName || currentUser.displayName}
                </h2>
                <p className="text-xs text-[#54656F] dark:text-[#8696A0] line-clamp-2">
                  {privacy.bioVisibility !== 'nobody' ? about || 'متاح' : 'النبذة مخفية حسب الخصوصية'}
                </p>
              </div>
            </div>

            <div className="pt-3 border-t border-[#F0F2F5] dark:border-[#222D34] grid grid-cols-2 gap-2 text-[11px] text-[#54656F] dark:text-[#8696A0]">
              <div>آخر ظهور: {getVisibilityLabel(privacy.lastSeenMode)}</div>
              <div>الصورة: {getVisibilityLabel(privacy.profilePhotoVisibility)}</div>
              <div>النبذة: {getVisibilityLabel(privacy.bioVisibility)}</div>
              <div>القراءة: {privacy.readReceipts ? 'مفعلة' : 'معطلة'}</div>
            </div>
          </div>

          <div className="bg-white dark:bg-[#111B21] rounded-2xl p-6 border border-[#E9EDEF] dark:border-[#222D34] space-y-3">
            <div className="flex items-center gap-3 text-[var(--wa-accent)]">
              <Shield className="w-5 h-5" aria-hidden="true" />
              <h2 className="font-display text-base font-bold text-[#111B21] dark:text-[#E9EDEF]">
                هوية الأمان والمفاتيح المحلية
              </h2>
            </div>
            <div dir="ltr" className="p-3 rounded-xl bg-[#F0F2F5] dark:bg-[#202C33] font-mono-code text-xs text-center text-[#111B21] dark:text-[#E9EDEF]">
              {currentUser.safetyCode}
            </div>
            <div className="flex items-center gap-2 text-[11px] text-[#54656F] dark:text-[#8696A0]">
              <Lock className="w-3.5 h-3.5 text-[var(--wa-accent)]" aria-hidden="true" />
              <span>حماية قواعد Firestore مفعلة بعزل كامل للبيانات الشخصية.</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
