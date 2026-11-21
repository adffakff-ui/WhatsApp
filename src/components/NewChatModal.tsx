import { useEffect, useRef, useState } from 'react';
import {
  X,
  Users,
  MessageSquarePlus,
  Lock,
  Camera,
  Sparkles,
  Copy,
  Check,
  Search,
  Megaphone,
  Radio
} from 'lucide-react';
import { Avatar } from './Avatar';
import { GROUP_ICON_PRESETS } from '../data/assets';
import { validateAvatarUrl } from '../lib/chatLogic';
import type { UserProfile } from '../types/chat';

interface NewChatModalProps {
  mode: 'direct' | 'group' | 'community' | null;
  initialDirectQuery?: string;
  myUid: string;
  currentUser?: UserProfile;
  isCloudSynced: boolean;
  contacts: UserProfile[];
  onClose: () => void;
  onCreateDirectChat: (name: string, peerUid?: string) => Promise<void>;
  onCreateGroupChat: (
    title: string,
    description: string,
    memberUids: string[],
    avatarUrl?: string,
    roomType?: 'group' | 'community',
    adminOnlyPost?: boolean
  ) => Promise<void>;
  onLookupPeerByUid?: (uid: string) => Promise<UserProfile | null>;
  onImportGoogleContacts?: () => Promise<void>;
}

async function compressGroupIcon(file: File): Promise<string> {
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
        resolve(canvas.toDataURL('image/jpeg', 0.78));
      };
      img.src = reader.result as string;
    };
    reader.readAsDataURL(file);
  });
}

export function NewChatModal({
  mode,
  initialDirectQuery = '',
  myUid,
  currentUser,
  isCloudSynced,
  contacts,
  onClose,
  onCreateDirectChat,
  onCreateGroupChat,
  onLookupPeerByUid,
  onImportGoogleContacts
}: NewChatModalProps) {
  const [contactInput, setContactInput] = useState('');
  const [roomType, setRoomType] = useState<'group' | 'community'>('group');
  const [adminOnlyPost, setAdminOnlyPost] = useState(false);
  const [groupTitle, setGroupTitle] = useState('');
  const [groupDesc, setGroupDesc] = useState('');
  const [groupAvatar, setGroupAvatar] = useState(GROUP_ICON_PRESETS[0]);
  const [selectedUids, setSelectedUids] = useState<string[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [isSearchingUid, setIsSearchingUid] = useState(false);
  const [foundRemoteUser, setFoundRemoteUser] = useState<UserProfile | null>(null);
  const [groupPeerQuery, setGroupPeerQuery] = useState('');
  const [groupFoundPeer, setGroupFoundPeer] = useState<UserProfile | null>(null);
  const [extraGroupPeers, setExtraGroupPeers] = useState<UserProfile[]>([]);
  const [searchingGroupPeer, setSearchingGroupPeer] = useState(false);
  const [copiedUid, setCopiedUid] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const iconInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (mode === 'community') {
      setRoomType('community');
      setAdminOnlyPost(true);
    } else if (mode === 'group') {
      setRoomType('group');
      setAdminOnlyPost(false);
    }
    if (mode === 'direct') {
      setContactInput(initialDirectQuery || '');
    } else if (!mode) {
      setContactInput('');
    }
    setIsSubmitting(false);
    setErrorMsg(null);
    setFoundRemoteUser(null);
    setGroupFoundPeer(null);
    setGroupPeerQuery('');
  }, [mode, initialDirectQuery]);

  // Automatic debounced lookup as user types a Wasil ID (@handle or bare handle >= 3 chars)
  useEffect(() => {
    if (mode !== 'direct' || !isCloudSynced || !onLookupPeerByUid) return;
    const cleaned = contactInput.trim();
    const bare = cleaned.replace(/^@+/, '').toLowerCase();
    const looksSearchable =
      (cleaned.startsWith('@') && bare.length >= 3) ||
      (/^[a-z0-9_]{3,28}$/i.test(cleaned)) ||
      (/^[a-zA-Z0-9_-]{20,128}$/.test(cleaned));
    if (!looksSearchable) {
      setIsSearchingUid(false);
      return;
    }

    const matchesOwnWasil =
      Boolean(currentUser?.wasilId) &&
      bare === currentUser!.wasilId!.replace(/^@+/, '').toLowerCase();
    if (cleaned === myUid || matchesOwnWasil) {
      setFoundRemoteUser(null);
      setIsSearchingUid(false);
      return;
    }

    let cancelled = false;
    setIsSearchingUid(true);
    const timer = window.setTimeout(async () => {
      try {
        const peer = await onLookupPeerByUid(cleaned);
        if (cancelled) return;
        if (peer && peer.uid !== myUid) {
          setFoundRemoteUser(peer);
          setErrorMsg(null);
        } else {
          setFoundRemoteUser(null);
        }
      } catch {
        if (!cancelled) setFoundRemoteUser(null);
      } finally {
        if (!cancelled) setIsSearchingUid(false);
      }
    }, 360);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [mode, contactInput, isCloudSynced, onLookupPeerByUid, myUid, currentUser?.wasilId]);

  useEffect(() => {
    if (!mode) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [mode, onClose]);

  if (!mode) return null;

  const isChannel = roomType === 'community';

  const toggleMember = (uid: string) => {
    setSelectedUids((prev) =>
      prev.includes(uid) ? prev.filter((id) => id !== uid) : [...prev, uid]
    );
  };

  const handleGroupIconUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    try {
      setErrorMsg(null);
      const compressed = await compressGroupIcon(file);
      if (!validateAvatarUrl(compressed)) {
        setErrorMsg('حجم الأيقونة كبير جداً حتى بعد الضغط.');
        return;
      }
      setGroupAvatar(compressed);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'تعذر تحميل أيقونة الغرفة.');
    }
  };

  const handleSearchRemotePeer = async () => {
    const cleaned = contactInput.trim();
    if (!cleaned || !onLookupPeerByUid) return;
    setErrorMsg(null);
    setFoundRemoteUser(null);
    const matchesOwnWasil =
      Boolean(currentUser?.wasilId) &&
      cleaned.replace(/^@+/, '').toLowerCase() === currentUser!.wasilId!.replace(/^@+/, '').toLowerCase();
    if (cleaned === myUid || matchesOwnWasil) {
      setErrorMsg('لا يمكنك إدخال معرف حسابك الخاص هنا.');
      return;
    }
    setIsSearchingUid(true);
    try {
      const peer = await onLookupPeerByUid(cleaned);
      if (!peer) {
        setErrorMsg('لم يتم العثور على مستخدم مسجّل بهذا المعرف (@) أو UID. تأكد من صحة المعرف.');
      } else if (peer.uid === myUid) {
        setErrorMsg('لا يمكنك بدء محادثة مع معرف حسابك الخاص هنا.');
      } else {
        setFoundRemoteUser(peer);
      }
    } catch {
      setErrorMsg('تعذر البحث عن المعرف السحابي.');
    } finally {
      setIsSearchingUid(false);
    }
  };

  const handleQuickCreateDirect = async (displayName: string, peerUid?: string) => {
    if (isSubmitting) return;
    setErrorMsg(null);
    setIsSubmitting(true);
    try {
      await onCreateDirectChat(displayName, peerUid);
      setContactInput('');
      setFoundRemoteUser(null);
      onClose();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'تعذر فتح المحادثة. حاول مرة أخرى.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSubmitDirect = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = contactInput.trim();
    if (!trimmed || isSubmitting) return;
    setErrorMsg(null);
    setIsSubmitting(true);
    try {
      if (foundRemoteUser) {
        await onCreateDirectChat(foundRemoteUser.displayName, foundRemoteUser.uid);
        setContactInput('');
        setFoundRemoteUser(null);
        onClose();
        return;
      }

      if (isCloudSynced && onLookupPeerByUid) {
        const matchesOwnWasil =
          Boolean(currentUser?.wasilId) &&
          trimmed.replace(/^@+/, '').toLowerCase() === currentUser!.wasilId!.replace(/^@+/, '').toLowerCase();
        if (trimmed === myUid || matchesOwnWasil) {
          setErrorMsg('لا يمكنك إدخال معرف حسابك الخاص هنا.');
          return;
        }
        const peer = await onLookupPeerByUid(trimmed);
        if (!peer) {
          setErrorMsg('لم يتم العثور على مستخدم مسجّل بهذا المعرف (@) أو UID. تأكد من صحة المعرف.');
          return;
        }
        if (peer.uid === myUid) {
          setErrorMsg('لا يمكنك بدء محادثة مع معرف حسابك الخاص هنا.');
          return;
        }
        await onCreateDirectChat(peer.displayName, peer.uid);
        setContactInput('');
        setFoundRemoteUser(null);
        onClose();
        return;
      }

      const looksLikeUid = /^[a-zA-Z0-9_-]{20,64}$/.test(trimmed);
      await onCreateDirectChat(trimmed, looksLikeUid ? trimmed : undefined);
      setContactInput('');
      setFoundRemoteUser(null);
      onClose();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'تعذر بدء المحادثة. حاول مرة أخرى.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSubmitGroup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!groupTitle.trim() || isSubmitting) return;
    setIsSubmitting(true);
    setErrorMsg(null);
    try {
      await onCreateGroupChat(
        groupTitle.trim(),
        groupDesc.trim(),
        selectedUids,
        groupAvatar,
        roomType,
        adminOnlyPost
      );
      setGroupTitle('');
      setGroupDesc('');
      setGroupAvatar(GROUP_ICON_PRESETS[0]);
      setSelectedUids([]);
      onClose();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'تعذر إنشاء المجموعة. حاول مرة أخرى.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleImport = async () => {
    if (!onImportGoogleContacts) return;
    setIsImporting(true);
    try {
      await onImportGoogleContacts();
    } finally {
      setIsImporting(false);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={
        mode === 'direct'
          ? 'بدء دردشة مشفرة جديدة'
          : isChannel
            ? 'إنشاء قناة إخبارية جديدة'
            : 'إنشاء مجموعة جديدة'
      }
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4"
    >
      <div className="w-full max-w-md max-h-[90dvh] flex flex-col bg-white dark:bg-[#202C33] rounded-2xl shadow-2xl border border-[#E9EDEF] dark:border-[#374248] overflow-hidden">
        <header className="px-5 py-4 bg-[var(--wa-accent-strong)] text-white flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2.5">
            {mode === 'direct' ? (
              <MessageSquarePlus className="w-5 h-5" aria-hidden="true" />
            ) : isChannel ? (
              <Radio className="w-5 h-5" aria-hidden="true" />
            ) : (
              <Users className="w-5 h-5" aria-hidden="true" />
            )}
            <h2 className="font-display text-base font-bold">
              {mode === 'direct'
                ? 'دردشة مشفرة جديدة (P2P)'
                : isChannel
                  ? 'إنشاء قناة أو مجتمع جديد'
                  : 'إنشاء مجموعة مشفرة جديدة'}
            </h2>
          </div>
          <button
            type="button"
            aria-label="إغلاق"
            onClick={onClose}
            className="p-1.5 rounded-full hover:bg-white/15 cursor-pointer"
          >
            <X className="w-5 h-5" aria-hidden="true" />
          </button>
        </header>

        {mode === 'direct' ? (
          <form onSubmit={(e) => void handleSubmitDirect(e)} className="p-5 space-y-4 overflow-y-auto flex-1">
            {isCloudSynced && (
              <div className="space-y-2">
                <div className="p-3 rounded-xl bg-[#F7F8FA] dark:bg-[#111B21] border border-[#E9EDEF] dark:border-[#2A3942] flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <span className="block text-[10px] font-semibold text-[#54656F] dark:text-[#8696A0]">
                      معرّفك الخاص للمشاركة (Wasil ID):
                    </span>
                    <span dir="ltr" className="block font-mono-code text-xs font-bold text-[var(--wa-accent)] truncate">
                      {currentUser?.wasilId || myUid}
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      void navigator.clipboard?.writeText(currentUser?.wasilId || myUid);
                      setCopiedUid(true);
                      window.setTimeout(() => setCopiedUid(false), 1800);
                    }}
                    className="shrink-0 min-h-[36px] px-2.5 rounded-lg bg-white dark:bg-[#202C33] border border-[#E9EDEF] dark:border-[#2A3942] text-[11px] font-bold flex items-center gap-1 cursor-pointer"
                  >
                    {copiedUid ? (
                      <>
                        <Check className="w-3.5 h-3.5 text-emerald-500" aria-hidden="true" />
                        <span>تم النسخ</span>
                      </>
                    ) : (
                      <>
                        <Copy className="w-3.5 h-3.5" aria-hidden="true" />
                        <span>نسخ المعرف</span>
                      </>
                    )}
                  </button>
                </div>
              </div>
            )}

            <div>
              <label htmlFor="new-chat-name" className="block text-xs font-medium text-[#54656F] dark:text-[#8696A0] mb-1.5">
                البحث بالمعرّف الخاص (Wasil ID مثل @user) أو UID
              </label>
              <div className="flex items-stretch gap-2">
                <input
                  id="new-chat-name"
                  type="text"
                  dir="auto"
                  required
                  value={contactInput}
                  onChange={(e) => {
                    setContactInput(e.target.value);
                    setFoundRemoteUser(null);
                    setErrorMsg(null);
                  }}
                  placeholder="مثال: @sara_dev أو الصق معرّف الحساب..."
                  className="flex-1 min-w-0 rounded-lg bg-[#F0F2F5] dark:bg-[#2A3942] px-3 py-2.5 text-sm text-[#111B21] dark:text-[#E9EDEF] focus:outline-none focus:ring-2 focus:ring-[var(--wa-accent)]"
                />
                {isCloudSynced && onLookupPeerByUid && (
                  <button
                    type="button"
                    disabled={isSearchingUid || !contactInput.trim()}
                    onClick={() => void handleSearchRemotePeer()}
                    aria-label="بحث بالمعرف السحابي"
                    className="px-3 rounded-lg bg-[var(--wa-accent-soft)] text-[var(--wa-accent-strong)] font-bold text-xs flex items-center gap-1 disabled:opacity-50 cursor-pointer shrink-0"
                  >
                    <Search className="w-4 h-4" aria-hidden="true" />
                    <span>{isSearchingUid ? '...' : 'بحث'}</span>
                  </button>
                )}
              </div>
              {isSearchingUid && (
                <p className="mt-1.5 text-[11px] text-[var(--wa-accent-strong)] dark:text-[var(--wa-accent)]">
                  جاري التحقق والبحث عن المعرّف في Firebase...
                </p>
              )}
            </div>

            {errorMsg && (
              <p role="alert" className="text-xs text-red-600 dark:text-red-400">
                {errorMsg}
              </p>
            )}

            {foundRemoteUser && (
              <button
                type="button"
                disabled={isSubmitting}
                onClick={() => void handleQuickCreateDirect(foundRemoteUser.displayName, foundRemoteUser.uid)}
                className="w-full p-3 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 flex items-center justify-between gap-3 text-right cursor-pointer hover:brightness-95 disabled:opacity-60 transition-all"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <Avatar
                    src={foundRemoteUser.avatarUrl}
                    name={foundRemoteUser.displayName}
                    size="sm"
                    isOnline={foundRemoteUser.isOnline}
                  />
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5 min-w-0">
                      <p className="text-sm font-bold text-[#111B21] dark:text-white truncate">
                        {foundRemoteUser.displayName}
                      </p>
                      {foundRemoteUser.wasilId && (
                        <span
                          dir="ltr"
                          className="shrink-0 px-1.5 py-0.5 rounded bg-emerald-500/15 font-mono-code text-[10px] font-bold text-emerald-700 dark:text-emerald-300"
                        >
                          {foundRemoteUser.wasilId}
                        </span>
                      )}
                    </div>
                    <p className="text-[11px] text-emerald-700 dark:text-emerald-300 truncate">
                      {foundRemoteUser.about || 'حساب موثّق جاهز للمحادثة والمكالمات P2P'}
                    </p>
                  </div>
                </div>
                <span className="px-3 py-1 rounded-full bg-[var(--wa-accent)] text-white text-xs font-bold shrink-0">
                  تواصل الآن
                </span>
              </button>
            )}

            {onImportGoogleContacts && (
              <button
                type="button"
                disabled={isImporting}
                onClick={() => void handleImport()}
                className="w-full py-2 px-3 rounded-xl bg-[var(--wa-accent)] text-white text-xs font-semibold flex items-center justify-center gap-2 shadow-sm hover:brightness-95 transition-all cursor-pointer disabled:opacity-60"
              >
                <Sparkles className="w-4 h-4" aria-hidden="true" />
                <span>{isImporting ? 'جاري الاستيراد...' : 'استيراد جهات اتصال Google (Google Contacts)'}</span>
              </button>
            )}

            {(() => {
              const q = contactInput.trim().toLowerCase();
              const filteredContacts = q
                ? contacts.filter(
                    (c) =>
                      c.displayName.toLowerCase().includes(q) ||
                      (c.wasilId && c.wasilId.toLowerCase().includes(q)) ||
                      c.uid.toLowerCase().includes(q)
                  )
                : contacts;

              return (
                <div>
                  <p className="text-xs font-semibold text-[var(--wa-accent-strong)] mb-2">
                    جهات الاتصال المتاحة ({filteredContacts.length})
                  </p>
                  {filteredContacts.length === 0 ? (
                    <p className="p-3 rounded-xl bg-[#F7F8FA] dark:bg-[#111B21] text-[11px] text-[#54656F] dark:text-[#8696A0] text-center">
                      {contacts.length === 0
                        ? 'لا توجد جهات اتصال محفوظة بعد — ابحث بالمعرف @ الخاص بالطرف الآخر لبدء محادثة مشفرة.'
                        : 'لا توجد جهة اتصال محلية مطابقة — اضغط «بحث» للبحث في سحابة Firebase عبر Wasil ID.'}
                    </p>
                  ) : (
                    <ul className="space-y-1 max-h-40 overflow-y-auto">
                      {filteredContacts.map((c) => (
                        <li key={c.uid}>
                          <button
                            type="button"
                            disabled={isSubmitting}
                            onClick={() => void handleQuickCreateDirect(c.displayName, c.uid)}
                            className="w-full p-2 rounded-xl flex items-center gap-3 hover:bg-[#F5F6F6] dark:hover:bg-[#182229] text-right cursor-pointer disabled:opacity-60"
                          >
                            <Avatar src={c.avatarUrl} name={c.displayName} size="sm" isOnline={c.isOnline} />
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-2 min-w-0">
                                <p className="text-sm font-semibold text-[#111B21] dark:text-[#E9EDEF] truncate">
                                  {c.displayName}
                                </p>
                                {c.wasilId && (
                                  <span
                                    dir="ltr"
                                    className="font-mono-code text-[10px] font-semibold text-[var(--wa-accent)] shrink-0"
                                  >
                                    {c.wasilId}
                                  </span>
                                )}
                              </div>
                              <p className="text-xs text-[#54656F] dark:text-[#8696A0] truncate">{c.about}</p>
                            </div>
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              );
            })()}

            <div className="flex items-center justify-between pt-2">
              <span className="text-[11px] text-[#54656F] dark:text-[#8696A0] flex items-center gap-1">
                <Lock className="w-3 h-3 text-[var(--wa-accent)]" aria-hidden="true" />
                مفتاح جلسة فريد بين الطرفين
              </span>
              <button
                type="submit"
                disabled={isSubmitting}
                className="px-5 py-2 rounded-lg bg-[var(--wa-accent)] text-white text-xs font-semibold hover:brightness-95 disabled:opacity-60 cursor-pointer"
              >
                {isSubmitting ? 'جاري الإنشاء...' : 'بدء المحادثة'}
              </button>
            </div>
          </form>
        ) : (
          <form onSubmit={(e) => void handleSubmitGroup(e)} className="p-5 space-y-4 overflow-y-auto flex-1">
            {/* Group vs Channel Switch */}
            <div className="grid grid-cols-2 gap-1.5 p-1 rounded-xl bg-[#F0F2F5] dark:bg-[#111B21]">
              <button
                type="button"
                onClick={() => {
                  setRoomType('group');
                  setAdminOnlyPost(false);
                }}
                className={`py-2 px-3 rounded-lg text-xs font-bold flex items-center justify-center gap-1.5 transition-colors cursor-pointer ${
                  !isChannel
                    ? 'bg-white dark:bg-[#202C33] text-[var(--wa-accent-strong)] shadow-xs'
                    : 'text-[#54656F] dark:text-[#8696A0]'
                }`}
              >
                <Users className="w-3.5 h-3.5" aria-hidden="true" />
                <span>مجموعة خاصة</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  setRoomType('community');
                  setAdminOnlyPost(true);
                }}
                className={`py-2 px-3 rounded-lg text-xs font-bold flex items-center justify-center gap-1.5 transition-colors cursor-pointer ${
                  isChannel
                    ? 'bg-white dark:bg-[#202C33] text-[var(--wa-accent-strong)] shadow-xs'
                    : 'text-[#54656F] dark:text-[#8696A0]'
                }`}
              >
                <Megaphone className="w-3.5 h-3.5" aria-hidden="true" />
                <span>قناة ومجتمع</span>
              </button>
            </div>

            {/* Room Icon Picker & Upload */}
            <div className="flex items-center gap-4">
              <div className="relative shrink-0">
                <Avatar
                  src={groupAvatar}
                  name={groupTitle || (isChannel ? 'قناة' : 'مجموعة')}
                  size="lg"
                  isGroup
                />
                <button
                  type="button"
                  aria-label="رفع أيقونة الغرفة"
                  onClick={() => iconInputRef.current?.click()}
                  className="absolute -bottom-1 -left-1 w-7 h-7 rounded-full bg-[var(--wa-accent)] text-white flex items-center justify-center shadow-md hover:brightness-95 cursor-pointer"
                >
                  <Camera className="w-3.5 h-3.5" aria-hidden="true" />
                </button>
                <input
                  ref={iconInputRef}
                  type="file"
                  accept="image/*"
                  aria-label="اختيار صورة أيقونة الغرفة"
                  onChange={(e) => void handleGroupIconUpload(e)}
                  className="hidden"
                />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-semibold text-[#111B21] dark:text-[#E9EDEF] mb-1.5">
                  {isChannel ? 'شعار القناة' : 'أيقونة المجموعة'}
                </p>
                <div className="flex flex-wrap items-center gap-2">
                  {GROUP_ICON_PRESETS.map((preset, idx) => (
                    <button
                      key={preset}
                      type="button"
                      aria-label={`اختيار الأيقونة ${idx + 1}`}
                      onClick={() => setGroupAvatar(preset)}
                      className={`rounded-full p-0.5 cursor-pointer ${
                        groupAvatar === preset ? 'ring-2 ring-[var(--wa-accent)]' : 'opacity-75 hover:opacity-100'
                      }`}
                    >
                      <Avatar src={preset} name={`أيقونة ${idx + 1}`} size="sm" />
                    </button>
                  ))}
                  <button
                    type="button"
                    onClick={() => iconInputRef.current?.click()}
                    className="px-2.5 py-1 rounded-md bg-[#F0F2F5] dark:bg-[#2A3942] text-[11px] font-medium text-[var(--wa-accent-strong)] cursor-pointer"
                  >
                    رفع صورة
                  </button>
                </div>
              </div>
            </div>

            {errorMsg && (
              <p role="alert" className="text-xs text-red-600 dark:text-red-400">
                {errorMsg}
              </p>
            )}

            <div>
              <label htmlFor="group-title" className="block text-xs font-medium text-[#54656F] dark:text-[#8696A0] mb-1">
                {isChannel ? 'اسم القناة أو المجتمع' : 'اسم المجموعة'}
              </label>
              <input
                id="group-title"
                type="text"
                required
                maxLength={100}
                value={groupTitle}
                onChange={(e) => setGroupTitle(e.target.value)}
                placeholder={isChannel ? 'مثال: قناة أخبار التكنولوجيا' : 'مثال: فريق إطلاق التطبيق'}
                className="w-full rounded-lg bg-[#F0F2F5] dark:bg-[#2A3942] px-3 py-2 text-sm text-[#111B21] dark:text-[#E9EDEF] focus:outline-none focus:ring-2 focus:ring-[var(--wa-accent)]"
              />
            </div>

            <div>
              <label htmlFor="group-desc" className="block text-xs font-medium text-[#54656F] dark:text-[#8696A0] mb-1">
                {isChannel ? 'وصف القناة (اختياري)' : 'وصف المجموعة (اختياري)'}
              </label>
              <input
                id="group-desc"
                type="text"
                maxLength={300}
                value={groupDesc}
                onChange={(e) => setGroupDesc(e.target.value)}
                placeholder={isChannel ? 'موضوع القناة وتنبيهاتها' : 'هدف المجموعة وقواعدها'}
                className="w-full rounded-lg bg-[#F0F2F5] dark:bg-[#2A3942] px-3 py-2 text-sm text-[#111B21] dark:text-[#E9EDEF] focus:outline-none focus:ring-2 focus:ring-[var(--wa-accent)]"
              />
            </div>

            {/* Admin-only Broadcast Mode Toggle */}
            <label className="p-3 rounded-xl bg-[#F8FAFB] dark:bg-[#111B21] border border-[#E9EDEF] dark:border-[#2A3942] flex items-center justify-between gap-3 cursor-pointer">
              <div className="min-w-0">
                <p className="text-xs font-bold text-[#111B21] dark:text-[#E9EDEF]">
                  نشر المشرفين فقط (وضع القناة)
                </p>
                <p className="text-[11px] text-[#54656F] dark:text-[#8696A0]">
                  قصر النشر على المشرفين مع إتاحة المتابعة والرد بالرموز التعبيرية
                </p>
              </div>
              <input
                type="checkbox"
                checked={adminOnlyPost}
                onChange={(e) => setAdminOnlyPost(e.target.checked)}
                className="w-4 h-4 accent-[var(--wa-accent)] shrink-0"
              />
            </label>

            <div className="space-y-2.5">
              <p className="text-xs font-semibold text-[var(--wa-accent-strong)]">
                {isChannel ? `دعوة متابعين (${selectedUids.length})` : `دعوة جهات الاتصال بالمعرف (${selectedUids.length})`}
              </p>
              {isCloudSynced && onLookupPeerByUid && (
                <div className="space-y-2">
                  <div className="flex items-stretch gap-2">
                    <input
                      type="text"
                      dir="auto"
                      value={groupPeerQuery}
                      onChange={(e) => {
                        setGroupPeerQuery(e.target.value);
                        setGroupFoundPeer(null);
                      }}
                      placeholder="إضافة عضو عبر @wasilId..."
                      className="flex-1 min-w-0 rounded-lg bg-[#F0F2F5] dark:bg-[#2A3942] px-3 py-1.5 text-xs text-[#111B21] dark:text-[#E9EDEF] focus:outline-none focus:ring-2 focus:ring-[var(--wa-accent)]"
                    />
                    <button
                      type="button"
                      disabled={searchingGroupPeer || !groupPeerQuery.trim()}
                      onClick={async () => {
                        const q = groupPeerQuery.trim();
                        if (!q || !onLookupPeerByUid) return;
                        setSearchingGroupPeer(true);
                        setErrorMsg(null);
                        try {
                          const peer = await onLookupPeerByUid(q);
                          if (!peer) {
                            setErrorMsg('لم يتم العثور على مستخدم بهذا المعرف.');
                            setGroupFoundPeer(null);
                          } else if (peer.uid === myUid) {
                            setErrorMsg('حسابك مضاف تلقائياً بصفتك المنشئ.');
                            setGroupFoundPeer(null);
                          } else {
                            setGroupFoundPeer(peer);
                          }
                        } finally {
                          setSearchingGroupPeer(false);
                        }
                      }}
                      className="px-3 rounded-lg bg-[var(--wa-accent-soft)] text-[var(--wa-accent-strong)] font-bold text-xs flex items-center gap-1 disabled:opacity-50 cursor-pointer shrink-0"
                    >
                      <Search className="w-3.5 h-3.5" aria-hidden="true" />
                      <span>{searchingGroupPeer ? '...' : 'بحث'}</span>
                    </button>
                  </div>
                  {groupFoundPeer && (
                    <button
                      type="button"
                      onClick={() => {
                        setExtraGroupPeers((prev) =>
                          prev.some((p) => p.uid === groupFoundPeer.uid) ? prev : [groupFoundPeer, ...prev]
                        );
                        setSelectedUids((prev) =>
                          prev.includes(groupFoundPeer.uid) ? prev : [...prev, groupFoundPeer.uid]
                        );
                        setGroupFoundPeer(null);
                        setGroupPeerQuery('');
                      }}
                      className="w-full p-2.5 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 flex items-center justify-between gap-2 text-right cursor-pointer"
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <Avatar src={groupFoundPeer.avatarUrl} name={groupFoundPeer.displayName} size="sm" />
                        <div className="min-w-0">
                          <p className="text-xs font-bold text-[#111B21] dark:text-white truncate">
                            {groupFoundPeer.displayName}
                          </p>
                          {groupFoundPeer.wasilId && (
                            <p dir="ltr" className="font-mono-code text-[10px] text-emerald-700 dark:text-emerald-300 truncate">
                              {groupFoundPeer.wasilId}
                            </p>
                          )}
                        </div>
                      </div>
                      <span className="px-2.5 py-1 rounded-lg bg-[var(--wa-accent)] text-white text-[11px] font-bold shrink-0">
                        إضافة
                      </span>
                    </button>
                  )}
                </div>
              )}
              {(() => {
                const combinedPeers = [
                  ...extraGroupPeers,
                  ...contacts.filter((c) => !extraGroupPeers.some((e) => e.uid === c.uid))
                ];
                if (combinedPeers.length === 0) {
                  return (
                    <p className="p-2.5 rounded-xl bg-[#F7F8FA] dark:bg-[#111B21] text-[11px] text-[#54656F] dark:text-[#8696A0] text-center">
                      ابحث بالمعرّف @ لإضافة أعضاء جدد، أو أنشئ المجموعة وأضف الأعضاء لاحقاً.
                    </p>
                  );
                }
                return (
                  <ul className="space-y-1 max-h-40 overflow-y-auto">
                    {combinedPeers.map((c) => {
                      const checked = selectedUids.includes(c.uid);
                      return (
                        <li key={c.uid}>
                          <label className="w-full p-2 rounded-xl flex items-center justify-between gap-3 hover:bg-[#F5F6F6] dark:hover:bg-[#182229] cursor-pointer">
                            <div className="flex items-center gap-3 min-w-0">
                              <Avatar src={c.avatarUrl} name={c.displayName} size="sm" />
                              <div className="min-w-0">
                                <span className="block text-sm font-medium text-[#111B21] dark:text-[#E9EDEF] truncate">
                                  {c.displayName}
                                </span>
                                {c.wasilId && (
                                  <span dir="ltr" className="block font-mono-code text-[10px] text-[#54656F] dark:text-[#8696A0] truncate">
                                    {c.wasilId}
                                  </span>
                                )}
                              </div>
                            </div>
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={() => toggleMember(c.uid)}
                              className="w-4 h-4 accent-[var(--wa-accent)]"
                            />
                          </label>
                        </li>
                      );
                    })}
                  </ul>
                );
              })()}
            </div>

            <div className="flex items-center justify-between gap-2 pt-2">
              <span className="text-[11px] text-[#54656F] dark:text-[#8696A0] flex items-center gap-1">
                <Lock className="w-3 h-3 text-[var(--wa-accent)]" aria-hidden="true" />
                تشفير AES-GCM-256
              </span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={onClose}
                  className="px-4 py-2 rounded-lg text-xs font-medium text-[#54656F] dark:text-[#AEBAC1] cursor-pointer"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-5 py-2 rounded-lg bg-[var(--wa-accent)] text-white text-xs font-semibold hover:brightness-95 disabled:opacity-60 cursor-pointer"
                >
                  {isSubmitting
                    ? 'جاري الإنشاء...'
                    : isChannel
                      ? 'إنشاء القناة'
                      : 'إنشاء المجموعة'}
                </button>
              </div>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
