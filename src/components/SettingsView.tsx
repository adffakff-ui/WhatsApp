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
  ChevronLeft,
  Edit3,
  Smartphone,
  Laptop,
  RefreshCw,
  Languages,
  Ban,
  Search,
  UserX,
  Users,
  ExternalLink,
  Clock,
  ShieldCheck
} from 'lucide-react';
import { Avatar } from './Avatar';
import { BiometricLockPanel } from './BiometricLockPanel';
import { PRESET_AVATARS } from '../data/assets';
import {
  formatWhatsAppTime,
  getVisibilityLabel,
  normalizeWasilId,
  validateAvatarUrl,
  validateProfileInput,
  validateWasilId
} from '../lib/chatLogic';
import { formatDeviceLastActive, isDeviceSessionActive } from '../lib/deviceSession';
import {
  SUPPORTED_TRANSLATION_LANGUAGES,
  type TranslationLangCode
} from '../lib/translation';
import {
  AUTO_LOCK_OPTIONS,
  formatAutoLockStatus,
  normalizeAutoLockMinutes
} from '../lib/autoLock';
import { checkWasilIdAvailability } from '../services/firestoreSync';
import type {
  BlockedContact,
  DeviceSession,
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
  linkedDevices?: DeviceSession[];
  currentDeviceId?: string;
  onRevokeDevice?: (deviceId: string) => Promise<void>;
  omarSettings?: OmarSettings;
  onUpdateOmarSettings?: (patch: Partial<OmarSettings>) => void;
  onLockAppNow?: () => void;
  onShowToast?: (message: string) => void;
  onToggleTheme: () => void;
  onSaveProfile: (displayName: string, about: string, avatarUrl: string) => Promise<void>;
  onUpdateWasilId?: (newWasilId: string) => Promise<void>;
  onUpdatePrivacy: (nextPrivacy: PrivacySettings) => Promise<void>;
  onSignOut: () => void;
  isSigningOut?: boolean;
  onGoogleSignIn: () => Promise<void | boolean>;
  onOpenOmarAddons?: () => void;
  onBackupData?: () => Promise<void>;
  onRestoreData?: () => Promise<void>;
  onGoogleDriveBackup?: () => Promise<void>;
  onGoogleDriveRestore?: () => Promise<void>;
  contacts?: UserProfile[];
  blockedContacts?: BlockedContact[];
  onBlockContact?: (target: UserProfile) => Promise<void>;
  onUnblockContact?: (blockedUid: string) => Promise<void>;
  onLookupUser?: (query: string) => Promise<UserProfile | null>;
  onImportGoogleContacts?: () => Promise<void>;
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
  linkedDevices = [],
  currentDeviceId,
  onRevokeDevice,
  omarSettings,
  onUpdateOmarSettings,
  onLockAppNow,
  onShowToast,
  onToggleTheme,
  onSaveProfile,
  onUpdateWasilId,
  onUpdatePrivacy,
  onSignOut,
  isSigningOut = false,
  onGoogleSignIn,
  onOpenOmarAddons,
  onBackupData,
  onRestoreData,
  onGoogleDriveBackup,
  onGoogleDriveRestore,
  contacts = [],
  blockedContacts = [],
  onBlockContact,
  onUnblockContact,
  onLookupUser,
  onImportGoogleContacts
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
  const [editingWasilId, setEditingWasilId] = useState(false);
  const [wasilIdInput, setWasilIdInput] = useState(currentUser.wasilId || '');
  const [wasilIdError, setWasilIdError] = useState<string | null>(null);
  const [savingWasilId, setSavingWasilId] = useState(false);
  const [revokingDeviceId, setRevokingDeviceId] = useState<string | null>(null);
  const [blockQuery, setBlockQuery] = useState('');
  const [selectedContactToBlock, setSelectedContactToBlock] = useState('');
  const [isBlockingContact, setIsBlockingContact] = useState(false);
  const [unblockingUid, setUnblockingUid] = useState<string | null>(null);
  const [blockError, setBlockError] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setDisplayName(currentUser.displayName);
    setAbout(currentUser.about);
    setAvatarUrl(currentUser.avatarUrl);
    if (!editingWasilId) {
      setWasilIdInput(currentUser.wasilId || '');
    }
  }, [currentUser.displayName, currentUser.about, currentUser.avatarUrl, currentUser.wasilId, editingWasilId]);

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

  const handleSaveWasilId = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!onUpdateWasilId) return;
    const validation = validateWasilId(wasilIdInput);
    if (!validation.valid) {
      setWasilIdError(validation.error || 'معرّف غير صالح.');
      return;
    }
    setWasilIdError(null);
    setSavingWasilId(true);
    try {
      const check = await checkWasilIdAvailability(validation.normalized, currentUser.uid);
      if (!check.available) {
        setWasilIdError(check.error || 'هذا المعرف محجوز لمستخدم آخر بالفعل.');
        return;
      }
      await onUpdateWasilId(validation.normalized);
      setEditingWasilId(false);
    } catch (err) {
      setWasilIdError(err instanceof Error ? err.message : 'تعذر تحديث المعرف.');
    } finally {
      setSavingWasilId(false);
    }
  };

  const blockedUidSet = new Set(blockedContacts.map((b) => b.blockedUid));
  const blockableContacts = contacts.filter(
    (c) => c.uid && c.uid !== currentUser.uid && !blockedUidSet.has(c.uid) && !c.uid.startsWith('gcontact_')
  );

  const handleBlockByLookup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!onBlockContact) return;
    const trimmed = blockQuery.trim();
    if (!trimmed) return;
    setBlockError(null);

    const localMatch = contacts.find(
      (c) =>
        c.uid === trimmed ||
        (c.wasilId && c.wasilId.toLowerCase() === trimmed.toLowerCase()) ||
        c.displayName.toLowerCase() === trimmed.toLowerCase()
    );

    setIsBlockingContact(true);
    try {
      let target: UserProfile | null = localMatch || null;
      if (!target && onLookupUser) {
        target = await onLookupUser(trimmed);
      }
      if (!target) {
        setBlockError('لم يتم العثور على مستخدم بهذا المعرف (@wasilId) أو UID.');
        return;
      }
      if (target.uid === currentUser.uid) {
        setBlockError('لا يمكنك حظر حسابك الشخصي.');
        return;
      }
      if (blockedUidSet.has(target.uid)) {
        setBlockError('جهة الاتصال محظورة بالفعل.');
        return;
      }
      await onBlockContact(target);
      setBlockQuery('');
    } catch (err) {
      setBlockError(err instanceof Error ? err.message : 'تعذر حظر جهة الاتصال.');
    } finally {
      setIsBlockingContact(false);
    }
  };

  const handleBlockFromSelect = async () => {
    if (!onBlockContact || !selectedContactToBlock) return;
    const target = blockableContacts.find((c) => c.uid === selectedContactToBlock);
    if (!target) return;
    setBlockError(null);
    setIsBlockingContact(true);
    try {
      await onBlockContact(target);
      setSelectedContactToBlock('');
    } catch (err) {
      setBlockError(err instanceof Error ? err.message : 'تعذر حظر جهة الاتصال.');
    } finally {
      setIsBlockingContact(false);
    }
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

            {omarSettings && onUpdateOmarSettings && (
              <div className="p-3 rounded-xl bg-[#F0F2F5] dark:bg-[#202C33] flex items-center justify-between gap-2 min-w-0">
                <label
                  htmlFor="preferred-translation-lang"
                  className="text-xs sm:text-sm text-[#111B21] dark:text-[#E9EDEF] min-w-0 flex-1 truncate flex items-center gap-2"
                >
                  <Languages className="w-4 h-4 text-[var(--wa-accent)] shrink-0" aria-hidden="true" />
                  <span className="truncate">لغة الترجمة المفضلة</span>
                </label>
                <select
                  id="preferred-translation-lang"
                  value={omarSettings.preferredLanguage || 'ar'}
                  onChange={(e) => {
                    onUpdateOmarSettings({
                      preferredLanguage: e.target.value as TranslationLangCode
                    });
                    onShowToast?.('تم حفظ لغة الترجمة المفضلة');
                  }}
                  className="shrink-0 max-w-[46%] rounded-lg bg-white dark:bg-[#111B21] border border-[#E9EDEF] dark:border-[#374248] px-2.5 py-1.5 text-xs text-[#111B21] dark:text-[#E9EDEF] focus:outline-none"
                >
                  {SUPPORTED_TRANSLATION_LANGUAGES.map((lang) => (
                    <option key={lang.code} value={lang.code}>
                      {lang.arabicName} ({lang.nativeName})
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>

          {/* Blocked Contacts Section */}
          {onBlockContact && onUnblockContact && (
            <section
              aria-label="جهات الاتصال المحظورة"
              className="space-y-3 pb-6 border-b border-[#F0F2F5] dark:border-[#222D34]"
            >
              <div className="flex items-center justify-between gap-2">
                <h2 className="text-xs font-semibold text-[#54656F] dark:text-[#8696A0] flex items-center gap-1.5">
                  <Ban className="w-3.5 h-3.5 text-red-500" aria-hidden="true" />
                  <span>جهات الاتصال المحظورة ({blockedContacts.length})</span>
                </h2>
                <span className="text-[10px] font-semibold text-red-600 dark:text-red-400">
                  منع نهائي للرسائل والمكالمات
                </span>
              </div>

              <div className="p-3.5 rounded-2xl bg-[#F0F2F5] dark:bg-[#202C33] border border-[#E9EDEF] dark:border-[#374248] space-y-3">
                <p className="text-[11px] text-[#54656F] dark:text-[#8696A0] leading-relaxed">
                  لن يتمكن المستخدمون في هذه القائمة من مراسلتك أو الاتصال بك، ويتم حفظ الحظر ومزامنته عبر Firestore.
                </p>

                {/* Quick block from existing contacts */}
                {blockableContacts.length > 0 && (
                  <div className="flex items-center gap-2 min-w-0">
                    <select
                      aria-label="اختر جهة اتصال لحظرها"
                      value={selectedContactToBlock}
                      onChange={(e) => {
                        setBlockError(null);
                        setSelectedContactToBlock(e.target.value);
                      }}
                      className="flex-1 min-w-0 rounded-lg bg-white dark:bg-[#111B21] border border-[#E9EDEF] dark:border-[#374248] px-2.5 py-2 text-xs text-[#111B21] dark:text-[#E9EDEF] focus:outline-none focus:ring-2 focus:ring-red-400"
                    >
                      <option value="">اختر جهة اتصال من محادثاتك لحظرها...</option>
                      {blockableContacts.map((c) => (
                        <option key={c.uid} value={c.uid}>
                          {c.displayName} {c.wasilId ? `(${c.wasilId})` : ''}
                        </option>
                      ))}
                    </select>
                    <button
                      type="button"
                      disabled={!selectedContactToBlock || isBlockingContact}
                      onClick={() => void handleBlockFromSelect()}
                      className="shrink-0 px-3 py-2 rounded-lg bg-red-600 text-white text-xs font-bold hover:bg-red-700 disabled:opacity-50 flex items-center gap-1 cursor-pointer"
                    >
                      <Ban className="w-3.5 h-3.5" aria-hidden="true" />
                      <span>حظر</span>
                    </button>
                  </div>
                )}

                {/* Block by @wasilId or UID */}
                <form onSubmit={(e) => void handleBlockByLookup(e)} className="flex items-center gap-2 min-w-0">
                  <div className="flex-1 min-w-0 flex items-center rounded-lg bg-white dark:bg-[#111B21] border border-[#E9EDEF] dark:border-[#374248] px-2.5">
                    <Search className="w-3.5 h-3.5 text-[#667781] shrink-0 ml-1.5" aria-hidden="true" />
                    <input
                      type="text"
                      dir="ltr"
                      value={blockQuery}
                      onChange={(e) => {
                        setBlockError(null);
                        setBlockQuery(e.target.value);
                      }}
                      placeholder="أضف للحظر عبر @wasilId أو UID"
                      aria-label="البحث عن مستخدم لحظر جهته"
                      className="w-full py-2 bg-transparent text-xs font-mono-code text-[#111B21] dark:text-[#E9EDEF] placeholder:text-[#667781] dark:placeholder:text-[#8696A0] focus:outline-none"
                    />
                  </div>
                  <button
                    type="submit"
                    disabled={!blockQuery.trim() || isBlockingContact}
                    className="shrink-0 px-3 py-2 rounded-lg bg-[#111B21] dark:bg-[#2A3942] text-white text-xs font-bold hover:opacity-90 disabled:opacity-50 flex items-center gap-1 cursor-pointer"
                  >
                    <UserX className="w-3.5 h-3.5" aria-hidden="true" />
                    <span>{isBlockingContact ? '...' : 'إضافة'}</span>
                  </button>
                </form>

                {blockError && (
                  <p role="alert" className="text-[11px] text-red-600 dark:text-red-400">
                    {blockError}
                  </p>
                )}

                {/* Blocked Users List */}
                {blockedContacts.length === 0 ? (
                  <div className="py-3 px-2 rounded-xl bg-white/70 dark:bg-[#111B21]/60 text-center text-xs text-[#667781] dark:text-[#8696A0]">
                    لا توجد جهات اتصال محظورة حالياً.
                  </div>
                ) : (
                  <ul className="space-y-2 max-h-60 overflow-y-auto">
                    {blockedContacts.map((item) => (
                      <li
                        key={item.blockedUid}
                        className="p-2.5 rounded-xl bg-white dark:bg-[#111B21] border border-[#E9EDEF] dark:border-[#2A3942] flex items-center justify-between gap-2.5"
                      >
                        <div className="flex items-center gap-2.5 min-w-0">
                          <Avatar src={item.avatarUrl} name={item.displayName} size="sm" />
                          <div className="min-w-0">
                            <p className="text-xs font-bold text-[#111B21] dark:text-[#E9EDEF] truncate">
                              {item.displayName}
                            </p>
                            <p className="text-[10px] text-[#54656F] dark:text-[#8696A0] truncate">
                              <span dir="ltr" className="font-mono-code">
                                {item.wasilId || item.blockedUid.slice(0, 12)}
                              </span>
                              {' · '}
                              <span>حُظر {formatWhatsAppTime(item.createdAtMs)}</span>
                            </p>
                          </div>
                        </div>

                        <button
                          type="button"
                          disabled={unblockingUid === item.blockedUid}
                          onClick={() => {
                            setUnblockingUid(item.blockedUid);
                            void onUnblockContact(item.blockedUid)
                              .catch(() => {
                                onShowToast?.('تعذر إلغاء الحظر الآن، يرجى المحاولة مجدداً.');
                              })
                              .finally(() => {
                                setUnblockingUid((curr) =>
                                  curr === item.blockedUid ? null : curr
                                );
                              });
                          }}
                          className="shrink-0 px-2.5 py-1.5 rounded-lg border border-emerald-200 dark:border-emerald-900/60 bg-emerald-50/70 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-300 text-[11px] font-bold hover:brightness-95 disabled:opacity-50 cursor-pointer"
                        >
                          {unblockingUid === item.blockedUid ? 'جاري الفك...' : 'إلغاء الحظر'}
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </section>
          )}

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

              {/* Auto-Lock Timeout Card */}
              {(() => {
                const activeAutoLockMinutes = normalizeAutoLockMinutes(
                  omarSettings.autoLockTimeoutMinutes
                );
                const activeOption =
                  AUTO_LOCK_OPTIONS.find((opt) => opt.minutes === activeAutoLockMinutes) ||
                  AUTO_LOCK_OPTIONS[0];
                return (
                  <div className="p-3.5 rounded-2xl bg-[#F0F2F5] dark:bg-[#202C33] border border-[#E9EDEF] dark:border-[#374248] space-y-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <h3 className="text-xs font-bold text-[#111B21] dark:text-[#E9EDEF] flex items-center gap-1.5">
                          <Clock
                            className="w-3.5 h-3.5 text-[var(--wa-accent)] shrink-0"
                            aria-hidden="true"
                          />
                          <span>القفل التلقائي عند عدم النشاط (Auto-Lock)</span>
                        </h3>
                        <p className="text-[11px] text-[#54656F] dark:text-[#8696A0] mt-0.5 leading-relaxed">
                          {activeOption.description}
                        </p>
                      </div>
                      <span
                        className={`shrink-0 px-2.5 py-1 rounded-lg text-[10px] font-bold ${
                          activeAutoLockMinutes > 0
                            ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300'
                            : 'bg-white dark:bg-[#111B21] text-[#54656F] dark:text-[#8696A0] border border-[#E9EDEF] dark:border-[#374248]'
                        }`}
                      >
                        {formatAutoLockStatus(activeAutoLockMinutes)}
                      </span>
                    </div>

                    <div
                      role="group"
                      aria-label="المدة الزمنية للقفل التلقائي"
                      className="grid grid-cols-5 gap-1.5"
                    >
                      {AUTO_LOCK_OPTIONS.map((opt) => {
                        const selected = opt.minutes === activeAutoLockMinutes;
                        return (
                          <button
                            key={opt.minutes}
                            type="button"
                            aria-pressed={selected}
                            onClick={() => {
                              onUpdateOmarSettings({ autoLockTimeoutMinutes: opt.minutes });
                              onShowToast?.(
                                opt.minutes === 0
                                  ? 'تم إيقاف القفل التلقائي للمحادثات.'
                                  : `تم تفعيل القفل التلقائي ${opt.label} لحماية محادثاتك المشفرة.`
                              );
                            }}
                            className={`min-h-[38px] px-1.5 py-1.5 rounded-xl text-[11px] font-bold border transition-all cursor-pointer ${
                              selected
                                ? 'bg-[var(--wa-accent)] text-white border-[var(--wa-accent)] shadow-xs'
                                : 'bg-white dark:bg-[#111B21] text-[#111B21] dark:text-[#E9EDEF] border-[#E9EDEF] dark:border-[#374248] hover:border-[var(--wa-accent)]'
                            }`}
                          >
                            {opt.shortLabel}
                          </button>
                        );
                      })}
                    </div>

                    <div className="flex items-start gap-1.5 text-[10px] text-[#54656F] dark:text-[#8696A0] bg-white/70 dark:bg-[#111B21]/60 rounded-xl px-2.5 py-2 border border-[#E9EDEF]/80 dark:border-[#374248]/70">
                      <ShieldCheck
                        className="w-3.5 h-3.5 text-[var(--wa-accent)] shrink-0 mt-0.5"
                        aria-hidden="true"
                      />
                      <span className="leading-relaxed">
                        {activeAutoLockMinutes > 0
                          ? `سيتم قفل التطبيق والمحادثات المقفولة تلقائياً بعد ${activeOption.label} من الخمول (يُستثنى أثناء المكالمات النشطة).${
                              omarSettings.chatLockPin === '1234'
                                ? ' يُنصح بتغيير رمز PIN الافتراضي (1234) من لوحة القفل أعلاه.'
                                : ''
                            }`
                          : 'عند التفعيل، يتم قفل الجلسة وحماية مفاتيحك ومحادثاتك المشفرة تلقائياً عند ترك الجهاز دون استخدام.'}
                      </span>
                    </div>
                  </div>
                );
              })()}
            </div>
          )}

          {/* Wasil ID Card */}
          <div className="space-y-2 pb-6 border-b border-[#F0F2F5] dark:border-[#222D34]">
            <h2 className="text-xs font-semibold text-[#54656F] dark:text-[#8696A0] flex items-center gap-1.5">
              <Shield className="w-3.5 h-3.5 text-[var(--wa-accent)]" aria-hidden="true" />
              <span>معرّفك الخاص للمراسلة (Wasil ID)</span>
            </h2>
            <div className="p-3.5 rounded-2xl bg-[#F0F2F5] dark:bg-[#202C33] border border-[#E9EDEF] dark:border-[#374248] space-y-3">
              <div className="flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <span dir="ltr" className="block font-mono-code text-sm font-bold text-[var(--wa-accent-strong)] truncate">
                    {currentUser.wasilId || currentUser.uid}
                  </span>
                  <p className="text-[11px] text-[#54656F] dark:text-[#8696A0] mt-0.5">
                    شارك هذا المعرف مع الآخرين للبحث عنك وبدء محادثات مشفرة فورية.
                  </p>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  {onUpdateWasilId && !editingWasilId && (
                    <button
                      type="button"
                      aria-label="تعديل المعرف الخاص"
                      onClick={() => {
                        setWasilIdInput(currentUser.wasilId || '');
                        setWasilIdError(null);
                        setEditingWasilId(true);
                      }}
                      className="px-2.5 py-2 rounded-xl bg-white dark:bg-[#111B21] border border-[#E9EDEF] dark:border-[#374248] text-xs font-semibold flex items-center gap-1 cursor-pointer"
                    >
                      <Edit3 className="w-3.5 h-3.5" aria-hidden="true" />
                      <span>تعديل</span>
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => {
                      const idToCopy = currentUser.wasilId || currentUser.uid;
                      void navigator.clipboard?.writeText(idToCopy);
                      setCopiedUid(true);
                      window.setTimeout(() => setCopiedUid(false), 1800);
                    }}
                    className="px-3 py-2 rounded-xl bg-white dark:bg-[#111B21] border border-[#E9EDEF] dark:border-[#374248] text-xs font-semibold flex items-center gap-1.5 cursor-pointer"
                  >
                    {copiedUid ? (
                      <>
                        <Check className="w-4 h-4 text-emerald-500" />
                        <span>تم النسخ</span>
                      </>
                    ) : (
                      <>
                        <Copy className="w-4 h-4" />
                        <span>نسخ</span>
                      </>
                    )}
                  </button>
                </div>
              </div>

              {editingWasilId && onUpdateWasilId && (
                <form onSubmit={(e) => void handleSaveWasilId(e)} className="pt-2 border-t border-[#E9EDEF] dark:border-[#374248] space-y-2">
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      dir="ltr"
                      maxLength={32}
                      value={wasilIdInput}
                      onChange={(e) => {
                        setWasilIdError(null);
                        const v = e.target.value;
                        setWasilIdInput(v.startsWith('@') ? v : `@${v.replace(/^@+/, '')}`);
                      }}
                      onBlur={() => {
                        if (wasilIdInput.trim()) {
                          const norm = normalizeWasilId(wasilIdInput);
                          if (norm) setWasilIdInput(norm);
                        }
                      }}
                      placeholder="@new_handle"
                      className="flex-1 min-w-0 rounded-lg bg-white dark:bg-[#111B21] border border-[#D1D7DB] dark:border-[#374248] px-3 py-2 font-mono-code text-xs font-semibold text-[#111B21] dark:text-[#E9EDEF] focus:outline-none focus:ring-2 focus:ring-[var(--wa-accent)]"
                    />
                    <button
                      type="submit"
                      disabled={savingWasilId}
                      className="px-3 py-2 rounded-lg bg-[var(--wa-accent)] text-white text-xs font-bold hover:brightness-95 disabled:opacity-60 cursor-pointer shrink-0"
                    >
                      {savingWasilId ? '...' : 'حفظ'}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setEditingWasilId(false);
                        setWasilIdError(null);
                      }}
                      className="px-2.5 py-2 rounded-lg text-xs font-medium text-[#54656F] dark:text-[#AEBAC1] cursor-pointer shrink-0"
                    >
                      إلغاء
                    </button>
                  </div>
                  {wasilIdError && (
                    <p role="alert" className="text-[11px] text-red-600 dark:text-red-400">
                      {wasilIdError}
                    </p>
                  )}
                </form>
              )}
            </div>
          </div>

          {/* Multi-Device Linked Sessions & Real-Time Sync */}
          {isCloudSynced && (
            <div className="space-y-2.5 pb-6 border-b border-[#F0F2F5] dark:border-[#222D34]">
              <div className="flex items-center justify-between gap-2">
                <h2 className="text-xs font-semibold text-[#54656F] dark:text-[#8696A0] flex items-center gap-1.5">
                  <Smartphone className="w-3.5 h-3.5 text-[var(--wa-accent)]" aria-hidden="true" />
                  <span>الأجهزة المرتبطة والمزامنة اللحظية ({linkedDevices.length})</span>
                </h2>
                <span className="inline-flex items-center gap-1 text-[11px] font-medium text-emerald-600 dark:text-emerald-400">
                  <RefreshCw className="w-3 h-3" aria-hidden="true" />
                  <span>مزامنة لحظية مفعلة</span>
                </span>
              </div>

              <div className="p-3.5 rounded-2xl bg-[#F0F2F5] dark:bg-[#202C33] border border-[#E9EDEF] dark:border-[#374248] space-y-2.5">
                <p className="text-[11px] text-[#54656F] dark:text-[#8696A0] leading-relaxed">
                  يمكنك تسجيل الدخول بنفس الحساب على عدة أجهزة في آنٍ واحد مع مزامنة مفاتيح التشفير والرسائل لحظياً عبر السحابة.
                </p>

                {linkedDevices.length === 0 ? (
                  <p className="text-xs text-[#667781] dark:text-[#8696A0] py-2 text-center">
                    جاري مزامنة سجل الأجهزة النشطة...
                  </p>
                ) : (
                  <ul className="space-y-2">
                    {linkedDevices.map((dev) => {
                      const isSelf = Boolean(currentDeviceId && dev.deviceId === currentDeviceId);
                      const isMobile =
                        dev.platform === 'Android' || dev.platform === 'iPhone' || dev.platform === 'iPad';
                      const activeNow = dev.isOnline && isDeviceSessionActive(dev.lastActiveAtMs);
                      return (
                        <li
                          key={dev.deviceId}
                          className="p-2.5 rounded-xl bg-white dark:bg-[#111B21] border border-[#E9EDEF] dark:border-[#2A3942] flex items-center justify-between gap-2.5"
                        >
                          <div className="flex items-center gap-2.5 min-w-0">
                            <div className="relative w-9 h-9 rounded-lg bg-[var(--wa-accent-soft)] dark:bg-[#202C33] text-[var(--wa-accent-strong)] flex items-center justify-center shrink-0">
                              {isMobile ? (
                                <Smartphone className="w-4 h-4" aria-hidden="true" />
                              ) : (
                                <Laptop className="w-4 h-4" aria-hidden="true" />
                              )}
                              {activeNow && (
                                <span
                                  aria-label="متصل الآن"
                                  className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-emerald-500 ring-2 ring-white dark:ring-[#111B21]"
                                />
                              )}
                            </div>
                            <div className="min-w-0">
                              <div className="flex items-center gap-1.5 flex-wrap">
                                <span className="text-xs font-bold text-[#111B21] dark:text-[#E9EDEF] truncate">
                                  {dev.deviceName}
                                </span>
                                {isSelf && (
                                  <span className="px-1.5 py-0.5 rounded bg-[var(--wa-accent-soft)] text-[var(--wa-accent-strong)] text-[10px] font-bold">
                                    هذا الجهاز
                                  </span>
                                )}
                              </div>
                              <p className="text-[11px] text-[#54656F] dark:text-[#8696A0] truncate">
                                {formatDeviceLastActive(dev.lastActiveAtMs, dev.isOnline)}
                              </p>
                            </div>
                          </div>

                          {!isSelf && onRevokeDevice && (
                            <button
                              type="button"
                              disabled={revokingDeviceId === dev.deviceId}
                              onClick={() => {
                                setRevokingDeviceId(dev.deviceId);
                                void onRevokeDevice(dev.deviceId)
                                  .catch(() => {
                                    onShowToast?.('تعذر فصل الجهاز حالياً، يرجى المحاولة مجدداً.');
                                  })
                                  .finally(() => {
                                    setRevokingDeviceId((curr) =>
                                      curr === dev.deviceId ? null : curr
                                    );
                                  });
                              }}
                              className="shrink-0 px-2.5 py-1.5 rounded-lg border border-red-200 dark:border-red-900/60 text-red-600 dark:text-red-400 text-[11px] font-semibold hover:bg-red-50 dark:hover:bg-red-950/30 disabled:opacity-50 cursor-pointer"
                            >
                              {revokingDeviceId === dev.deviceId ? 'جاري الفصل...' : 'فصل الجهاز'}
                            </button>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
            </div>
          )}

          {/* Cloud & Local Backup & Restore */}
          <div className="space-y-2.5 pb-6 border-b border-[#F0F2F5] dark:border-[#222D34]">
            <h2 className="text-xs font-semibold text-[#54656F] dark:text-[#8696A0] flex items-center gap-1.5">
              <Download className="w-3.5 h-3.5 text-[var(--wa-accent)]" aria-hidden="true" />
              <span>النسخ الاحتياطي التلقائي والمستمر واستعادة البيانات</span>
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {onBackupData && (
                <button
                  type="button"
                  onClick={() => void onBackupData()}
                  className="py-2.5 px-3 rounded-xl bg-[var(--wa-accent-soft)] text-[var(--wa-accent-strong)] text-xs font-bold hover:brightness-95 flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  <Download className="w-4 h-4 rotate-180" />
                  <span>نسخ احتياطي فوري للسحابة</span>
                </button>
              )}
              {onRestoreData && (
                <button
                  type="button"
                  onClick={() => void onRestoreData()}
                  className="py-2.5 px-3 rounded-xl bg-[#F0F2F5] dark:bg-[#202C33] text-[#111B21] dark:text-[#E9EDEF] text-xs font-bold hover:bg-[#E9EDEF] dark:hover:bg-[#2A3942] flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  <Download className="w-4 h-4" />
                  <span>استعادة من السحابة</span>
                </button>
              )}
            </div>
          </div>

          {/* Google Drive Encrypted Backup */}
          <div className="space-y-2.5 pb-6 border-b border-[#F0F2F5] dark:border-[#222D34]">
            <h2 className="text-xs font-semibold text-[#54656F] dark:text-[#8696A0] flex items-center gap-1.5">
              <Lock className="w-3.5 h-3.5 text-[var(--wa-accent)]" aria-hidden="true" />
              <span>نسخ احتياطي مشفر بـ AES عبر Google Drive (اختياري)</span>
            </h2>
            <p className="text-[11px] text-[#54656F] dark:text-[#8696A0]">
              ربط Google Drive لتخزين واستعادة نسخ احتياطية مشفرة بالكامل لمحادثاتك، بدلاً من الاعتماد فقط على Firestore.
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1">
              {onGoogleDriveBackup && (
                <button
                  type="button"
                  onClick={() => void onGoogleDriveBackup()}
                  className="py-2.5 px-3 rounded-xl bg-[var(--wa-accent)] text-white text-xs font-bold hover:brightness-95 flex items-center justify-center gap-1.5 cursor-pointer shadow-xs"
                >
                  <Download className="w-4 h-4 rotate-180" />
                  <span>رفع نسخة مشفرة لـ Drive</span>
                </button>
              )}
              {onGoogleDriveRestore && (
                <button
                  type="button"
                  onClick={() => void onGoogleDriveRestore()}
                  className="py-2.5 px-3 rounded-xl bg-[#F0F2F5] dark:bg-[#202C33] text-[#111B21] dark:text-[#E9EDEF] text-xs font-bold hover:bg-[#E9EDEF] dark:hover:bg-[#2A3942] flex items-center justify-center gap-1.5 cursor-pointer border border-[#E9EDEF] dark:border-[#374248]"
                >
                  <Download className="w-4 h-4" />
                  <span>استعادة من Drive</span>
                </button>
              )}
            </div>
          </div>

          {/* Standalone Install Portal Link */}
          <div className="pb-6 border-b border-[#F0F2F5] dark:border-[#222D34]">
            <a
              href="/install"
              target="_blank"
              rel="noopener noreferrer"
              className="w-full px-3.5 py-3 rounded-xl bg-[#F0F2F5] dark:bg-[#202C33] hover:bg-[#E9EDEF] dark:hover:bg-[#2A3942] border border-[#E9EDEF] dark:border-[#2A3942] flex items-center justify-between gap-3 transition-colors"
            >
              <div className="min-w-0">
                <div className="text-xs font-bold text-[#111B21] dark:text-[#E9EDEF]">
                  بوابة تثبيت التطبيق وحزمة APK (صفحة مستقلة)
                </div>
                <div className="text-[11px] text-[#54656F] dark:text-[#8696A0] truncate">
                  فتح واجهة التثبيت المستقلة وملفات الحزمة الفعلية عبر Vercel
                </div>
              </div>
              <ExternalLink className="w-4 h-4 text-[var(--wa-accent)] shrink-0" aria-hidden="true" />
            </a>
          </div>

          {/* Account Actions */}
          <div className="space-y-2.5">
            {onImportGoogleContacts && (
              <button
                type="button"
                onClick={() => void onImportGoogleContacts()}
                className="w-full py-2.5 px-4 rounded-xl border border-[var(--wa-accent)]/30 bg-[var(--wa-accent-soft)]/50 text-[var(--wa-accent-strong)] text-sm font-semibold flex items-center justify-center gap-2 hover:brightness-95 transition-all cursor-pointer"
              >
                <Users className="w-4 h-4" aria-hidden="true" />
                <span>استيراد جهات اتصال Google (اختيار وفلترة ذكية)</span>
              </button>
            )}

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
