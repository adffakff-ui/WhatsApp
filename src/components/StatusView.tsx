import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Plus,
  Eye,
  X,
  ChevronLeft,
  ChevronRight,
  Image as ImageIcon,
  Type,
  Clock,
  Users,
  Trash2,
  Pause,
  Play,
  Upload,
  Check
} from 'lucide-react';
import { Avatar } from './Avatar';
import {
  filterActiveStatuses,
  formatRemainingStatusTime,
  formatWhatsAppTime,
  MAX_STATUS_MEDIA_BYTES,
  resolveStatusViewerIds
} from '../lib/chatLogic';
import type { StatusItem, UserProfile } from '../types/chat';

export interface PublishStatusPayload {
  type: 'text' | 'image';
  content: string;
  backgroundColor: string;
  fontStyle?: 'display' | 'sans' | 'mono';
  mediaUrl?: string;
  viewerIds: string[];
}

interface StatusViewProps {
  statuses: StatusItem[];
  currentUser: UserProfile;
  contacts: UserProfile[];
  onPublishStatus: (payload: PublishStatusPayload) => Promise<void>;
  onMarkViewed: (statusId: string) => void;
  onDeleteStatus: (statusId: string) => Promise<void>;
}

const BG_SWATCHES = ['#005C4B', '#1E3A5F', '#5B2C6F', '#78281F', '#1B2631'];

const FONT_STYLES: { id: 'display' | 'sans' | 'mono'; label: string; className: string }[] = [
  { id: 'display', label: 'عريض', className: 'font-display font-bold' },
  { id: 'sans', label: 'ناعم', className: 'font-sans font-medium' },
  { id: 'mono', label: 'أحادي', className: 'font-mono-code font-semibold' }
];

const SAMPLE_STATUS_PHOTOS = [
  {
    label: 'غروب العلا',
    url: '/src/assets/images/status_desert_sunset_1794759601351.jpg'
  }
];

async function compressStatusImageFile(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('تعذر قراءة الصورة المختارة.'));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error('الملف المختار ليس صورة صالحة.'));
      img.onload = () => {
        const maxSide = 720;
        const scale = Math.min(1, maxSide / Math.max(img.width, img.height));
        const width = Math.max(1, Math.round(img.width * scale));
        const height = Math.max(1, Math.round(img.height * scale));
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          reject(new Error('تعذر معالجة الصورة.'));
          return;
        }
        ctx.drawImage(img, 0, 0, width, height);
        let quality = 0.76;
        let dataUrl = canvas.toDataURL('image/jpeg', quality);
        while (dataUrl.length > MAX_STATUS_MEDIA_BYTES && quality > 0.35) {
          quality -= 0.12;
          dataUrl = canvas.toDataURL('image/jpeg', quality);
        }
        resolve(dataUrl);
      };
      img.src = reader.result as string;
    };
    reader.readAsDataURL(file);
  });
}

export function StatusView({
  statuses,
  currentUser,
  contacts,
  onPublishStatus,
  onMarkViewed,
  onDeleteStatus
}: StatusViewProps) {
  const [viewerQueue, setViewerQueue] = useState<StatusItem[] | null>(null);
  const [viewerIndex, setViewerIndex] = useState<number>(0);
  const [isPaused, setIsPaused] = useState(false);
  const [progress, setProgress] = useState(0);

  const [showComposer, setShowComposer] = useState(false);
  const [composeMode, setComposeMode] = useState<'text' | 'image'>('text');
  const [content, setContent] = useState('');
  const [bgColor, setBgColor] = useState(BG_SWATCHES[0]);
  const [fontStyle, setFontStyle] = useState<'display' | 'sans' | 'mono'>('display');
  const [mediaUrl, setMediaUrl] = useState('');
  const [audienceMode, setAudienceMode] = useState<'all_contacts' | 'selected'>('all_contacts');
  const [selectedContactIds, setSelectedContactIds] = useState<string[]>([]);
  const [isPublishing, setIsPublishing] = useState(false);
  const [composeError, setComposeError] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const activeStatuses = useMemo(() => filterActiveStatuses(statuses), [statuses]);

  const myStatuses = useMemo(
    () => activeStatuses.filter((s) => s.authorId === currentUser.uid),
    [activeStatuses, currentUser.uid]
  );

  const unviewedContactStatuses = useMemo(
    () => activeStatuses.filter((s) => s.authorId !== currentUser.uid && !s.viewedByMe),
    [activeStatuses, currentUser.uid]
  );

  const viewedContactStatuses = useMemo(
    () => activeStatuses.filter((s) => s.authorId !== currentUser.uid && s.viewedByMe),
    [activeStatuses, currentUser.uid]
  );

  const activeStory =
    viewerQueue && viewerIndex >= 0 && viewerIndex < viewerQueue.length
      ? activeStatuses.find((s) => s.id === viewerQueue[viewerIndex].id) || viewerQueue[viewerIndex]
      : null;

  useEffect(() => {
    if (!viewerQueue || !activeStory || isPaused) return;
    onMarkViewed(activeStory.id);
    const interval = window.setInterval(() => {
      setProgress((p) => {
        if (p >= 100) {
          if (viewerIndex < viewerQueue.length - 1) {
            setViewerIndex((idx) => idx + 1);
          } else {
            setViewerQueue(null);
          }
          return 0;
        }
        return p + 2;
      });
    }, 100);
    return () => window.clearInterval(interval);
  }, [viewerQueue, viewerIndex, activeStory?.id, isPaused]);

  useEffect(() => {
    setProgress(0);
  }, [viewerIndex, activeStory?.id]);

  useEffect(() => {
    if (!viewerQueue) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setViewerQueue(null);
      } else if (e.key === 'ArrowLeft') {
        if (viewerIndex < viewerQueue.length - 1) {
          setViewerIndex((i) => i + 1);
        } else {
          setViewerQueue(null);
        }
      } else if (e.key === 'ArrowRight') {
        setViewerIndex((i) => (i > 0 ? i - 1 : 0));
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [viewerQueue, viewerIndex]);

  const openViewerForList = (list: StatusItem[], startIndex: number) => {
    if (list.length === 0) return;
    setViewerQueue(list);
    setViewerIndex(startIndex);
    setProgress(0);
    setIsPaused(false);
    onMarkViewed(list[startIndex].id);
  };

  const openComposer = (mode: 'text' | 'image') => {
    setComposeMode(mode);
    setContent('');
    setMediaUrl('');
    setComposeError(null);
    setAudienceMode('all_contacts');
    setSelectedContactIds(contacts.map((c) => c.uid));
    setShowComposer(true);
  };

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    try {
      setComposeError(null);
      const compressed = await compressStatusImageFile(file);
      if (compressed.length > MAX_STATUS_MEDIA_BYTES) {
        setComposeError('حجم الصورة يتجاوز الحد المسموح حتى بعد الضغط. يرجى اختيار صورة أصغر.');
        return;
      }
      setMediaUrl(compressed);
    } catch (err) {
      setComposeError(err instanceof Error ? err.message : 'تعذر تحميل الصورة.');
    }
  };

  const toggleSelectedContact = (uid: string) => {
    setSelectedContactIds((prev) =>
      prev.includes(uid) ? prev.filter((id) => id !== uid) : [...prev, uid]
    );
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setComposeError(null);

    if (composeMode === 'text' && !content.trim()) {
      setComposeError('يرجى كتابة نص الحالة قبل النشر.');
      return;
    }
    if (composeMode === 'image' && !mediaUrl) {
      setComposeError('يرجى رفع صورة أو اختيار صورة قبل النشر.');
      return;
    }

    const allContactUids = contacts.map((c) => c.uid);
    const chosenContacts =
      audienceMode === 'selected' ? selectedContactIds : allContactUids;

    if (audienceMode === 'selected' && chosenContacts.length === 0) {
      setComposeError('اختر جهة اتصال واحدة على الأقل لمشاركة الحالة معها.');
      return;
    }

    const viewerIds = resolveStatusViewerIds(currentUser.uid, allContactUids, chosenContacts);

    setIsPublishing(true);
    try {
      await onPublishStatus({
        type: composeMode,
        content: content.trim(),
        backgroundColor: bgColor,
        fontStyle,
        ...(composeMode === 'image' ? { mediaUrl } : {}),
        viewerIds
      });
      setContent('');
      setMediaUrl('');
      setShowComposer(false);
    } finally {
      setIsPublishing(false);
    }
  };

  const handleDelete = async (statusId: string) => {
    await onDeleteStatus(statusId);
    if (viewerQueue) {
      const remaining = viewerQueue.filter((s) => s.id !== statusId);
      if (remaining.length === 0) {
        setViewerQueue(null);
      } else {
        setViewerQueue(remaining);
        setViewerIndex((idx) => Math.min(idx, remaining.length - 1));
      }
    }
  };

  const activeFontClass =
    FONT_STYLES.find((f) => f.id === (activeStory?.fontStyle || 'display'))?.className ||
    'font-display font-bold';
  const composerFontClass =
    FONT_STYLES.find((f) => f.id === fontStyle)?.className || 'font-display font-bold';

  return (
    <div className="flex-1 flex flex-col md:flex-row h-full bg-white dark:bg-[#111B21]">
      {/* Left Status Sidebar */}
      <div className="w-full md:w-96 border-l border-[#E9EDEF] dark:border-[#222D34] flex flex-col h-full">
        <header className="h-16 px-4 flex items-center justify-between border-b border-[#F0F2F5] dark:border-[#222D34]">
          <h1 className="font-display text-xl font-bold text-[#111B21] dark:text-[#E9EDEF]">
            الحالات
          </h1>
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              aria-label="إضافة حالة مصورة"
              onClick={() => openComposer('image')}
              className="p-2 rounded-full bg-[#F0F2F5] dark:bg-[#202C33] text-[#54656F] dark:text-[#AEBAC1] hover:text-[#00A884] cursor-pointer"
              title="حالة مصورة"
            >
              <ImageIcon className="w-4 h-4" aria-hidden="true" />
            </button>
            <button
              type="button"
              onClick={() => openComposer('text')}
              className="px-3.5 py-2 rounded-full bg-[#00A884] text-white text-xs font-semibold flex items-center gap-1.5 hover:bg-[#008069] cursor-pointer"
            >
              <Plus className="w-4 h-4" aria-hidden="true" />
              <span>إضافة حالة</span>
            </button>
          </div>
        </header>

        <div className="flex-1 overflow-y-auto p-3 space-y-5 pb-20 md:pb-4">
          {/* My Status Section */}
          <div>
            <div className="w-full p-2.5 rounded-xl flex items-center gap-3 hover:bg-[#F5F6F6] dark:hover:bg-[#202C33] transition-colors">
              <button
                type="button"
                onClick={() =>
                  myStatuses.length > 0 ? openViewerForList(myStatuses, 0) : openComposer('text')
                }
                className="flex items-center gap-3 flex-1 min-w-0 text-right cursor-pointer"
              >
                <div className="relative shrink-0">
                  <div
                    className={`p-0.5 rounded-full ${
                      myStatuses.length > 0 ? 'border-2 border-[#00A884]' : ''
                    }`}
                  >
                    <Avatar src={currentUser.avatarUrl} name={currentUser.displayName} size="lg" />
                  </div>
                  {myStatuses.length === 0 && (
                    <span className="absolute -bottom-0.5 -left-0.5 w-5 h-5 rounded-full bg-[#00A884] text-white flex items-center justify-center ring-2 ring-white dark:ring-[#111B21]">
                      <Plus className="w-3.5 h-3.5" aria-hidden="true" />
                    </span>
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-[#111B21] dark:text-[#E9EDEF]">حالتي</p>
                  <p className="text-xs text-[#54656F] dark:text-[#8696A0] truncate">
                    {myStatuses.length > 0
                      ? `${myStatuses.length} تحديث نشط · ${formatRemainingStatusTime(myStatuses[0].expiresAtMs)}`
                      : 'انقر لإضافة تحديث نصي أو مصور لمدة ٢٤ ساعة'}
                  </p>
                </div>
              </button>

              {myStatuses.length > 0 && (
                <button
                  type="button"
                  aria-label="إضافة تحديث جديد لحالتي"
                  onClick={() => openComposer('text')}
                  className="w-8 h-8 rounded-full bg-[#F0F2F5] dark:bg-[#202C33] text-[#00A884] flex items-center justify-center hover:brightness-95 cursor-pointer"
                >
                  <Plus className="w-4 h-4" aria-hidden="true" />
                </button>
              )}
            </div>

            {myStatuses.length > 0 && (
              <ul className="mt-1 space-y-1 pr-2">
                {myStatuses.map((st, idx) => (
                  <li
                    key={st.id}
                    className="px-2.5 py-2 rounded-lg bg-[#F8FAFB] dark:bg-[#182229] flex items-center justify-between gap-2"
                  >
                    <button
                      type="button"
                      onClick={() => openViewerForList(myStatuses, idx)}
                      className="flex items-center gap-2.5 flex-1 min-w-0 text-right cursor-pointer"
                    >
                      <span
                        className="w-8 h-8 rounded-lg shrink-0 flex items-center justify-center text-white text-[10px] font-bold overflow-hidden"
                        style={{ backgroundColor: st.backgroundColor }}
                      >
                        {st.type === 'image' && st.mediaUrl ? (
                          <img
                            src={st.mediaUrl}
                            alt=""
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          'نص'
                        )}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="text-xs font-medium text-[#111B21] dark:text-[#E9EDEF] truncate">
                          {st.content || 'حالة مصورة'}
                        </p>
                        <p className="text-[11px] text-[#54656F] dark:text-[#8696A0]">
                          {formatWhatsAppTime(st.createdAtMs)} · {formatRemainingStatusTime(st.expiresAtMs)}
                        </p>
                      </div>
                    </button>

                    <div className="flex items-center gap-2 shrink-0">
                      <span className="text-[11px] font-mono-code text-[#54656F] dark:text-[#8696A0] flex items-center gap-1">
                        <Eye className="w-3.5 h-3.5" aria-hidden="true" />
                        {st.viewCount}
                      </span>
                      <button
                        type="button"
                        aria-label={`حذف الحالة ${st.content || 'المصورة'}`}
                        onClick={() => void handleDelete(st.id)}
                        className="p-1.5 rounded-md text-red-500 hover:bg-red-50 dark:hover:bg-red-950/30 cursor-pointer"
                      >
                        <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* Unviewed Contact Updates */}
          <div>
            <p className="px-2 pb-2 text-xs font-semibold text-[#008069] dark:text-[#06CF9C]">
              التحديثات الأخيرة ({unviewedContactStatuses.length})
            </p>
            {unviewedContactStatuses.length === 0 ? (
              <p className="px-2 text-xs text-[#667781] dark:text-[#8696A0]">
                لا توجد تحديثات جديدة غير مشاهدة من جهات اتصالك.
              </p>
            ) : (
              <ul className="space-y-1">
                {unviewedContactStatuses.map((st, idx) => (
                  <li key={st.id}>
                    <button
                      type="button"
                      onClick={() => openViewerForList(unviewedContactStatuses, idx)}
                      className="w-full p-2.5 rounded-xl flex items-center gap-3 hover:bg-[#F5F6F6] dark:hover:bg-[#202C33] text-right transition-colors cursor-pointer"
                    >
                      <div className="p-0.5 rounded-full border-2 border-[#00A884]">
                        <Avatar src={st.authorAvatar} name={st.authorName} size="md" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-[#111B21] dark:text-[#E9EDEF] truncate">
                          {st.authorName}
                        </p>
                        <p className="text-xs text-[#54656F] dark:text-[#8696A0]">
                          {formatWhatsAppTime(st.createdAtMs)} · {formatRemainingStatusTime(st.expiresAtMs)}
                        </p>
                      </div>
                      <span className="text-[11px] font-mono-code text-[#54656F] dark:text-[#8696A0] flex items-center gap-1">
                        <Eye className="w-3.5 h-3.5" aria-hidden="true" />
                        {st.viewCount}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* Viewed Contact Updates */}
          {viewedContactStatuses.length > 0 && (
            <div>
              <p className="px-2 pb-2 text-xs font-semibold text-[#54656F] dark:text-[#8696A0]">
                تمت مشاهدتها ({viewedContactStatuses.length})
              </p>
              <ul className="space-y-1">
                {viewedContactStatuses.map((st, idx) => (
                  <li key={st.id}>
                    <button
                      type="button"
                      onClick={() => openViewerForList(viewedContactStatuses, idx)}
                      className="w-full p-2.5 rounded-xl flex items-center gap-3 hover:bg-[#F5F6F6] dark:hover:bg-[#202C33] text-right transition-colors cursor-pointer"
                    >
                      <div className="p-0.5 rounded-full border-2 border-[#8696A0]/45">
                        <Avatar src={st.authorAvatar} name={st.authorName} size="md" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-[#111B21] dark:text-[#E9EDEF] truncate">
                          {st.authorName}
                        </p>
                        <p className="text-xs text-[#54656F] dark:text-[#8696A0]">
                          {formatWhatsAppTime(st.createdAtMs)} · {formatRemainingStatusTime(st.expiresAtMs)}
                        </p>
                      </div>
                      <span className="text-[11px] font-mono-code text-[#54656F] dark:text-[#8696A0] flex items-center gap-1">
                        <Eye className="w-3.5 h-3.5" aria-hidden="true" />
                        {st.viewCount}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </div>

      {/* Right Preview / Action Prompt */}
      <div className="hidden md:flex flex-1 items-center justify-center bg-[#F0F2F5] dark:bg-[#0B141A] p-8 text-center">
        <div className="max-w-md bg-white dark:bg-[#111B21] border border-[#E9EDEF] dark:border-[#222D34] rounded-2xl p-8 space-y-5 shadow-xs">
          <div className="w-14 h-14 mx-auto rounded-2xl bg-[#E7F8F2] dark:bg-[#005C4B]/40 text-[#00A884] flex items-center justify-center">
            <Clock className="w-7 h-7" aria-hidden="true" />
          </div>
          <div>
            <h2 className="font-display text-lg font-bold text-[#111B21] dark:text-[#E9EDEF]">
              تحديثات الحالة المؤقتة (٢٤ ساعة)
            </h2>
            <p className="mt-2 text-xs text-[#54656F] dark:text-[#8696A0] leading-relaxed">
              شارك لحظاتك النصية أو المصورة مع جهات اتصالك بأمان. تختفي جميع التحديثات تلقائياً من السحابة بعد مرور ٢٤ ساعة من نشرها.
            </p>
          </div>
          <div className="flex items-center justify-center gap-3 pt-1">
            <button
              type="button"
              onClick={() => openComposer('text')}
              className="px-4 py-2.5 rounded-xl bg-[#00A884] text-white text-xs font-semibold flex items-center gap-2 hover:bg-[#008069] cursor-pointer"
            >
              <Type className="w-4 h-4" aria-hidden="true" />
              <span>نشر حالة نصية</span>
            </button>
            <button
              type="button"
              onClick={() => openComposer('image')}
              className="px-4 py-2.5 rounded-xl bg-[#F0F2F5] dark:bg-[#202C33] text-[#111B21] dark:text-[#E9EDEF] text-xs font-semibold flex items-center gap-2 hover:brightness-95 cursor-pointer"
            >
              <ImageIcon className="w-4 h-4 text-[#00A884]" aria-hidden="true" />
              <span>نشر حالة مصورة</span>
            </button>
          </div>
        </div>
      </div>

      {/* Fullscreen Story Viewer */}
      {activeStory && viewerQueue && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={`عرض حالة ${activeStory.authorName}`}
          className="fixed inset-0 z-50 bg-[#0B141A] text-white flex flex-col items-center justify-center p-4"
        >
          <div
            className="w-full max-w-md h-[85vh] rounded-2xl overflow-hidden relative flex flex-col justify-between shadow-2xl"
            style={{ backgroundColor: activeStory.backgroundColor }}
          >
            {activeStory.type === 'image' && activeStory.mediaUrl && (
              <img
                src={activeStory.mediaUrl}
                alt={activeStory.content || 'حالة مصورة'}
                referrerPolicy="no-referrer"
                className="absolute inset-0 w-full h-full object-cover"
              />
            )}
            <div className="relative z-10 p-4 bg-gradient-to-b from-black/75 to-transparent">
              {/* Progress Bar */}
              <div className="flex gap-1 mb-3">
                {viewerQueue.map((s, i) => (
                  <div key={s.id} className="flex-1 h-1 rounded-full bg-white/30 overflow-hidden">
                    <div
                      className="h-full bg-white transition-all duration-100"
                      style={{
                        width: i < viewerIndex ? '100%' : i === viewerIndex ? `${progress}%` : '0%'
                      }}
                    />
                  </div>
                ))}
              </div>
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2.5 min-w-0">
                  <Avatar src={activeStory.authorAvatar} name={activeStory.authorName} size="sm" />
                  <div className="min-w-0">
                    <p className="text-sm font-semibold truncate">{activeStory.authorName}</p>
                    <p className="text-[11px] text-white/80 flex items-center gap-1.5">
                      <span>{formatWhatsAppTime(activeStory.createdAtMs)}</span>
                      <span>·</span>
                      <span>{formatRemainingStatusTime(activeStory.expiresAtMs)}</span>
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  <button
                    type="button"
                    aria-label={isPaused ? 'استئناف العرض' : 'إيقاف العرض مؤقتاً'}
                    onClick={() => setIsPaused((p) => !p)}
                    className="w-8 h-8 rounded-full bg-black/35 flex items-center justify-center hover:bg-black/55 cursor-pointer"
                  >
                    {isPaused ? (
                      <Play className="w-4 h-4" aria-hidden="true" />
                    ) : (
                      <Pause className="w-4 h-4" aria-hidden="true" />
                    )}
                  </button>
                  {activeStory.authorId === currentUser.uid && (
                    <button
                      type="button"
                      aria-label="حذف هذه الحالة"
                      onClick={() => void handleDelete(activeStory.id)}
                      className="w-8 h-8 rounded-full bg-red-600/75 flex items-center justify-center hover:bg-red-600 cursor-pointer"
                    >
                      <Trash2 className="w-4 h-4" aria-hidden="true" />
                    </button>
                  )}
                  <button
                    type="button"
                    aria-label="إغلاق عرض الحالة"
                    onClick={() => setViewerQueue(null)}
                    className="w-8 h-8 rounded-full bg-black/35 flex items-center justify-center hover:bg-black/55 cursor-pointer"
                  >
                    <X className="w-4 h-4" aria-hidden="true" />
                  </button>
                </div>
              </div>
            </div>

            {activeStory.type === 'text' && (
              <div className="relative z-10 px-8 text-center">
                <p className={`text-2xl leading-relaxed ${activeFontClass}`}>
                  {activeStory.content}
                </p>
              </div>
            )}

            <div className="relative z-10 p-4 bg-gradient-to-t from-black/85 via-black/45 to-transparent text-center space-y-2.5">
              {activeStory.type === 'image' && activeStory.content && (
                <p className="text-sm font-medium">{activeStory.content}</p>
              )}
              <div className="flex items-center justify-between">
                <button
                  type="button"
                  aria-label="الحالة السابقة"
                  disabled={viewerIndex === 0}
                  onClick={() => setViewerIndex((i) => (i > 0 ? i - 1 : 0))}
                  className="p-2 rounded-full bg-white/15 disabled:opacity-30 cursor-pointer"
                >
                  <ChevronRight className="w-5 h-5" aria-hidden="true" />
                </button>
                <div className="flex items-center gap-3 text-xs text-white/85 font-mono-code">
                  <span className="flex items-center gap-1">
                    <Eye className="w-4 h-4" aria-hidden="true" />
                    {activeStory.viewCount} مشاهدة
                  </span>
                  <span className="flex items-center gap-1">
                    <Users className="w-3.5 h-3.5" aria-hidden="true" />
                    {Math.max(0, activeStory.viewerIds.length - 1)} جهة اتصال
                  </span>
                </div>
                <button
                  type="button"
                  aria-label="الحالة التالية"
                  onClick={() =>
                    viewerIndex < viewerQueue.length - 1
                      ? setViewerIndex((i) => i + 1)
                      : setViewerQueue(null)
                  }
                  className="p-2 rounded-full bg-white/15 cursor-pointer"
                >
                  <ChevronLeft className="w-5 h-5" aria-hidden="true" />
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Compose Status Modal (Text + Image + Contacts Audience) */}
      {showComposer && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="نشر حالة جديدة"
          className="fixed inset-0 z-50 bg-black/55 backdrop-blur-xs flex items-center justify-center p-4"
        >
          <form
            onSubmit={(e) => void handleSubmit(e)}
            className="w-full max-w-lg bg-white dark:bg-[#202C33] rounded-2xl overflow-hidden shadow-2xl border border-[#E9EDEF] dark:border-[#374248] flex flex-col max-h-[90vh]"
          >
            {/* Mode Switch Header */}
            <div className="px-4 py-3 border-b border-[#E9EDEF] dark:border-[#2A3942] flex items-center justify-between gap-2">
              <div className="flex items-center gap-1.5 bg-[#F0F2F5] dark:bg-[#111B21] p-1 rounded-xl">
                <button
                  type="button"
                  onClick={() => {
                    setComposeMode('text');
                    setComposeError(null);
                  }}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer ${
                    composeMode === 'text'
                      ? 'bg-[#00A884] text-white'
                      : 'text-[#54656F] dark:text-[#AEBAC1]'
                  }`}
                >
                  <Type className="w-3.5 h-3.5" aria-hidden="true" />
                  <span>حالة نصية</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setComposeMode('image');
                    setComposeError(null);
                  }}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer ${
                    composeMode === 'image'
                      ? 'bg-[#00A884] text-white'
                      : 'text-[#54656F] dark:text-[#AEBAC1]'
                  }`}
                >
                  <ImageIcon className="w-3.5 h-3.5" aria-hidden="true" />
                  <span>حالة مصورة</span>
                </button>
              </div>
              <span className="text-[11px] text-[#008069] dark:text-[#06CF9C] flex items-center gap-1">
                <Clock className="w-3.5 h-3.5" aria-hidden="true" />
                <span>تختفي بعد ٢٤ ساعة</span>
              </span>
            </div>

            <div className="overflow-y-auto">
              {/* Preview & Input Area */}
              {composeMode === 'text' ? (
                <div
                  className="p-8 min-h-[210px] flex flex-col items-center justify-center text-center transition-colors relative"
                  style={{ backgroundColor: bgColor }}
                >
                  <textarea
                    rows={3}
                    maxLength={500}
                    value={content}
                    onChange={(e) => setContent(e.target.value)}
                    placeholder="اكتب حالتك هنا..."
                    aria-label="نص الحالة"
                    className={`w-full bg-transparent text-white placeholder:text-white/60 text-xl text-center resize-none focus:outline-none ${composerFontClass}`}
                  />
                  <span className="absolute bottom-2.5 left-3 text-[10px] font-mono-code text-white/70">
                    {content.length}/500
                  </span>
                </div>
              ) : (
                <div className="p-4 bg-[#111B21] space-y-3">
                  {mediaUrl ? (
                    <div className="relative rounded-xl overflow-hidden bg-black/50 h-56 flex items-center justify-center">
                      <img
                        src={mediaUrl}
                        alt="معاينة صورة الحالة"
                        className="w-full h-full object-contain"
                      />
                      <button
                        type="button"
                        aria-label="إزالة الصورة المختارة"
                        onClick={() => setMediaUrl('')}
                        className="absolute top-2.5 left-2.5 w-8 h-8 rounded-full bg-black/65 text-white flex items-center justify-center hover:bg-black/85 cursor-pointer"
                      >
                        <X className="w-4 h-4" aria-hidden="true" />
                      </button>
                    </div>
                  ) : (
                    <div className="h-44 rounded-xl border-2 border-dashed border-[#374248] flex flex-col items-center justify-center gap-3 text-center p-4">
                      <Upload className="w-7 h-7 text-[#00A884]" aria-hidden="true" />
                      <div>
                        <p className="text-xs font-semibold text-[#E9EDEF]">
                          ارفع صورة من جهازك لمشاركتها كحالة
                        </p>
                        <p className="text-[11px] text-[#8696A0] mt-0.5">
                          يتم ضغط الصورة تلقائياً لتخزين سريع وفعال عبر Firebase
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => fileInputRef.current?.click()}
                          className="px-3.5 py-1.5 rounded-lg bg-[#00A884] text-white text-xs font-semibold hover:bg-[#008069] cursor-pointer"
                        >
                          اختيار صورة
                        </button>
                        {SAMPLE_STATUS_PHOTOS.map((sample) => (
                          <button
                            key={sample.url}
                            type="button"
                            onClick={() => setMediaUrl(sample.url)}
                            className="px-3 py-1.5 rounded-lg bg-[#202C33] text-[#E9EDEF] text-xs font-medium hover:bg-[#2A3942] cursor-pointer"
                          >
                            {sample.label}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    aria-label="رفع صورة للحالة"
                    onChange={(e) => void handleImageUpload(e)}
                    className="hidden"
                  />

                  <input
                    type="text"
                    maxLength={500}
                    value={content}
                    onChange={(e) => setContent(e.target.value)}
                    placeholder="أضف وصفاً اختيارياً للصورة..."
                    aria-label="وصف الصورة"
                    className="w-full rounded-lg bg-[#202C33] px-3 py-2 text-xs text-white placeholder:text-[#8696A0] focus:outline-none focus:ring-1 focus:ring-[#00A884]"
                  />
                </div>
              )}

              {/* Style & Audience Controls */}
              <div className="p-4 space-y-4">
                {composeMode === 'text' && (
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="flex items-center gap-2">
                      {BG_SWATCHES.map((c) => (
                        <button
                          key={c}
                          type="button"
                          aria-label={`اختيار اللون ${c}`}
                          onClick={() => setBgColor(c)}
                          className={`w-6 h-6 rounded-full cursor-pointer ${
                            bgColor === c ? 'ring-2 ring-offset-2 ring-[#00A884]' : ''
                          }`}
                          style={{ backgroundColor: c }}
                        />
                      ))}
                    </div>
                    <div className="flex items-center gap-1">
                      {FONT_STYLES.map((f) => (
                        <button
                          key={f.id}
                          type="button"
                          onClick={() => setFontStyle(f.id)}
                          className={`px-2.5 py-1 rounded-md text-[11px] cursor-pointer ${
                            fontStyle === f.id
                              ? 'bg-[#00A884] text-white font-semibold'
                              : 'bg-[#F0F2F5] dark:bg-[#111B21] text-[#54656F] dark:text-[#AEBAC1]'
                          }`}
                        >
                          {f.label}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* Contacts Visibility Picker */}
                <div className="p-3 rounded-xl bg-[#F0F2F5] dark:bg-[#111B21] space-y-2.5">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-semibold text-[#111B21] dark:text-[#E9EDEF] flex items-center gap-1.5">
                      <Users className="w-3.5 h-3.5 text-[#00A884]" aria-hidden="true" />
                      <span>من يمكنه رؤية هذه الحالة؟</span>
                    </span>
                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => setAudienceMode('all_contacts')}
                        className={`px-2.5 py-1 rounded-md text-[11px] font-medium cursor-pointer ${
                          audienceMode === 'all_contacts'
                            ? 'bg-[#00A884] text-white'
                            : 'bg-white dark:bg-[#202C33] text-[#54656F] dark:text-[#AEBAC1]'
                        }`}
                      >
                        جميع جهات الاتصال ({contacts.length})
                      </button>
                      <button
                        type="button"
                        onClick={() => setAudienceMode('selected')}
                        className={`px-2.5 py-1 rounded-md text-[11px] font-medium cursor-pointer ${
                          audienceMode === 'selected'
                            ? 'bg-[#00A884] text-white'
                            : 'bg-white dark:bg-[#202C33] text-[#54656F] dark:text-[#AEBAC1]'
                        }`}
                      >
                        تحديد جهات اتصال
                      </button>
                    </div>
                  </div>

                  {audienceMode === 'selected' && (
                    <div className="flex flex-wrap gap-1.5 pt-1">
                      {contacts.map((c) => {
                        const checked = selectedContactIds.includes(c.uid);
                        return (
                          <button
                            key={c.uid}
                            type="button"
                            onClick={() => toggleSelectedContact(c.uid)}
                            className={`px-2.5 py-1 rounded-lg text-[11px] flex items-center gap-1.5 border transition-colors cursor-pointer ${
                              checked
                                ? 'bg-[#E7F8F2] dark:bg-[#005C4B]/50 border-[#00A884] text-[#008069] dark:text-[#06CF9C] font-semibold'
                                : 'bg-white dark:bg-[#202C33] border-[#E9EDEF] dark:border-[#374248] text-[#54656F] dark:text-[#AEBAC1]'
                            }`}
                          >
                            {checked && <Check className="w-3 h-3" aria-hidden="true" />}
                            <span>{c.displayName}</span>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>

                {composeError && (
                  <p role="alert" className="text-xs text-red-600 dark:text-red-400">
                    {composeError}
                  </p>
                )}
              </div>
            </div>

            <div className="p-4 border-t border-[#E9EDEF] dark:border-[#2A3942] flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowComposer(false)}
                className="px-3.5 py-2 rounded-lg text-xs font-medium text-[#54656F] dark:text-[#AEBAC1] cursor-pointer"
              >
                إلغاء
              </button>
              <button
                type="submit"
                disabled={isPublishing}
                className="px-4 py-2 rounded-lg bg-[#00A884] text-white text-xs font-semibold hover:bg-[#008069] disabled:opacity-60 cursor-pointer"
              >
                {isPublishing ? 'جاري النشر...' : 'نشر الحالة'}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
