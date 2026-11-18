import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Plus,
  Eye,
  EyeOff,
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
  Check,
  Download,
  Pin,
  PinOff,
  Video,
  Volume2,
  VolumeX,
  Maximize2,
  Minimize2,
  Camera,
  SendHorizontal,
  StopCircle
} from 'lucide-react';
import { Avatar } from './Avatar';
import {
  formatMediaSeconds,
  formatRemainingStatusTime,
  formatWhatsAppTime,
  MAX_STATUS_MEDIA_BYTES,
  MAX_STATUS_VIDEO_SECONDS,
  resolveStatusViewerIds,
  sortStatusesWithPinned
} from '../lib/chatLogic';
import {
  downloadMediaUriOrUrl,
  inspectVideoAndCapturePoster,
  resolvePlayableMediaUrl,
  saveMediaBlob
} from '../lib/mediaStorage';
import type { StatusItem, UserProfile } from '../types/chat';

export interface PublishStatusPayload {
  id?: string;
  type: 'text' | 'image' | 'video';
  content: string;
  backgroundColor: string;
  fontStyle?: 'display' | 'sans' | 'mono';
  mediaUrl?: string;
  posterUrl?: string;
  durationSec?: number;
  viewerIds: string[];
}

interface StatusViewProps {
  statuses: StatusItem[];
  pinnedStatusIds: string[];
  currentUser: UserProfile;
  contacts: UserProfile[];
  hideViewStatus?: boolean;
  initialAuthorId?: string | null;
  onConsumeInitialAuthor?: () => void;
  onPublishStatus: (payload: PublishStatusPayload) => Promise<void>;
  onMarkViewed: (statusId: string) => void;
  onTogglePinStatus: (statusId: string) => Promise<void>;
  onDeleteStatus: (statusId: string) => Promise<void>;
  onReplyToStatus?: (authorId: string, authorName: string, replyText: string, statusPreview: string) => void;
}

const BG_SWATCHES = ['#005C4B', '#800020', '#1E3A5F', '#5B2C6F', '#1B2631'];

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

function createTextStatusPngDataUrl(story: StatusItem): string | null {
  const canvas = document.createElement('canvas');
  canvas.width = 1080;
  canvas.height = 1920;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  ctx.fillStyle = story.backgroundColor || '#005C4B';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = '#FFFFFF';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = 'bold 58px Cairo, sans-serif';
  const words = (story.content || 'حالة تواصل').split(/\s+/);
  const lines: string[] = [];
  let current = '';
  for (const word of words) {
    const test = current ? `${current} ${word}` : word;
    if (ctx.measureText(test).width > 860) {
      if (current) lines.push(current);
      current = word;
    } else {
      current = test;
    }
  }
  if (current) lines.push(current);
  const lineHeight = 88;
  const startY = canvas.height / 2 - ((lines.length - 1) * lineHeight) / 2;
  lines.forEach((line, idx) => {
    ctx.fillText(line, canvas.width / 2, startY + idx * lineHeight);
  });
  ctx.font = '32px Cairo, sans-serif';
  ctx.fillStyle = 'rgba(255,255,255,0.78)';
  ctx.fillText(story.authorName, canvas.width / 2, canvas.height - 120);
  return canvas.toDataURL('image/png');
}

export function StatusView({
  statuses,
  pinnedStatusIds,
  currentUser,
  contacts,
  hideViewStatus = false,
  initialAuthorId = null,
  onConsumeInitialAuthor,
  onPublishStatus,
  onMarkViewed,
  onTogglePinStatus,
  onDeleteStatus,
  onReplyToStatus
}: StatusViewProps) {
  const [viewerQueue, setViewerQueue] = useState<StatusItem[] | null>(null);
  const [viewerIndex, setViewerIndex] = useState<number>(0);
  const [isPaused, setIsPaused] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [isBrowserFullscreen, setIsBrowserFullscreen] = useState(false);
  const [progress, setProgress] = useState(0);
  const [videoTimeSec, setVideoTimeSec] = useState(0);
  const [resolvedVideoSrc, setResolvedVideoSrc] = useState<string | null>(null);
  const [downloadedId, setDownloadedId] = useState<string | null>(null);
  const [quickReply, setQuickReply] = useState('');

  const [showComposer, setShowComposer] = useState(false);
  const [composeMode, setComposeMode] = useState<'text' | 'image' | 'video'>('text');
  const [content, setContent] = useState('');
  const [bgColor, setBgColor] = useState(BG_SWATCHES[0]);
  const [fontStyle, setFontStyle] = useState<'display' | 'sans' | 'mono'>('display');
  const [mediaUrl, setMediaUrl] = useState('');
  const [pendingVideoBlob, setPendingVideoBlob] = useState<Blob | null>(null);
  const [pendingVideoPreviewUrl, setPendingVideoPreviewUrl] = useState<string | null>(null);
  const [pendingVideoPoster, setPendingVideoPoster] = useState('');
  const [pendingVideoDuration, setPendingVideoDuration] = useState(0);
  const [isInspectingVideo, setIsInspectingVideo] = useState(false);
  const [isRecordingVideo, setIsRecordingVideo] = useState(false);
  const [recordElapsedSec, setRecordElapsedSec] = useState(0);
  const [audienceMode, setAudienceMode] = useState<'all_contacts' | 'selected'>('all_contacts');
  const [selectedContactIds, setSelectedContactIds] = useState<string[]>([]);
  const [isPublishing, setIsPublishing] = useState(false);
  const [composeError, setComposeError] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const videoInputRef = useRef<HTMLInputElement>(null);
  const viewerContainerRef = useRef<HTMLDivElement>(null);
  const viewerVideoRef = useRef<HTMLVideoElement>(null);
  const liveCamVideoRef = useRef<HTMLVideoElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recordStreamRef = useRef<MediaStream | null>(null);
  const recordTimerRef = useRef<number | null>(null);
  const recordChunksRef = useRef<Blob[]>([]);

  const activeStatuses = useMemo(
    () => sortStatusesWithPinned(statuses, pinnedStatusIds),
    [statuses, pinnedStatusIds]
  );

  const pinnedStatuses = useMemo(
    () => activeStatuses.filter((s) => Boolean(s.pinned)),
    [activeStatuses]
  );

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

  // Open specific author stories directly when launched from Stories Tray
  useEffect(() => {
    if (!initialAuthorId) return;
    const authorStories = activeStatuses.filter((s) => s.authorId === initialAuthorId);
    if (authorStories.length > 0) {
      setViewerQueue(authorStories);
      setViewerIndex(0);
      setProgress(0);
      setIsPaused(false);
      onMarkViewed(authorStories[0].id);
    }
    onConsumeInitialAuthor?.();
  }, [initialAuthorId, activeStatuses]);

  // Resolve IndexedDB or direct playable URL for video statuses in the viewer
  useEffect(() => {
    let cancelled = false;
    let createdObjectUrl: string | null = null;

    async function loadVideo() {
      setResolvedVideoSrc(null);
      setVideoTimeSec(0);
      if (!activeStory || activeStory.type !== 'video' || !activeStory.mediaUrl) return;
      const src = await resolvePlayableMediaUrl(activeStory.mediaUrl);
      if (cancelled) {
        if (src && src.startsWith('blob:')) URL.revokeObjectURL(src);
        return;
      }
      if (src && src.startsWith('blob:')) {
        createdObjectUrl = src;
      }
      setResolvedVideoSrc(src);
    }

    void loadVideo();
    return () => {
      cancelled = true;
      if (createdObjectUrl) {
        URL.revokeObjectURL(createdObjectUrl);
      }
    };
  }, [activeStory?.id, activeStory?.mediaUrl, activeStory?.type]);

  // Sync HTML5 video pause/play & mute controls
  useEffect(() => {
    const vid = viewerVideoRef.current;
    if (!vid) return;
    vid.muted = isMuted;
    if (isPaused) {
      vid.pause();
    } else {
      void vid.play().catch(() => {});
    }
  }, [isPaused, isMuted, resolvedVideoSrc]);

  // Auto-advance timer for text/image stories (videos advance onEnded!)
  useEffect(() => {
    if (!viewerQueue || !activeStory || isPaused) return;
    onMarkViewed(activeStory.id);
    if (activeStory.type === 'video' && resolvedVideoSrc) return;

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
  }, [viewerQueue, viewerIndex, activeStory?.id, activeStory?.type, isPaused, resolvedVideoSrc]);

  useEffect(() => {
    setProgress(0);
    setVideoTimeSec(0);
    setQuickReply('');
  }, [viewerIndex, activeStory?.id]);

  // Listen to native browser Fullscreen changes
  useEffect(() => {
    const handleFsChange = () => {
      setIsBrowserFullscreen(Boolean(document.fullscreenElement));
    };
    document.addEventListener('fullscreenchange', handleFsChange);
    return () => document.removeEventListener('fullscreenchange', handleFsChange);
  }, []);

  // Keyboard shortcuts inside Fullscreen Viewer
  useEffect(() => {
    if (!viewerQueue) return;
    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')) {
        if (e.key === 'Escape') target.blur();
        return;
      }
      if (e.key === 'Escape') {
        void exitViewer();
      } else if (e.key === ' ') {
        e.preventDefault();
        setIsPaused((p) => !p);
      } else if (e.key === 'ArrowLeft') {
        if (viewerIndex < viewerQueue.length - 1) {
          setViewerIndex((i) => i + 1);
        } else {
          void exitViewer();
        }
      } else if (e.key === 'ArrowRight') {
        setViewerIndex((i) => (i > 0 ? i - 1 : 0));
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [viewerQueue, viewerIndex]);

  // Cleanup recording resources on unmount or modal close
  const stopCameraRecording = () => {
    if (recordTimerRef.current) {
      window.clearInterval(recordTimerRef.current);
      recordTimerRef.current = null;
    }
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
    }
    if (recordStreamRef.current) {
      recordStreamRef.current.getTracks().forEach((t) => t.stop());
      recordStreamRef.current = null;
    }
    setIsRecordingVideo(false);
  };

  useEffect(() => {
    return () => {
      stopCameraRecording();
      if (pendingVideoPreviewUrl) {
        URL.revokeObjectURL(pendingVideoPreviewUrl);
      }
    };
  }, []);

  const exitViewer = async () => {
    if (document.fullscreenElement) {
      try {
        await document.exitFullscreen();
      } catch {
        // ignore fullscreen exit error
      }
    }
    setViewerQueue(null);
  };

  const toggleBrowserFullscreen = async () => {
    try {
      if (!document.fullscreenElement && viewerContainerRef.current?.requestFullscreen) {
        await viewerContainerRef.current.requestFullscreen();
      } else if (document.fullscreenElement) {
        await document.exitFullscreen();
      }
    } catch {
      // Headless or browser policy blocked native fullscreen; CSS 100dvh fullscreen remains active
    }
  };

  const openViewerForList = (list: StatusItem[], startIndex: number) => {
    if (list.length === 0) return;
    setViewerQueue(list);
    setViewerIndex(startIndex);
    setProgress(0);
    setIsPaused(false);
    onMarkViewed(list[startIndex].id);
  };

  const resetComposerMedia = () => {
    stopCameraRecording();
    if (pendingVideoPreviewUrl) {
      URL.revokeObjectURL(pendingVideoPreviewUrl);
    }
    setMediaUrl('');
    setPendingVideoBlob(null);
    setPendingVideoPreviewUrl(null);
    setPendingVideoPoster('');
    setPendingVideoDuration(0);
    setRecordElapsedSec(0);
  };

  const openComposer = (mode: 'text' | 'image' | 'video') => {
    resetComposerMedia();
    setComposeMode(mode);
    setContent('');
    setComposeError(null);
    setAudienceMode('all_contacts');
    setSelectedContactIds(contacts.map((c) => c.uid));
    setShowComposer(true);
  };

  const handleDownloadStory = async (story: StatusItem) => {
    const stamp = `wasil-status-${story.id.slice(-6)}`;
    if (story.type === 'video' && story.mediaUrl) {
      const ok = await downloadMediaUriOrUrl(story.mediaUrl, `${stamp}.mp4`);
      if (ok) {
        setDownloadedId(story.id);
        window.setTimeout(() => setDownloadedId(null), 2200);
        return;
      }
      if (story.posterUrl) {
        await downloadMediaUriOrUrl(story.posterUrl, `${stamp}-frame.jpg`);
        setDownloadedId(story.id);
        window.setTimeout(() => setDownloadedId(null), 2200);
      }
      return;
    }

    if (story.type === 'image' && story.mediaUrl) {
      await downloadMediaUriOrUrl(story.mediaUrl, `${stamp}.jpg`);
      setDownloadedId(story.id);
      window.setTimeout(() => setDownloadedId(null), 2200);
      return;
    }

    const pngUrl = createTextStatusPngDataUrl(story);
    if (pngUrl) {
      await downloadMediaUriOrUrl(pngUrl, `${stamp}.png`);
      setDownloadedId(story.id);
      window.setTimeout(() => setDownloadedId(null), 2200);
    }
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

  const handleVideoFileSelected = async (file: Blob, overrideDurationSec?: number) => {
    setComposeError(null);
    setIsInspectingVideo(true);
    try {
      const inspected = await inspectVideoAndCapturePoster(file, overrideDurationSec);
      if (!inspected.valid) {
        setComposeError(inspected.error || 'مدة الفيديو غير صالحة (الحد الأقصى ٣ دقائق).');
        return;
      }
      if (pendingVideoPreviewUrl) {
        URL.revokeObjectURL(pendingVideoPreviewUrl);
      }
      setPendingVideoBlob(file);
      setPendingVideoPreviewUrl(URL.createObjectURL(file));
      setPendingVideoPoster(inspected.posterUrl);
      setPendingVideoDuration(inspected.durationSec);
    } finally {
      setIsInspectingVideo(false);
    }
  };

  const handleVideoInputChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    await handleVideoFileSelected(file);
  };

  const handleStartVideoRecording = async () => {
    setComposeError(null);
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
      setComposeError('متصفحك لا يدعم تسجيل الفيديو المباشر. يمكنك اختيار مقطع فيديو من جهازك حتى ٣ دقائق.');
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
      recordStreamRef.current = stream;
      recordChunksRef.current = [];
      if (liveCamVideoRef.current) {
        liveCamVideoRef.current.srcObject = stream;
      }

      const recorder = new MediaRecorder(stream);
      mediaRecorderRef.current = recorder;
      setIsRecordingVideo(true);
      setRecordElapsedSec(0);

      let elapsed = 0;
      recordTimerRef.current = window.setInterval(() => {
        elapsed += 1;
        setRecordElapsedSec(elapsed);
        if (elapsed >= MAX_STATUS_VIDEO_SECONDS) {
          stopCameraRecording();
        }
      }, 1000);

      recorder.ondataavailable = (ev) => {
        if (ev.data && ev.data.size > 0) {
          recordChunksRef.current.push(ev.data);
        }
      };

      recorder.onstop = () => {
        const mimeType = recorder.mimeType || 'video/webm';
        const recordedBlob = new Blob(recordChunksRef.current, { type: mimeType });
        const finalDur = Math.max(1, Math.min(MAX_STATUS_VIDEO_SECONDS, elapsed || 2));
        if (recordedBlob.size > 0) {
          void handleVideoFileSelected(recordedBlob, finalDur);
        }
      };

      recorder.start(500);
    } catch {
      setComposeError('تعذر الوصول إلى الكاميرا أو الميكروفون. يمكنك رفع ملف فيديو مباشرة من جهازك.');
      stopCameraRecording();
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
    if (composeMode === 'video' && !pendingVideoBlob) {
      setComposeError('يرجى اختيار أو تسجيل مقطع فيديو (بحد أقصى ٣ دقائق) قبل النشر.');
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
    const generatedId = `st_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;

    setIsPublishing(true);
    try {
      let resolvedMediaUrl = mediaUrl;
      if (composeMode === 'video' && pendingVideoBlob) {
        resolvedMediaUrl = await saveMediaBlob(generatedId, pendingVideoBlob);
      }

      await onPublishStatus({
        id: generatedId,
        type: composeMode,
        content: content.trim(),
        backgroundColor: composeMode === 'video' ? '#0B141A' : bgColor,
        fontStyle,
        ...(composeMode === 'image' ? { mediaUrl: resolvedMediaUrl } : {}),
        ...(composeMode === 'video'
          ? {
              mediaUrl: resolvedMediaUrl,
              posterUrl: pendingVideoPoster,
              durationSec: pendingVideoDuration || 10
            }
          : {}),
        viewerIds
      });
      setContent('');
      resetComposerMedia();
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
        await exitViewer();
      } else {
        setViewerQueue(remaining);
        setViewerIndex((idx) => Math.min(idx, remaining.length - 1));
      }
    }
  };

  const handleSendStatusReply = (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeStory || !quickReply.trim() || !onReplyToStatus) return;
    onReplyToStatus(
      activeStory.authorId,
      activeStory.authorName,
      quickReply.trim(),
      activeStory.content || (activeStory.type === 'video' ? 'حالة فيديو' : 'حالة مصورة')
    );
    setQuickReply('');
    void exitViewer();
  };

  const activeFontClass =
    FONT_STYLES.find((f) => f.id === (activeStory?.fontStyle || 'display'))?.className ||
    'font-display font-bold';
  const composerFontClass =
    FONT_STYLES.find((f) => f.id === fontStyle)?.className || 'font-display font-bold';

  const renderStatusRow = (st: StatusItem, queueList: StatusItem[], idx: number, isUnviewed = false) => {
    const isPinned = Boolean(st.pinned);
    return (
      <li
        key={st.id}
        className="px-2.5 py-2 rounded-xl bg-[#F8FAFB] dark:bg-[#182229] flex items-center justify-between gap-2 hover:bg-[#F0F2F5] dark:hover:bg-[#202C33] transition-colors"
      >
        {/* Main Clickable Area (Never nests action buttons inside!) */}
        <button
          type="button"
          onClick={() => openViewerForList(queueList, idx)}
          className="flex items-center gap-2.5 flex-1 min-w-0 text-right cursor-pointer"
        >
          <div className="relative shrink-0">
            <div
              className={`p-0.5 rounded-full border-2 ${
                isPinned
                  ? 'border-amber-500'
                  : isUnviewed
                    ? 'border-[var(--wa-accent)]'
                    : 'border-[#8696A0]/45'
              }`}
            >
              <Avatar src={st.authorAvatar} name={st.authorName} size="md" />
            </div>
            {st.type === 'video' && (
              <span className="absolute -bottom-0.5 -left-0.5 w-4.5 h-4.5 rounded-full bg-[var(--wa-accent)] text-white flex items-center justify-center ring-2 ring-white dark:ring-[#182229]">
                <Video className="w-2.5 h-2.5" aria-hidden="true" />
              </span>
            )}
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5">
              <p className="text-xs sm:text-sm font-semibold text-[#111B21] dark:text-[#E9EDEF] truncate">
                {st.authorId === currentUser.uid ? st.content || (st.type === 'video' ? 'مقطع فيديو' : 'حالة مصورة') : st.authorName}
              </p>
              {isPinned && (
                <Pin className="w-3 h-3 text-amber-500 shrink-0 rotate-45" aria-label="حالة مثبتة" />
              )}
            </div>
            <p className="text-[11px] text-[#54656F] dark:text-[#8696A0] flex items-center gap-1.5 truncate">
              <span>{formatWhatsAppTime(st.createdAtMs)}</span>
              {st.type === 'video' && typeof st.durationSec === 'number' && (
                <>
                  <span>·</span>
                  <span className="font-mono-code text-[var(--wa-accent-strong)] font-semibold">
                    {formatMediaSeconds(st.durationSec)}
                  </span>
                </>
              )}
              <span>·</span>
              <span>{formatRemainingStatusTime(st.expiresAtMs)}</span>
            </p>
          </div>
        </button>

        {/* Clean Sibling Action Buttons (Pin, Download, Delete) */}
        <div className="flex items-center gap-1 shrink-0">
          <span className="hidden sm:inline-flex text-[11px] font-mono-code text-[#54656F] dark:text-[#8696A0] items-center gap-1 pl-1">
            <Eye className="w-3.5 h-3.5" aria-hidden="true" />
            {st.viewCount}
          </span>
          <button
            type="button"
            aria-label={isPinned ? `إلغاء تثبيت حالة ${st.authorName}` : `تثبيت حالة ${st.authorName}`}
            title={isPinned ? 'إلغاء تثبيت الحالة' : 'تثبيت الحالة'}
            aria-pressed={isPinned}
            onClick={() => void onTogglePinStatus(st.id)}
            className={`w-8 h-8 rounded-lg flex items-center justify-center transition-colors cursor-pointer ${
              isPinned
                ? 'bg-amber-500/15 text-amber-600 dark:text-amber-400'
                : 'text-[#54656F] dark:text-[#AEBAC1] hover:bg-black/5 dark:hover:bg-white/10'
            }`}
          >
            {isPinned ? (
              <PinOff className="w-3.5 h-3.5" aria-hidden="true" />
            ) : (
              <Pin className="w-3.5 h-3.5" aria-hidden="true" />
            )}
          </button>
          <button
            type="button"
            aria-label={`تحميل حالة ${st.authorName}`}
            title="حفظ / تحميل الحالة"
            onClick={() => void handleDownloadStory(st)}
            className="w-8 h-8 rounded-lg flex items-center justify-center text-[#54656F] dark:text-[#AEBAC1] hover:bg-black/5 dark:hover:bg-white/10 hover:text-[var(--wa-accent)] cursor-pointer"
          >
            {downloadedId === st.id ? (
              <Check className="w-3.5 h-3.5 text-emerald-500" aria-hidden="true" />
            ) : (
              <Download className="w-3.5 h-3.5" aria-hidden="true" />
            )}
          </button>
          <button
            type="button"
            aria-label={`حذف حالة ${st.content || st.authorName}`}
            title="حذف الحالة"
            onClick={() => void handleDelete(st.id)}
            className="w-8 h-8 rounded-lg flex items-center justify-center text-red-500 hover:bg-red-50 dark:hover:bg-red-950/30 cursor-pointer"
          >
            <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
          </button>
        </div>
      </li>
    );
  };

  return (
    <div className="flex-1 min-w-0 w-full max-w-full overflow-hidden flex flex-col md:flex-row h-full bg-white dark:bg-[#111B21]">
      {/* Left Status Sidebar */}
      <div className="w-full max-w-full min-w-0 md:w-96 lg:w-[410px] border-l border-[#E9EDEF] dark:border-[#222D34] flex flex-col h-full md:shrink-0 overflow-hidden">
        <header className="h-16 px-3 sm:px-4 flex items-center justify-between gap-2 border-b border-[#F0F2F5] dark:border-[#222D34] shrink-0 min-w-0">
          <div className="flex items-center gap-2 min-w-0">
            <h1 className="font-display text-lg sm:text-xl font-bold text-[#111B21] dark:text-[#E9EDEF] truncate">
              الحالات
            </h1>
            {hideViewStatus && (
              <span
                title="ميزة إخفاء مشاهدة الحالات مفعّلة"
                className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-[var(--wa-accent-soft)] text-[var(--wa-accent-strong)] text-[10px] font-bold shrink-0"
              >
                <EyeOff className="w-3 h-3" aria-hidden="true" />
                <span>تخفي</span>
              </span>
            )}
          </div>
          <div className="flex items-center gap-1 sm:gap-1.5 shrink-0">
            <button
              type="button"
              aria-label="إضافة حالة فيديو حتى ٣ دقائق"
              onClick={() => openComposer('video')}
              className="w-8 h-8 sm:w-9 sm:h-9 rounded-full bg-[#F0F2F5] dark:bg-[#202C33] text-[#54656F] dark:text-[#AEBAC1] hover:text-[var(--wa-accent)] flex items-center justify-center cursor-pointer"
              title="حالة فيديو (حتى ٣ دقائق)"
            >
              <Video className="w-4 h-4" aria-hidden="true" />
            </button>
            <button
              type="button"
              aria-label="إضافة حالة مصورة"
              onClick={() => openComposer('image')}
              className="w-8 h-8 sm:w-9 sm:h-9 rounded-full bg-[#F0F2F5] dark:bg-[#202C33] text-[#54656F] dark:text-[#AEBAC1] hover:text-[var(--wa-accent)] flex items-center justify-center cursor-pointer"
              title="حالة مصورة"
            >
              <ImageIcon className="w-4 h-4" aria-hidden="true" />
            </button>
            <button
              type="button"
              onClick={() => openComposer('text')}
              className="px-2.5 sm:px-3 py-1.5 sm:py-2 rounded-full bg-[var(--wa-accent)] text-white text-[11px] sm:text-xs font-semibold flex items-center gap-1 hover:brightness-95 whitespace-nowrap cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5 sm:w-4 sm:h-4" aria-hidden="true" />
              <span>حالة جديدة</span>
            </button>
          </div>
        </header>

        <div className="flex-1 min-w-0 overflow-y-auto overflow-x-hidden p-3 space-y-5 pb-24 md:pb-6">
          {/* Pinned Statuses Strip */}
          {pinnedStatuses.length > 0 && (
            <div>
              <p className="px-2 pb-2 text-xs font-bold text-amber-600 dark:text-amber-400 flex items-center gap-1.5">
                <Pin className="w-3.5 h-3.5 rotate-45" aria-hidden="true" />
                <span>الحالات المثبتة ({pinnedStatuses.length})</span>
              </p>
              <ul className="space-y-1.5">
                {pinnedStatuses.map((st, idx) => renderStatusRow(st, pinnedStatuses, idx, !st.viewedByMe))}
              </ul>
            </div>
          )}

          {/* My Status Section */}
          <div>
            <div className="w-full p-2.5 rounded-xl flex items-center gap-3 hover:bg-[#F5F6F6] dark:hover:bg-[#202C33] transition-colors">
              <button
                type="button"
                onClick={() =>
                  myStatuses.length > 0 ? openViewerForList(myStatuses, 0) : openComposer('video')
                }
                className="flex items-center gap-3 flex-1 min-w-0 text-right cursor-pointer"
              >
                <div className="relative shrink-0">
                  <div
                    className={`p-0.5 rounded-full ${
                      myStatuses.length > 0 ? 'border-2 border-[var(--wa-accent)]' : ''
                    }`}
                  >
                    <Avatar src={currentUser.avatarUrl} name={currentUser.displayName} size="lg" />
                  </div>
                  {myStatuses.length === 0 && (
                    <span className="absolute -bottom-0.5 -left-0.5 w-5 h-5 rounded-full bg-[var(--wa-accent)] text-white flex items-center justify-center ring-2 ring-white dark:ring-[#111B21]">
                      <Plus className="w-3.5 h-3.5" aria-hidden="true" />
                    </span>
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-[#111B21] dark:text-[#E9EDEF]">حالتي</p>
                  <p className="text-xs text-[#54656F] dark:text-[#8696A0] truncate">
                    {myStatuses.length > 0
                      ? `${myStatuses.length} تحديث نشط · ${formatRemainingStatusTime(myStatuses[0].expiresAtMs)}`
                      : 'أضف نصاً أو صورة أو فيديو حتى ٣ دقائق'}
                  </p>
                </div>
              </button>

              <button
                type="button"
                aria-label="إضافة تحديث جديد لحالتي"
                onClick={() => openComposer('text')}
                className="w-8 h-8 rounded-full bg-[#F0F2F5] dark:bg-[#202C33] text-[var(--wa-accent)] flex items-center justify-center hover:brightness-95 cursor-pointer"
              >
                <Plus className="w-4 h-4" aria-hidden="true" />
              </button>
            </div>

            {myStatuses.length > 0 && (
              <ul className="mt-1 space-y-1.5 pr-1">
                {myStatuses.map((st, idx) => renderStatusRow(st, myStatuses, idx, true))}
              </ul>
            )}
          </div>

          {/* Unviewed Contact Updates */}
          <div>
            <p className="px-2 pb-2 text-xs font-semibold text-[var(--wa-accent-strong)]">
              التحديثات الأخيرة ({unviewedContactStatuses.length})
            </p>
            {unviewedContactStatuses.length === 0 ? (
              <p className="px-2 text-xs text-[#667781] dark:text-[#8696A0]">
                لا توجد تحديثات جديدة غير مشاهدة من جهات اتصالك.
              </p>
            ) : (
              <ul className="space-y-1.5">
                {unviewedContactStatuses.map((st, idx) =>
                  renderStatusRow(st, unviewedContactStatuses, idx, true)
                )}
              </ul>
            )}
          </div>

          {/* Viewed Contact Updates */}
          {viewedContactStatuses.length > 0 && (
            <div>
              <p className="px-2 pb-2 text-xs font-semibold text-[#54656F] dark:text-[#8696A0]">
                تمت مشاهدتها ({viewedContactStatuses.length})
              </p>
              <ul className="space-y-1.5">
                {viewedContactStatuses.map((st, idx) =>
                  renderStatusRow(st, viewedContactStatuses, idx, false)
                )}
              </ul>
            </div>
          )}
        </div>
      </div>

      {/* Right Preview / Action Prompt */}
      <div className="hidden md:flex flex-1 items-center justify-center bg-[#F0F2F5] dark:bg-[#0B141A] p-8 text-center">
        <div className="max-w-lg bg-white dark:bg-[#111B21] border border-[#E9EDEF] dark:border-[#222D34] rounded-2xl p-8 space-y-5 shadow-xs">
          <div className="w-14 h-14 mx-auto rounded-2xl bg-[var(--wa-accent-soft)] text-[var(--wa-accent-strong)] flex items-center justify-center">
            <Video className="w-7 h-7" aria-hidden="true" />
          </div>
          <div>
            <h2 className="font-display text-lg font-bold text-[#111B21] dark:text-[#E9EDEF]">
              حالات مطوّرة حتى ٣ دقائق · تثبيت وتحميل بملء الشاشة
            </h2>
            <p className="mt-2 text-xs text-[#54656F] dark:text-[#8696A0] leading-relaxed">
              انشر مقاطع فيديو حتى ١٨٠ ثانية (٣ دقائق) مع حفظ فوري، تثبيت لأهم الحالات، حذف بنقرة واحدة، وعرض سينمائي بملء الشاشة بالكامل.
            </p>
          </div>
          <div className="flex flex-wrap items-center justify-center gap-2.5 pt-1">
            <button
              type="button"
              onClick={() => openComposer('video')}
              className="px-4 py-2.5 rounded-xl bg-[var(--wa-accent)] text-white text-xs font-semibold flex items-center gap-2 hover:brightness-95 cursor-pointer"
            >
              <Video className="w-4 h-4" aria-hidden="true" />
              <span>فيديو (٣ دقائق)</span>
            </button>
            <button
              type="button"
              onClick={() => openComposer('image')}
              className="px-4 py-2.5 rounded-xl bg-[#F0F2F5] dark:bg-[#202C33] text-[#111B21] dark:text-[#E9EDEF] text-xs font-semibold flex items-center gap-2 hover:brightness-95 cursor-pointer"
            >
              <ImageIcon className="w-4 h-4 text-[var(--wa-accent)]" aria-hidden="true" />
              <span>حالة مصورة</span>
            </button>
            <button
              type="button"
              onClick={() => openComposer('text')}
              className="px-4 py-2.5 rounded-xl bg-[#F0F2F5] dark:bg-[#202C33] text-[#111B21] dark:text-[#E9EDEF] text-xs font-semibold flex items-center gap-2 hover:brightness-95 cursor-pointer"
            >
              <Type className="w-4 h-4 text-[var(--wa-accent)]" aria-hidden="true" />
              <span>حالة نصية</span>
            </button>
          </div>
        </div>
      </div>

      {/* Edge-to-Edge Fullscreen Story Viewer */}
      {activeStory && viewerQueue && (
        <div
          ref={viewerContainerRef}
          role="dialog"
          aria-modal="true"
          aria-label={`عرض حالة ${activeStory.authorName}`}
          className="fixed inset-0 z-[55] w-full max-w-full h-[100dvh] bg-black text-white flex flex-col justify-between overflow-hidden select-none"
          style={{
            backgroundColor: activeStory.type === 'text' ? activeStory.backgroundColor : '#000000'
          }}
        >
          {/* Background Image or Video Layer */}
          {activeStory.type === 'image' && activeStory.mediaUrl && (
            <img
              src={activeStory.mediaUrl}
              alt={activeStory.content || 'حالة مصورة'}
              referrerPolicy="no-referrer"
              className="absolute inset-0 w-full h-full object-contain bg-black"
            />
          )}

          {activeStory.type === 'video' && (
            <div className="absolute inset-0 w-full h-full bg-black flex items-center justify-center">
              {resolvedVideoSrc ? (
                <video
                  ref={viewerVideoRef}
                  src={resolvedVideoSrc}
                  poster={activeStory.posterUrl}
                  playsInline
                  autoPlay
                  muted={isMuted}
                  onTimeUpdate={(e) => {
                    const el = e.currentTarget;
                    const dur = el.duration || activeStory.durationSec || 1;
                    setVideoTimeSec(el.currentTime);
                    setProgress(Math.min(100, (el.currentTime / dur) * 100));
                  }}
                  onEnded={() => {
                    if (viewerIndex < viewerQueue.length - 1) {
                      setViewerIndex((i) => i + 1);
                    } else {
                      void exitViewer();
                    }
                  }}
                  className="w-full h-full object-contain"
                />
              ) : activeStory.posterUrl ? (
                <img
                  src={activeStory.posterUrl}
                  alt={activeStory.content || 'حالة فيديو'}
                  className="w-full h-full object-contain opacity-85"
                />
              ) : (
                <div className="text-center space-y-2 text-white/70">
                  <Video className="w-12 h-12 mx-auto" aria-hidden="true" />
                  <p className="text-xs">جاري تجهيز المقطع للتشغيل...</p>
                </div>
              )}
            </div>
          )}

          {/* Edge Tap Navigation Zones (behind top/bottom bars) */}
          <div className="absolute inset-0 z-[5] grid grid-cols-3">
            <button
              type="button"
              aria-label="الحالة التالية"
              onClick={() =>
                viewerIndex < viewerQueue.length - 1
                  ? setViewerIndex((i) => i + 1)
                  : void exitViewer()
              }
              className="h-full w-full cursor-pointer focus:outline-none"
            />
            <button
              type="button"
              aria-label={isPaused ? 'استئناف العرض' : 'إيقاف مؤقت'}
              onClick={() => setIsPaused((p) => !p)}
              className="h-full w-full cursor-pointer focus:outline-none"
            />
            <button
              type="button"
              aria-label="الحالة السابقة"
              onClick={() => setViewerIndex((i) => (i > 0 ? i - 1 : 0))}
              className="h-full w-full cursor-pointer focus:outline-none"
            />
          </div>

          {/* Top Edge-to-Edge Control Bar */}
          <header className="relative z-20 px-4 pt-4 pb-6 bg-gradient-to-b from-black/85 via-black/45 to-transparent">
            <div className="max-w-5xl mx-auto space-y-3">
              {/* Progress Segments */}
              <div className="flex gap-1.5">
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

              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2.5 min-w-0">
                  <Avatar src={activeStory.authorAvatar} name={activeStory.authorName} size="sm" />
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5">
                      <p className="text-sm font-bold truncate">{activeStory.authorName}</p>
                      {activeStory.pinned && (
                        <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-amber-500/25 text-amber-200 text-[10px] font-bold">
                          <Pin className="w-2.5 h-2.5" aria-hidden="true" />
                          مثبتة
                        </span>
                      )}
                    </div>
                    <p className="text-[11px] text-white/80 flex items-center gap-1.5">
                      <span>{formatWhatsAppTime(activeStory.createdAtMs)}</span>
                      {activeStory.type === 'video' && (
                        <>
                          <span>·</span>
                          <span className="font-mono-code">
                            {formatMediaSeconds(videoTimeSec)} /{' '}
                            {formatMediaSeconds(activeStory.durationSec || 0)}
                          </span>
                        </>
                      )}
                      <span>·</span>
                      <span>{formatRemainingStatusTime(activeStory.expiresAtMs)}</span>
                    </p>
                  </div>
                </div>

                {/* Top Action Cluster: Pin, Download, Mute (for video), Pause, Fullscreen, Delete, Close */}
                <div className="flex items-center gap-1.5 shrink-0">
                  <button
                    type="button"
                    aria-label={activeStory.pinned ? 'إلغاء تثبيت الحالة' : 'تثبيت الحالة'}
                    aria-pressed={Boolean(activeStory.pinned)}
                    title={activeStory.pinned ? 'إلغاء التثبيت' : 'تثبيت الحالة'}
                    onClick={() => void onTogglePinStatus(activeStory.id)}
                    className={`h-9 px-2.5 rounded-full flex items-center gap-1 text-xs font-semibold cursor-pointer ${
                      activeStory.pinned
                        ? 'bg-amber-500 text-black'
                        : 'bg-white/15 text-white hover:bg-white/25'
                    }`}
                  >
                    {activeStory.pinned ? (
                      <PinOff className="w-3.5 h-3.5" aria-hidden="true" />
                    ) : (
                      <Pin className="w-3.5 h-3.5" aria-hidden="true" />
                    )}
                    <span className="hidden sm:inline">
                      {activeStory.pinned ? 'مثبتة' : 'تثبيت'}
                    </span>
                  </button>

                  <button
                    type="button"
                    aria-label="تحميل وحفظ الحالة"
                    title="تحميل الحالة"
                    onClick={() => void handleDownloadStory(activeStory)}
                    className="h-9 px-2.5 rounded-full bg-white/15 hover:bg-white/25 flex items-center gap-1 text-xs font-semibold cursor-pointer"
                  >
                    {downloadedId === activeStory.id ? (
                      <>
                        <Check className="w-3.5 h-3.5 text-emerald-400" aria-hidden="true" />
                        <span className="hidden sm:inline">تم الحفظ</span>
                      </>
                    ) : (
                      <>
                        <Download className="w-3.5 h-3.5" aria-hidden="true" />
                        <span className="hidden sm:inline">تحميل</span>
                      </>
                    )}
                  </button>

                  {activeStory.type === 'video' && (
                    <button
                      type="button"
                      aria-label={isMuted ? 'إلغاء كتم صوت الفيديو' : 'كتم صوت الفيديو'}
                      onClick={() => setIsMuted((m) => !m)}
                      className="w-9 h-9 rounded-full bg-white/15 hover:bg-white/25 flex items-center justify-center cursor-pointer"
                    >
                      {isMuted ? (
                        <VolumeX className="w-4 h-4" aria-hidden="true" />
                      ) : (
                        <Volume2 className="w-4 h-4" aria-hidden="true" />
                      )}
                    </button>
                  )}

                  <button
                    type="button"
                    aria-label={isPaused ? 'تشغيل العرض' : 'إيقاف العرض مؤقتاً'}
                    onClick={() => setIsPaused((p) => !p)}
                    className="w-9 h-9 rounded-full bg-white/15 hover:bg-white/25 flex items-center justify-center cursor-pointer"
                  >
                    {isPaused ? (
                      <Play className="w-4 h-4" aria-hidden="true" />
                    ) : (
                      <Pause className="w-4 h-4" aria-hidden="true" />
                    )}
                  </button>

                  <button
                    type="button"
                    aria-label={isBrowserFullscreen ? 'تصغير من ملء الشاشة' : 'تكبير لملء الشاشة الكامل'}
                    title="تبديل ملء الشاشة"
                    onClick={() => void toggleBrowserFullscreen()}
                    className="w-9 h-9 rounded-full bg-white/15 hover:bg-white/25 flex items-center justify-center cursor-pointer"
                  >
                    {isBrowserFullscreen ? (
                      <Minimize2 className="w-4 h-4" aria-hidden="true" />
                    ) : (
                      <Maximize2 className="w-4 h-4" aria-hidden="true" />
                    )}
                  </button>

                  <button
                    type="button"
                    aria-label="حذف الحالة"
                    title="حذف الحالة"
                    onClick={() => void handleDelete(activeStory.id)}
                    className="w-9 h-9 rounded-full bg-red-600/80 hover:bg-red-600 flex items-center justify-center cursor-pointer"
                  >
                    <Trash2 className="w-4 h-4" aria-hidden="true" />
                  </button>

                  <button
                    type="button"
                    aria-label="إغلاق عرض الحالة"
                    onClick={() => void exitViewer()}
                    className="w-9 h-9 rounded-full bg-white/20 hover:bg-white/30 flex items-center justify-center cursor-pointer"
                  >
                    <X className="w-4 h-4" aria-hidden="true" />
                  </button>
                </div>
              </div>
            </div>
          </header>

          {/* Center Text Canvas */}
          {activeStory.type === 'text' && (
            <div className="relative z-10 flex-1 flex items-center justify-center px-6 sm:px-14 text-center pointer-events-none">
              <p className={`text-2xl sm:text-4xl max-w-3xl leading-relaxed ${activeFontClass}`}>
                {activeStory.content}
              </p>
            </div>
          )}

          {/* Bottom Scrim: Caption, Scrub Bar, Navigation & Reply */}
          <footer className="relative z-20 px-4 pb-5 pb-safe pt-8 bg-gradient-to-t from-black/90 via-black/55 to-transparent">
            <div className="max-w-3xl mx-auto space-y-3">
              {activeStory.type !== 'text' && activeStory.content && (
                <p className="text-sm sm:text-base font-medium text-center">{activeStory.content}</p>
              )}

              {/* Video Scrubber up to 180s */}
              {activeStory.type === 'video' && resolvedVideoSrc && (
                <div className="flex items-center gap-3" dir="ltr">
                  <span className="font-mono-code text-[11px] text-white/80">
                    {formatMediaSeconds(videoTimeSec)}
                  </span>
                  <input
                    type="range"
                    min={0}
                    max={Math.max(1, activeStory.durationSec || viewerVideoRef.current?.duration || 10)}
                    step={0.5}
                    value={videoTimeSec}
                    aria-label="شريط تقديم وتأخير الفيديو"
                    onChange={(e) => {
                      const next = Number(e.target.value);
                      if (viewerVideoRef.current) {
                        viewerVideoRef.current.currentTime = next;
                      }
                      setVideoTimeSec(next);
                    }}
                    className="flex-1 accent-[var(--wa-accent)] cursor-pointer"
                  />
                  <span className="font-mono-code text-[11px] text-white/80">
                    {formatMediaSeconds(activeStory.durationSec || viewerVideoRef.current?.duration || 0)}
                  </span>
                </div>
              )}

              {/* Quick Reply Input for contact stories */}
              {activeStory.authorId !== currentUser.uid && onReplyToStatus && (
                <form onSubmit={handleSendStatusReply} className="flex items-center gap-2">
                  <input
                    type="text"
                    value={quickReply}
                    onChange={(e) => setQuickReply(e.target.value)}
                    placeholder={`رد على حالة ${activeStory.authorName}...`}
                    aria-label={`رد سريع على حالة ${activeStory.authorName}`}
                    className="flex-1 min-h-[42px] px-4 rounded-full bg-white/15 backdrop-blur-sm border border-white/20 text-xs sm:text-sm text-white placeholder:text-white/65 focus:outline-none focus:ring-2 focus:ring-[var(--wa-accent)]"
                  />
                  <button
                    type="submit"
                    disabled={!quickReply.trim()}
                    aria-label="إرسال الرد على الحالة"
                    className="w-10 h-10 rounded-full bg-[var(--wa-accent)] text-white flex items-center justify-center disabled:opacity-40 cursor-pointer"
                  >
                    <SendHorizontal className="w-4 h-4 rotate-180" aria-hidden="true" />
                  </button>
                </form>
              )}

              <div className="flex items-center justify-between pt-1">
                <button
                  type="button"
                  aria-label="الحالة السابقة"
                  disabled={viewerIndex === 0}
                  onClick={() => setViewerIndex((i) => (i > 0 ? i - 1 : 0))}
                  className="p-2.5 rounded-full bg-white/15 hover:bg-white/25 disabled:opacity-30 cursor-pointer"
                >
                  <ChevronRight className="w-5 h-5" aria-hidden="true" />
                </button>
                <div className="flex items-center gap-3 text-xs text-white/85 font-mono-code">
                  <span className="flex items-center gap-1">
                    {hideViewStatus ? (
                      <EyeOff className="w-4 h-4 text-amber-300" aria-hidden="true" />
                    ) : (
                      <Eye className="w-4 h-4" aria-hidden="true" />
                    )}
                    {hideViewStatus ? 'تصفح خفي' : `${activeStory.viewCount} مشاهدة`}
                  </span>
                  <span className="flex items-center gap-1">
                    <Users className="w-3.5 h-3.5" aria-hidden="true" />
                    {Math.max(0, activeStory.viewerIds.length - 1)} جهة
                  </span>
                </div>
                <button
                  type="button"
                  aria-label="الحالة التالية"
                  onClick={() =>
                    viewerIndex < viewerQueue.length - 1
                      ? setViewerIndex((i) => i + 1)
                      : void exitViewer()
                  }
                  className="p-2.5 rounded-full bg-white/15 hover:bg-white/25 cursor-pointer"
                >
                  <ChevronLeft className="w-5 h-5" aria-hidden="true" />
                </button>
              </div>
            </div>
          </footer>
        </div>
      )}

      {/* Compose Status Modal (Text + Image + 3-Minute Video) */}
      {showComposer && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="نشر حالة جديدة"
          className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4"
        >
          <form
            onSubmit={(e) => void handleSubmit(e)}
            className="w-full max-w-lg bg-white dark:bg-[#202C33] rounded-2xl overflow-hidden shadow-2xl border border-[#E9EDEF] dark:border-[#374248] flex flex-col max-h-[92dvh]"
          >
            {/* Mode Switch Header */}
            <div className="px-4 py-3 border-b border-[#E9EDEF] dark:border-[#2A3942] flex items-center justify-between gap-2 shrink-0">
              <div className="flex items-center gap-1 bg-[#F0F2F5] dark:bg-[#111B21] p-1 rounded-xl">
                {[
                  { id: 'text' as const, label: 'نص', icon: Type },
                  { id: 'image' as const, label: 'صورة', icon: ImageIcon },
                  { id: 'video' as const, label: 'فيديو ٣ د', icon: Video }
                ].map((m) => {
                  const Icon = m.icon;
                  const active = composeMode === m.id;
                  return (
                    <button
                      key={m.id}
                      type="button"
                      onClick={() => {
                        stopCameraRecording();
                        setComposeMode(m.id);
                        setComposeError(null);
                      }}
                      className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer ${
                        active
                          ? 'bg-[var(--wa-accent)] text-white'
                          : 'text-[#54656F] dark:text-[#AEBAC1]'
                      }`}
                    >
                      <Icon className="w-3.5 h-3.5" aria-hidden="true" />
                      <span>{m.label}</span>
                    </button>
                  );
                })}
              </div>

              <button
                type="button"
                aria-label="إغلاق نافذة إضافة الحالة"
                onClick={() => {
                  resetComposerMedia();
                  setShowComposer(false);
                }}
                className="w-8 h-8 rounded-full flex items-center justify-center text-[#54656F] dark:text-[#AEBAC1] hover:bg-black/5 cursor-pointer"
              >
                <X className="w-4 h-4" aria-hidden="true" />
              </button>
            </div>

            <div className="overflow-y-auto flex-1">
              {composeMode === 'text' ? (
                <div
                  className="p-8 min-h-[200px] flex flex-col items-center justify-center text-center transition-colors relative"
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
              ) : composeMode === 'image' ? (
                <div className="p-4 bg-[#111B21] space-y-3">
                  {mediaUrl ? (
                    <div className="relative rounded-xl overflow-hidden bg-black/50 h-56 flex items-center justify-center">
                      <img
                        src={mediaUrl}
                        alt="معاينة صورة الحالة"
                        referrerPolicy="no-referrer"
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
                      <Upload className="w-7 h-7 text-[var(--wa-accent)]" aria-hidden="true" />
                      <div>
                        <p className="text-xs font-semibold text-[#E9EDEF]">
                          ارفع صورة من جهازك لمشاركتها كحالة
                        </p>
                        <p className="text-[11px] text-[#8696A0] mt-0.5">
                          ضغط ذكي مع الحفاظ على دقة الصورة
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => fileInputRef.current?.click()}
                          className="px-3.5 py-1.5 rounded-lg bg-[var(--wa-accent)] text-white text-xs font-semibold hover:brightness-95 cursor-pointer"
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
                    className="w-full rounded-lg bg-[#202C33] px-3 py-2 text-xs text-white placeholder:text-[#8696A0] focus:outline-none focus:ring-1 focus:ring-[var(--wa-accent)]"
                  />
                </div>
              ) : (
                /* VIDEO COMPOSER UP TO 3 MINUTES (180 SECONDS) */
                <div className="p-4 bg-[#111B21] space-y-3">
                  {isRecordingVideo ? (
                    <div className="relative rounded-xl overflow-hidden bg-black h-56 flex items-center justify-center">
                      <video
                        ref={liveCamVideoRef}
                        autoPlay
                        muted
                        playsInline
                        className="w-full h-full object-cover"
                      />
                      <div className="absolute top-3 right-3 px-2.5 py-1 rounded-full bg-red-600 text-white text-xs font-mono-code font-bold flex items-center gap-1.5">
                        <span className="w-2 h-2 rounded-full bg-white animate-pulse" />
                        <span>
                          {formatMediaSeconds(recordElapsedSec)} / 03:00
                        </span>
                      </div>
                      <button
                        type="button"
                        onClick={stopCameraRecording}
                        className="absolute bottom-3 left-1/2 -translate-x-1/2 px-4 py-2 rounded-full bg-red-600 text-white text-xs font-bold flex items-center gap-1.5 shadow-lg cursor-pointer"
                      >
                        <StopCircle className="w-4 h-4" aria-hidden="true" />
                        <span>إيقاف التسجيل وحفظ المقطع</span>
                      </button>
                    </div>
                  ) : pendingVideoPreviewUrl ? (
                    <div className="relative rounded-xl overflow-hidden bg-black h-56 flex items-center justify-center">
                      <video
                        src={pendingVideoPreviewUrl}
                        poster={pendingVideoPoster}
                        controls
                        playsInline
                        className="w-full h-full object-contain"
                      />
                      <span className="absolute top-2.5 right-2.5 px-2 py-0.5 rounded bg-black/70 text-white text-[11px] font-mono-code font-bold">
                        {formatMediaSeconds(pendingVideoDuration)} / 03:00
                      </span>
                      <button
                        type="button"
                        aria-label="إزالة مقطع الفيديو"
                        onClick={resetComposerMedia}
                        className="absolute top-2.5 left-2.5 w-8 h-8 rounded-full bg-black/65 text-white flex items-center justify-center hover:bg-black/85 cursor-pointer"
                      >
                        <X className="w-4 h-4" aria-hidden="true" />
                      </button>
                    </div>
                  ) : (
                    <div className="h-48 rounded-xl border-2 border-dashed border-[#374248] flex flex-col items-center justify-center gap-3 text-center p-4">
                      <Video className="w-8 h-8 text-[var(--wa-accent)]" aria-hidden="true" />
                      <div>
                        <p className="text-xs font-bold text-[#E9EDEF]">
                          {isInspectingVideo
                            ? 'جاري فحص المقطع وتجهيز المعاينة...'
                            : 'مقطع فيديو حتى ٣ دقائق (180 ثانية)'}
                        </p>
                        <p className="text-[11px] text-[#8696A0] mt-0.5">
                          يدعم MP4 و WebM مع تخزين آمن وتشغيل فوري بملء الشاشة
                        </p>
                      </div>
                      <div className="flex flex-wrap items-center justify-center gap-2">
                        <button
                          type="button"
                          disabled={isInspectingVideo}
                          onClick={() => videoInputRef.current?.click()}
                          className="px-3.5 py-2 rounded-lg bg-[var(--wa-accent)] text-white text-xs font-semibold flex items-center gap-1.5 hover:brightness-95 cursor-pointer"
                        >
                          <Upload className="w-3.5 h-3.5" aria-hidden="true" />
                          <span>اختيار فيديو</span>
                        </button>
                        <button
                          type="button"
                          disabled={isInspectingVideo}
                          onClick={() => void handleStartVideoRecording()}
                          className="px-3.5 py-2 rounded-lg bg-[#202C33] text-[#E9EDEF] text-xs font-semibold flex items-center gap-1.5 hover:bg-[#2A3942] cursor-pointer"
                        >
                          <Camera className="w-3.5 h-3.5 text-[var(--wa-accent)]" aria-hidden="true" />
                          <span>تسجيل مباشر (٣ دقائق)</span>
                        </button>
                      </div>
                    </div>
                  )}

                  <input
                    ref={videoInputRef}
                    type="file"
                    accept="video/*"
                    aria-label="رفع مقطع فيديو للحالة"
                    onChange={(e) => void handleVideoInputChange(e)}
                    className="hidden"
                  />

                  <input
                    type="text"
                    maxLength={500}
                    value={content}
                    onChange={(e) => setContent(e.target.value)}
                    placeholder="أضف وصفاً لمقطع الفيديو (اختياري)..."
                    aria-label="وصف الفيديو"
                    className="w-full rounded-lg bg-[#202C33] px-3 py-2 text-xs text-white placeholder:text-[#8696A0] focus:outline-none focus:ring-1 focus:ring-[var(--wa-accent)]"
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
                            bgColor === c ? 'ring-2 ring-offset-2 ring-[var(--wa-accent)]' : ''
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
                              ? 'bg-[var(--wa-accent)] text-white font-semibold'
                              : 'bg-[#F0F2F5] dark:bg-[#111B21] text-[#54656F] dark:text-[#AEBAC1]'
                          }`}
                        >
                          {f.label}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                <div className="p-3 rounded-xl bg-[#F0F2F5] dark:bg-[#111B21] space-y-2.5">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-semibold text-[#111B21] dark:text-[#E9EDEF] flex items-center gap-1.5">
                      <Users className="w-3.5 h-3.5 text-[var(--wa-accent)]" aria-hidden="true" />
                      <span>من يمكنه رؤية الحالة؟</span>
                    </span>
                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => setAudienceMode('all_contacts')}
                        className={`px-2.5 py-1 rounded-md text-[11px] font-medium cursor-pointer ${
                          audienceMode === 'all_contacts'
                            ? 'bg-[var(--wa-accent)] text-white'
                            : 'bg-white dark:bg-[#202C33] text-[#54656F] dark:text-[#AEBAC1]'
                        }`}
                      >
                        الكل ({contacts.length})
                      </button>
                      <button
                        type="button"
                        onClick={() => setAudienceMode('selected')}
                        className={`px-2.5 py-1 rounded-md text-[11px] font-medium cursor-pointer ${
                          audienceMode === 'selected'
                            ? 'bg-[var(--wa-accent)] text-white'
                            : 'bg-white dark:bg-[#202C33] text-[#54656F] dark:text-[#AEBAC1]'
                        }`}
                      >
                        تحديد جهات
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
                            className={`px-2.5 py-1 rounded-lg text-[11px] flex items-center gap-1.5 border cursor-pointer ${
                              checked
                                ? 'bg-[var(--wa-accent-soft)] border-[var(--wa-accent)] text-[var(--wa-accent-strong)] font-semibold'
                                : 'bg-white dark:bg-[#202C33] border-transparent text-[#54656F] dark:text-[#AEBAC1]'
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

            <footer className="px-4 py-3 border-t border-[#E9EDEF] dark:border-[#2A3942] flex items-center justify-between gap-2 shrink-0">
              <span className="text-[11px] text-[#54656F] dark:text-[#8696A0] flex items-center gap-1">
                <Clock className="w-3.5 h-3.5" aria-hidden="true" />
                <span>تختفي بعد ٢٤ ساعة</span>
              </span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    resetComposerMedia();
                    setShowComposer(false);
                  }}
                  className="px-3.5 py-2 rounded-lg text-xs text-[#54656F] dark:text-[#AEBAC1] cursor-pointer"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  disabled={isPublishing || isInspectingVideo || isRecordingVideo}
                  className="px-5 py-2 rounded-lg bg-[var(--wa-accent)] text-white text-xs font-semibold hover:brightness-95 disabled:opacity-60 cursor-pointer"
                >
                  {isPublishing ? 'جاري النشر...' : 'نشر الحالة الآن'}
                </button>
              </div>
            </footer>
          </form>
        </div>
      )}
    </div>
  );
}
