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
  groupStoriesByUser,
  MAX_STATUS_MEDIA_BYTES,
  MAX_STATUS_VIDEO_SECONDS,
  resolveStatusViewerIds,
  sortStatusesWithPinned,
  stepStoryViewerPosition,
  type StoryUserGroup
} from '../lib/chatLogic';
import { BUNDLED_ASSETS, resolveBundledAssetUrl } from '../data/assets';
import {
  downloadMediaUriOrUrl,
  encodeShortVideoForCloudStory,
  inspectVideoAndCapturePoster,
  resolvePlayableMediaUrl
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
  onReplyToStatus?: (
    authorId: string,
    authorName: string,
    replyText: string,
    statusPreview: string
  ) => void;
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
    url: BUNDLED_ASSETS.statusDesertSunset
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
        let quality = 0.78;
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
  const words = (story.content || 'قصة تواصل').split(/\s+/);
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

function StorySegmentedRing({
  stories,
  isSelf,
  children
}: {
  stories: StatusItem[];
  isSelf?: boolean;
  children: React.ReactNode;
}) {
  const count = Math.max(1, stories.length);
  const radius = 25;
  const circumference = 2 * Math.PI * radius;
  const gap = count > 1 ? 5 : 0;
  const segLen = Math.max(4, (circumference - count * gap) / count);

  return (
    <div className="relative w-14 h-14 flex items-center justify-center shrink-0">
      <svg
        viewBox="0 0 56 56"
        className="absolute inset-0 w-full h-full -rotate-90 pointer-events-none"
        aria-hidden="true"
      >
        {stories.map((st, idx) => {
          const strokeColor =
            st.pinned
              ? '#F59E0B'
              : isSelf || !st.viewedByMe
                ? 'var(--wa-accent)'
                : 'rgba(134, 150, 160, 0.45)';
          const offset = -(idx * (segLen + gap));
          return (
            <circle
              key={st.id}
              cx="28"
              cy="28"
              r={radius}
              fill="none"
              stroke={strokeColor}
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeDasharray={`${segLen} ${circumference}`}
              strokeDashoffset={offset}
            />
          );
        })}
      </svg>
      <div className="relative z-10">{children}</div>
    </div>
  );
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
  const [viewerAuthorOrder, setViewerAuthorOrder] = useState<string[] | null>(null);
  const [viewerUserIndex, setViewerUserIndex] = useState<number>(0);
  const [viewerStoryIndex, setViewerStoryIndex] = useState<number>(0);
  const [isPaused, setIsPaused] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [isBrowserFullscreen, setIsBrowserFullscreen] = useState(false);
  const [progress, setProgress] = useState(0);
  const [videoTimeSec, setVideoTimeSec] = useState(0);
  const [resolvedVideoSrc, setResolvedVideoSrc] = useState<string | null>(null);
  const [downloadedId, setDownloadedId] = useState<string | null>(null);
  const [quickReply, setQuickReply] = useState('');
  const [showViewersModal, setShowViewersModal] = useState(false);

  const [showComposer, setShowComposer] = useState(false);
  const [composeMode, setComposeMode] = useState<'text' | 'image' | 'video'>('image');
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

  const allStoryGroups = useMemo(
    () => groupStoriesByUser(activeStatuses, currentUser.uid),
    [activeStatuses, currentUser.uid]
  );

  const myStoryGroup = useMemo(
    () => allStoryGroups.find((g) => g.authorId === currentUser.uid) || null,
    [allStoryGroups, currentUser.uid]
  );

  const contactStoryGroups = useMemo(
    () => allStoryGroups.filter((g) => g.authorId !== currentUser.uid),
    [allStoryGroups, currentUser.uid]
  );

  const unviewedUserGroups = useMemo(
    () => contactStoryGroups.filter((g) => g.unviewedCount > 0),
    [contactStoryGroups]
  );

  const viewedUserGroups = useMemo(
    () => contactStoryGroups.filter((g) => g.unviewedCount === 0),
    [contactStoryGroups]
  );

  // Build ordered StoryUserGroups currently inside the fullscreen viewer so live edits/reads stay synced
  const viewerGroups = useMemo<StoryUserGroup[] | null>(() => {
    if (!viewerAuthorOrder) return null;
    const byAuthor = new Map(allStoryGroups.map((g) => [g.authorId, g]));
    const resolved: StoryUserGroup[] = [];
    for (const authorId of viewerAuthorOrder) {
      const grp = byAuthor.get(authorId);
      if (grp && grp.stories.length > 0) {
        resolved.push(grp);
      }
    }
    return resolved.length > 0 ? resolved : null;
  }, [viewerAuthorOrder, allStoryGroups]);

  const safeUserIndex =
    viewerGroups && viewerUserIndex >= 0 && viewerUserIndex < viewerGroups.length
      ? viewerUserIndex
      : 0;
  const activeUserGroup = viewerGroups ? viewerGroups[safeUserIndex] || null : null;
  const safeStoryIndex =
    activeUserGroup &&
    viewerStoryIndex >= 0 &&
    viewerStoryIndex < activeUserGroup.stories.length
      ? viewerStoryIndex
      : 0;
  const activeStory = activeUserGroup ? activeUserGroup.stories[safeStoryIndex] || null : null;

  const openViewerForAuthor = (
    authorId: string,
    groupsPool: StoryUserGroup[] = allStoryGroups,
    explicitStoryIdx?: number
  ) => {
    if (groupsPool.length === 0) return;
    const targetIdx = groupsPool.findIndex((g) => g.authorId === authorId);
    const resolvedIdx = targetIdx >= 0 ? targetIdx : 0;
    const targetGroup = groupsPool[resolvedIdx];
    const startStoryIdx =
      typeof explicitStoryIdx === 'number'
        ? Math.max(0, Math.min(explicitStoryIdx, targetGroup.stories.length - 1))
        : targetGroup.firstUnviewedIndex;

    setViewerAuthorOrder(groupsPool.map((g) => g.authorId));
    setViewerUserIndex(resolvedIdx);
    setViewerStoryIndex(startStoryIdx);
    setProgress(0);
    setIsPaused(false);
    setShowViewersModal(false);
    const opened = targetGroup.stories[startStoryIdx];
    if (opened) onMarkViewed(opened.id);
  };

  // Open specific author stories directly when launched from Stories Tray
  useEffect(() => {
    if (!initialAuthorId) return;
    const targetGroup = allStoryGroups.find((g) => g.authorId === initialAuthorId);
    if (targetGroup) {
      const pool =
        initialAuthorId === currentUser.uid
          ? allStoryGroups
          : contactStoryGroups.length > 0
            ? contactStoryGroups
            : allStoryGroups;
      openViewerForAuthor(initialAuthorId, pool);
    }
    onConsumeInitialAuthor?.();
  }, [initialAuthorId, allStoryGroups]);

  const exitViewer = async () => {
    if (document.fullscreenElement) {
      try {
        await document.exitFullscreen();
      } catch {
        // ignore fullscreen exit error
      }
    }
    setViewerAuthorOrder(null);
    setShowViewersModal(false);
  };

  const navigateViewer = (direction: 'next' | 'prev') => {
    if (!viewerGroups) return;
    const nextPos = stepStoryViewerPosition(
      viewerGroups,
      safeUserIndex,
      safeStoryIndex,
      direction
    );
    if (!nextPos) {
      if (direction === 'next') {
        void exitViewer();
      } else {
        setProgress(0);
      }
      return;
    }
    setViewerUserIndex(nextPos.userIdx);
    setViewerStoryIndex(nextPos.storyIdx);
    setProgress(0);
    setVideoTimeSec(0);
    const nextStory = viewerGroups[nextPos.userIdx]?.stories[nextPos.storyIdx];
    if (nextStory) onMarkViewed(nextStory.id);
  };

  const jumpToViewerUser = (targetUserIdx: number) => {
    if (!viewerGroups || targetUserIdx < 0 || targetUserIdx >= viewerGroups.length) return;
    const targetGroup = viewerGroups[targetUserIdx];
    const startIdx = targetGroup.firstUnviewedIndex;
    setViewerUserIndex(targetUserIdx);
    setViewerStoryIndex(startIdx);
    setProgress(0);
    setVideoTimeSec(0);
    setIsPaused(false);
    const nextStory = targetGroup.stories[startIdx];
    if (nextStory) onMarkViewed(nextStory.id);
  };

  // Resolve IndexedDB or Data URL for video statuses in the viewer
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
    if (!viewerGroups || !activeStory || isPaused) return;
    onMarkViewed(activeStory.id);
    if (activeStory.type === 'video' && resolvedVideoSrc) return;

    const interval = window.setInterval(() => {
      setProgress((p) => {
        if (p >= 100) {
          navigateViewer('next');
          return 0;
        }
        return p + 2;
      });
    }, 100);
    return () => window.clearInterval(interval);
  }, [viewerGroups, safeUserIndex, safeStoryIndex, activeStory?.id, activeStory?.type, isPaused, resolvedVideoSrc]);

  useEffect(() => {
    setProgress(0);
    setVideoTimeSec(0);
    setQuickReply('');
  }, [safeUserIndex, safeStoryIndex, activeStory?.id]);

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
    if (!viewerGroups) return;
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
        navigateViewer('next');
      } else if (e.key === 'ArrowRight') {
        navigateViewer('prev');
      } else if (e.key === 'ArrowDown' && safeUserIndex + 1 < viewerGroups.length) {
        e.preventDefault();
        jumpToViewerUser(safeUserIndex + 1);
      } else if (e.key === 'ArrowUp' && safeUserIndex > 0) {
        e.preventDefault();
        jumpToViewerUser(safeUserIndex - 1);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [viewerGroups, safeUserIndex, safeStoryIndex]);

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

  const toggleBrowserFullscreen = async () => {
    try {
      if (!document.fullscreenElement && viewerContainerRef.current?.requestFullscreen) {
        await viewerContainerRef.current.requestFullscreen();
      } else if (document.fullscreenElement) {
        await document.exitFullscreen();
      }
    } catch {
      // Browser policy blocked native fullscreen; CSS 100dvh fullscreen remains active
    }
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
    const stamp = `wasil-story-${story.id.slice(-6)}`;
    if (story.type === 'video' && story.mediaUrl) {
      const ok = await downloadMediaUriOrUrl(story.mediaUrl, `${stamp}.webm`);
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
        setComposeError(inspected.error || 'مدة الفيديو غير صالحة.');
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
      setComposeError('متصفحك لا يدعم تسجيل الفيديو المباشر. يمكنك اختيار مقطع فيديو قصير من جهازك.');
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 480 }, height: { ideal: 854 }, frameRate: { ideal: 24 } },
        audio: true
      });
      recordStreamRef.current = stream;
      recordChunksRef.current = [];
      if (liveCamVideoRef.current) {
        liveCamVideoRef.current.srcObject = stream;
      }

      const preferredMime = ['video/webm;codecs=vp8', 'video/webm', 'video/mp4'].find((m) =>
        MediaRecorder.isTypeSupported(m)
      );
      const recorder = preferredMime
        ? new MediaRecorder(stream, { mimeType: preferredMime, videoBitsPerSecond: 240_000 })
        : new MediaRecorder(stream, { videoBitsPerSecond: 240_000 });
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

      recorder.start(400);
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
      setComposeError('يرجى كتابة نص القصة قبل النشر.');
      return;
    }
    if (composeMode === 'image' && !mediaUrl) {
      setComposeError('يرجى رفع صورة أو اختيار صورة قبل النشر.');
      return;
    }
    if (composeMode === 'video' && !pendingVideoBlob) {
      setComposeError('يرجى اختيار أو تسجيل مقطع فيديو قصير قبل النشر.');
      return;
    }

    const allContactUids = contacts.map((c) => c.uid);
    const chosenContacts =
      audienceMode === 'selected' ? selectedContactIds : allContactUids;

    if (audienceMode === 'selected' && chosenContacts.length === 0) {
      setComposeError('اختر جهة اتصال واحدة على الأقل لمشاركة القصة معها.');
      return;
    }

    const viewerIds = resolveStatusViewerIds(currentUser.uid, allContactUids, chosenContacts);
    const generatedId = `st_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;

    setIsPublishing(true);
    try {
      let resolvedMediaUrl = mediaUrl;
      if (composeMode === 'video' && pendingVideoBlob) {
        const encoded = await encodeShortVideoForCloudStory(pendingVideoBlob);
        resolvedMediaUrl = encoded.mediaUrl;
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
              durationSec: pendingVideoDuration || 8
            }
          : {}),
        viewerIds
      });
      setContent('');
      resetComposerMedia();
      setShowComposer(false);
    } catch (err) {
      setComposeError(err instanceof Error ? err.message : 'تعذر نشر القصة الآن. يرجى المحاولة مرة أخرى.');
    } finally {
      setIsPublishing(false);
    }
  };

  const handleDelete = async (statusId: string) => {
    const isViewingTarget = activeStory?.id === statusId;
    await onDeleteStatus(statusId);
    if (isViewingTarget && viewerGroups && activeUserGroup) {
      const remainingStoriesInUser = activeUserGroup.stories.filter((s) => s.id !== statusId);
      if (remainingStoriesInUser.length > 0) {
        setViewerStoryIndex((idx) => Math.min(idx, remainingStoriesInUser.length - 1));
      } else if (viewerGroups.length > 1) {
        const nextUserIdx =
          safeUserIndex < viewerGroups.length - 1 ? safeUserIndex : Math.max(0, safeUserIndex - 1);
        setViewerUserIndex(nextUserIdx);
        setViewerStoryIndex(0);
      } else {
        await exitViewer();
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
      activeStory.content || (activeStory.type === 'video' ? 'قصة فيديو' : 'قصة مصورة')
    );
    setQuickReply('');
    void exitViewer();
  };

  const activeFontClass =
    FONT_STYLES.find((f) => f.id === (activeStory?.fontStyle || 'display'))?.className ||
    'font-display font-bold';
  const composerFontClass =
    FONT_STYLES.find((f) => f.id === fontStyle)?.className || 'font-display font-bold';

  const hasPrevPosition =
    viewerGroups !== null &&
    stepStoryViewerPosition(viewerGroups, safeUserIndex, safeStoryIndex, 'prev') !== null;
  const hasNextPosition =
    viewerGroups !== null &&
    stepStoryViewerPosition(viewerGroups, safeUserIndex, safeStoryIndex, 'next') !== null;

  const renderUserGroupRow = (group: StoryUserGroup, groupsPool: StoryUserGroup[]) => {
    const hasVideo = group.stories.some((s) => s.type === 'video');
    const isUnviewed = group.unviewedCount > 0;
    return (
      <li
        key={group.authorId}
        className="px-2.5 py-2 rounded-xl bg-[#F8FAFB] dark:bg-[#182229] flex items-center justify-between gap-2 hover:bg-[#F0F2F5] dark:hover:bg-[#202C33] transition-colors"
      >
        <button
          type="button"
          onClick={() => openViewerForAuthor(group.authorId, groupsPool)}
          className="flex items-center gap-2.5 flex-1 min-w-0 text-right cursor-pointer"
        >
          <div className="relative shrink-0">
            <StorySegmentedRing stories={group.stories}>
              <Avatar src={group.authorAvatar} name={group.authorName} size="md" />
            </StorySegmentedRing>
            {hasVideo && (
              <span className="absolute bottom-0 left-0 z-20 w-4.5 h-4.5 rounded-full bg-[var(--wa-accent)] text-white flex items-center justify-center ring-2 ring-white dark:ring-[#182229]">
                <Video className="w-2.5 h-2.5" aria-hidden="true" />
              </span>
            )}
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5">
              <p className="text-xs sm:text-sm font-semibold text-[#111B21] dark:text-[#E9EDEF] truncate">
                {group.authorName}
              </p>
              {group.hasPinned && (
                <Pin className="w-3 h-3 text-amber-500 shrink-0 rotate-45" aria-label="مثبتة" />
              )}
            </div>
            <p className="text-[11px] text-[#54656F] dark:text-[#8696A0] flex items-center gap-1.5 truncate">
              <span className={isUnviewed ? 'text-[var(--wa-accent-strong)] font-semibold' : ''}>
                {group.stories.length === 1 ? 'قصة واحدة' : `${group.stories.length} قصص`}
              </span>
              <span>·</span>
              <span>{formatWhatsAppTime(group.latestCreatedAtMs)}</span>
              <span>·</span>
              <span>{formatRemainingStatusTime(group.earliestExpiresAtMs)}</span>
            </p>
          </div>
        </button>

        <div className="flex items-center gap-1.5 shrink-0">
          {isUnviewed && (
            <span
              className="w-2 h-2 rounded-full bg-[var(--wa-accent)]"
              title={`${group.unviewedCount} غير مشاهدة`}
            />
          )}
          <ChevronLeft className="w-4 h-4 text-[#8696A0]" aria-hidden="true" />
        </div>
      </li>
    );
  };

  const renderMyOwnStoryRow = (st: StatusItem, idx: number) => {
    const isPinned = Boolean(st.pinned);
    return (
      <li
        key={st.id}
        className="px-2.5 py-2 rounded-xl bg-[#F8FAFB] dark:bg-[#182229] flex items-center justify-between gap-2 hover:bg-[#F0F2F5] dark:hover:bg-[#202C33] transition-colors"
      >
        <button
          type="button"
          onClick={() => openViewerForAuthor(currentUser.uid, allStoryGroups, idx)}
          className="flex items-center gap-2.5 flex-1 min-w-0 text-right cursor-pointer"
        >
          <div className="w-10 h-10 rounded-xl overflow-hidden bg-[#202C33] shrink-0 flex items-center justify-center text-white text-xs font-bold">
            {st.type === 'image' && st.mediaUrl ? (
              <img
                src={resolveBundledAssetUrl(st.mediaUrl)}
                alt={st.content || 'قصة مصورة'}
                className="w-full h-full object-cover"
              />
            ) : st.type === 'video' ? (
              st.posterUrl ? (
                <img
                  src={st.posterUrl}
                  alt={st.content || 'قصة فيديو'}
                  className="w-full h-full object-cover"
                />
              ) : (
                <Video className="w-4 h-4 text-[var(--wa-accent)]" aria-hidden="true" />
              )
            ) : (
              <div
                className="w-full h-full flex items-center justify-center p-1 text-[9px] leading-tight text-center"
                style={{ backgroundColor: st.backgroundColor || '#005C4B' }}
              >
                <Type className="w-4 h-4" aria-hidden="true" />
              </div>
            )}
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5">
              <p className="text-xs sm:text-sm font-semibold text-[#111B21] dark:text-[#E9EDEF] truncate">
                {st.content || (st.type === 'video' ? 'مقطع فيديو قصير' : 'قصة مصورة')}
              </p>
              {isPinned && (
                <Pin className="w-3 h-3 text-amber-500 shrink-0 rotate-45" aria-label="قصة مثبتة" />
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

        <div className="flex items-center gap-1 shrink-0">
          <span className="hidden sm:inline-flex text-[11px] font-mono-code text-[#54656F] dark:text-[#8696A0] items-center gap-1 pl-1">
            <Eye className="w-3.5 h-3.5" aria-hidden="true" />
            {st.viewCount}
          </span>
          <button
            type="button"
            aria-label={isPinned ? 'إلغاء تثبيت القصة' : 'تثبيت القصة'}
            title={isPinned ? 'إلغاء التثبيت' : 'تثبيت القصة'}
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
            aria-label="تحميل القصة"
            title="حفظ / تحميل القصة"
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
            aria-label={`حذف قصة ${st.content || 'خاصة بي'}`}
            title="حذف القصة"
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
      {/* Left Stories Feed Sidebar */}
      <div className="w-full max-w-full min-w-0 md:w-96 lg:w-[410px] border-l border-[#E9EDEF] dark:border-[#222D34] flex flex-col h-full md:shrink-0 overflow-hidden">
        <header className="h-16 px-3 sm:px-4 flex items-center justify-between gap-2 border-b border-[#F0F2F5] dark:border-[#222D34] shrink-0 min-w-0">
          <div className="min-w-0">
            <h1 className="font-display text-lg sm:text-xl font-bold text-[#111B21] dark:text-[#E9EDEF] truncate">
              القصص والحالات
            </h1>
            <p className="text-[11px] text-[#54656F] dark:text-[#8696A0] flex items-center gap-1.5 truncate">
              <span>تختفي بعد ٢٤ ساعة</span>
              {hideViewStatus && (
                <>
                  <span>·</span>
                  <span className="text-[var(--wa-accent-strong)] font-semibold inline-flex items-center gap-1">
                    <EyeOff className="w-3 h-3" aria-hidden="true" />
                    تخفي نشط
                  </span>
                </>
              )}
            </p>
          </div>
          <div className="flex items-center gap-1 sm:gap-1.5 shrink-0">
            <button
              type="button"
              aria-label="إضافة قصة فيديو قصيرة"
              onClick={() => openComposer('video')}
              className="w-8 h-8 sm:w-9 sm:h-9 rounded-full bg-[#F0F2F5] dark:bg-[#202C33] text-[#54656F] dark:text-[#AEBAC1] hover:text-[var(--wa-accent)] flex items-center justify-center cursor-pointer"
              title="نشر فيديو قصير"
            >
              <Video className="w-4 h-4" aria-hidden="true" />
            </button>
            <button
              type="button"
              aria-label="إضافة قصة مصورة"
              onClick={() => openComposer('image')}
              className="w-8 h-8 sm:w-9 sm:h-9 rounded-full bg-[#F0F2F5] dark:bg-[#202C33] text-[#54656F] dark:text-[#AEBAC1] hover:text-[var(--wa-accent)] flex items-center justify-center cursor-pointer"
              title="نشر صورة"
            >
              <ImageIcon className="w-4 h-4" aria-hidden="true" />
            </button>
            <button
              type="button"
              onClick={() => openComposer('image')}
              className="px-2.5 sm:px-3 py-1.5 sm:py-2 rounded-full bg-[var(--wa-accent)] text-white text-[11px] sm:text-xs font-semibold flex items-center gap-1 hover:brightness-95 whitespace-nowrap cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5 sm:w-4 sm:h-4" aria-hidden="true" />
              <span>قصة جديدة</span>
            </button>
          </div>
        </header>

        <div className="flex-1 min-w-0 overflow-y-auto overflow-x-hidden p-3 space-y-5 pb-24 md:pb-6">
          {/* My Stories Section */}
          <div>
            <div className="w-full p-2.5 rounded-xl flex items-center gap-3 hover:bg-[#F5F6F6] dark:hover:bg-[#202C33] transition-colors">
              <button
                type="button"
                onClick={() =>
                  myStoryGroup
                    ? openViewerForAuthor(currentUser.uid, allStoryGroups)
                    : openComposer('image')
                }
                className="flex items-center gap-3 flex-1 min-w-0 text-right cursor-pointer"
              >
                <div className="relative shrink-0">
                  {myStoryGroup ? (
                    <StorySegmentedRing stories={myStoryGroup.stories} isSelf>
                      <Avatar src={currentUser.avatarUrl} name={currentUser.displayName} size="md" />
                    </StorySegmentedRing>
                  ) : (
                    <div className="p-0.5 rounded-full border-2 border-dashed border-[var(--wa-accent)]">
                      <Avatar src={currentUser.avatarUrl} name={currentUser.displayName} size="md" />
                    </div>
                  )}
                  {!myStoryGroup && (
                    <span className="absolute -bottom-0.5 -left-0.5 w-5 h-5 rounded-full bg-[var(--wa-accent)] text-white flex items-center justify-center ring-2 ring-white dark:ring-[#111B21]">
                      <Plus className="w-3.5 h-3.5" aria-hidden="true" />
                    </span>
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-[#111B21] dark:text-[#E9EDEF]">قصتي</p>
                  <p className="text-xs text-[#54656F] dark:text-[#8696A0] truncate">
                    {myStoryGroup
                      ? `${myStoryGroup.stories.length} قصة نشطة · ${formatRemainingStatusTime(myStoryGroup.earliestExpiresAtMs)}`
                      : 'شارك صورة أو فيديو قصير يختفي بعد ٢٤ ساعة'}
                  </p>
                </div>
              </button>

              <button
                type="button"
                aria-label="إضافة قصة جديدة"
                onClick={() => openComposer('video')}
                className="w-8 h-8 rounded-full bg-[#F0F2F5] dark:bg-[#202C33] text-[var(--wa-accent)] flex items-center justify-center hover:brightness-95 cursor-pointer"
                title="نشر قصة جديدة"
              >
                <Plus className="w-4 h-4" aria-hidden="true" />
              </button>
            </div>

            {myStoryGroup && (
              <ul className="mt-1 space-y-1.5 pr-1">
                {myStoryGroup.stories.map((st, idx) => renderMyOwnStoryRow(st, idx))}
              </ul>
            )}
          </div>

          {/* Unviewed Users' Stories */}
          <div>
            <p className="px-2 pb-2 text-xs font-semibold text-[var(--wa-accent-strong)]">
              قصص جديدة ({unviewedUserGroups.length})
            </p>
            {unviewedUserGroups.length === 0 ? (
              <p className="px-2 text-xs text-[#667781] dark:text-[#8696A0]">
                لا توجد قصص جديدة غير مشاهدة من جهات اتصالك حالياً.
              </p>
            ) : (
              <ul className="space-y-1.5">
                {unviewedUserGroups.map((grp) => renderUserGroupRow(grp, contactStoryGroups))}
              </ul>
            )}
          </div>

          {/* Viewed Users' Stories */}
          {viewedUserGroups.length > 0 && (
            <div>
              <p className="px-2 pb-2 text-xs font-semibold text-[#54656F] dark:text-[#8696A0]">
                تمت مشاهدتها ({viewedUserGroups.length})
              </p>
              <ul className="space-y-1.5">
                {viewedUserGroups.map((grp) => renderUserGroupRow(grp, contactStoryGroups))}
              </ul>
            </div>
          )}
        </div>
      </div>

      {/* Right Interactive Stories Stage (Desktop) */}
      <div className="hidden md:flex flex-1 flex-col min-w-0 bg-[#F0F2F5] dark:bg-[#0B141A] overflow-y-auto p-6">
        <div className="max-w-5xl w-full mx-auto space-y-6">
          {/* Quick Creation Header Bar */}
          <div className="bg-white dark:bg-[#111B21] border border-[#E9EDEF] dark:border-[#222D34] rounded-2xl p-5 flex flex-wrap items-center justify-between gap-4">
            <div className="space-y-1">
              <h2 className="font-display text-lg font-bold text-[#111B21] dark:text-[#E9EDEF]">
                استكشف القصص وتنقّل بين المستخدمين
              </h2>
              <p className="text-xs text-[#54656F] dark:text-[#8696A0]">
                انشر صوراً ومقاطع فيديو قصيرة تختفي تلقائياً بعد ٢٤ ساعة، وتنقّل بسلاسة بين قصص جميع جهات الاتصال.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => openComposer('image')}
                className="px-3.5 py-2 rounded-xl bg-[var(--wa-accent)] text-white text-xs font-semibold flex items-center gap-1.5 hover:brightness-95 cursor-pointer"
              >
                <ImageIcon className="w-4 h-4" aria-hidden="true" />
                <span>نشر صورة</span>
              </button>
              <button
                type="button"
                onClick={() => openComposer('video')}
                className="px-3.5 py-2 rounded-xl bg-[#F0F2F5] dark:bg-[#202C33] text-[#111B21] dark:text-[#E9EDEF] text-xs font-semibold flex items-center gap-1.5 hover:brightness-95 cursor-pointer"
              >
                <Video className="w-4 h-4 text-[var(--wa-accent)]" aria-hidden="true" />
                <span>فيديو قصير</span>
              </button>
              <button
                type="button"
                onClick={() => openComposer('text')}
                className="px-3.5 py-2 rounded-xl bg-[#F0F2F5] dark:bg-[#202C33] text-[#111B21] dark:text-[#E9EDEF] text-xs font-semibold flex items-center gap-1.5 hover:brightness-95 cursor-pointer"
              >
                <Type className="w-4 h-4 text-[var(--wa-accent)]" aria-hidden="true" />
                <span>قصة نصية</span>
              </button>
            </div>
          </div>

          {/* Story Cards Grid Grouped by User */}
          {allStoryGroups.length > 0 ? (
            <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {allStoryGroups.map((group) => {
                const latest = group.stories[group.stories.length - 1];
                const isSelf = group.authorId === currentUser.uid;
                const previewImage =
                  latest.type === 'image'
                    ? resolveBundledAssetUrl(latest.mediaUrl || '')
                    : latest.type === 'video'
                      ? latest.posterUrl || ''
                      : '';
                return (
                  <button
                    key={group.authorId}
                    type="button"
                    onClick={() => openViewerForAuthor(group.authorId, allStoryGroups)}
                    className="group relative aspect-[9/14] rounded-2xl overflow-hidden bg-[#111B21] border border-[#E9EDEF] dark:border-[#222D34] text-right shadow-xs hover:shadow-md transition-all cursor-pointer flex flex-col justify-between"
                    style={{
                      backgroundColor:
                        latest.type === 'text' ? latest.backgroundColor || '#005C4B' : '#0B141A'
                    }}
                  >
                    {previewImage && (
                      <img
                        src={previewImage}
                        alt={group.authorName}
                        referrerPolicy="no-referrer"
                        className="absolute inset-0 w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                      />
                    )}

                    {latest.type === 'text' && (
                      <div className="absolute inset-0 flex items-center justify-center p-4 text-center">
                        <p className="text-white text-sm font-bold line-clamp-4 leading-relaxed">
                          {latest.content}
                        </p>
                      </div>
                    )}

                    {latest.type === 'video' && !previewImage && (
                      <div className="absolute inset-0 flex items-center justify-center text-white/70">
                        <Video className="w-10 h-10" aria-hidden="true" />
                      </div>
                    )}

                    {/* Top Scrim & Avatar */}
                    <div className="relative z-10 p-3 bg-gradient-to-b from-black/75 to-transparent flex items-center justify-between gap-2">
                      <div className="p-0.5 rounded-full border-2 border-white/80 shrink-0">
                        <Avatar src={group.authorAvatar} name={group.authorName} size="sm" />
                      </div>
                      <span className="text-[10px] font-mono-code text-white/90 bg-black/45 px-2 py-0.5 rounded">
                        {group.stories.length} {group.stories.length === 1 ? 'قصة' : 'قصص'}
                      </span>
                    </div>

                    {/* Bottom Author & 24h Expiry Info */}
                    <div className="relative z-10 p-3 bg-gradient-to-t from-black/85 via-black/45 to-transparent text-white">
                      <p className="text-xs font-bold truncate">
                        {isSelf ? 'قصتي' : group.authorName}
                      </p>
                      <p className="text-[10px] text-white/80 flex items-center gap-1 mt-0.5 truncate">
                        <Clock className="w-3 h-3 shrink-0" aria-hidden="true" />
                        <span>{formatRemainingStatusTime(group.earliestExpiresAtMs)}</span>
                      </p>
                    </div>
                  </button>
                );
              })}
            </div>
          ) : (
            <div className="bg-white dark:bg-[#111B21] border border-[#E9EDEF] dark:border-[#222D34] rounded-2xl p-10 text-center space-y-3">
              <div className="w-14 h-14 mx-auto rounded-2xl bg-[var(--wa-accent-soft)] text-[var(--wa-accent-strong)] flex items-center justify-center">
                <Camera className="w-7 h-7" aria-hidden="true" />
              </div>
              <h3 className="font-display text-base font-bold text-[#111B21] dark:text-[#E9EDEF]">
                لا توجد قصص نشطة حالياً
              </h3>
              <p className="text-xs text-[#54656F] dark:text-[#8696A0] max-w-md mx-auto leading-relaxed">
                ابدأ برفع صورة أو تسجيل مقطع فيديو قصير لمشاركته مع جهات اتصالك لمدة ٢٤ ساعة.
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Edge-to-Edge Multi-User Fullscreen Story Viewer */}
      {activeStory && viewerGroups && activeUserGroup && (
        <div
          ref={viewerContainerRef}
          role="dialog"
          aria-modal="true"
          aria-label={`عرض قصص ${activeStory.authorName}`}
          className="fixed inset-0 z-[55] w-full max-w-full h-[100dvh] bg-black text-white flex flex-col justify-between overflow-hidden select-none"
          style={{
            backgroundColor: activeStory.type === 'text' ? activeStory.backgroundColor : '#000000'
          }}
        >
          {/* Background Image or Video Layer */}
          {activeStory.type === 'image' && activeStory.mediaUrl && (
            <img
              src={resolveBundledAssetUrl(activeStory.mediaUrl)}
              alt={activeStory.content || 'قصة مصورة'}
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
                  onEnded={() => navigateViewer('next')}
                  className="w-full h-full object-contain"
                />
              ) : activeStory.posterUrl ? (
                <img
                  src={activeStory.posterUrl}
                  alt={activeStory.content || 'قصة فيديو'}
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

          {/* Edge Tap Navigation Zones (Crosses smoothly between different users' stories) */}
          <div className="absolute inset-0 z-[5] grid grid-cols-3">
            <button
              type="button"
              aria-label="القصة التالية"
              onClick={() => navigateViewer('next')}
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
              aria-label="القصة السابقة"
              onClick={() => navigateViewer('prev')}
              className="h-full w-full cursor-pointer focus:outline-none"
            />
          </div>

          {/* Top Edge-to-Edge Control Bar */}
          <header className="relative z-20 px-4 pt-4 pb-6 bg-gradient-to-b from-black/90 via-black/50 to-transparent">
            <div className="max-w-5xl mx-auto space-y-3">
              {/* Clickable Progress Segments for Active User's Stories */}
              <div className="flex gap-1.5">
                {activeUserGroup.stories.map((s, i) => (
                  <button
                    key={s.id}
                    type="button"
                    aria-label={`الانتقال إلى القصة ${i + 1}`}
                    onClick={() => {
                      setViewerStoryIndex(i);
                      setProgress(0);
                      setVideoTimeSec(0);
                      onMarkViewed(s.id);
                    }}
                    className="flex-1 h-1.5 rounded-full bg-white/30 overflow-hidden cursor-pointer"
                  >
                    <div
                      className="h-full bg-white transition-all duration-100"
                      style={{
                        width: i < safeStoryIndex ? '100%' : i === safeStoryIndex ? `${progress}%` : '0%'
                      }}
                    />
                  </button>
                ))}
              </div>

              {/* Multi-User Stories Switcher Bar (when multiple users have stories) */}
              {viewerGroups.length > 1 && (
                <div className="flex items-center gap-2 overflow-x-auto no-scrollbar pb-0.5">
                  <button
                    type="button"
                    aria-label="المستخدم السابق"
                    disabled={safeUserIndex === 0}
                    onClick={() => jumpToViewerUser(safeUserIndex - 1)}
                    className="px-2 py-1 rounded-full bg-white/10 hover:bg-white/20 disabled:opacity-35 text-[11px] flex items-center gap-1 shrink-0 cursor-pointer"
                  >
                    <ChevronRight className="w-3.5 h-3.5" aria-hidden="true" />
                    <span className="hidden sm:inline">السابق</span>
                  </button>

                  <div className="flex items-center gap-1.5 flex-1 overflow-x-auto no-scrollbar">
                    {viewerGroups.map((grp, uIdx) => {
                      const isCurrentUserGroup = uIdx === safeUserIndex;
                      return (
                        <button
                          key={grp.authorId}
                          type="button"
                          onClick={() => jumpToViewerUser(uIdx)}
                          className={`flex items-center gap-1.5 px-2 py-1 rounded-full text-[11px] shrink-0 transition-colors cursor-pointer ${
                            isCurrentUserGroup
                              ? 'bg-white text-black font-bold'
                              : 'bg-white/15 text-white/90 hover:bg-white/25'
                          }`}
                        >
                          <span
                            className={`rounded-full border ${
                              isCurrentUserGroup
                                ? 'border-[var(--wa-accent)]'
                                : grp.unviewedCount > 0
                                  ? 'border-[var(--wa-accent)]'
                                  : 'border-white/40'
                            }`}
                          >
                            <Avatar src={grp.authorAvatar} name={grp.authorName} size="sm" />
                          </span>
                          <span className="max-w-[76px] truncate">
                            {grp.authorId === currentUser.uid ? 'قصتي' : grp.authorName.split(' ')[0]}
                          </span>
                        </button>
                      );
                    })}
                  </div>

                  <button
                    type="button"
                    aria-label="المستخدم التالي"
                    disabled={safeUserIndex >= viewerGroups.length - 1}
                    onClick={() => jumpToViewerUser(safeUserIndex + 1)}
                    className="px-2 py-1 rounded-full bg-white/10 hover:bg-white/20 disabled:opacity-35 text-[11px] flex items-center gap-1 shrink-0 cursor-pointer"
                  >
                    <span className="hidden sm:inline">التالي</span>
                    <ChevronLeft className="w-3.5 h-3.5" aria-hidden="true" />
                  </button>
                </div>
              )}

              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2.5 min-w-0">
                  <Avatar src={activeStory.authorAvatar} name={activeStory.authorName} size="sm" />
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5">
                      <p className="text-sm font-bold truncate">
                        {activeStory.authorId === currentUser.uid ? 'قصتي' : activeStory.authorName}
                      </p>
                      {activeStory.pinned && (
                        <span className="text-[11px] text-amber-300 font-bold inline-flex items-center gap-0.5">
                          <Pin className="w-3 h-3" aria-hidden="true" />
                          مثبتة
                        </span>
                      )}
                      {viewerGroups.length > 1 && (
                        <span className="text-[10px] font-mono-code text-white/70">
                          ({safeUserIndex + 1}/{viewerGroups.length})
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

                {/* Top Action Cluster */}
                <div className="flex items-center gap-1.5 shrink-0">
                  <button
                    type="button"
                    aria-label={activeStory.pinned ? 'إلغاء تثبيت القصة' : 'تثبيت القصة'}
                    aria-pressed={Boolean(activeStory.pinned)}
                    title={activeStory.pinned ? 'إلغاء التثبيت' : 'تثبيت القصة'}
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
                    aria-label="تحميل وحفظ القصة"
                    title="تحميل القصة"
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

                  {activeStory.authorId === currentUser.uid && (
                    <button
                      type="button"
                      aria-label="حذف القصة"
                      title="حذف القصة"
                      onClick={() => void handleDelete(activeStory.id)}
                      className="w-9 h-9 rounded-full bg-red-600/80 hover:bg-red-600 flex items-center justify-center cursor-pointer"
                    >
                      <Trash2 className="w-4 h-4" aria-hidden="true" />
                    </button>
                  )}

                  <button
                    type="button"
                    aria-label="إغلاق عرض القصة"
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

              {/* Video Scrubber */}
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

              {/* Quick Reply & Emoji Reactions for contact stories */}
              {activeStory.authorId !== currentUser.uid && onReplyToStatus && (
                <div className="space-y-2">
                  <div
                    className="flex items-center justify-center gap-2"
                    role="group"
                    aria-label="التفاعل السريع بالرموز التعبيرية"
                  >
                    {['❤️', '🔥', '👏', '😂', '👍', '😮'].map((emoji) => (
                      <button
                        key={emoji}
                        type="button"
                        aria-label={`تفاعل سريع بـ ${emoji}`}
                        onClick={() => {
                          onReplyToStatus(
                            activeStory.authorId,
                            activeStory.authorName,
                            emoji,
                            activeStory.content || 'قصة مصورة'
                          );
                          void exitViewer();
                        }}
                        className="w-9 h-9 rounded-full bg-white/20 hover:bg-white/35 flex items-center justify-center text-base transition-transform hover:scale-110 cursor-pointer shadow-md"
                      >
                        {emoji}
                      </button>
                    ))}
                  </div>

                  <form onSubmit={handleSendStatusReply} className="flex items-center gap-2">
                    <input
                      type="text"
                      value={quickReply}
                      onChange={(e) => setQuickReply(e.target.value)}
                      placeholder={`رد على قصة ${activeStory.authorName}...`}
                      aria-label={`رد سريع على قصة ${activeStory.authorName}`}
                      className="flex-1 min-h-[42px] px-4 rounded-full bg-white/15 backdrop-blur-sm border border-white/20 text-xs sm:text-sm text-white placeholder:text-white/65 focus:outline-none focus:ring-2 focus:ring-[var(--wa-accent)]"
                    />
                    <button
                      type="submit"
                      disabled={!quickReply.trim()}
                      aria-label="إرسال الرد على القصة"
                      className="w-10 h-10 rounded-full bg-[var(--wa-accent)] text-white flex items-center justify-center disabled:opacity-40 cursor-pointer"
                    >
                      <SendHorizontal className="w-4 h-4 rotate-180" aria-hidden="true" />
                    </button>
                  </form>
                </div>
              )}

              <div className="flex items-center justify-between pt-1">
                <button
                  type="button"
                  aria-label="القصة السابقة"
                  disabled={!hasPrevPosition}
                  onClick={() => navigateViewer('prev')}
                  className="p-2.5 rounded-full bg-white/15 hover:bg-white/25 disabled:opacity-30 cursor-pointer"
                >
                  <ChevronRight className="w-5 h-5" aria-hidden="true" />
                </button>
                <div className="flex items-center gap-3 text-xs text-white/85 font-mono-code">
                  <button
                    type="button"
                    aria-label="عرض قائمة مشاهدين القصة"
                    onClick={() => {
                      setIsPaused(true);
                      setShowViewersModal(true);
                    }}
                    className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-white/15 hover:bg-white/25 transition-colors cursor-pointer text-xs text-white/95 font-mono-code"
                    title="انقر لعرض قائمة المشاهدين"
                  >
                    {hideViewStatus ? (
                      <EyeOff className="w-4 h-4 text-amber-300" aria-hidden="true" />
                    ) : (
                      <Eye className="w-4 h-4 text-[var(--wa-accent)]" aria-hidden="true" />
                    )}
                    <span>{hideViewStatus ? 'تصفح خفي' : `${activeStory.viewCount} مشاهدة`}</span>
                  </button>
                  <span className="flex items-center gap-1">
                    <Users className="w-3.5 h-3.5" aria-hidden="true" />
                    {Math.max(0, activeStory.viewerIds.length - 1)} جهة
                  </span>
                </div>
                <button
                  type="button"
                  aria-label={hasNextPosition ? 'القصة التالية' : 'إنهاء العرض'}
                  onClick={() => navigateViewer('next')}
                  className="p-2.5 rounded-full bg-white/15 hover:bg-white/25 cursor-pointer"
                >
                  <ChevronLeft className="w-5 h-5" aria-hidden="true" />
                </button>
              </div>
            </div>
          </footer>
        </div>
      )}

      {/* Story Viewers Modal (Real viewedByIds only — never fabricated) */}
      {showViewersModal && activeStory && (() => {
        const realViewedUids = Array.isArray(activeStory.viewedByIds)
          ? activeStory.viewedByIds.filter((uid) => Boolean(uid))
          : [];

        return (
          <div
            role="dialog"
            aria-modal="true"
            aria-label="قائمة مشاهدين القصة"
            className="fixed inset-0 z-60 bg-black/75 backdrop-blur-xs flex items-center justify-center p-4"
          >
            <div className="w-full max-w-sm bg-white dark:bg-[#202C33] rounded-2xl shadow-2xl border border-[#E9EDEF] dark:border-[#374248] overflow-hidden flex flex-col max-h-[85dvh]">
              <div className="px-4 py-3.5 border-b border-[#E9EDEF] dark:border-[#2A3942] flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <Users className="w-4 h-4 text-[var(--wa-accent)]" aria-hidden="true" />
                  <h3 className="font-display text-sm font-bold text-[#111B21] dark:text-[#E9EDEF]">
                    مشاهدو القصة ({realViewedUids.length})
                  </h3>
                </div>
                <button
                  type="button"
                  aria-label="إغلاق قائمة المشاهدين"
                  onClick={() => {
                    setShowViewersModal(false);
                    setIsPaused(false);
                  }}
                  className="w-7 h-7 rounded-full flex items-center justify-center text-[#54656F] dark:text-[#AEBAC1] hover:bg-black/5 cursor-pointer"
                >
                  <X className="w-4 h-4" aria-hidden="true" />
                </button>
              </div>

              <div className="overflow-y-auto p-3 space-y-2 flex-1">
                {realViewedUids.length === 0 ? (
                  <div className="py-10 text-center text-xs text-[#667781] dark:text-[#8696A0]">
                    لم يقم أي شخص بمشاهدة هذه القصة بعد.
                  </div>
                ) : (
                  realViewedUids.map((uid) => {
                    const contact = contacts.find((c) => c.uid === uid);
                    const isSelf = uid === currentUser.uid;
                    const name = isSelf ? 'أنت' : contact?.displayName || `مستخدم (${uid.slice(0, 6)})`;
                    const avatar = isSelf ? currentUser.avatarUrl : contact?.avatarUrl || '';
                    const about = isSelf ? currentUser.about : contact?.about || 'متصل عبر تواصل';
                    return (
                      <div
                        key={uid}
                        className="p-2.5 rounded-xl bg-[#F0F2F5] dark:bg-[#111B21] flex items-center gap-3"
                      >
                        <Avatar src={avatar} name={name} size="md" />
                        <div className="min-w-0 flex-1">
                          <p className="text-xs font-bold text-[#111B21] dark:text-[#E9EDEF] truncate">
                            {name}
                          </p>
                          <p className="text-[11px] text-[#54656F] dark:text-[#8696A0] truncate mt-0.5">
                            {about}
                          </p>
                        </div>
                        <span className="text-[10px] font-mono-code text-[var(--wa-accent)] shrink-0">
                          مشاهدة
                        </span>
                      </div>
                    );
                  })
                )}
              </div>

              <div className="p-3 border-t border-[#E9EDEF] dark:border-[#2A3942] bg-[#F8FAFB] dark:bg-[#182229] text-center">
                <button
                  type="button"
                  onClick={() => {
                    setShowViewersModal(false);
                    setIsPaused(false);
                  }}
                  className="w-full py-2 rounded-xl bg-[var(--wa-accent)] text-white text-xs font-bold hover:brightness-95 cursor-pointer"
                >
                  تم
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Compose Story Modal (Photo + Short Video + Text, Auto-Disappears After 24 Hours) */}
      {showComposer && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="نشر قصة جديدة"
          className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4"
        >
          <form
            onSubmit={(e) => void handleSubmit(e)}
            className="w-full max-w-lg bg-white dark:bg-[#202C33] rounded-2xl overflow-hidden shadow-2xl border border-[#E9EDEF] dark:border-[#374248] flex flex-col max-h-[92dvh]"
          >
            <div className="px-4 py-3 border-b border-[#E9EDEF] dark:border-[#2A3942] flex items-center justify-between gap-2 shrink-0">
              <div className="flex items-center gap-1 bg-[#F0F2F5] dark:bg-[#111B21] p-1 rounded-xl">
                {[
                  { id: 'image' as const, label: 'صورة', icon: ImageIcon },
                  { id: 'video' as const, label: 'فيديو قصير', icon: Video },
                  { id: 'text' as const, label: 'نص', icon: Type }
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
                aria-label="إغلاق نافذة إضافة القصة"
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
                    placeholder="اكتب قصتك هنا..."
                    aria-label="نص القصة"
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
                        alt="معاينة صورة القصة"
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
                          ارفع صورة من جهازك لمشاركتها كقصة
                        </p>
                        <p className="text-[11px] text-[#8696A0] mt-0.5">
                          ضغط تلقائي سريع وتختفي بعد ٢٤ ساعة
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
                    aria-label="رفع صورة للقصة"
                    onChange={(e) => void handleImageUpload(e)}
                    className="hidden"
                  />

                  <input
                    type="text"
                    maxLength={500}
                    value={content}
                    onChange={(e) => setContent(e.target.value)}
                    placeholder="أضف تعليقاً اختيارياً للصورة..."
                    aria-label="وصف الصورة"
                    className="w-full rounded-lg bg-[#202C33] px-3 py-2 text-xs text-white placeholder:text-[#8696A0] focus:outline-none focus:ring-1 focus:ring-[var(--wa-accent)]"
                  />
                </div>
              ) : (
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
                        <span>{formatMediaSeconds(recordElapsedSec)}</span>
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
                        {formatMediaSeconds(pendingVideoDuration)}
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
                            : 'مقطع فيديو قصير قابل للمشاهدة لدى الجميع'}
                        </p>
                        <p className="text-[11px] text-[#8696A0] mt-0.5">
                          يدعم MP4 و WebM (يوصى بـ ٥ إلى ٢٠ ثانية) · يختفي بعد ٢٤ ساعة
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
                          <span>تسجيل مباشر</span>
                        </button>
                      </div>
                    </div>
                  )}

                  <input
                    ref={videoInputRef}
                    type="file"
                    accept="video/*"
                    aria-label="رفع مقطع فيديو للقصة"
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
                      <span>من يمكنه رؤية القصة؟</span>
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
                  {isPublishing ? 'جاري النشر...' : 'نشر القصة الآن'}
                </button>
              </div>
            </footer>
          </form>
        </div>
      )}
    </div>
  );
}
