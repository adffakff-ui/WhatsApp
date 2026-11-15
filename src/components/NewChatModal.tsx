import { useRef, useState } from 'react';
import { X, Users, MessageSquarePlus, Lock, Camera } from 'lucide-react';
import { Avatar } from './Avatar';
import { validateAvatarUrl } from '../lib/chatLogic';
import type { UserProfile } from '../types/chat';

interface NewChatModalProps {
  mode: 'direct' | 'group' | null;
  contacts: UserProfile[];
  onClose: () => void;
  onCreateDirectChat: (name: string, peerUid?: string) => Promise<void>;
  onCreateGroupChat: (
    title: string,
    description: string,
    memberUids: string[],
    avatarUrl?: string
  ) => Promise<void>;
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

export function NewChatModal({
  mode,
  contacts,
  onClose,
  onCreateDirectChat,
  onCreateGroupChat
}: NewChatModalProps) {
  const [contactInput, setContactInput] = useState('');
  const [groupTitle, setGroupTitle] = useState('');
  const [groupDesc, setGroupDesc] = useState('');
  const [groupAvatar, setGroupAvatar] = useState(GROUP_ICON_PRESETS[0]);
  const [selectedUids, setSelectedUids] = useState<string[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const iconInputRef = useRef<HTMLInputElement>(null);

  if (!mode) return null;

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
      setErrorMsg(err instanceof Error ? err.message : 'تعذر تحميل أيقونة المجموعة.');
    }
  };

  const handleSubmitDirect = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!contactInput.trim()) return;
    setIsSubmitting(true);
    try {
      await onCreateDirectChat(contactInput.trim());
      setContactInput('');
      onClose();
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSubmitGroup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!groupTitle.trim()) return;
    setIsSubmitting(true);
    setErrorMsg(null);
    try {
      await onCreateGroupChat(groupTitle.trim(), groupDesc.trim(), selectedUids, groupAvatar);
      setGroupTitle('');
      setGroupDesc('');
      setGroupAvatar(GROUP_ICON_PRESETS[0]);
      setSelectedUids([]);
      onClose();
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={mode === 'direct' ? 'بدء دردشة مشفرة جديدة' : 'إنشاء مجموعة جديدة'}
      className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4"
    >
      <div className="w-full max-w-md bg-white dark:bg-[#202C33] rounded-2xl shadow-2xl border border-[#E9EDEF] dark:border-[#374248] overflow-hidden">
        <header className="px-5 py-4 bg-[#008069] text-white flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            {mode === 'direct' ? (
              <MessageSquarePlus className="w-5 h-5" aria-hidden="true" />
            ) : (
              <Users className="w-5 h-5" aria-hidden="true" />
            )}
            <h2 className="font-display text-base font-bold">
              {mode === 'direct' ? 'دردشة مشفرة جديدة' : 'إنشاء مجموعة جديدة'}
            </h2>
          </div>
          <button
            type="button"
            aria-label="إغلاق"
            onClick={onClose}
            className="p-1 rounded-full hover:bg-white/15 cursor-pointer"
          >
            <X className="w-5 h-5" aria-hidden="true" />
          </button>
        </header>

        {mode === 'direct' ? (
          <form onSubmit={(e) => void handleSubmitDirect(e)} className="p-5 space-y-4">
            <div>
              <label htmlFor="new-chat-name" className="block text-xs font-medium text-[#54656F] dark:text-[#8696A0] mb-1.5">
                اسم جهة الاتصال أو معرف المستخدم (UID)
              </label>
              <input
                id="new-chat-name"
                type="text"
                required
                value={contactInput}
                onChange={(e) => setContactInput(e.target.value)}
                placeholder="مثال: طارق العتيبي"
                className="w-full rounded-lg bg-[#F0F2F5] dark:bg-[#2A3942] px-3 py-2.5 text-sm text-[#111B21] dark:text-[#E9EDEF] focus:outline-none focus:ring-2 focus:ring-[#00A884]"
              />
            </div>

            <div>
              <p className="text-xs font-semibold text-[#008069] dark:text-[#06CF9C] mb-2">
                جهات الاتصال المتاحة
              </p>
              <ul className="space-y-1 max-h-48 overflow-y-auto">
                {contacts.map((c) => (
                  <li key={c.uid}>
                    <button
                      type="button"
                      onClick={() => {
                        void onCreateDirectChat(c.displayName, c.uid).then(onClose);
                      }}
                      className="w-full p-2 rounded-xl flex items-center gap-3 hover:bg-[#F5F6F6] dark:hover:bg-[#182229] text-right cursor-pointer"
                    >
                      <Avatar src={c.avatarUrl} name={c.displayName} size="sm" isOnline={c.isOnline} />
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-semibold text-[#111B21] dark:text-[#E9EDEF] truncate">
                          {c.displayName}
                        </p>
                        <p className="text-xs text-[#54656F] dark:text-[#8696A0] truncate">{c.about}</p>
                      </div>
                    </button>
                  </li>
                ))}
              </ul>
            </div>

            <div className="flex items-center justify-between pt-2">
              <span className="text-[11px] text-[#54656F] dark:text-[#8696A0] flex items-center gap-1">
                <Lock className="w-3 h-3 text-[#00A884]" aria-hidden="true" />
                مفتاح جلسة فريد
              </span>
              <button
                type="submit"
                disabled={isSubmitting}
                className="px-5 py-2 rounded-lg bg-[#00A884] text-white text-xs font-semibold hover:bg-[#008069] disabled:opacity-60 cursor-pointer"
              >
                {isSubmitting ? 'جاري الإنشاء...' : 'بدء المحادثة'}
              </button>
            </div>
          </form>
        ) : (
          <form onSubmit={(e) => void handleSubmitGroup(e)} className="p-5 space-y-4">
            {/* Group Icon Picker & Upload */}
            <div className="flex items-center gap-4">
              <div className="relative">
                <Avatar src={groupAvatar} name={groupTitle || 'مجموعة'} size="lg" isGroup />
                <button
                  type="button"
                  aria-label="رفع أيقونة المجموعة"
                  onClick={() => iconInputRef.current?.click()}
                  className="absolute -bottom-1 -left-1 w-7 h-7 rounded-full bg-[#00A884] text-white flex items-center justify-center shadow-md hover:bg-[#008069] cursor-pointer"
                >
                  <Camera className="w-3.5 h-3.5" aria-hidden="true" />
                </button>
                <input
                  ref={iconInputRef}
                  type="file"
                  accept="image/*"
                  aria-label="اختيار صورة أيقونة المجموعة"
                  onChange={(e) => void handleGroupIconUpload(e)}
                  className="hidden"
                />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-semibold text-[#111B21] dark:text-[#E9EDEF] mb-1.5">
                  أيقونة المجموعة
                </p>
                <div className="flex items-center gap-2">
                  {GROUP_ICON_PRESETS.map((preset, idx) => (
                    <button
                      key={preset}
                      type="button"
                      aria-label={`اختيار أيقونة المجموعة ${idx + 1}`}
                      onClick={() => setGroupAvatar(preset)}
                      className={`rounded-full p-0.5 cursor-pointer ${
                        groupAvatar === preset ? 'ring-2 ring-[#00A884]' : 'opacity-75 hover:opacity-100'
                      }`}
                    >
                      <Avatar src={preset} name={`أيقونة ${idx + 1}`} size="sm" />
                    </button>
                  ))}
                  <button
                    type="button"
                    onClick={() => iconInputRef.current?.click()}
                    className="px-2 py-1 rounded-md bg-[#F0F2F5] dark:bg-[#2A3942] text-[11px] font-medium text-[#008069] dark:text-[#06CF9C] cursor-pointer"
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
                اسم المجموعة
              </label>
              <input
                id="group-title"
                type="text"
                required
                maxLength={100}
                value={groupTitle}
                onChange={(e) => setGroupTitle(e.target.value)}
                placeholder="مثال: فريق إطلاق التطبيق"
                className="w-full rounded-lg bg-[#F0F2F5] dark:bg-[#2A3942] px-3 py-2 text-sm text-[#111B21] dark:text-[#E9EDEF] focus:outline-none focus:ring-2 focus:ring-[#00A884]"
              />
            </div>

            <div>
              <label htmlFor="group-desc" className="block text-xs font-medium text-[#54656F] dark:text-[#8696A0] mb-1">
                وصف المجموعة (اختياري)
              </label>
              <input
                id="group-desc"
                type="text"
                maxLength={300}
                value={groupDesc}
                onChange={(e) => setGroupDesc(e.target.value)}
                placeholder="هدف المجموعة وقواعدها"
                className="w-full rounded-lg bg-[#F0F2F5] dark:bg-[#2A3942] px-3 py-2 text-sm text-[#111B21] dark:text-[#E9EDEF] focus:outline-none focus:ring-2 focus:ring-[#00A884]"
              />
            </div>

            <div>
              <p className="text-xs font-semibold text-[#008069] dark:text-[#06CF9C] mb-2">
                دعوة جهات الاتصال ({selectedUids.length})
              </p>
              <ul className="space-y-1 max-h-48 overflow-y-auto">
                {contacts.map((c) => {
                  const checked = selectedUids.includes(c.uid);
                  return (
                    <li key={c.uid}>
                      <label className="w-full p-2 rounded-xl flex items-center justify-between gap-3 hover:bg-[#F5F6F6] dark:hover:bg-[#182229] cursor-pointer">
                        <div className="flex items-center gap-3 min-w-0">
                          <Avatar src={c.avatarUrl} name={c.displayName} size="sm" />
                          <span className="text-sm font-medium text-[#111B21] dark:text-[#E9EDEF] truncate">
                            {c.displayName}
                          </span>
                        </div>
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => toggleMember(c.uid)}
                          className="w-4 h-4 accent-[#00A884]"
                        />
                      </label>
                    </li>
                  );
                })}
              </ul>
            </div>

            <div className="flex items-center justify-between gap-2 pt-2">
              <span className="text-[11px] text-[#54656F] dark:text-[#8696A0] flex items-center gap-1">
                <Lock className="w-3 h-3 text-[#00A884]" aria-hidden="true" />
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
                  className="px-5 py-2 rounded-lg bg-[#00A884] text-white text-xs font-semibold hover:bg-[#008069] disabled:opacity-60 cursor-pointer"
                >
                  {isSubmitting ? 'جاري الإنشاء...' : 'إنشاء المجموعة'}
                </button>
              </div>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
