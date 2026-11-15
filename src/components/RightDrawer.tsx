import { useEffect, useRef, useState } from 'react';
import {
  X,
  Lock,
  ShieldCheck,
  Search,
  Timer,
  Pin,
  Heart,
  VolumeX,
  Archive,
  Trash2,
  KeyRound,
  Users,
  UserPlus,
  UserMinus,
  Pencil,
  Check,
  Camera,
  Image as ImageIcon,
  Link2,
  FileText,
  ExternalLink,
  Download
} from 'lucide-react';
import { Avatar } from './Avatar';
import {
  extractChatSharedAssets,
  formatDisappearingLabel,
  formatWhatsAppTime,
  validateAvatarUrl,
  type SharedMediaItem
} from '../lib/chatLogic';
import type { ChatRoom, DecryptedMessage, RightPanelMode, UserProfile } from '../types/chat';

interface RightDrawerProps {
  mode: RightPanelMode;
  chat: ChatRoom | null;
  messages: DecryptedMessage[];
  safetyCode: string;
  inspectMessageId: string | null;
  currentUser: UserProfile;
  contacts: UserProfile[];
  onClose: () => void;
  onSetDisappearing: (chatId: string, seconds: number) => void;
  onTogglePin: (chatId: string) => void;
  onToggleFavorite: (chatId: string) => void;
  onToggleMute: (chatId: string) => void;
  onToggleArchive: (chatId: string) => void;
  onClearChat: (chatId: string) => void;
  onUpdateGroupSettings: (
    chatId: string,
    title: string,
    description: string,
    avatarUrl: string
  ) => Promise<void>;
  onInviteMemberToGroup: (chatId: string, contact: UserProfile) => Promise<void>;
  onRemoveMemberFromGroup: (chatId: string, memberUid: string) => Promise<void>;
}

const GROUP_ICON_PRESETS = [
  '/src/assets/images/avatar_tech_group_1794759600547.jpg',
  '/src/assets/images/avatar_sara_1794759599750.jpg',
  '/src/assets/images/avatar_omar_1794759600042.jpg'
];

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

export function RightDrawer({
  mode,
  chat,
  messages,
  safetyCode,
  inspectMessageId,
  currentUser,
  contacts,
  onClose,
  onSetDisappearing,
  onTogglePin,
  onToggleFavorite,
  onToggleMute,
  onToggleArchive,
  onClearChat,
  onUpdateGroupSettings,
  onInviteMemberToGroup,
  onRemoveMemberFromGroup
}: RightDrawerProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const [isEditingGroup, setIsEditingGroup] = useState(false);
  const [groupTitle, setGroupTitle] = useState('');
  const [groupDesc, setGroupDesc] = useState('');
  const [groupAvatar, setGroupAvatar] = useState('');
  const [groupSavedNotice, setGroupSavedNotice] = useState(false);
  const [groupError, setGroupError] = useState<string | null>(null);
  const [showInvitePicker, setShowInvitePicker] = useState(false);
  const [mediaTab, setMediaTab] = useState<'media' | 'links' | 'docs'>('media');
  const [lightboxMedia, setLightboxMedia] = useState<SharedMediaItem | null>(null);

  const iconInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (chat) {
      setGroupTitle(chat.title);
      setGroupDesc(chat.description);
      setGroupAvatar(chat.avatarUrl);
      setIsEditingGroup(false);
      setShowInvitePicker(false);
      setGroupError(null);
      setMediaTab('media');
      setLightboxMedia(null);
    }
  }, [chat?.id]);

  if (mode === 'none' || !chat) return null;

  const isGroup = chat.type !== 'direct';
  const sharedAssets = mode === 'info' ? extractChatSharedAssets(messages) : null;

  const resolvedMembers: UserProfile[] = chat.memberIds.map((uid) => {
    if (uid === currentUser.uid) return currentUser;
    const found = contacts.find((c) => c.uid === uid);
    if (found) return found;
    return {
      uid,
      displayName: uid,
      about: 'عضو في المجموعة',
      avatarUrl: '',
      publicKeyJwk: '',
      safetyCode: '',
      isOnline: false,
      lastSeenMs: Date.now()
    };
  });

  const invitableContacts = contacts.filter((c) => !chat.memberIds.includes(c.uid));

  const inspectedMsg =
    (inspectMessageId ? messages.find((m) => m.id === inspectMessageId) : null) ||
    messages[messages.length - 1] ||
    null;

  const filteredMessages = searchTerm.trim()
    ? messages.filter((m) =>
        m.payload.text.toLowerCase().includes(searchTerm.trim().toLowerCase())
      )
    : [];

  const handleGroupIconUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    try {
      setGroupError(null);
      const compressed = await compressGroupIcon(file);
      if (!validateAvatarUrl(compressed)) {
        setGroupError('حجم الصورة كبير جداً بعد الضغط.');
        return;
      }
      setGroupAvatar(compressed);
    } catch (err) {
      setGroupError(err instanceof Error ? err.message : 'تعذر تحميل الصورة.');
    }
  };

  const handleSaveGroup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!groupTitle.trim()) {
      setGroupError('اسم المجموعة مطلوب.');
      return;
    }
    setGroupError(null);
    await onUpdateGroupSettings(chat.id, groupTitle.trim(), groupDesc.trim(), groupAvatar);
    setIsEditingGroup(false);
    setGroupSavedNotice(true);
    window.setTimeout(() => setGroupSavedNotice(false), 2500);
  };

  return (
    <aside
      aria-label={
        mode === 'info'
          ? 'معلومات المحادثة'
          : mode === 'search'
            ? 'البحث في الرسائل'
            : 'تفاصيل التشفير التام'
      }
      className="fixed inset-0 md:static z-40 w-full md:w-88 lg:w-96 shrink-0 bg-white dark:bg-[#111B21] border-r border-[#E9EDEF] dark:border-[#222D34] flex flex-col h-full"
    >
      <header className="h-16 px-4 shrink-0 bg-[#F0F2F5] dark:bg-[#202C33] border-b border-[#E9EDEF] dark:border-[#222D34] flex items-center gap-3">
        <button
          type="button"
          aria-label="إغلاق اللوحة الجانبية"
          onClick={onClose}
          className="w-9 h-9 rounded-full flex items-center justify-center text-[#54656F] dark:text-[#AEBAC1] hover:bg-black/5 dark:hover:bg-white/10 cursor-pointer"
        >
          <X className="w-5 h-5" aria-hidden="true" />
        </button>
        <h2 className="font-display text-base font-bold text-[#111B21] dark:text-[#E9EDEF]">
          {mode === 'info'
            ? chat.type === 'direct'
              ? 'معلومات جهة الاتصال'
              : 'معلومات وإعدادات المجموعة'
            : mode === 'search'
              ? 'البحث في الرسائل'
              : 'التحقق من التشفير التام'}
        </h2>
      </header>

      <div className="flex-1 overflow-y-auto p-4 space-y-5">
        {mode === 'info' && (
          <>
            <div className="flex flex-col items-center text-center py-4 border-b border-[#F0F2F5] dark:border-[#222D34]">
              <Avatar
                src={isEditingGroup ? groupAvatar : chat.avatarUrl}
                name={isEditingGroup ? groupTitle : chat.title}
                size="xl"
                isOnline={chat.isOnline}
                isGroup={isGroup}
              />
              <h3 className="mt-4 font-display text-xl font-bold text-[#111B21] dark:text-[#E9EDEF]">
                {chat.title}
              </h3>
              <p className="mt-1 text-sm text-[#54656F] dark:text-[#8696A0]">
                {chat.description || chat.peerAbout || 'متاح'}
              </p>

              {isGroup && !isEditingGroup && (
                <div className="mt-3 flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setGroupTitle(chat.title);
                      setGroupDesc(chat.description);
                      setGroupAvatar(chat.avatarUrl);
                      setIsEditingGroup(true);
                    }}
                    className="px-3 py-1.5 rounded-lg bg-[#F0F2F5] dark:bg-[#202C33] text-xs font-semibold text-[#008069] dark:text-[#06CF9C] flex items-center gap-1.5 hover:brightness-95 cursor-pointer"
                  >
                    <Pencil className="w-3.5 h-3.5" aria-hidden="true" />
                    <span>تعديل إعدادات المجموعة</span>
                  </button>
                  {groupSavedNotice && (
                    <span className="text-xs font-medium text-[#00A884] flex items-center gap-1">
                      <Check className="w-3.5 h-3.5" aria-hidden="true" />
                      تم الحفظ
                    </span>
                  )}
                </div>
              )}
            </div>

            {/* Group Settings Editor */}
            {isGroup && isEditingGroup && (
              <form
                onSubmit={(e) => void handleSaveGroup(e)}
                className="p-3.5 rounded-xl bg-[#F0F2F5] dark:bg-[#202C33] space-y-3 border border-[#E9EDEF] dark:border-[#374248]"
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-[#008069] dark:text-[#06CF9C]">
                    تحديث اسم وأيقونة المجموعة
                  </span>
                  <button
                    type="button"
                    onClick={() => iconInputRef.current?.click()}
                    className="px-2.5 py-1 rounded-md bg-white dark:bg-[#111B21] text-[11px] font-medium text-[#008069] dark:text-[#06CF9C] flex items-center gap-1 cursor-pointer"
                  >
                    <Camera className="w-3 h-3" aria-hidden="true" />
                    <span>تغيير الأيقونة</span>
                  </button>
                  <input
                    ref={iconInputRef}
                    type="file"
                    accept="image/*"
                    aria-label="رفع أيقونة جديدة للمجموعة"
                    onChange={(e) => void handleGroupIconUpload(e)}
                    className="hidden"
                  />
                </div>

                <div className="flex items-center gap-2">
                  {GROUP_ICON_PRESETS.map((preset, idx) => (
                    <button
                      key={preset}
                      type="button"
                      aria-label={`أيقونة مقترحة ${idx + 1}`}
                      onClick={() => setGroupAvatar(preset)}
                      className={`rounded-full p-0.5 cursor-pointer ${
                        groupAvatar === preset ? 'ring-2 ring-[#00A884]' : 'opacity-75'
                      }`}
                    >
                      <Avatar src={preset} name={`أيقونة ${idx + 1}`} size="sm" />
                    </button>
                  ))}
                </div>

                <div>
                  <label htmlFor="edit-group-name" className="block text-[11px] text-[#54656F] dark:text-[#8696A0] mb-1">
                    اسم المجموعة
                  </label>
                  <input
                    id="edit-group-name"
                    type="text"
                    required
                    maxLength={100}
                    value={groupTitle}
                    onChange={(e) => setGroupTitle(e.target.value)}
                    className="w-full rounded-lg bg-white dark:bg-[#111B21] px-3 py-2 text-sm text-[#111B21] dark:text-[#E9EDEF] focus:outline-none focus:ring-2 focus:ring-[#00A884]"
                  />
                </div>

                <div>
                  <label htmlFor="edit-group-desc" className="block text-[11px] text-[#54656F] dark:text-[#8696A0] mb-1">
                    وصف المجموعة
                  </label>
                  <input
                    id="edit-group-desc"
                    type="text"
                    maxLength={300}
                    value={groupDesc}
                    onChange={(e) => setGroupDesc(e.target.value)}
                    className="w-full rounded-lg bg-white dark:bg-[#111B21] px-3 py-2 text-sm text-[#111B21] dark:text-[#E9EDEF] focus:outline-none focus:ring-2 focus:ring-[#00A884]"
                  />
                </div>

                {groupError && (
                  <p role="alert" className="text-xs text-red-600 dark:text-red-400">
                    {groupError}
                  </p>
                )}

                <div className="flex items-center justify-end gap-2 pt-1">
                  <button
                    type="button"
                    onClick={() => setIsEditingGroup(false)}
                    className="px-3 py-1.5 rounded-lg text-xs text-[#54656F] dark:text-[#AEBAC1] cursor-pointer"
                  >
                    إلغاء
                  </button>
                  <button
                    type="submit"
                    className="px-4 py-1.5 rounded-lg bg-[#00A884] text-white text-xs font-semibold hover:bg-[#008069] cursor-pointer"
                  >
                    حفظ التغييرات
                  </button>
                </div>
              </form>
            )}

            {/* Group Members & Invite Contacts Section */}
            {isGroup && (
              <div className="space-y-3 pb-4 border-b border-[#F0F2F5] dark:border-[#222D34]">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-semibold text-[#111B21] dark:text-[#E9EDEF] flex items-center gap-2">
                    <Users className="w-4 h-4 text-[#00A884]" aria-hidden="true" />
                    <span>الأعضاء ({resolvedMembers.length})</span>
                  </span>
                  {invitableContacts.length > 0 && (
                    <button
                      type="button"
                      onClick={() => setShowInvitePicker((v) => !v)}
                      className="px-2.5 py-1 rounded-lg bg-[#E7F8F2] dark:bg-[#005C4B]/40 text-[#008069] dark:text-[#06CF9C] text-xs font-semibold flex items-center gap-1 cursor-pointer"
                    >
                      <UserPlus className="w-3.5 h-3.5" aria-hidden="true" />
                      <span>دعوة عضو</span>
                    </button>
                  )}
                </div>

                {showInvitePicker && invitableContacts.length > 0 && (
                  <div className="p-2.5 rounded-xl bg-[#F0F2F5] dark:bg-[#202C33] space-y-1.5">
                    <p className="text-[11px] font-medium text-[#54656F] dark:text-[#8696A0]">
                      اختر جهة اتصال لدعوتها إلى المجموعة:
                    </p>
                    {invitableContacts.map((contact) => (
                      <button
                        key={contact.uid}
                        type="button"
                        onClick={() => {
                          void onInviteMemberToGroup(chat.id, contact);
                          setShowInvitePicker(false);
                        }}
                        className="w-full p-2 rounded-lg bg-white dark:bg-[#111B21] flex items-center justify-between gap-2 hover:brightness-95 cursor-pointer"
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          <Avatar src={contact.avatarUrl} name={contact.displayName} size="sm" />
                          <span className="text-xs font-semibold text-[#111B21] dark:text-[#E9EDEF] truncate">
                            {contact.displayName}
                          </span>
                        </div>
                        <span className="text-[11px] font-semibold text-[#00A884]">+ دعوة</span>
                      </button>
                    ))}
                  </div>
                )}

                <ul className="space-y-1.5">
                  {resolvedMembers.map((member) => {
                    const isMe = member.uid === currentUser.uid;
                    return (
                      <li
                        key={member.uid}
                        className="p-2 rounded-xl flex items-center justify-between gap-2 bg-[#F8FAFB] dark:bg-[#182229]"
                      >
                        <div className="flex items-center gap-2.5 min-w-0">
                          <Avatar
                            src={member.avatarUrl}
                            name={member.displayName}
                            size="sm"
                            isOnline={member.isOnline}
                          />
                          <div className="min-w-0">
                            <p className="text-xs font-semibold text-[#111B21] dark:text-[#E9EDEF] truncate">
                              {isMe ? `${member.displayName} (أنت)` : member.displayName}
                            </p>
                            <p className="text-[10px] text-[#54656F] dark:text-[#8696A0]">
                              {isMe ? 'مشرف المجموعة · مفتاح مشفر' : 'عضو · AES-GCM-256'}
                            </p>
                          </div>
                        </div>

                        {!isMe && (
                          <button
                            type="button"
                            aria-label={`إزالة ${member.displayName} من المجموعة`}
                            onClick={() => void onRemoveMemberFromGroup(chat.id, member.uid)}
                            className="p-1.5 rounded-md text-red-500 hover:bg-red-50 dark:hover:bg-red-950/30 cursor-pointer"
                          >
                            <UserMinus className="w-3.5 h-3.5" aria-hidden="true" />
                          </button>
                        )}
                      </li>
                    );
                  })}
                </ul>
              </div>
            )}

            {/* Media, Links, and Docs Section */}
            {sharedAssets && (
              <section
                aria-label="الوسائط والروابط والمستندات"
                className="space-y-3 pb-4 border-b border-[#F0F2F5] dark:border-[#222D34]"
              >
                <div className="flex items-center justify-between">
                  <span className="text-sm font-semibold text-[#111B21] dark:text-[#E9EDEF] flex items-center gap-2">
                    <ImageIcon className="w-4 h-4 text-[#00A884]" aria-hidden="true" />
                    <span>الوسائط والروابط والمستندات</span>
                  </span>
                  <span className="font-mono-code text-xs font-semibold text-[#54656F] dark:text-[#8696A0]">
                    {sharedAssets.totalCount}
                  </span>
                </div>

                <div
                  role="tablist"
                  aria-label="أقسام الملفات المشتركة"
                  className="grid grid-cols-3 gap-1 p-1 rounded-xl bg-[#F0F2F5] dark:bg-[#202C33]"
                >
                  {[
                    {
                      id: 'media' as const,
                      label: 'الوسائط',
                      count: sharedAssets.media.length,
                      icon: ImageIcon
                    },
                    {
                      id: 'links' as const,
                      label: 'الروابط',
                      count: sharedAssets.links.length,
                      icon: Link2
                    },
                    {
                      id: 'docs' as const,
                      label: 'المستندات',
                      count: sharedAssets.docs.length,
                      icon: FileText
                    }
                  ].map((tab) => {
                    const Icon = tab.icon;
                    const active = mediaTab === tab.id;
                    return (
                      <button
                        key={tab.id}
                        type="button"
                        role="tab"
                        aria-selected={active}
                        onClick={() => setMediaTab(tab.id)}
                        className={`py-1.5 px-2 rounded-lg text-[11px] font-semibold flex items-center justify-center gap-1 cursor-pointer ${
                          active
                            ? 'bg-white dark:bg-[#111B21] text-[#008069] dark:text-[#06CF9C] shadow-xs'
                            : 'bg-transparent text-[#54656F] dark:text-[#AEBAC1] hover:text-[#111B21] dark:hover:text-[#E9EDEF]'
                        }`}
                      >
                        <Icon className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                        <span>{tab.label}</span>
                        <span className="font-mono-code text-[10px] opacity-80">({tab.count})</span>
                      </button>
                    );
                  })}
                </div>

                {mediaTab === 'media' && (
                  sharedAssets.media.length === 0 ? (
                    <p className="py-5 text-center text-xs text-[#667781] dark:text-[#8696A0]">
                      لا توجد صور أو وسائط مشتركة في هذه المحادثة بعد.
                    </p>
                  ) : (
                    <div className="grid grid-cols-3 gap-1.5">
                      {sharedAssets.media.map((item) => (
                        <button
                          key={item.id}
                          type="button"
                          aria-label={`معاينة الصورة من ${item.senderName}`}
                          onClick={() => setLightboxMedia(item)}
                          className="group relative aspect-square rounded-lg overflow-hidden bg-[#F0F2F5] dark:bg-[#202C33] border border-[#E9EDEF] dark:border-[#222D34] cursor-pointer"
                        >
                          <img
                            src={item.mediaUrl}
                            alt={item.caption || 'صورة مشتركة'}
                            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-200"
                          />
                        </button>
                      ))}
                    </div>
                  )
                )}

                {mediaTab === 'links' && (
                  sharedAssets.links.length === 0 ? (
                    <p className="py-5 text-center text-xs text-[#667781] dark:text-[#8696A0]">
                      لا توجد روابط مشتركة في هذه المحادثة بعد.
                    </p>
                  ) : (
                    <ul className="space-y-2">
                      {sharedAssets.links.map((link) => (
                        <li
                          key={link.id}
                          className="p-2.5 rounded-xl bg-[#F8FAFB] dark:bg-[#182229] border border-[#E9EDEF] dark:border-[#222D34] space-y-1.5"
                        >
                          <div className="flex items-center justify-between gap-2">
                            <span
                              dir="ltr"
                              className="inline-flex items-center gap-1 text-[11px] font-semibold text-[#008069] dark:text-[#06CF9C] truncate"
                            >
                              <Link2 className="w-3 h-3 shrink-0" aria-hidden="true" />
                              {link.hostname}
                            </span>
                            <span className="font-mono-code text-[10px] text-[#667781] dark:text-[#8696A0] shrink-0">
                              {formatWhatsAppTime(link.createdAtMs)}
                            </span>
                          </div>
                          <a
                            href={link.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            dir="ltr"
                            className="flex items-center justify-between gap-2 text-xs text-[#027EB5] dark:text-[#53BDEB] hover:underline break-all"
                          >
                            <span className="line-clamp-1">{link.url}</span>
                            <ExternalLink className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                          </a>
                          <p className="text-[11px] text-[#54656F] dark:text-[#8696A0] line-clamp-2">
                            {link.senderName}: {link.textSnippet}
                          </p>
                        </li>
                      ))}
                    </ul>
                  )
                )}

                {mediaTab === 'docs' && (
                  sharedAssets.docs.length === 0 ? (
                    <p className="py-5 text-center text-xs text-[#667781] dark:text-[#8696A0]">
                      لا توجد مستندات أو ملفات مشتركة في هذه المحادثة بعد.
                    </p>
                  ) : (
                    <ul className="space-y-2">
                      {sharedAssets.docs.map((doc) => {
                        const ext = doc.fileName.includes('.')
                          ? doc.fileName.split('.').pop()?.toUpperCase() || 'FILE'
                          : 'FILE';
                        return (
                          <li
                            key={doc.id}
                            className="p-2.5 rounded-xl bg-[#F8FAFB] dark:bg-[#182229] border border-[#E9EDEF] dark:border-[#222D34] flex items-center gap-3"
                          >
                            <div className="w-10 h-10 rounded-lg bg-[#E7F8F2] dark:bg-[#005C4B]/40 text-[#008069] dark:text-[#06CF9C] flex flex-col items-center justify-center shrink-0">
                              <FileText className="w-4 h-4" aria-hidden="true" />
                              <span className="font-mono-code text-[9px] font-bold leading-none mt-0.5">
                                {ext.slice(0, 4)}
                              </span>
                            </div>
                            <div className="min-w-0 flex-1">
                              <p
                                dir="ltr"
                                className="text-xs font-semibold text-[#111B21] dark:text-[#E9EDEF] truncate text-right"
                              >
                                {doc.fileName}
                              </p>
                              <div className="mt-0.5 flex items-center justify-between text-[11px] text-[#54656F] dark:text-[#8696A0]">
                                <span className="truncate">{doc.senderName}</span>
                                <span className="font-mono-code shrink-0">
                                  {doc.fileSizeLabel} · {formatWhatsAppTime(doc.createdAtMs)}
                                </span>
                              </div>
                            </div>
                          </li>
                        );
                      })}
                    </ul>
                  )
                )}
              </section>
            )}

            {/* Disappearing Messages Selector */}
            <div className="space-y-2 pb-4 border-b border-[#F0F2F5] dark:border-[#222D34]">
              <div className="flex items-center gap-2 text-sm font-semibold text-[#111B21] dark:text-[#E9EDEF]">
                <Timer className="w-4 h-4 text-[#00A884]" aria-hidden="true" />
                <span>الرسائل ذاتية الاختفاء</span>
              </div>
              <p className="text-xs text-[#54656F] dark:text-[#8696A0]">
                الحالة الحالية: {formatDisappearingLabel(chat.disappearingSeconds)}
              </p>
              <div className="grid grid-cols-4 gap-1.5 pt-1">
                {[
                  { sec: 0, label: 'إيقاف' },
                  { sec: 86400, label: '٢٤ ساعة' },
                  { sec: 604800, label: '٧ أيام' },
                  { sec: 7776000, label: '٩٠ يوماً' }
                ].map((opt) => (
                  <button
                    key={opt.sec}
                    type="button"
                    onClick={() => onSetDisappearing(chat.id, opt.sec)}
                    className={`py-1.5 rounded-lg text-xs font-medium transition-colors cursor-pointer ${
                      chat.disappearingSeconds === opt.sec
                        ? 'bg-[#00A884] text-white'
                        : 'bg-[#F0F2F5] dark:bg-[#202C33] text-[#54656F] dark:text-[#AEBAC1] hover:bg-[#E9EDEF]'
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Actions */}
            <div className="space-y-1">
              <button
                type="button"
                onClick={() => onTogglePin(chat.id)}
                className="w-full px-3 py-2.5 rounded-xl flex items-center justify-between hover:bg-[#F5F6F6] dark:hover:bg-[#202C33] text-sm cursor-pointer"
              >
                <span className="flex items-center gap-3 text-[#111B21] dark:text-[#E9EDEF]">
                  <Pin className="w-4 h-4 text-[#54656F]" aria-hidden="true" />
                  <span>{chat.pinned ? 'إلغاء تثبيت المحادثة' : 'تثبيت المحادثة'}</span>
                </span>
              </button>
              <button
                type="button"
                onClick={() => onToggleFavorite(chat.id)}
                className="w-full px-3 py-2.5 rounded-xl flex items-center justify-between hover:bg-[#F5F6F6] dark:hover:bg-[#202C33] text-sm cursor-pointer"
              >
                <span className="flex items-center gap-3 text-[#111B21] dark:text-[#E9EDEF]">
                  <Heart className="w-4 h-4 text-[#00A884]" aria-hidden="true" />
                  <span>{chat.favorite ? 'إزالة من المفضلة' : 'إضافة إلى المفضلة'}</span>
                </span>
              </button>
              <button
                type="button"
                onClick={() => onToggleMute(chat.id)}
                className="w-full px-3 py-2.5 rounded-xl flex items-center justify-between hover:bg-[#F5F6F6] dark:hover:bg-[#202C33] text-sm cursor-pointer"
              >
                <span className="flex items-center gap-3 text-[#111B21] dark:text-[#E9EDEF]">
                  <VolumeX className="w-4 h-4 text-[#54656F]" aria-hidden="true" />
                  <span>{chat.muted ? 'إلغاء كتم الإشعارات' : 'كتم الإشعارات'}</span>
                </span>
              </button>
              <button
                type="button"
                onClick={() => onToggleArchive(chat.id)}
                className="w-full px-3 py-2.5 rounded-xl flex items-center justify-between hover:bg-[#F5F6F6] dark:hover:bg-[#202C33] text-sm cursor-pointer"
              >
                <span className="flex items-center gap-3 text-[#111B21] dark:text-[#E9EDEF]">
                  <Archive className="w-4 h-4 text-[#54656F]" aria-hidden="true" />
                  <span>{chat.archived ? 'إلغاء الأرشفة' : 'أرشفة الدردشة'}</span>
                </span>
              </button>
              <button
                type="button"
                onClick={() => onClearChat(chat.id)}
                className="w-full px-3 py-2.5 rounded-xl flex items-center gap-3 hover:bg-red-50 dark:hover:bg-red-950/30 text-sm text-red-600 dark:text-red-400 cursor-pointer"
              >
                <Trash2 className="w-4 h-4" aria-hidden="true" />
                <span>مسح سجل المحادثة</span>
              </button>
            </div>
          </>
        )}

        {mode === 'search' && (
          <div className="space-y-4">
            <div className="flex items-center bg-[#F0F2F5] dark:bg-[#202C33] rounded-lg px-3 h-10">
              <Search className="w-4 h-4 text-[#54656F] ml-2" aria-hidden="true" />
              <input
                type="search"
                autoFocus
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="ابحث داخل الرسائل المفكوكة..."
                className="w-full bg-transparent text-sm text-[#111B21] dark:text-[#E9EDEF] focus:outline-none"
              />
            </div>

            {!searchTerm.trim() ? (
              <p className="text-xs text-center text-[#667781] dark:text-[#8696A0] py-8">
                اكتب كلمة مفتاحية للبحث الفوري في رسائل هذه المحادثة المشفرة.
              </p>
            ) : filteredMessages.length === 0 ? (
              <p className="text-xs text-center text-[#667781] dark:text-[#8696A0] py-8">
                لم يتم العثور على نتائج مطابقة.
              </p>
            ) : (
              <ul className="divide-y divide-[#F0F2F5] dark:divide-[#222D34]">
                {filteredMessages.map((msg) => (
                  <li key={msg.id} className="py-2.5">
                    <div className="flex items-center justify-between text-[11px] text-[#667781] dark:text-[#8696A0]">
                      <span className="font-semibold">{msg.senderName}</span>
                      <span className="font-mono-code">{formatWhatsAppTime(msg.createdAtMs)}</span>
                    </div>
                    <p className="mt-1 text-sm text-[#111B21] dark:text-[#E9EDEF]">
                      {msg.payload.text}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        {mode === 'encryption' && (
          <div className="space-y-5">
            <div className="p-4 rounded-2xl bg-[#D9FDD3]/40 dark:bg-[#0A332C]/60 border border-[#00A884]/25 text-center">
              <div className="w-12 h-12 rounded-full bg-[#00A884] text-white flex items-center justify-center mx-auto mb-3">
                <ShieldCheck className="w-6 h-6" aria-hidden="true" />
              </div>
              <h3 className="font-display text-base font-bold text-[#111B21] dark:text-[#E9EDEF]">
                تشفير تام بين الطرفين نشط
              </h3>
              <p className="mt-1.5 text-xs text-[#54656F] dark:text-[#AEBAC1] leading-relaxed">
                يتم اشتقاق مفتاح الجلسة عبر ECDH P-256 وتشفير كل رسالة بمفتاح AES-GCM 256-bit قبل إرسالها إلى Firebase Firestore.
              </p>
            </div>

            <div className="space-y-2">
              <div className="flex items-center gap-2 text-xs font-semibold text-[#111B21] dark:text-[#E9EDEF]">
                <KeyRound className="w-4 h-4 text-[#00A884]" aria-hidden="true" />
                <span>رقم الأمان (60 خانة للتحقق)</span>
              </div>
              <div
                dir="ltr"
                className="p-3.5 rounded-xl bg-[#F0F2F5] dark:bg-[#202C33] font-mono-code text-xs tracking-wider leading-6 text-center text-[#111B21] dark:text-[#E9EDEF]"
              >
                {safetyCode}
              </div>
            </div>

            {inspectedMsg && (
              <div className="space-y-2 pt-2 border-t border-[#F0F2F5] dark:border-[#222D34]">
                <div className="flex items-center gap-2 text-xs font-semibold text-[#111B21] dark:text-[#E9EDEF]">
                  <Lock className="w-4 h-4 text-[#00A884]" aria-hidden="true" />
                  <span>فحص حمولة التشفير في قاعدة البيانات</span>
                </div>
                <div className="rounded-xl bg-[#0C1317] text-[#E9EDEF] p-3.5 space-y-2 text-[11px] font-mono-code" dir="ltr">
                  <div>
                    <span className="text-[#06CF9C]">Algorithm:</span> {inspectedMsg.algorithm}
                  </div>
                  <div className="break-all">
                    <span className="text-[#06CF9C]">IV (96-bit):</span> {inspectedMsg.iv}
                  </div>
                  <div className="break-all">
                    <span className="text-[#06CF9C]">Ciphertext:</span>{' '}
                    {inspectedMsg.ciphertext.slice(0, 120)}
                    {inspectedMsg.ciphertext.length > 120 ? '...' : ''}
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Media Lightbox Preview */}
      {lightboxMedia && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="عرض الوسائط المشتركة"
          className="fixed inset-0 z-50 bg-black/85 flex flex-col justify-between p-4"
        >
          <div className="flex items-center justify-between text-white">
            <div>
              <p className="text-sm font-semibold">{lightboxMedia.senderName}</p>
              <p className="text-xs text-white/70 font-mono-code">
                {formatWhatsAppTime(lightboxMedia.createdAtMs)}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <a
                href={lightboxMedia.mediaUrl}
                download
                aria-label="تنزيل الصورة"
                className="w-9 h-9 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-white"
              >
                <Download className="w-4 h-4" aria-hidden="true" />
              </a>
              <button
                type="button"
                aria-label="إغلاق معاينة الصورة"
                onClick={() => setLightboxMedia(null)}
                className="w-9 h-9 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-white cursor-pointer"
              >
                <X className="w-5 h-5" aria-hidden="true" />
              </button>
            </div>
          </div>

          <div className="flex-1 flex items-center justify-center py-4 overflow-hidden">
            <img
              src={lightboxMedia.mediaUrl}
              alt={lightboxMedia.caption || 'صورة مشتركة'}
              className="max-h-full max-w-full rounded-xl object-contain"
            />
          </div>

          {lightboxMedia.caption && (
            <p className="text-center text-sm text-white/90 pb-2">{lightboxMedia.caption}</p>
          )}
        </div>
      )}
    </aside>
  );
}
