import { useEffect, useRef, useState } from 'react';
import {
  Phone,
  Video,
  Search,
  MoreVertical,
  Lock,
  Unlock,
  Smile,
  Plus,
  Mic,
  SendHorizontal,
  Check,
  CheckCheck,
  Reply,
  Star,
  Trash2,
  Copy,
  ShieldCheck,
  FileText,
  Image as ImageIcon,
  Images,
  BarChart3,
  Play,
  Pause,
  Square,
  ArrowRight,
  X,
  Timer,
  Forward,
  Zap,
  ShieldAlert,
  Pencil,
  Clock,
  RotateCcw,
  Download,
  ChevronUp,
  ChevronDown,
  Languages,
  Palette,
  Ban
} from 'lucide-react';
import { Avatar } from './Avatar';
import { HighlightText } from './HighlightText';
import { ImageViewerModal } from './ImageViewerModal';
import { ScheduleMessageModal } from './ScheduleMessageModal';
import { LottieStickerPlayer } from './LottieStickerPlayer';
import { VideoWallpaperLayer } from './VideoWallpaperLayer';
import { resolveBundledAssetUrl } from '../data/assets';
import {
  SWIPE_REPLY_TRIGGER_PX,
  buildQuickReplySuggestions,
  computeSwipeReplyOffset,
  filterExpiredDisappearingMessages,
  formatCallDuration,
  formatDisappearingLabel,
  formatReplyPreviewText,
  formatWhatsAppTime,
  getMessageReceiptDetails,
  isSwipeReplyThresholdMet,
  searchMessagesInChat,
  type MessageSearchFilter
} from '../lib/chatLogic';
import { FONT_SIZE_OPTIONS } from '../lib/omarConfig';
import { resolveChatWallpaper } from '../lib/chatWallpaper';
import {
  getTranslatableMessageText,
  getTranslationLanguageMeta,
  SUPPORTED_TRANSLATION_LANGUAGES,
  translateMessageText,
  type TranslationLangCode,
  type TranslationResult
} from '../lib/translation';
import {
  filterStickersByCategory,
  getStickerById,
  isLottieSticker,
  STICKER_CATEGORIES,
  type StickerCategoryId,
  type StickerDefinition
} from '../lib/stickers';
import { getLottieAnimationById, isValidLottieData } from '../lib/lottieStickers';
import type {
  ChatRoom,
  DecryptedMessage,
  MessagePayload,
  MessageType,
  OmarSettings,
  RightPanelMode,
  UserProfile
} from '../types/chat';

interface ChatWindowProps {
  chat: ChatRoom | null;
  chats: ChatRoom[];
  messages: DecryptedMessage[];
  myUid: string;
  omarSettings: OmarSettings;
  onBackMobile: () => void;
  onSendMessage: (type: MessageType, payload: MessagePayload, replyToId?: string) => Promise<void>;
  onEditMessage?: (messageId: string, newText: string) => Promise<void>;
  onRetryMessage?: (msg: DecryptedMessage) => Promise<void>;
  onForwardMessage: (msg: DecryptedMessage, targetChatId: string) => Promise<void>;
  onVotePoll: (messageId: string, optionId: string) => void;
  onReactMessage: (messageId: string, emoji: string) => void;
  onToggleStarMessage: (messageId: string) => void;
  onDeleteMessage: (messageId: string) => void;
  onStartCall: (callType: 'audio' | 'video') => void;
  onOpenRightPanel: (mode: RightPanelMode, inspectMessageId?: string) => void;
  onClearChat: (chatId: string) => void;
  onDeleteChat?: (chatId: string) => Promise<void> | void;
  onSetDisappearing: (chatId: string, seconds: number) => void;
  onToggleLockChat?: (chatId: string) => void;
  onTypingChange?: (isTyping: boolean) => void;
  isLocked?: boolean;
  highlightedMessageId?: string | null;
  externalSearchQuery?: string;
  onClearExternalHighlight?: () => void;
  onScheduleMessage?: (chatId: string, sendAtMs: number, text: string) => Promise<void>;
  onOpenScheduledMessages?: () => void;
  onChangePreferredLanguage?: (lang: TranslationLangCode) => void;
  onOpenWallpaperPicker?: () => void;
  isPeerBlocked?: boolean;
  onBlockPeer?: () => Promise<void> | void;
  onUnblockPeer?: () => Promise<void> | void;
  contacts?: UserProfile[];
}

async function compressChatImageToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('تعذر قراءة الصورة.'));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error('ملف الصورة غير صالح.'));
      img.onload = () => {
        const maxSide = 720;
        const scale = Math.min(1, maxSide / Math.max(img.width || maxSide, img.height || maxSide));
        const canvas = document.createElement('canvas');
        canvas.width = Math.max(1, Math.round(img.width * scale));
        canvas.height = Math.max(1, Math.round(img.height * scale));
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          reject(new Error('تعذر ضغط الصورة.'));
          return;
        }
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        let quality = 0.78;
        let dataUrl = canvas.toDataURL('image/jpeg', quality);
        while (dataUrl.length > 42000 && quality > 0.35) {
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

const EMOJI_PALETTE = [
  '❤️', '👍', '😂', '😮', '🙏', '🔥',
  '🎉', '👏', '💯', '✅', '🔒', '✨',
  '😍', '🥳', '🤝', '🌟', '💐', '☕',
  '🕌', '🌙', '☀️', '😎', '🤔', '😅',
  '🙌', '💪', '👌', '👀', '💬', '📌',
  '🚀', '🎯', '💡', '⚡', '🫶', '🤍'
];

interface FloatingAnchorRect {
  top: number;
  bottom: number;
  left: number;
  right: number;
}

interface FloatingPopoverState {
  msgId: string;
  left: number;
  top?: number;
  bottom?: number;
  maxHeight: number;
  triggerRect: FloatingAnchorRect;
}

function computeClampedFloatingPosition(
  rect: FloatingAnchorRect,
  menuWidth: number,
  preferredHeight: number
): Omit<FloatingPopoverState, 'msgId'> {
  const pad = 12;
  const vw = typeof window !== 'undefined' ? window.innerWidth : 390;
  const vh = typeof window !== 'undefined' ? window.innerHeight : 800;
  const safeWidth = Math.min(menuWidth, vw - pad * 2);

  let clampedLeft = rect.left;
  if (rect.right + safeWidth > vw - pad) {
    clampedLeft = rect.right - safeWidth;
  }
  if (clampedLeft < pad) {
    clampedLeft = pad;
  }
  if (clampedLeft + safeWidth > vw - pad) {
    clampedLeft = vw - safeWidth - pad;
  }

  const spaceBelow = Math.max(0, vh - rect.bottom - pad);
  const spaceAbove = Math.max(0, rect.top - pad);

  if (spaceBelow >= preferredHeight || spaceBelow >= spaceAbove) {
    return {
      left: clampedLeft,
      top: Math.max(pad, rect.bottom + 6),
      maxHeight: Math.max(160, Math.min(440, spaceBelow - 6)),
      triggerRect: rect
    };
  }
  return {
    left: clampedLeft,
    bottom: Math.max(pad, vh - rect.top + 6),
    maxHeight: Math.max(160, Math.min(440, spaceAbove - 6)),
    triggerRect: rect
  };
}

function StickerCard({
  sticker,
  lottieId,
  lottieData,
  customLabel
}: {
  sticker?: StickerDefinition;
  lottieId?: string;
  lottieData?: unknown;
  customLabel?: string;
}) {
  const effectiveLottieId = lottieId || sticker?.lottieId;
  const hasLottie = Boolean(isValidLottieData(lottieData) || getLottieAnimationById(effectiveLottieId));
  const bgFrom = sticker?.bgFrom || '#0F766E';
  const bgTo = sticker?.bgTo || '#115E59';
  const accent = sticker?.accent || '#CCFBF1';
  const textColor = sticker?.textColor || '#FFFFFF';
  const label = customLabel || sticker?.label || 'ملصق متحرك';
  const subtitle = sticker?.subtitle;

  return (
    <div
      style={{
        background: `linear-gradient(135deg, ${bgFrom} 0%, ${bgTo} 100%)`,
        color: textColor
      }}
      className="relative overflow-hidden rounded-2xl px-4 py-3.5 min-w-[176px] max-w-[236px] shadow-md select-none"
    >
      <svg
        viewBox="0 0 180 110"
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 w-full h-full opacity-25"
      >
        <circle cx="24" cy="22" r="28" fill={accent} />
        <circle cx="158" cy="92" r="34" fill={accent} />
        <path
          d="M0 86 Q 48 64 94 86 T 180 82 L 180 110 L 0 110 Z"
          fill={accent}
          opacity="0.35"
        />
      </svg>
      <div className="relative z-10 flex flex-col items-center text-center gap-1.5">
        {(sticker?.badge || hasLottie) && (
          <span
            style={{ color: accent }}
            className="text-[10px] font-bold tracking-wide opacity-95"
          >
            {hasLottie ? 'Lottie · متحرك' : sticker?.badge}
          </span>
        )}
        {hasLottie ? (
          <LottieStickerPlayer
            lottieId={effectiveLottieId}
            lottieData={lottieData}
            fallbackEmoji={sticker?.emoji || '✨'}
            label={label}
            sizeClassName="w-22 h-22"
            interactiveReplay
          />
        ) : (
          <span className="text-3xl leading-none drop-shadow-sm">{sticker?.emoji || '✨'}</span>
        )}
        <p className="font-display text-base font-extrabold leading-snug">{label}</p>
        {subtitle && (
          <p className="text-[11px] opacity-90 font-medium leading-tight">{subtitle}</p>
        )}
      </div>
    </div>
  );
}

export function ChatWindow({
  chat,
  chats,
  messages,
  myUid,
  omarSettings,
  onBackMobile,
  onSendMessage,
  onEditMessage,
  onRetryMessage,
  onForwardMessage,
  onVotePoll,
  onReactMessage,
  onToggleStarMessage,
  onDeleteMessage,
  onStartCall,
  onOpenRightPanel,
  onClearChat,
  onDeleteChat,
  onSetDisappearing,
  onToggleLockChat,
  onTypingChange,
  isLocked = false,
  highlightedMessageId = null,
  externalSearchQuery = '',
  onClearExternalHighlight,
  onScheduleMessage,
  onOpenScheduledMessages,
  onChangePreferredLanguage,
  onOpenWallpaperPicker,
  isPeerBlocked = false,
  onBlockPeer,
  onUnblockPeer,
  contacts = []
}: ChatWindowProps) {
  const [text, setText] = useState('');
  const [replyTo, setReplyTo] = useState<DecryptedMessage | null>(null);
  const [editingMsg, setEditingMsg] = useState<DecryptedMessage | null>(null);
  const [forwardMsg, setForwardMsg] = useState<DecryptedMessage | null>(null);
  const [forwardingToId, setForwardingToId] = useState<string | null>(null);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [pickerTab, setPickerTab] = useState<'emoji' | 'stickers'>('emoji');
  const [stickerCategory, setStickerCategory] = useState<StickerCategoryId>('all');
  const [lottieUploadError, setLottieUploadError] = useState<string | null>(null);
  const [showTemplatesPicker, setShowTemplatesPicker] = useState(false);
  const [showAttachMenu, setShowAttachMenu] = useState(false);
  const [showMoreMenu, setShowMoreMenu] = useState(false);
  const [showDeleteChatConfirm, setShowDeleteChatConfirm] = useState(false);
  const [isDeletingChat, setIsDeletingChat] = useState(false);
  const [activeMsgMenu, setActiveMsgMenu] = useState<FloatingPopoverState | null>(null);
  const [activeReceipt, setActiveReceipt] = useState<FloatingPopoverState | null>(null);
  const [showPollModal, setShowPollModal] = useState(false);
  const [pollQuestion, setPollQuestion] = useState('');
  const [pollOptions, setPollOptions] = useState(['', '', '']);
  const [isRecording, setIsRecording] = useState(false);
  const [recordSeconds, setRecordSeconds] = useState(0);
  const [playingVoiceId, setPlayingVoiceId] = useState<string | null>(null);
  const [showInChatSearch, setShowInChatSearch] = useState(false);
  const [inChatSearchQuery, setInChatSearchQuery] = useState('');
  const [inChatFilterType, setInChatFilterType] = useState<MessageSearchFilter>('all');
  const [activeMatchIdx, setActiveMatchIdx] = useState(0);
  const [lightboxImage, setLightboxImage] = useState<{
    mediaUrl?: string;
    images?: string[];
    initialIndex?: number;
    caption?: string;
  } | null>(null);
  const [showScheduleModal, setShowScheduleModal] = useState(false);
  const [translatedMessages, setTranslatedMessages] = useState<
    Record<string, { result: TranslationResult; sourceText: string }>
  >({});
  const [translatingIds, setTranslatingIds] = useState<Record<string, boolean>>({});
  const [translationErrors, setTranslationErrors] = useState<Record<string, string>>({});
  const [swipeDragState, setSwipeDragState] = useState<{
    msgId: string;
    offsetX: number;
    isSwiping: boolean;
  } | null>(null);

  const bottomRef = useRef<HTMLDivElement>(null);
  const prevChatIdRef = useRef<string | null>(null);
  const prevMsgCountRef = useRef<number>(0);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const inChatSearchInputRef = useRef<HTMLInputElement>(null);
  const msgRefsMap = useRef<Record<string, HTMLDivElement | null>>({});
  const swipeTrackerRef = useRef<{
    msgId: string;
    pointerId: number;
    startX: number;
    startY: number;
    axisLocked: 'none' | 'x' | 'y';
    triggeredHaptic: boolean;
    lastOffsetX: number;
  } | null>(null);
  const suppressClickUntilRef = useRef<number>(0);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const lottieInputRef = useRef<HTMLInputElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recordChunksRef = useRef<BlobPart[]>([]);
  const recordStreamRef = useRef<MediaStream | null>(null);
  const audioPlayerRef = useRef<HTMLAudioElement | null>(null);
  const recordTimerRef = useRef<number | null>(null);

  const visibleMessages = chat
    ? filterExpiredDisappearingMessages(messages, chat.disappearingSeconds)
    : [];

  const inChatMatches = showInChatSearch
    ? searchMessagesInChat(visibleMessages, inChatSearchQuery, inChatFilterType)
    : [];

  const activeHighlightQuery = showInChatSearch
    ? inChatSearchQuery
    : externalSearchQuery || '';

  const focusedMatchId =
    showInChatSearch && inChatMatches.length > 0
      ? inChatMatches[Math.min(activeMatchIdx, inChatMatches.length - 1)]?.id || null
      : highlightedMessageId;

  useEffect(() => {
    const currentChatId = chat?.id || null;
    const chatChanged = currentChatId !== prevChatIdRef.current;
    const messageAppended = messages.length > prevMsgCountRef.current;
    prevChatIdRef.current = currentChatId;
    prevMsgCountRef.current = messages.length;

    if (!highlightedMessageId && (chatChanged || messageAppended)) {
      bottomRef.current?.scrollIntoView({ behavior: chatChanged ? 'auto' : 'smooth' });
    }
  }, [messages.length, chat?.id, highlightedMessageId]);

  useEffect(() => {
    setReplyTo(null);
    setEditingMsg(null);
    setText('');
    setForwardMsg(null);
    setShowEmojiPicker(false);
    setShowTemplatesPicker(false);
    setShowAttachMenu(false);
    setShowMoreMenu(false);
    setShowDeleteChatConfirm(false);
    setIsDeletingChat(false);
    setActiveMsgMenu(null);
    setActiveReceipt(null);
    setShowInChatSearch(false);
    setInChatSearchQuery('');
    setInChatFilterType('all');
    setActiveMatchIdx(0);
    setSwipeDragState(null);
    swipeTrackerRef.current = null;
  }, [chat?.id]);

  useEffect(() => {
    setActiveMatchIdx(inChatMatches.length > 0 ? inChatMatches.length - 1 : 0);
  }, [inChatSearchQuery, inChatFilterType, inChatMatches.length]);

  useEffect(() => {
    if (!focusedMatchId) return;
    const scrollToTarget = () => {
      const targetEl = msgRefsMap.current[focusedMatchId];
      if (targetEl) {
        targetEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
        return true;
      }
      return false;
    };
    if (!scrollToTarget()) {
      const rafId = window.requestAnimationFrame(() => {
        scrollToTarget();
      });
      return () => window.cancelAnimationFrame(rafId);
    }
  }, [focusedMatchId, messages.length]);

  useEffect(() => {
    const hasFloatingOpen =
      showEmojiPicker ||
      showTemplatesPicker ||
      showAttachMenu ||
      showMoreMenu ||
      showDeleteChatConfirm ||
      Boolean(activeMsgMenu) ||
      Boolean(activeReceipt) ||
      showPollModal ||
      Boolean(forwardMsg) ||
      Boolean(editingMsg);
    if (!hasFloatingOpen) return;

    const handleOutside = (e: MouseEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && target.closest('[data-chat-floating="true"]')) return;
      setShowEmojiPicker(false);
      setShowTemplatesPicker(false);
      setShowAttachMenu(false);
      setShowMoreMenu(false);
      setActiveMsgMenu(null);
      setActiveReceipt(null);
    };

    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setShowEmojiPicker(false);
        setShowTemplatesPicker(false);
        setShowAttachMenu(false);
        setShowMoreMenu(false);
        setShowDeleteChatConfirm(false);
        setActiveMsgMenu(null);
        setActiveReceipt(null);
        setShowPollModal(false);
        setForwardMsg(null);
        if (editingMsg) {
          setEditingMsg(null);
          setText('');
        }
      }
    };

    const handleResize = () => {
      setActiveMsgMenu(null);
      setActiveReceipt(null);
    };

    document.addEventListener('mousedown', handleOutside);
    window.addEventListener('keydown', handleEscape);
    window.addEventListener('resize', handleResize);
    return () => {
      document.removeEventListener('mousedown', handleOutside);
      window.removeEventListener('keydown', handleEscape);
      window.removeEventListener('resize', handleResize);
    };
  }, [
    showEmojiPicker,
    showTemplatesPicker,
    showAttachMenu,
    showMoreMenu,
    showDeleteChatConfirm,
    activeMsgMenu,
    activeReceipt,
    showPollModal,
    forwardMsg,
    editingMsg
  ]);

  if (!chat) {
    return (
      <div className="hidden md:flex flex-1 flex-col items-center justify-center bg-[#F0F2F5] dark:bg-[#222E35] border-b-[6px] border-[var(--wa-accent)] px-8 text-center">
        <img
          src="/pwa-192x192.png"
          alt="شعار تواصل Wasil"
          className="w-20 h-20 rounded-2xl shadow-lg object-cover mb-6 border border-black/10 dark:border-white/10"
          referrerPolicy="no-referrer"
        />
        <h2 className="font-display text-2xl font-bold text-[#111B21] dark:text-[#E9EDEF]">
          تواصل ويب · محادثات مشفرة بإضافات أكرم
        </h2>
        <p className="mt-3 text-sm text-[#54656F] dark:text-[#8696A0] max-w-md leading-relaxed">
          اختر محادثة من القائمة الجانبية لبدء المراسلة الفورية أو إجراء مكالمة صوتية ومرئية مشفرة بتقنية AES-GCM-256 مع ثيمات وخصوصية متقدمة.
        </p>
        <div className="mt-8 flex items-center gap-2 text-xs text-[#667781] dark:text-[#8696A0]">
          <ShieldCheck className="w-4 h-4 text-[var(--wa-accent)]" aria-hidden="true" />
          <span>مشفرة تماماً بين الطرفين · End-to-End Encrypted</span>
        </div>
      </div>
    );
  }

  const fontSizeClass =
    FONT_SIZE_OPTIONS.find((f) => f.id === omarSettings.fontSize)?.className || 'text-[14.5px]';

  const getBubbleRadiusClass = (isMine: boolean) => {
    if (omarSettings.bubbleStyle === 'rounded') return 'rounded-2xl';
    if (omarSettings.bubbleStyle === 'classic') return 'rounded-lg';
    return isMine ? 'rounded-xl rounded-tr-xs' : 'rounded-xl rounded-tl-xs';
  };

  const isComposerReadOnly =
    (chat.type === 'direct' && isPeerBlocked) ||
    (chat.type === 'community' && Boolean(chat.adminOnlyPost) && chat.id.startsWith('channel_'));

  const openQuickReplyForMessage = (msg: DecryptedMessage) => {
    if (msg.isDeleted || isComposerReadOnly) return;
    setEditingMsg(null);
    setReplyTo(msg);
    setActiveMsgMenu(null);
    setActiveReceipt(null);
    setShowEmojiPicker(false);
    setShowAttachMenu(false);
    setShowMoreMenu(false);
    setShowTemplatesPicker(false);
    window.requestAnimationFrame(() => {
      textareaRef.current?.focus();
    });
  };

  const handleMessagePointerDown = (
    e: React.PointerEvent<HTMLDivElement>,
    msg: DecryptedMessage
  ) => {
    if (msg.isDeleted || isComposerReadOnly) return;
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    const target = e.target as HTMLElement | null;
    if (target?.closest('button, a, input, select, textarea, [data-chat-floating="true"]')) {
      return;
    }
    swipeTrackerRef.current = {
      msgId: msg.id,
      pointerId: e.pointerId,
      startX: e.clientX,
      startY: e.clientY,
      axisLocked: 'none',
      triggeredHaptic: false,
      lastOffsetX: 0
    };
  };

  const handleMessagePointerMove = (
    e: React.PointerEvent<HTMLDivElement>,
    msg: DecryptedMessage
  ) => {
    const tracker = swipeTrackerRef.current;
    if (!tracker || tracker.msgId !== msg.id || tracker.pointerId !== e.pointerId) return;
    if (tracker.axisLocked === 'y') return;

    const dx = e.clientX - tracker.startX;
    const dy = e.clientY - tracker.startY;

    if (tracker.axisLocked === 'none') {
      if (Math.abs(dy) > 8 && Math.abs(dy) >= Math.abs(dx)) {
        tracker.axisLocked = 'y';
        return;
      }
      if (dx < -6 && Math.abs(dx) > Math.abs(dy)) {
        tracker.axisLocked = 'x';
        try {
          e.currentTarget.setPointerCapture(e.pointerId);
        } catch {
          // Pointer capture may fail in synthetic or touch environments
        }
      } else if (dx > 10) {
        tracker.axisLocked = 'y';
        return;
      } else {
        return;
      }
    }

    const offsetX = computeSwipeReplyOffset(dx);
    tracker.lastOffsetX = offsetX;
    if (isSwipeReplyThresholdMet(offsetX) && !tracker.triggeredHaptic) {
      tracker.triggeredHaptic = true;
      try {
        navigator.vibrate?.(12);
      } catch {
        // Ignore unsupported vibration API
      }
    }
    setSwipeDragState({ msgId: msg.id, offsetX, isSwiping: true });
  };

  const handleMessagePointerFinish = (
    e: React.PointerEvent<HTMLDivElement>,
    msg: DecryptedMessage,
    cancelled: boolean
  ) => {
    const tracker = swipeTrackerRef.current;
    if (!tracker || tracker.msgId !== msg.id || tracker.pointerId !== e.pointerId) return;

    const shouldOpenReply =
      !cancelled &&
      tracker.axisLocked === 'x' &&
      isSwipeReplyThresholdMet(tracker.lastOffsetX);

    if (tracker.axisLocked === 'x' && Math.abs(tracker.lastOffsetX) > 8) {
      suppressClickUntilRef.current = Date.now() + 260;
    }

    try {
      if (e.currentTarget.hasPointerCapture(e.pointerId)) {
        e.currentTarget.releasePointerCapture(e.pointerId);
      }
    } catch {
      // Ignore release errors
    }

    swipeTrackerRef.current = null;
    setSwipeDragState(null);

    if (shouldOpenReply) {
      openQuickReplyForMessage(msg);
    }
  };

  const handleSendText = async (overrideText?: string) => {
    const raw = typeof overrideText === 'string' ? overrideText : text;
    const trimmed = raw.trim();
    if (!trimmed) return;
    if (typeof overrideText !== 'string') {
      setText('');
    }
    if (editingMsg && onEditMessage) {
      const targetId = editingMsg.id;
      setEditingMsg(null);
      await onEditMessage(targetId, trimmed);
      return;
    }
    const currentReply = replyTo;
    setReplyTo(null);
    await onSendMessage(
      'text',
      {
        text: trimmed,
        ...(currentReply
          ? {
              replyToText: formatReplyPreviewText(currentReply),
              replyToSender: currentReply.senderId === myUid ? 'أنت' : currentReply.senderName
            }
          : {})
      },
      currentReply?.id
    );
  };

  const handleSendQuickReplyChip = async (replyText: string) => {
    if (!replyTo || isComposerReadOnly) return;
    await handleSendText(replyText);
  };

  const handleSendSticker = async (sticker: StickerDefinition) => {
    const currentReply = replyTo;
    setReplyTo(null);
    setShowEmojiPicker(false);
    setLottieUploadError(null);
    await onSendMessage(
      'text',
      {
        text: `ملصق: ${sticker.label}`,
        stickerId: sticker.id,
        stickerLabel: sticker.label,
        stickerCategory: sticker.category,
        stickerKind: sticker.kind || 'static',
        ...(sticker.lottieId ? { lottieId: sticker.lottieId } : {}),
        ...(currentReply
          ? {
              replyToText: formatReplyPreviewText(currentReply),
              replyToSender: currentReply.senderId === myUid ? 'أنت' : currentReply.senderName
            }
          : {})
      },
      currentReply?.id
    );
  };

  const handleLottieFilePick = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setLottieUploadError(null);
    try {
      const raw = await file.text();
      if (raw.length > 32000) {
        setLottieUploadError('حجم ملف Lottie كبير جداً للتشفير الفوري (الحد الأقصى 32 كيلوبايت).');
        return;
      }
      const parsed: unknown = JSON.parse(raw);
      if (!isValidLottieData(parsed)) {
        setLottieUploadError('ملف JSON لا يطابق بنية ملصقات Lottie الصالحة.');
        return;
      }
      const cleanName = file.name.replace(/\.json$/i, '').slice(0, 40) || 'ملصق Lottie';
      const currentReply = replyTo;
      setReplyTo(null);
      setShowEmojiPicker(false);
      await onSendMessage(
        'text',
        {
          text: `ملصق: ${cleanName}`,
          stickerLabel: cleanName,
          stickerCategory: 'animated',
          stickerKind: 'lottie',
          lottieData: parsed as unknown as Record<string, unknown>,
          ...(currentReply
            ? {
                replyToText: formatReplyPreviewText(currentReply),
                replyToSender: currentReply.senderId === myUid ? 'أنت' : currentReply.senderName
              }
            : {})
        },
        currentReply?.id
      );
    } catch {
      setLottieUploadError('تعذر قراءة ملف Lottie JSON.');
    }
  };

  const handleStartRecording = async () => {
    setIsRecording(true);
    setRecordSeconds(0);
    recordChunksRef.current = [];
    recordTimerRef.current = window.setInterval(() => {
      setRecordSeconds((s) => s + 1);
    }, 1000);

    try {
      if (navigator.mediaDevices?.getUserMedia) {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        recordStreamRef.current = stream;
        const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
          ? 'audio/webm;codecs=opus'
          : MediaRecorder.isTypeSupported('audio/webm')
            ? 'audio/webm'
            : undefined;
        const recorder = mimeType
          ? new MediaRecorder(stream, { mimeType, audioBitsPerSecond: 24000 })
          : new MediaRecorder(stream);
        mediaRecorderRef.current = recorder;
        recorder.ondataavailable = (ev) => {
          if (ev.data && ev.data.size > 0) {
            recordChunksRef.current.push(ev.data);
          }
        };
        recorder.start(250);
      }
    } catch {
      // Headless or mic-denied environment: timer still captures simulated voice note smoothly
    }
  };

  const stopRecorderAndGetAudioUrl = (): Promise<string | undefined> => {
    return new Promise((resolve) => {
      const recorder = mediaRecorderRef.current;
      const stream = recordStreamRef.current;
      if (!recorder || recorder.state === 'inactive') {
        stream?.getTracks().forEach((t) => t.stop());
        recordStreamRef.current = null;
        mediaRecorderRef.current = null;
        resolve(undefined);
        return;
      }

      recorder.onstop = () => {
        stream?.getTracks().forEach((t) => t.stop());
        recordStreamRef.current = null;
        mediaRecorderRef.current = null;
        const chunks = recordChunksRef.current;
        recordChunksRef.current = [];
        if (chunks.length === 0) {
          resolve(undefined);
          return;
        }
        const blob = new Blob(chunks, { type: recorder.mimeType || 'audio/webm' });
        if (blob.size > 28 * 1024) {
          resolve(undefined);
          return;
        }
        const reader = new FileReader();
        reader.onloadend = () => {
          const res = typeof reader.result === 'string' ? reader.result : undefined;
          resolve(res && res.length <= 42000 ? res : undefined);
        };
        reader.onerror = () => resolve(undefined);
        reader.readAsDataURL(blob);
      };
      recorder.stop();
    });
  };

  const handleStopAndSendRecording = async () => {
    if (recordTimerRef.current) {
      window.clearInterval(recordTimerRef.current);
      recordTimerRef.current = null;
    }
    const dur = Math.max(2, recordSeconds);
    const recordedAudioUrl = await stopRecorderAndGetAudioUrl();
    setIsRecording(false);
    setRecordSeconds(0);
    await onSendMessage('voice', {
      text: `رسالة صوتية (${formatCallDuration(dur)})`,
      ...(recordedAudioUrl ? { mediaUrl: recordedAudioUrl } : {}),
      voiceDurationSec: dur,
      voiceWaveform: [30, 55, 70, 40, 90, 65, 50, 80, 95, 60, 45, 75, 85, 40, 60, 35, 50, 70, 45, 30]
    });
  };

  const handleCancelRecording = () => {
    if (recordTimerRef.current) {
      window.clearInterval(recordTimerRef.current);
      recordTimerRef.current = null;
    }
    recordChunksRef.current = [];
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.onstop = () => {
        recordStreamRef.current?.getTracks().forEach((t) => t.stop());
        recordStreamRef.current = null;
        mediaRecorderRef.current = null;
      };
      mediaRecorderRef.current.stop();
    } else {
      recordStreamRef.current?.getTracks().forEach((t) => t.stop());
      recordStreamRef.current = null;
      mediaRecorderRef.current = null;
    }
    setIsRecording(false);
    setRecordSeconds(0);
  };

  const handleImagePick = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    e.target.value = '';
    setShowAttachMenu(false);
    if (files.length === 0) return;
    try {
      if (files.length === 1) {
        const compressedUrl = await compressChatImageToDataUrl(files[0]);
        await onSendMessage('image', {
          text: files[0].name,
          mediaUrl: compressedUrl
        });
      } else {
        const compressedUrls = await Promise.all(
          files.map((file) => compressChatImageToDataUrl(file))
        );
        await onSendMessage('image', {
          text: `${files.length} صور (ألبوم)`,
          mediaUrl: compressedUrls[0],
          mediaUrls: compressedUrls
        });
      }
    } catch {
      // Fallback ignored on invalid image
    }
  };

  const handleFilePick = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const sizeKb = Math.max(1, Math.round(file.size / 1024));
    const sizeLabel = sizeKb > 1024 ? `${(sizeKb / 1024).toFixed(1)} MB` : `${sizeKb} KB`;
    if (file.size <= 24 * 1024) {
      const reader = new FileReader();
      reader.onloadend = () => {
        const dataUrl = typeof reader.result === 'string' && reader.result.length <= 36000
          ? reader.result
          : undefined;
        void onSendMessage('file', {
          text: `مستند: ${file.name}`,
          fileName: file.name,
          fileSizeLabel: sizeLabel,
          ...(dataUrl ? { fileDataUrl: dataUrl } : {})
        });
      };
      reader.readAsDataURL(file);
    } else {
      void onSendMessage('file', {
        text: `مستند: ${file.name}`,
        fileName: file.name,
        fileSizeLabel: sizeLabel
      });
    }
    e.target.value = '';
    setShowAttachMenu(false);
  };

  const handleCreatePoll = async (e: React.FormEvent) => {
    e.preventDefault();
    const q = pollQuestion.trim();
    const opts = pollOptions.map((o) => o.trim()).filter(Boolean);
    if (!q || opts.length < 2) return;

    await onSendMessage('poll', {
      text: `استطلاع: ${q}`,
      pollQuestion: q,
      pollOptions: opts.map((optText, idx) => ({
        id: `opt_${Date.now()}_${idx}`,
        text: optText,
        voterIds: []
      }))
    });
    setPollQuestion('');
    setPollOptions(['', '', '']);
    setShowPollModal(false);
  };

  const togglePlayVoice = (msgId: string, durationSec: number, mediaUrl?: string) => {
    if (audioPlayerRef.current) {
      audioPlayerRef.current.pause();
      audioPlayerRef.current = null;
    }
    if (playingVoiceId === msgId) {
      setPlayingVoiceId(null);
      return;
    }
    setPlayingVoiceId(msgId);
    if (mediaUrl && mediaUrl.startsWith('data:audio')) {
      try {
        const audio = new Audio(mediaUrl);
        audioPlayerRef.current = audio;
        audio.onended = () => {
          setPlayingVoiceId((curr) => (curr === msgId ? null : curr));
          audioPlayerRef.current = null;
        };
        audio.onerror = () => {
          setPlayingVoiceId((curr) => (curr === msgId ? null : curr));
          audioPlayerRef.current = null;
        };
        void audio.play().catch(() => {
          setPlayingVoiceId(null);
        });
        return;
      } catch {
        // Fallback below
      }
    }
    try {
      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (AudioCtx) {
        const ctx = new AudioCtx();
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.frequency.value = 520;
        gain.gain.value = 0.03;
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start();
        osc.stop(ctx.currentTime + 0.08);
      }
    } catch {
      // Ignore audio policy error in non-interactive headless browser
    }
    window.setTimeout(() => {
      setPlayingVoiceId((curr) => (curr === msgId ? null : curr));
    }, Math.min(durationSec, 8) * 1000);
  };

  const handleConfirmForward = async (targetChatId: string) => {
    if (!forwardMsg) return;
    setForwardingToId(targetChatId);
    try {
      await onForwardMessage(forwardMsg, targetChatId);
      setForwardMsg(null);
    } finally {
      setForwardingToId(null);
    }
  };

  const preferredLang = (omarSettings.preferredLanguage as TranslationLangCode) || 'ar';

  const handleTranslateMessage = async (
    msg: DecryptedMessage,
    overrideLang?: TranslationLangCode
  ) => {
    const sourceText = getTranslatableMessageText(msg);
    if (!sourceText) return;
    const targetLang = overrideLang || preferredLang;
    setTranslatingIds((prev) => ({ ...prev, [msg.id]: true }));
    setTranslationErrors((prev) => {
      const next = { ...prev };
      delete next[msg.id];
      return next;
    });
    try {
      const result = await translateMessageText(sourceText, targetLang);
      setTranslatedMessages((prev) => ({
        ...prev,
        [msg.id]: { result, sourceText }
      }));
    } catch (err) {
      setTranslationErrors((prev) => ({
        ...prev,
        [msg.id]: err instanceof Error ? err.message : 'تعذر ترجمة الرسالة حالياً.'
      }));
    } finally {
      setTranslatingIds((prev) => {
        const next = { ...prev };
        delete next[msg.id];
        return next;
      });
    }
  };

  const handleHideTranslation = (messageId: string) => {
    setTranslatedMessages((prev) => {
      const next = { ...prev };
      delete next[messageId];
      return next;
    });
    setTranslationErrors((prev) => {
      const next = { ...prev };
      delete next[messageId];
      return next;
    });
  };

  return (
    <section aria-label={`محادثة ${chat.title}`} className="flex-1 flex flex-col h-full w-full max-w-full min-w-0 overflow-hidden relative">
      {/* Chat Header */}
      <header className="h-16 px-2 sm:px-3 md:px-4 shrink-0 bg-[#F0F2F5] dark:bg-[#202C33] border-b border-[#E9EDEF] dark:border-[#222D34] flex items-center justify-between gap-1 sm:gap-2 z-20 min-w-0 max-w-full">
        <div className="flex items-center gap-1.5 sm:gap-2.5 flex-1 min-w-0">
          <button
            type="button"
            aria-label="العودة إلى قائمة الدردشات"
            onClick={onBackMobile}
            className="md:hidden w-9 h-9 sm:w-10 sm:h-10 rounded-full flex items-center justify-center shrink-0 text-[#54656F] dark:text-[#AEBAC1] hover:bg-black/5 dark:hover:bg-white/5 cursor-pointer"
          >
            <ArrowRight className="w-5 h-5" aria-hidden="true" />
          </button>

          <div className="flex items-center gap-2 sm:gap-3 flex-1 min-w-0 text-right">
            <button
              type="button"
              onClick={() => onOpenRightPanel('info')}
              aria-label={`معلومات محادثة ${chat.title}`}
              className="flex items-center shrink-0 hover:opacity-90 transition-opacity cursor-pointer"
            >
              <Avatar
                src={chat.avatarUrl}
                name={chat.title}
                size="md"
                isOnline={chat.isOnline}
                isGroup={chat.type !== 'direct'}
              />
            </button>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5 min-w-0">
                <button
                  type="button"
                  onClick={() => onOpenRightPanel('info')}
                  className="font-display text-[15px] sm:text-base font-bold text-[#111B21] dark:text-[#E9EDEF] truncate text-right hover:underline cursor-pointer"
                >
                  {chat.title}
                </button>

                {/* Real-time End-to-End Encryption Badge */}
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onOpenRightPanel('encryption');
                  }}
                  title="تشفير تام بين الطرفين (AES-GCM-256) نشط في الوقت الفعلي · انقر للتحقق من كود الأمان"
                  aria-label="حالة التشفير: مشفرة تماماً بنهاية الطرفين في الوقت الفعلي"
                  className="inline-flex items-center gap-1 px-1.5 sm:px-2 py-0.5 rounded-full bg-emerald-500/10 dark:bg-emerald-500/15 border border-emerald-500/30 text-emerald-700 dark:text-emerald-300 text-[10px] sm:text-[11px] font-semibold shrink-0 hover:bg-emerald-500/20 active:scale-95 transition-all cursor-pointer shadow-2xs select-none"
                >
                  <span className="relative flex h-1.5 w-1.5 shrink-0" aria-hidden="true">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-emerald-500"></span>
                  </span>
                  <ShieldCheck className="w-3 h-3 text-emerald-600 dark:text-emerald-400 shrink-0" aria-hidden="true" />
                  <span className="whitespace-nowrap">مشفر E2EE</span>
                </button>

                {isLocked && (
                  <Lock className="w-3.5 h-3.5 text-amber-500 shrink-0" aria-label="محادثة مقفلة" />
                )}
                {chat.disappearingSeconds > 0 && (
                  <Timer
                    className="w-3.5 h-3.5 text-[var(--wa-accent)] shrink-0"
                    aria-label={`الرسائل ذاتية الاختفاء: ${formatDisappearingLabel(chat.disappearingSeconds)}`}
                  />
                )}
              </div>
              <button
                type="button"
                onClick={() => onOpenRightPanel('info')}
                className="text-xs text-[#54656F] dark:text-[#8696A0] truncate block text-right hover:opacity-85 cursor-pointer w-full"
              >
                {isPeerBlocked && chat.type === 'direct'
                  ? 'جهة اتصال محظورة'
                  : chat.isTyping && !omarSettings.hideTypingIndicator
                    ? 'يكتب الآن...'
                    : chat.type === 'community'
                      ? `${chat.memberIds.length} متابع · ${chat.adminOnlyPost ? 'بث المشرفين فقط' : 'قناة مفتوحة'}`
                      : chat.type !== 'direct'
                        ? `${chat.memberIds.length} أعضاء · مشفرة تماماً`
                        : omarSettings.freezeLastSeen
                          ? 'آخر ظهور مجمد'
                          : chat.isOnline
                            ? 'متصل الآن'
                            : 'آخر ظهور اليوم'}
              </button>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-0.5 sm:gap-1 shrink-0 relative">
          <button
            type="button"
            aria-label="التحقق من التشفير التام"
            title="تفاصيل التشفير التام"
            onClick={() => onOpenRightPanel('encryption')}
            className="hidden sm:flex items-center gap-1.5 px-2.5 h-9 rounded-full bg-[var(--wa-accent-soft)] text-[var(--wa-accent-strong)] text-xs font-medium hover:brightness-95 transition-all whitespace-nowrap cursor-pointer"
          >
            <Lock className="w-3.5 h-3.5" aria-hidden="true" />
            <span>مشفر</span>
          </button>

          <button
            type="button"
            aria-label="بدء مكالمة مرئية"
            title={isPeerBlocked ? 'جهة الاتصال محظورة' : 'مكالمة مرئية'}
            disabled={isPeerBlocked}
            onClick={() => onStartCall('video')}
            className="w-9 h-9 sm:w-10 sm:h-10 rounded-full flex items-center justify-center text-[#54656F] dark:text-[#AEBAC1] hover:bg-black/5 dark:hover:bg-white/10 disabled:opacity-40 disabled:cursor-not-allowed transition-colors cursor-pointer"
          >
            <Video className="w-4.5 h-4.5 sm:w-5 sm:h-5" aria-hidden="true" />
          </button>

          <button
            type="button"
            aria-label="بدء مكالمة صوتية"
            title={isPeerBlocked ? 'جهة الاتصال محظورة' : 'مكالمة صوتية'}
            disabled={isPeerBlocked}
            onClick={() => onStartCall('audio')}
            className="w-9 h-9 sm:w-10 sm:h-10 rounded-full flex items-center justify-center text-[#54656F] dark:text-[#AEBAC1] hover:bg-black/5 dark:hover:bg-white/10 disabled:opacity-40 disabled:cursor-not-allowed transition-colors cursor-pointer"
          >
            <Phone className="w-4.5 h-4.5 sm:w-5 sm:h-5" aria-hidden="true" />
          </button>

          <button
            type="button"
            aria-label="البحث في الرسائل"
            title="بحث داخل المحادثة"
            onClick={() => {
              setShowInChatSearch((v) => {
                const next = !v;
                if (next) {
                  if (externalSearchQuery) setInChatSearchQuery(externalSearchQuery);
                  window.requestAnimationFrame(() => inChatSearchInputRef.current?.focus());
                } else {
                  setInChatSearchQuery('');
                  setInChatFilterType('all');
                  onClearExternalHighlight?.();
                }
                return next;
              });
            }}
            className={`w-9 h-9 sm:w-10 sm:h-10 rounded-full flex items-center justify-center transition-colors cursor-pointer ${
              showInChatSearch
                ? 'bg-[var(--wa-accent-soft)] text-[var(--wa-accent-strong)]'
                : 'text-[#54656F] dark:text-[#AEBAC1] hover:bg-black/5 dark:hover:bg-white/10'
            }`}
          >
            <Search className="w-5 h-5" aria-hidden="true" />
          </button>

          <div data-chat-floating="true" className="relative">
            <button
              type="button"
              aria-label="خيارات المحادثة"
              aria-expanded={showMoreMenu}
              onClick={() => {
                setShowMoreMenu((v) => !v);
                setActiveMsgMenu(null);
                setActiveReceipt(null);
                setShowEmojiPicker(false);
                setShowAttachMenu(false);
                setShowTemplatesPicker(false);
              }}
              className="w-9 h-9 sm:w-10 sm:h-10 rounded-full flex items-center justify-center text-[#54656F] dark:text-[#AEBAC1] hover:bg-black/5 dark:hover:bg-white/10 transition-colors cursor-pointer"
            >
              <MoreVertical className="w-5 h-5" aria-hidden="true" />
            </button>

            {showMoreMenu && (
              <div
                role="menu"
                className="absolute left-0 top-12 z-40 w-56 max-w-[calc(100vw-1.5rem)] max-h-[calc(100dvh-5.5rem)] overflow-y-auto rounded-xl bg-white dark:bg-[#233138] shadow-xl border border-[#E9EDEF] dark:border-[#374248] py-1.5 text-sm"
              >
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  onOpenRightPanel('info');
                  setShowMoreMenu(false);
                }}
                className="w-full px-4 py-2.5 text-right hover:bg-[#F5F6F6] dark:hover:bg-[#182229] text-[#111B21] dark:text-[#E9EDEF] cursor-pointer"
              >
                {chat.type === 'direct' ? 'معلومات جهة الاتصال' : 'معلومات وإعدادات المجموعة'}
              </button>
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  setShowInChatSearch(true);
                  setShowMoreMenu(false);
                  window.requestAnimationFrame(() => inChatSearchInputRef.current?.focus());
                }}
                className="w-full px-4 py-2.5 text-right hover:bg-[#F5F6F6] dark:hover:bg-[#182229] text-[#111B21] dark:text-[#E9EDEF] cursor-pointer"
              >
                البحث في الرسائل
              </button>
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  onOpenRightPanel('search');
                  setShowMoreMenu(false);
                }}
                className="w-full px-4 py-2.5 text-right hover:bg-[#F5F6F6] dark:hover:bg-[#182229] text-[#111B21] dark:text-[#E9EDEF] cursor-pointer"
              >
                فهرس البحث الجانبي
              </button>
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  onOpenRightPanel('encryption');
                  setShowMoreMenu(false);
                }}
                className="w-full px-4 py-2.5 text-right hover:bg-[#F5F6F6] dark:hover:bg-[#182229] text-[#111B21] dark:text-[#E9EDEF] cursor-pointer"
              >
                التحقق من التشفير
              </button>
              {onOpenWallpaperPicker && (
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    onOpenWallpaperPicker();
                    setShowMoreMenu(false);
                  }}
                  className="w-full px-4 py-2.5 text-right flex items-center gap-2 hover:bg-[#F5F6F6] dark:hover:bg-[#182229] text-[#111B21] dark:text-[#E9EDEF] cursor-pointer"
                >
                  <Palette className="w-4 h-4 text-[var(--wa-accent)]" aria-hidden="true" />
                  <span>خلفية المحادثة</span>
                </button>
              )}
              {onOpenScheduledMessages && (
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    onOpenScheduledMessages();
                    setShowMoreMenu(false);
                  }}
                  className="w-full px-4 py-2.5 text-right flex items-center gap-2 hover:bg-[#F5F6F6] dark:hover:bg-[#182229] text-[#111B21] dark:text-[#E9EDEF] cursor-pointer"
                >
                  <Clock className="w-4 h-4 text-amber-500" aria-hidden="true" />
                  <span>الرسائل المجدولة</span>
                </button>
              )}
              {onToggleLockChat && (
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    onToggleLockChat(chat.id);
                    setShowMoreMenu(false);
                  }}
                  className="w-full px-4 py-2.5 text-right flex items-center gap-2 hover:bg-[#F5F6F6] dark:hover:bg-[#182229] text-[#111B21] dark:text-[#E9EDEF] cursor-pointer"
                >
                  {isLocked ? (
                    <>
                      <Unlock className="w-4 h-4 text-amber-500" aria-hidden="true" />
                      <span>إلغاء قفل المحادثة</span>
                    </>
                  ) : (
                    <>
                      <Lock className="w-4 h-4 text-amber-500" aria-hidden="true" />
                      <span>قفل المحادثة برمز</span>
                    </>
                  )}
                </button>
              )}
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  const next = chat.disappearingSeconds === 0 ? 86400 : 0;
                  onSetDisappearing(chat.id, next);
                  setShowMoreMenu(false);
                }}
                className="w-full px-4 py-2.5 text-right hover:bg-[#F5F6F6] dark:hover:bg-[#182229] text-[#111B21] dark:text-[#E9EDEF] cursor-pointer"
              >
                {chat.disappearingSeconds > 0
                  ? 'إيقاف الرسائل ذاتية الاختفاء'
                  : 'تفعيل اختفاء الرسائل (٢٤ ساعة)'}
              </button>
              {chat.type === 'direct' && (isPeerBlocked ? onUnblockPeer : onBlockPeer) && (
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    setShowMoreMenu(false);
                    if (isPeerBlocked) {
                      void onUnblockPeer?.();
                    } else {
                      void onBlockPeer?.();
                    }
                  }}
                  className={`w-full px-4 py-2.5 text-right flex items-center gap-2 cursor-pointer ${
                    isPeerBlocked
                      ? 'hover:bg-emerald-50 dark:hover:bg-emerald-950/30 text-emerald-700 dark:text-emerald-300'
                      : 'hover:bg-red-50 dark:hover:bg-red-950/40 text-red-600 dark:text-red-400'
                  }`}
                >
                  <Ban className="w-4 h-4" aria-hidden="true" />
                  <span>{isPeerBlocked ? 'إلغاء حظر جهة الاتصال' : 'حظر جهة الاتصال'}</span>
                </button>
              )}
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  onClearChat(chat.id);
                  setShowMoreMenu(false);
                }}
                className="w-full px-4 py-2.5 text-right hover:bg-red-50 dark:hover:bg-red-950/40 text-red-600 dark:text-red-400 cursor-pointer"
              >
                مسح محتوى الدردشة
              </button>
              {onDeleteChat && (
                <>
                  <div className="my-1 border-t border-[#E9EDEF] dark:border-[#374248]" />
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      setShowMoreMenu(false);
                      setShowDeleteChatConfirm(true);
                    }}
                    className="w-full px-4 py-2.5 text-right flex items-center gap-2 hover:bg-rose-50 dark:hover:bg-rose-950/40 text-rose-600 dark:text-rose-400 font-semibold cursor-pointer"
                  >
                    <Trash2 className="w-4 h-4 shrink-0" aria-hidden="true" />
                    <span>حذف المحادثة</span>
                  </button>
                </>
              )}
              </div>
            )}
          </div>
        </div>
      </header>

      {/* Inline Advanced In-Chat Search Bar */}
      {showInChatSearch && (
        <div
          role="search"
          aria-label="شريط البحث المتقدم داخل الرسائل"
          className="px-3 sm:px-4 py-2 bg-white dark:bg-[#182229] border-b border-[#E9EDEF] dark:border-[#222D34] space-y-2 z-10 shrink-0"
        >
          <div className="flex items-center gap-2">
            <div className="flex-1 min-w-0 flex items-center bg-[#F0F2F5] dark:bg-[#202C33] rounded-xl px-3 h-9">
              <Search className="w-4 h-4 text-[#54656F] dark:text-[#8696A0] shrink-0 ml-2" aria-hidden="true" />
              <input
                ref={inChatSearchInputRef}
                type="search"
                value={inChatSearchQuery}
                onChange={(e) => setInChatSearchQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Escape') {
                    setShowInChatSearch(false);
                    setInChatSearchQuery('');
                    setInChatFilterType('all');
                    onClearExternalHighlight?.();
                  } else if (e.key === 'Enter' && inChatMatches.length > 0) {
                    e.preventDefault();
                    setActiveMatchIdx((idx) =>
                      e.shiftKey
                        ? (idx + 1) % inChatMatches.length
                        : (idx - 1 + inChatMatches.length) % inChatMatches.length
                    );
                  }
                }}
                placeholder="ابحث داخل رسائل هذه المحادثة..."
                aria-label="نص البحث داخل الرسائل"
                className="w-full bg-transparent text-xs sm:text-sm text-[#111B21] dark:text-[#E9EDEF] placeholder:text-[#54656F] dark:placeholder:text-[#8696A0] focus:outline-none"
              />
              {(inChatSearchQuery || inChatFilterType !== 'all') && (
                <span className="text-[11px] font-mono-code text-[#54656F] dark:text-[#8696A0] whitespace-nowrap px-1.5">
                  {inChatMatches.length > 0
                    ? `${activeMatchIdx + 1}/${inChatMatches.length}`
                    : '0/0'}
                </span>
              )}
            </div>

            <div className="flex items-center gap-1 shrink-0">
              <button
                type="button"
                aria-label="النتيجة السابقة"
                disabled={inChatMatches.length === 0}
                onClick={() =>
                  setActiveMatchIdx((idx) => (idx - 1 + inChatMatches.length) % inChatMatches.length)
                }
                className="w-8 h-8 rounded-lg bg-[#F0F2F5] dark:bg-[#202C33] flex items-center justify-center text-[#54656F] dark:text-[#AEBAC1] disabled:opacity-40 cursor-pointer"
              >
                <ChevronUp className="w-4 h-4" aria-hidden="true" />
              </button>
              <button
                type="button"
                aria-label="النتيجة التالية"
                disabled={inChatMatches.length === 0}
                onClick={() =>
                  setActiveMatchIdx((idx) => (idx + 1) % inChatMatches.length)
                }
                className="w-8 h-8 rounded-lg bg-[#F0F2F5] dark:bg-[#202C33] flex items-center justify-center text-[#54656F] dark:text-[#AEBAC1] disabled:opacity-40 cursor-pointer"
              >
                <ChevronDown className="w-4 h-4" aria-hidden="true" />
              </button>
              <button
                type="button"
                aria-label="إغلاق شريط البحث"
                onClick={() => {
                  setShowInChatSearch(false);
                  setInChatSearchQuery('');
                  setInChatFilterType('all');
                  onClearExternalHighlight?.();
                }}
                className="w-8 h-8 rounded-lg hover:bg-[#F0F2F5] dark:hover:bg-[#202C33] flex items-center justify-center text-[#54656F] dark:text-[#AEBAC1] cursor-pointer"
              >
                <X className="w-4 h-4" aria-hidden="true" />
              </button>
            </div>
          </div>

          <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar">
            {(
              [
                { id: 'all', label: 'الكل' },
                { id: 'text', label: 'نص وصور' },
                { id: 'link', label: 'روابط' },
                { id: 'file', label: 'ملفات' },
                { id: 'poll', label: 'استطلاعات' }
              ] as { id: MessageSearchFilter; label: string }[]
            ).map((opt) => (
              <button
                key={opt.id}
                type="button"
                onClick={() => setInChatFilterType(opt.id)}
                className={`px-2.5 py-0.5 rounded-full text-[11px] font-medium whitespace-nowrap shrink-0 cursor-pointer transition-colors ${
                  inChatFilterType === opt.id
                    ? 'bg-[var(--wa-accent)] text-white font-semibold'
                    : 'bg-[#F0F2F5] dark:bg-[#202C33] text-[#54656F] dark:text-[#8696A0]'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Highlighted External Jump Banner */}
      {!showInChatSearch && highlightedMessageId && (
        <div className="px-4 py-1.5 bg-amber-50 dark:bg-amber-950/40 border-b border-amber-200 dark:border-amber-800/60 flex items-center justify-between text-xs text-amber-900 dark:text-amber-200 shrink-0">
          <span>
            {externalSearchQuery
              ? `تم الانتقال إلى الرسالة المطابقة لـ «${externalSearchQuery}»`
              : 'تم الانتقال إلى الرسالة المحددة'}
          </span>
          <button
            type="button"
            onClick={() => onClearExternalHighlight?.()}
            className="font-bold underline cursor-pointer"
          >
            إخفاء التحديد
          </button>
        </div>
      )}

      {/* Messages Canvas */}
      {(() => {
        const resolvedWallpaper = resolveChatWallpaper(chat.wallpaper, omarSettings.wallpaper);
        return (
          <div className="relative flex-1 min-w-0 overflow-hidden flex flex-col">
            <div
              aria-hidden="true"
              className={`pointer-events-none absolute inset-0 z-0 transition-all duration-200 ${resolvedWallpaper.className}`}
              style={resolvedWallpaper.style}
            />
            <VideoWallpaperLayer resolved={resolvedWallpaper} className="z-[1]" />
            <div
              onScroll={() => {
                if (activeMsgMenu) setActiveMsgMenu(null);
                if (activeReceipt) setActiveReceipt(null);
              }}
              className="relative z-10 flex-1 min-w-0 overflow-y-auto overflow-x-hidden px-3 sm:px-4 md:px-10 py-4 space-y-2.5"
            >
        {/* E2EE Encryption Notice Banner */}
        <div className="flex justify-center my-2">
          <button
            type="button"
            onClick={() => onOpenRightPanel('encryption')}
            className="max-w-lg px-4 py-2 rounded-xl bg-[#FFEECD] dark:bg-[#182229] text-[#54656F] dark:text-[#FFD279] text-xs leading-relaxed text-center shadow-xs hover:brightness-95 transition-all cursor-pointer"
          >
            <Lock className="w-3.5 h-3.5 inline-block ml-1.5 -mt-0.5" aria-hidden="true" />
            <span>
              الرسائل والمكالمات مشفرة تماماً بين الطرفين. لا يمكن لأي شخص خارج هذه الدردشة قراءتها أو الاستماع إليها. انقر للتحقق.
            </span>
          </button>
        </div>

        {visibleMessages.map((msg) => {
          const isMine = msg.senderId === myUid;
          const isStarred = msg.starredBy.includes(myUid);
          const totalPollVotes =
            msg.payload.pollOptions?.reduce((sum, o) => sum + o.voterIds.length, 0) || 0;
          const reactionEntries = Object.entries(msg.reactions).filter(([, users]) => users.length > 0);
          const showPreservedDeleted = msg.isDeleted && omarSettings.antiDeleteMessages && Boolean(msg.payload.text);
          const isFocusedHighlight = focusedMatchId === msg.id;
          const isSwipingThis = swipeDragState?.msgId === msg.id && swipeDragState.isSwiping;
          const activeSwipeOffset = isSwipingThis ? swipeDragState.offsetX : 0;
          const swipeProgress = Math.min(1, Math.abs(activeSwipeOffset) / SWIPE_REPLY_TRIGGER_PX);
          const swipeThresholdMet = isSwipeReplyThresholdMet(activeSwipeOffset);

          return (
            <div
              key={msg.id}
              ref={(el) => {
                msgRefsMap.current[msg.id] = el;
              }}
              className={`relative flex flex-col touch-pan-y select-none ${isMine ? 'items-start' : 'items-end'}`}
            >
              {activeSwipeOffset < -4 && (
                <div
                  aria-hidden="true"
                  style={{
                    opacity: Math.max(0.2, swipeProgress),
                    transform: `translate3d(0, -50%, 0) scale(${0.78 + swipeProgress * 0.28})`
                  }}
                  className="pointer-events-none absolute right-1.5 top-1/2 z-0 flex items-center gap-1.5"
                >
                  <span
                    className={`w-8 h-8 rounded-full flex items-center justify-center shadow-sm transition-colors ${
                      swipeThresholdMet
                        ? 'bg-[var(--wa-accent)] text-white'
                        : 'bg-white/95 dark:bg-[#233138] text-[#54656F] dark:text-[#AEBAC1] border border-[#E9EDEF] dark:border-[#374248]'
                    }`}
                  >
                    <Reply className="w-4 h-4" />
                  </span>
                  {swipeThresholdMet && (
                    <span className="px-2 py-0.5 rounded-md bg-[var(--wa-accent)] text-white text-[10px] font-bold shadow-xs whitespace-nowrap">
                      أفلت للرد
                    </span>
                  )}
                </div>
              )}
              <div
                onPointerDown={(e) => handleMessagePointerDown(e, msg)}
                onPointerMove={(e) => handleMessagePointerMove(e, msg)}
                onPointerUp={(e) => handleMessagePointerFinish(e, msg, false)}
                onPointerCancel={(e) => handleMessagePointerFinish(e, msg, true)}
                style={{
                  transform:
                    activeSwipeOffset < 0 ? `translate3d(${activeSwipeOffset}px, 0, 0)` : undefined,
                  transition: isSwipingThis
                    ? 'none'
                    : 'transform 180ms cubic-bezier(0.16, 1, 0.3, 1)'
                }}
                className={`group relative z-10 max-w-[88%] sm:max-w-[70%] md:max-w-[62%] will-change-transform ${
                  msg.isDeleted ? 'px-3' : 'pl-8 pr-3'
                } py-2 shadow-xs transition-[box-shadow,background-color] ${getBubbleRadiusClass(
                  isMine
                )} ${
                  isMine
                    ? 'bg-[var(--wa-outgoing-bg)] text-[#111B21] dark:text-[#E9EDEF]'
                    : 'bg-white dark:bg-[#202C33] text-[#111B21] dark:text-[#E9EDEF]'
                } ${
                  isFocusedHighlight
                    ? 'ring-2 ring-amber-400 dark:ring-amber-300 shadow-lg'
                    : ''
                }`}
              >
                {/* Forwarded Label */}
                {msg.payload.forwarded && !msg.isDeleted && (
                  <p className="text-[11px] italic text-[#54656F] dark:text-[#8696A0] flex items-center gap-1 mb-1">
                    <Forward className="w-3 h-3" aria-hidden="true" />
                    <span>رسالة محوّلة</span>
                  </p>
                )}

                {/* Anti-Delete Badge */}
                {showPreservedDeleted && (
                  <div className="mb-1.5 inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-amber-500/15 text-amber-800 dark:text-amber-300 text-[10px] font-semibold">
                    <ShieldAlert className="w-3 h-3" aria-hidden="true" />
                    <span>محذوفة (محتفظ بها بميزة منع الحذف)</span>
                  </div>
                )}

                {/* Group sender name */}
                {!isMine && chat.type !== 'direct' && (
                  <p className="text-xs font-semibold text-[var(--wa-accent-strong)] mb-1">
                    {msg.senderName}
                  </p>
                )}

                {/* Reply Quote */}
                {msg.payload.replyToText && (
                  <div className="mb-1.5 rounded-lg bg-black/5 dark:bg-black/25 px-2.5 py-1.5 text-xs border-r-[3px] border-[var(--wa-accent)]">
                    <p className="font-semibold text-[var(--wa-accent-strong)]">
                      {msg.payload.replyToSender || 'رسالة'}
                    </p>
                    <p className="text-[#54656F] dark:text-[#AEBAC1] line-clamp-1">
                      {msg.payload.replyToText}
                    </p>
                  </div>
                )}

                {/* Message Content by Type */}
                {msg.isDeleted && !showPreservedDeleted ? (
                  <p className="text-sm italic text-[#667781] dark:text-[#8696A0]">
                    تم حذف هذه الرسالة
                  </p>
                ) : msg.type === 'image' && (msg.payload.mediaUrl || (msg.payload.mediaUrls && msg.payload.mediaUrls.length > 0)) ? (
                  <div className="space-y-1.5">
                    {msg.payload.mediaUrls && msg.payload.mediaUrls.length > 1 ? (
                      <div className="space-y-1.5">
                        <div className="flex items-center gap-1.5 text-[11px] font-semibold text-[#54656F] dark:text-[#AEBAC1] px-0.5">
                          <Images className="w-3.5 h-3.5 text-[var(--wa-accent)]" aria-hidden="true" />
                          <span>ألبوم وسائط · {msg.payload.mediaUrls.length} صور</span>
                        </div>
                        <div className="grid grid-cols-2 gap-1 rounded-xl overflow-hidden bg-black/5 dark:bg-black/25 max-w-[280px] sm:max-w-[320px]">
                          {msg.payload.mediaUrls.length === 2 ? (
                            msg.payload.mediaUrls.map((url, idx) => (
                              <div
                                key={idx}
                                className="relative aspect-square overflow-hidden cursor-pointer group"
                                onClick={() => {
                                  if (suppressClickUntilRef.current > Date.now()) return;
                                  setLightboxImage({
                                    images: msg.payload.mediaUrls,
                                    initialIndex: idx,
                                    caption: msg.payload.text
                                  });
                                }}
                              >
                                <img
                                  src={resolveBundledAssetUrl(url)}
                                  alt={`صورة ${idx + 1}`}
                                  referrerPolicy="no-referrer"
                                  className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-200"
                                />
                              </div>
                            ))
                          ) : msg.payload.mediaUrls.length === 3 ? (
                            <>
                              <div
                                className="row-span-2 relative aspect-[3/4] overflow-hidden cursor-pointer group"
                                onClick={() => {
                                  if (suppressClickUntilRef.current > Date.now()) return;
                                  setLightboxImage({
                                    images: msg.payload.mediaUrls,
                                    initialIndex: 0,
                                    caption: msg.payload.text
                                  });
                                }}
                              >
                                <img
                                  src={resolveBundledAssetUrl(msg.payload.mediaUrls[0])}
                                  alt="صورة 1"
                                  referrerPolicy="no-referrer"
                                  className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-200"
                                />
                              </div>
                              <div
                                className="relative aspect-square overflow-hidden cursor-pointer group"
                                onClick={() => {
                                  if (suppressClickUntilRef.current > Date.now()) return;
                                  setLightboxImage({
                                    images: msg.payload.mediaUrls,
                                    initialIndex: 1,
                                    caption: msg.payload.text
                                  });
                                }}
                              >
                                <img
                                  src={resolveBundledAssetUrl(msg.payload.mediaUrls[1])}
                                  alt="صورة 2"
                                  referrerPolicy="no-referrer"
                                  className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-200"
                                />
                              </div>
                              <div
                                className="relative aspect-square overflow-hidden cursor-pointer group"
                                onClick={() => {
                                  if (suppressClickUntilRef.current > Date.now()) return;
                                  setLightboxImage({
                                    images: msg.payload.mediaUrls,
                                    initialIndex: 2,
                                    caption: msg.payload.text
                                  });
                                }}
                              >
                                <img
                                  src={resolveBundledAssetUrl(msg.payload.mediaUrls[2])}
                                  alt="صورة 3"
                                  referrerPolicy="no-referrer"
                                  className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-200"
                                />
                              </div>
                            </>
                          ) : (
                            <>
                              {msg.payload.mediaUrls.slice(0, 3).map((url, idx) => (
                                <div
                                  key={idx}
                                  className="relative aspect-square overflow-hidden cursor-pointer group"
                                  onClick={() => {
                                    if (suppressClickUntilRef.current > Date.now()) return;
                                    setLightboxImage({
                                      images: msg.payload.mediaUrls,
                                      initialIndex: idx,
                                      caption: msg.payload.text
                                    });
                                  }}
                                >
                                  <img
                                    src={resolveBundledAssetUrl(url)}
                                    alt={`صورة ${idx + 1}`}
                                    referrerPolicy="no-referrer"
                                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-200"
                                  />
                                </div>
                              ))}
                              <div
                                className="relative aspect-square overflow-hidden cursor-pointer group"
                                onClick={() => {
                                  if (suppressClickUntilRef.current > Date.now()) return;
                                  setLightboxImage({
                                    images: msg.payload.mediaUrls,
                                    initialIndex: 3,
                                    caption: msg.payload.text
                                  });
                                }}
                              >
                                <img
                                  src={resolveBundledAssetUrl(msg.payload.mediaUrls[3])}
                                  alt="صورة 4"
                                  referrerPolicy="no-referrer"
                                  className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-200"
                                />
                                {msg.payload.mediaUrls.length > 4 && (
                                  <div className="absolute inset-0 bg-black/60 backdrop-blur-[1px] flex flex-col items-center justify-center text-white font-bold transition-opacity group-hover:bg-black/70">
                                    <span className="text-xl sm:text-2xl font-display">
                                      +{msg.payload.mediaUrls.length - 3}
                                    </span>
                                    <span className="text-[10px] opacity-90">عرض الألبوم</span>
                                  </div>
                                )}
                              </div>
                            </>
                          )}
                        </div>
                      </div>
                    ) : (
                      <img
                        src={resolveBundledAssetUrl(msg.payload.mediaUrl || msg.payload.mediaUrls?.[0] || '')}
                        alt={msg.payload.text || 'صورة مرفقة'}
                        referrerPolicy="no-referrer"
                        onClick={() => {
                          if (suppressClickUntilRef.current > Date.now()) return;
                          setLightboxImage({
                            mediaUrl: msg.payload.mediaUrl || msg.payload.mediaUrls?.[0],
                            caption: msg.payload.text
                          });
                        }}
                        className="rounded-lg max-h-72 w-full object-cover bg-black/10 cursor-pointer hover:opacity-95 transition-opacity"
                        title="انقر لتكبير الصورة"
                      />
                    )}
                    {msg.payload.text && (
                      <p className={`${fontSizeClass} leading-relaxed whitespace-pre-wrap`}>
                        <HighlightText
                          text={msg.payload.text}
                          query={activeHighlightQuery}
                          active={isFocusedHighlight}
                        />
                      </p>
                    )}
                  </div>
                ) : msg.type === 'voice' ? (
                  <div className="flex items-center gap-3 min-w-[220px] py-1">
                    <button
                      type="button"
                      aria-label={playingVoiceId === msg.id ? 'إيقاف الرسالة الصوتية' : 'تشغيل الرسالة الصوتية'}
                      onClick={() =>
                        togglePlayVoice(msg.id, msg.payload.voiceDurationSec || 10, msg.payload.mediaUrl)
                      }
                      className="w-9 h-9 rounded-full bg-[var(--wa-accent)] text-white flex items-center justify-center shrink-0 hover:brightness-95 transition-all cursor-pointer"
                    >
                      {playingVoiceId === msg.id ? (
                        <Pause className="w-4 h-4" aria-hidden="true" />
                      ) : (
                        <Play className="w-4 h-4 mr-0.5" aria-hidden="true" />
                      )}
                    </button>
                    <div className="flex-1 flex flex-col gap-1">
                      <div className="flex items-center gap-[3px] h-6">
                        {(msg.payload.voiceWaveform || [35, 65, 80, 45, 90, 50, 75, 40, 85, 55, 70, 35]).map(
                          (h, idx) => (
                            <span
                              key={idx}
                              style={{ height: `${Math.max(20, h)}%` }}
                              className={`w-1 rounded-full transition-colors ${
                                playingVoiceId === msg.id
                                  ? 'bg-[var(--wa-accent)]'
                                  : 'bg-[#8696A0]/60'
                              }`}
                            />
                          )
                        )}
                      </div>
                      <span className="text-[11px] font-mono-code text-[#54656F] dark:text-[#AEBAC1]">
                        {formatCallDuration(msg.payload.voiceDurationSec || 8)}
                      </span>
                    </div>
                  </div>
                ) : msg.type === 'file' ? (
                  <div className="flex items-center gap-3 p-2.5 rounded-lg bg-black/5 dark:bg-black/20 min-w-[220px]">
                    <div className="w-10 h-10 rounded-lg bg-[var(--wa-accent-soft)] text-[var(--wa-accent-strong)] flex items-center justify-center shrink-0">
                      <FileText className="w-5 h-5" aria-hidden="true" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium truncate">
                        <HighlightText
                          text={msg.payload.fileName || msg.payload.text}
                          query={activeHighlightQuery}
                          active={isFocusedHighlight}
                        />
                      </p>
                      <p className="text-[11px] text-[#54656F] dark:text-[#AEBAC1] font-mono-code">
                        {msg.payload.fileSizeLabel || 'PDF'} · مشفر
                      </p>
                    </div>
                    {msg.payload.fileDataUrl && (
                      <a
                        href={msg.payload.fileDataUrl}
                        download={msg.payload.fileName || 'file'}
                        aria-label={`تنزيل ${msg.payload.fileName || 'الملف'}`}
                        className="w-8 h-8 rounded-full bg-white/80 dark:bg-[#233138] text-[var(--wa-accent-strong)] flex items-center justify-center shrink-0 hover:brightness-95"
                      >
                        <Download className="w-4 h-4" aria-hidden="true" />
                      </a>
                    )}
                  </div>
                ) : msg.type === 'poll' && msg.payload.pollOptions ? (
                  <div className="min-w-[240px] space-y-2.5 py-1">
                    <p className="text-sm font-bold">
                      <HighlightText
                        text={msg.payload.pollQuestion || ''}
                        query={activeHighlightQuery}
                        active={isFocusedHighlight}
                      />
                    </p>
                    <div className="space-y-2">
                      {msg.payload.pollOptions.map((opt) => {
                        const voted = opt.voterIds.includes(myUid);
                        const pct =
                          totalPollVotes > 0
                            ? Math.round((opt.voterIds.length / totalPollVotes) * 100)
                            : 0;
                        return (
                          <button
                            key={opt.id}
                            type="button"
                            onClick={() => onVotePoll(msg.id, opt.id)}
                            className="w-full text-right rounded-lg p-2 bg-black/5 dark:bg-black/25 hover:bg-black/10 dark:hover:bg-black/35 transition-colors cursor-pointer"
                          >
                            <div className="flex items-center justify-between gap-2 text-xs font-medium">
                              <span className="flex items-center gap-2">
                                <span
                                  className={`w-4 h-4 rounded-full border flex items-center justify-center ${
                                    voted
                                      ? 'bg-[var(--wa-accent)] border-[var(--wa-accent)] text-white'
                                      : 'border-[#8696A0]'
                                  }`}
                                >
                                  {voted && <Check className="w-3 h-3" aria-hidden="true" />}
                                </span>
                                <span>
                                  <HighlightText
                                    text={opt.text}
                                    query={activeHighlightQuery}
                                    active={isFocusedHighlight}
                                  />
                                </span>
                              </span>
                              <span className="font-mono-code text-[#54656F] dark:text-[#AEBAC1]">
                                {opt.voterIds.length}
                              </span>
                            </div>
                            <div className="mt-1.5 h-1.5 w-full rounded-full bg-black/10 dark:bg-white/10 overflow-hidden">
                              <div
                                style={{ width: `${pct}%` }}
                                className="h-full bg-[var(--wa-accent)] rounded-full transition-all duration-300"
                              />
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ) : msg.payload.decryptionFailed ? (
                  <div className="rounded-xl bg-amber-500/10 dark:bg-amber-950/35 border border-amber-300/60 dark:border-amber-700/50 px-3 py-2 space-y-1.5">
                    <div className="flex items-center gap-1.5 text-xs font-bold text-amber-800 dark:text-amber-300">
                      <Lock className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                      <span>رسالة مشفرة بمفتاح جلسة سابق</span>
                    </div>
                    <p className="text-[11px] text-[#54656F] dark:text-[#AEBAC1] leading-relaxed">
                      تعذر فك التشفير لاختلاف مفتاح الجهاز وقت الإرسال — الرسائل الجديدة متزامنة تلقائياً.
                    </p>
                    <button
                      type="button"
                      onClick={() => onOpenRightPanel('encryption', msg.id)}
                      className="text-[11px] font-semibold text-[var(--wa-accent-strong)] hover:underline cursor-pointer"
                    >
                      التحقق من المفاتيح والتشفير
                    </button>
                  </div>
                ) : (() => {
                  const stickerDef =
                    msg.type === 'text' ? getStickerById(msg.payload.stickerId) : undefined;
                  const hasCustomLottie =
                    msg.type === 'text' &&
                    (isValidLottieData(msg.payload.lottieData) ||
                      Boolean(getLottieAnimationById(msg.payload.lottieId)));
                  if (stickerDef || hasCustomLottie) {
                    return (
                      <StickerCard
                        sticker={stickerDef}
                        lottieId={msg.payload.lottieId || stickerDef?.lottieId}
                        lottieData={msg.payload.lottieData}
                        customLabel={msg.payload.stickerLabel}
                      />
                    );
                  }
                  return (
                    <p className={`${fontSizeClass} leading-relaxed whitespace-pre-wrap break-words`}>
                      <HighlightText
                        text={msg.payload.text}
                        query={activeHighlightQuery}
                        active={isFocusedHighlight}
                      />
                    </p>
                  );
                })()}

                {/* Per-Message Live Translation Result / Status */}
                {!msg.isDeleted && translatingIds[msg.id] && (
                  <div className="mt-2 rounded-lg bg-black/5 dark:bg-black/25 px-2.5 py-2 text-xs text-[#54656F] dark:text-[#AEBAC1] flex items-center gap-2 border-t border-black/5 dark:border-white/10">
                    <Languages className="w-3.5 h-3.5 text-[var(--wa-accent)] animate-pulse shrink-0" aria-hidden="true" />
                    <span>جاري ترجمة الرسالة...</span>
                  </div>
                )}

                {!msg.isDeleted && !translatingIds[msg.id] && translationErrors[msg.id] && (
                  <div className="mt-2 rounded-lg bg-red-500/10 px-2.5 py-1.5 text-[11px] text-red-700 dark:text-red-300 flex items-center justify-between gap-2">
                    <span>{translationErrors[msg.id]}</span>
                    <button
                      type="button"
                      onClick={() => void handleTranslateMessage(msg)}
                      className="font-bold underline shrink-0 cursor-pointer"
                    >
                      إعادة المحاولة
                    </button>
                  </div>
                )}

                {!msg.isDeleted &&
                  !translatingIds[msg.id] &&
                  translatedMessages[msg.id] &&
                  translatedMessages[msg.id].sourceText === getTranslatableMessageText(msg) && (() => {
                    const entry = translatedMessages[msg.id].result;
                    const langMeta = getTranslationLanguageMeta(entry.targetLang);
                    return (
                      <div className="mt-2 rounded-lg bg-black/5 dark:bg-black/25 px-2.5 py-2 border-r-[3px] border-[var(--wa-accent)] space-y-1">
                        <div className="flex items-center justify-between gap-2 text-[10px] text-[#54656F] dark:text-[#AEBAC1]">
                          <span className="inline-flex items-center gap-1 font-semibold text-[var(--wa-accent-strong)]">
                            <Languages className="w-3 h-3 shrink-0" aria-hidden="true" />
                            <span>ترجمة ({langMeta.arabicName})</span>
                          </span>
                          <div className="flex items-center gap-1.5">
                            <select
                              aria-label="تغيير لغة الترجمة"
                              value={entry.targetLang}
                              onChange={(e) => {
                                const nextLang = e.target.value as TranslationLangCode;
                                onChangePreferredLanguage?.(nextLang);
                                void handleTranslateMessage(msg, nextLang);
                              }}
                              className="rounded bg-white/80 dark:bg-[#111B21] border border-black/10 dark:border-white/10 px-1.5 py-0.5 text-[10px] text-[#111B21] dark:text-[#E9EDEF] focus:outline-none cursor-pointer"
                            >
                              {SUPPORTED_TRANSLATION_LANGUAGES.map((langOpt) => (
                                <option key={langOpt.code} value={langOpt.code}>
                                  {langOpt.arabicName}
                                </option>
                              ))}
                            </select>
                            <button
                              type="button"
                              aria-label="إخفاء الترجمة"
                              onClick={() => handleHideTranslation(msg.id)}
                              className="p-0.5 rounded hover:bg-black/10 dark:hover:bg-white/10 cursor-pointer"
                            >
                              <X className="w-3 h-3" aria-hidden="true" />
                            </button>
                          </div>
                        </div>
                        <p
                          dir={langMeta.dir}
                          className={`${fontSizeClass} leading-relaxed whitespace-pre-wrap break-words text-[#111B21] dark:text-[#E9EDEF]`}
                        >
                          {entry.translatedText}
                        </p>
                      </div>
                    );
                  })()}

                {/* Timestamp, Edited badge, Star & Receipt Indicator (from deliveredToIds / readByIds) */}
                <div className="mt-1 flex items-center justify-end gap-1.5 text-[11px] text-[#667781] dark:text-[#AEBAC1] font-mono-code">
                  {msg.payload.edited && !msg.isDeleted && (
                    <span className="text-[10px] font-sans font-medium opacity-80">
                      تم التعديل
                    </span>
                  )}
                  {isStarred && <Star className="w-3 h-3 fill-amber-400 text-amber-400" aria-label="مميزة بنجمة" />}
                  <span>{formatWhatsAppTime(msg.createdAtMs)}</span>
                  {isMine && !msg.isDeleted && (() => {
                    const isGroupChat = chat.type !== 'direct';
                    const receipt = getMessageReceiptDetails(msg, isGroupChat);
                    const resolvePeerName = (peerId: string) => {
                      const match = contacts.find((c) => c.uid === peerId);
                      if (match?.displayName) return match.displayName;
                      if (!isGroupChat && chat.title) return chat.title;
                      return `${peerId.slice(0, 6)}…`;
                    };
                    const isPopoverOpen = activeReceipt?.msgId === msg.id;

                    if (receipt.status === 'sending') {
                      return (
                        <span
                          data-receipt-status="sending"
                          title={receipt.description}
                          aria-label={receipt.description}
                          className="inline-flex items-center"
                        >
                          <Clock className="w-3.5 h-3.5 opacity-75 animate-pulse" aria-hidden="true" />
                        </span>
                      );
                    }

                    if (receipt.status === 'failed') {
                      return (
                        <button
                          type="button"
                          data-receipt-status="failed"
                          onClick={() => onRetryMessage && void onRetryMessage(msg)}
                          className="inline-flex items-center gap-1 text-red-600 dark:text-red-400 font-sans font-bold hover:underline cursor-pointer"
                          title={receipt.description}
                        >
                          <RotateCcw className="w-3 h-3" aria-hidden="true" />
                          <span>إعادة</span>
                        </button>
                      );
                    }

                    return (
                      <div data-chat-floating="true" className="inline-flex items-center">
                        <button
                          type="button"
                          data-receipt-status={receipt.status}
                          title={`${receipt.description} — انقر لعرض التفاصيل`}
                          aria-label={receipt.description}
                          aria-expanded={isPopoverOpen}
                          onClick={(e) => {
                            e.stopPropagation();
                            setActiveMsgMenu(null);
                            if (activeReceipt?.msgId === msg.id) {
                              setActiveReceipt(null);
                              return;
                            }
                            const rect = e.currentTarget.getBoundingClientRect();
                            setActiveReceipt({
                              msgId: msg.id,
                              ...computeClampedFloatingPosition(
                                { top: rect.top, bottom: rect.bottom, left: rect.left, right: rect.right },
                                256,
                                200
                              )
                            });
                          }}
                          className={`inline-flex items-center gap-0.5 rounded px-0.5 py-0.5 transition-colors cursor-pointer hover:bg-black/5 dark:hover:bg-white/10 ${
                            receipt.status === 'read'
                              ? 'text-[#0284C7] dark:text-[#53BDEB]'
                              : receipt.status === 'delivered'
                                ? 'text-[#54656F] dark:text-[#AEBAC1]'
                                : 'text-[#667781] dark:text-[#9CA3AF]'
                          }`}
                        >
                          {receipt.status === 'sent' ? (
                            <Check className="w-3.5 h-3.5" aria-hidden="true" />
                          ) : (
                            <CheckCheck className="w-3.5 h-3.5" aria-hidden="true" />
                          )}
                          {isGroupChat &&
                            (receipt.status === 'read'
                              ? receipt.readPeerIds.length > 0 && (
                                  <span className="text-[10px] leading-none font-mono-code">
                                    {receipt.readPeerIds.length}
                                  </span>
                                )
                              : receipt.status === 'delivered' &&
                                receipt.deliveredPeerIds.length > 0 && (
                                  <span className="text-[10px] leading-none font-mono-code">
                                    {receipt.deliveredPeerIds.length}
                                  </span>
                                ))}
                        </button>
                      </div>
                    );
                  })()}
                </div>

                {/* Hover / Touch Quick Action Trigger */}
                {!msg.isDeleted && (
                  <div data-chat-floating="true" className="contents">
                    <button
                      type="button"
                      aria-label="خيارات الرسالة"
                      onClick={(e) => {
                        e.stopPropagation();
                        setShowMoreMenu(false);
                        setShowEmojiPicker(false);
                        setShowAttachMenu(false);
                        setShowTemplatesPicker(false);
                        setActiveReceipt(null);
                        if (activeMsgMenu?.msgId === msg.id) {
                          setActiveMsgMenu(null);
                          return;
                        }
                        const rect = e.currentTarget.getBoundingClientRect();
                        setActiveMsgMenu({
                          msgId: msg.id,
                          ...computeClampedFloatingPosition(
                            { top: rect.top, bottom: rect.bottom, left: rect.left, right: rect.right },
                            216,
                            360
                          )
                        });
                      }}
                      className="opacity-75 md:opacity-0 md:group-hover:opacity-100 focus:opacity-100 absolute top-1.5 left-1.5 w-6 h-6 rounded-full bg-white/90 dark:bg-[#233138] shadow-xs flex items-center justify-center text-[#54656F] dark:text-[#AEBAC1] transition-opacity cursor-pointer"
                    >
                      <MoreVertical className="w-3.5 h-3.5" aria-hidden="true" />
                    </button>
                  </div>
                )}
              </div>

              {/* Reactions bar */}
              {reactionEntries.length > 0 && (
                <div className="flex items-center gap-1 -mt-1.5 z-10 px-2">
                  {reactionEntries.map(([emoji, users]) => (
                    <button
                      key={emoji}
                      type="button"
                      onClick={() => onReactMessage(msg.id, emoji)}
                      className="px-1.5 py-0.5 rounded-full bg-white dark:bg-[#202C33] border border-[#E9EDEF] dark:border-[#374248] text-xs shadow-xs flex items-center gap-1 cursor-pointer"
                    >
                      <span>{emoji}</span>
                      {users.length > 1 && <span className="text-[10px] font-mono-code">{users.length}</span>}
                    </button>
                  ))}
                </div>
              )}
            </div>
          );
        })}
        <div ref={bottomRef} />
            </div>
          </div>
        );
      })()}

      {/* Reply / Edit Preview Strip + Direct Quick Replies List */}
      {(replyTo || editingMsg) && (() => {
        const quickSuggestions =
          replyTo && !editingMsg
            ? buildQuickReplySuggestions(replyTo, omarSettings.quickTemplates)
            : [];
        return (
          <div
            data-chat-floating="true"
            className="px-3 sm:px-4 py-2 bg-[#F0F2F5] dark:bg-[#202C33] border-t border-[#E9EDEF] dark:border-[#222D34] space-y-2 shrink-0"
          >
            <div className="flex items-center justify-between gap-2.5">
              <div className="flex-1 min-w-0 bg-white dark:bg-[#111B21] rounded-lg px-3 py-2 border-r-4 border-[var(--wa-accent)]">
                <p className="text-xs font-semibold text-[var(--wa-accent-strong)] flex items-center gap-1.5">
                  <Reply className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                  <span>
                    {editingMsg
                      ? 'تعديل الرسالة'
                      : `الرد على ${replyTo!.senderId === myUid ? 'نفسك' : replyTo!.senderName}`}
                  </span>
                </p>
                <p className="text-xs text-[#54656F] dark:text-[#8696A0] truncate mt-0.5">
                  {editingMsg ? editingMsg.payload.text : formatReplyPreviewText(replyTo!)}
                </p>
              </div>
              <button
                type="button"
                aria-label={editingMsg ? 'إلغاء التعديل' : 'إلغاء الرد'}
                onClick={() => {
                  if (editingMsg) {
                    setEditingMsg(null);
                    setText('');
                  } else {
                    setReplyTo(null);
                  }
                }}
                className="w-10 h-10 rounded-full flex items-center justify-center text-[#54656F] dark:text-[#AEBAC1] hover:bg-black/5 dark:hover:bg-white/10 shrink-0 cursor-pointer"
              >
                <X className="w-4 h-4" aria-hidden="true" />
              </button>
            </div>

            {quickSuggestions.length > 0 && !isComposerReadOnly && (
              <div
                aria-label="قائمة الردود السريعة"
                className="flex items-center gap-1.5 overflow-x-auto no-scrollbar pb-0.5"
              >
                <span className="inline-flex items-center gap-1 text-[11px] font-bold text-[var(--wa-accent-strong)] shrink-0 pl-1">
                  <Zap className="w-3.5 h-3.5" aria-hidden="true" />
                  <span>ردود سريعة:</span>
                </span>
                {quickSuggestions.map((suggestion) => (
                  <button
                    key={suggestion}
                    type="button"
                    onClick={() => void handleSendQuickReplyChip(suggestion)}
                    className="px-3 py-1.5 rounded-lg bg-white dark:bg-[#111B21] border border-[#DCE3E7] dark:border-[#374248] text-xs font-medium text-[#111B21] dark:text-[#E9EDEF] hover:border-[var(--wa-accent)] hover:bg-[var(--wa-accent-soft)]/40 active:scale-[0.98] transition-all shrink-0 cursor-pointer"
                  >
                    {suggestion}
                  </button>
                ))}
              </div>
            )}
          </div>
        );
      })()}

      {/* Composer Bar */}
      <footer
        data-chat-floating="true"
        className="px-2.5 sm:px-3 py-2.5 pb-safe bg-[#F0F2F5] dark:bg-[#202C33] border-t border-[#E9EDEF] dark:border-[#222D34] relative shrink-0"
      >
        {chat.type === 'direct' && isPeerBlocked ? (
          <div className="py-2.5 px-3.5 rounded-xl bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900/50 flex flex-wrap items-center justify-between gap-2 text-xs text-red-700 dark:text-red-300">
            <div className="flex items-center gap-2 min-w-0">
              <Ban className="w-4 h-4 shrink-0" aria-hidden="true" />
              <span>لقد قمت بحظر جهة الاتصال هذه — تم منع الرسائل والمكالمات بينكما.</span>
            </div>
            {onUnblockPeer && (
              <button
                type="button"
                onClick={() => void onUnblockPeer()}
                className="px-3 py-1 rounded-lg bg-white dark:bg-[#111B21] border border-red-200 dark:border-red-800 text-xs font-bold text-[#111B21] dark:text-[#E9EDEF] hover:brightness-95 cursor-pointer"
              >
                إلغاء الحظر
              </button>
            )}
          </div>
        ) : chat.type === 'community' && chat.adminOnlyPost && chat.id.startsWith('channel_') ? (
          <div className="py-2 px-3 rounded-xl bg-white/80 dark:bg-[#111B21]/70 text-center text-xs text-[#54656F] dark:text-[#AEBAC1] flex items-center justify-center gap-2">
            <Lock className="w-3.5 h-3.5 text-[var(--wa-accent)] shrink-0" aria-hidden="true" />
            <span>
              هذه القناة مخصصة لبث المشرفين فقط — يمكنك التفاعل بالرموز التعبيرية على الرسائل أعلاه.
            </span>
          </div>
        ) : (
          <>
        {showEmojiPicker && (
          <div className="absolute bottom-16 right-2 left-2 sm:left-auto sm:right-4 sm:w-[340px] max-w-[calc(100vw-1rem)] z-40 rounded-2xl bg-white dark:bg-[#233138] shadow-2xl border border-[#E9EDEF] dark:border-[#374248] overflow-hidden">
            {/* Picker Tabs */}
            <div className="flex items-center justify-between px-3 py-2 border-b border-[#E9EDEF] dark:border-[#374248] bg-[#F8FAFB] dark:bg-[#182229]">
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => setPickerTab('emoji')}
                  className={`px-3 py-1 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
                    pickerTab === 'emoji'
                      ? 'bg-[var(--wa-accent)] text-white'
                      : 'text-[#54656F] dark:text-[#AEBAC1] hover:bg-black/5 dark:hover:bg-white/5'
                  }`}
                >
                  رموز تعبيرية
                </button>
                <button
                  type="button"
                  onClick={() => setPickerTab('stickers')}
                  className={`px-3 py-1 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
                    pickerTab === 'stickers'
                      ? 'bg-[var(--wa-accent)] text-white'
                      : 'text-[#54656F] dark:text-[#AEBAC1] hover:bg-black/5 dark:hover:bg-white/5'
                  }`}
                >
                  ملصقات عربية
                </button>
              </div>
              <button
                type="button"
                aria-label="إغلاق لوحة الرموز والملصقات"
                onClick={() => setShowEmojiPicker(false)}
                className="p-1 rounded-full text-[#54656F] dark:text-[#AEBAC1] hover:bg-black/5 dark:hover:bg-white/5 cursor-pointer"
              >
                <X className="w-3.5 h-3.5" aria-hidden="true" />
              </button>
            </div>

            {pickerTab === 'emoji' ? (
              <div className="p-3 grid grid-cols-6 gap-1.5 max-h-60 overflow-y-auto">
                {EMOJI_PALETTE.map((emoji) => (
                  <button
                    key={emoji}
                    type="button"
                    onClick={() => setText((t) => `${t}${emoji}`)}
                    className="w-10 h-10 rounded-lg hover:bg-[#F0F2F5] dark:hover:bg-[#182229] text-xl flex items-center justify-center cursor-pointer mx-auto"
                  >
                    {emoji}
                  </button>
                ))}
              </div>
            ) : (
              <div className="p-2.5 space-y-2.5">
                <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar pb-0.5">
                  {STICKER_CATEGORIES.map((cat) => (
                    <button
                      key={cat.id}
                      type="button"
                      onClick={() => setStickerCategory(cat.id)}
                      className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold whitespace-nowrap shrink-0 cursor-pointer transition-colors ${
                        stickerCategory === cat.id
                          ? 'bg-[var(--wa-accent-soft)] text-[var(--wa-accent-strong)]'
                          : 'bg-[#F0F2F5] dark:bg-[#182229] text-[#54656F] dark:text-[#AEBAC1]'
                      }`}
                    >
                      {cat.label}
                    </button>
                  ))}
                </div>
                <div className="grid grid-cols-2 gap-2 max-h-64 overflow-y-auto pl-0.5">
                  {filterStickersByCategory(stickerCategory).map((stk) => {
                    const isAnimated = isLottieSticker(stk);
                    return (
                      <button
                        key={stk.id}
                        type="button"
                        onClick={() => void handleSendSticker(stk)}
                        style={{
                          background: `linear-gradient(135deg, ${stk.bgFrom} 0%, ${stk.bgTo} 100%)`,
                          color: stk.textColor
                        }}
                        className="relative rounded-xl px-2.5 py-2.5 text-center shadow-xs hover:brightness-105 active:scale-[0.98] transition-all flex flex-col items-center justify-center gap-1 cursor-pointer"
                      >
                        {isAnimated && (
                          <span className="text-[9px] font-bold opacity-90 tracking-wide">
                            Lottie · متحرك
                          </span>
                        )}
                        {isAnimated ? (
                          <LottieStickerPlayer
                            lottieId={stk.lottieId}
                            fallbackEmoji={stk.emoji}
                            label={stk.label}
                            sizeClassName="w-12 h-12"
                            interactiveReplay={false}
                          />
                        ) : (
                          <span className="text-2xl leading-none">{stk.emoji}</span>
                        )}
                        <span className="font-display text-xs font-bold leading-tight">
                          {stk.label}
                        </span>
                        {stk.subtitle && (
                          <span className="text-[10px] opacity-85 line-clamp-1">{stk.subtitle}</span>
                        )}
                      </button>
                    );
                  })}
                </div>
                <div className="pt-1 border-t border-[#E9EDEF] dark:border-[#374248] flex items-center justify-between gap-2">
                  <button
                    type="button"
                    onClick={() => lottieInputRef.current?.click()}
                    className="w-full py-1.5 px-3 rounded-lg bg-[#F0F2F5] dark:bg-[#182229] hover:bg-[#E4E8EB] dark:hover:bg-[#202C33] text-[11px] font-semibold text-[#111B21] dark:text-[#E9EDEF] flex items-center justify-center gap-1.5 cursor-pointer transition-colors"
                  >
                    <Plus className="w-3.5 h-3.5 text-[var(--wa-accent)]" aria-hidden="true" />
                    <span>استيراد ملصق Lottie (.json)</span>
                  </button>
                </div>
                {lottieUploadError && (
                  <p className="text-[11px] text-red-600 dark:text-red-400 text-center">
                    {lottieUploadError}
                  </p>
                )}
              </div>
            )}
          </div>
        )}

        {showTemplatesPicker && (
          <div className="absolute bottom-16 right-4 left-4 sm:left-auto sm:w-80 z-30 p-2.5 rounded-2xl bg-white dark:bg-[#233138] shadow-xl border border-[#E9EDEF] dark:border-[#374248] space-y-1.5">
            <div className="px-2 py-1 flex items-center justify-between border-b border-[#E9EDEF] dark:border-[#374248]">
              <span className="text-xs font-bold text-[var(--wa-accent-strong)] flex items-center gap-1.5">
                <Zap className="w-3.5 h-3.5" aria-hidden="true" />
                <span>قوالب أكرم السريعة</span>
              </span>
              <button
                type="button"
                aria-label="إغلاق القوالب"
                onClick={() => setShowTemplatesPicker(false)}
                className="p-1 text-[#54656F] dark:text-[#AEBAC1] cursor-pointer"
              >
                <X className="w-3.5 h-3.5" aria-hidden="true" />
              </button>
            </div>
            <div className="max-h-48 overflow-y-auto space-y-1">
              {omarSettings.quickTemplates.map((tpl, idx) => (
                <div
                  key={`${idx}_${tpl}`}
                  className="flex items-center gap-1.5 rounded-xl bg-[#F8FAFB] dark:bg-[#182229] px-2.5 py-2 hover:bg-[#F0F2F5] dark:hover:bg-[#202C33]"
                >
                  <button
                    type="button"
                    onClick={() => {
                      setText((t) => (t ? `${t} ${tpl}` : tpl));
                      setShowTemplatesPicker(false);
                    }}
                    className="flex-1 text-right text-xs text-[#111B21] dark:text-[#E9EDEF] leading-relaxed cursor-pointer"
                  >
                    {tpl}
                  </button>
                  <button
                    type="button"
                    aria-label="إرسال القالب فوراً"
                    title="إرسال مباشر"
                    onClick={() => {
                      setShowTemplatesPicker(false);
                      void handleSendText(tpl);
                    }}
                    className="w-7 h-7 rounded-full bg-[var(--wa-accent)] text-white flex items-center justify-center shrink-0 hover:brightness-95 cursor-pointer"
                  >
                    <SendHorizontal className="w-3.5 h-3.5 rotate-180" aria-hidden="true" />
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {showAttachMenu && (
          <div className="absolute bottom-16 right-14 z-30 w-48 rounded-2xl bg-white dark:bg-[#233138] shadow-xl border border-[#E9EDEF] dark:border-[#374248] py-2 text-sm">
            <button
              type="button"
              onClick={() => imageInputRef.current?.click()}
              className="w-full px-4 py-2.5 flex items-center gap-3 hover:bg-[#F5F6F6] dark:hover:bg-[#182229] text-[#111B21] dark:text-[#E9EDEF] cursor-pointer"
            >
              <ImageIcon className="w-4 h-4 text-blue-500" aria-hidden="true" />
              <span>صورة أو وسائط</span>
            </button>
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="w-full px-4 py-2.5 flex items-center gap-3 hover:bg-[#F5F6F6] dark:hover:bg-[#182229] text-[#111B21] dark:text-[#E9EDEF] cursor-pointer"
            >
              <FileText className="w-4 h-4 text-indigo-500" aria-hidden="true" />
              <span>مستند أو ملف</span>
            </button>
            <button
              type="button"
              onClick={() => {
                setShowPollModal(true);
                setShowAttachMenu(false);
              }}
              className="w-full px-4 py-2.5 flex items-center gap-3 hover:bg-[#F5F6F6] dark:hover:bg-[#182229] text-[#111B21] dark:text-[#E9EDEF] cursor-pointer"
            >
              <BarChart3 className="w-4 h-4 text-[var(--wa-accent)]" aria-hidden="true" />
              <span>استطلاع رأي</span>
            </button>
            <button
              type="button"
              onClick={() => {
                setShowScheduleModal(true);
                setShowAttachMenu(false);
              }}
              className="w-full px-4 py-2.5 flex items-center gap-3 hover:bg-[#F5F6F6] dark:hover:bg-[#182229] text-[#111B21] dark:text-[#E9EDEF] cursor-pointer"
            >
              <Clock className="w-4 h-4 text-amber-500" aria-hidden="true" />
              <span>جدولة رسالة مستقبلية</span>
            </button>
          </div>
        )}

        <input
          ref={imageInputRef}
          type="file"
          accept="image/*"
          multiple
          onChange={handleImagePick}
          className="hidden"
        />
        <input
          ref={fileInputRef}
          type="file"
          onChange={handleFilePick}
          className="hidden"
        />
        <input
          ref={lottieInputRef}
          type="file"
          accept=".json,application/json"
          onChange={(e) => void handleLottieFilePick(e)}
          className="hidden"
        />

        {isRecording ? (
          <div className="flex items-center justify-between gap-3 bg-white dark:bg-[#2A3942] rounded-xl px-4 h-11">
            <div className="flex items-center gap-2.5 text-red-500 text-sm font-medium">
              <span className="w-2.5 h-2.5 rounded-full bg-red-500 animate-pulse" />
              <span>جاري تسجيل رسالة صوتية...</span>
              <span className="font-mono-code text-[#111B21] dark:text-[#E9EDEF]">
                {formatCallDuration(recordSeconds)}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                aria-label="إلغاء التسجيل"
                onClick={handleCancelRecording}
                className="px-3 py-1.5 rounded-lg text-xs text-red-500 hover:bg-red-50 dark:hover:bg-red-950/40 cursor-pointer"
              >
                إلغاء
              </button>
              <button
                type="button"
                aria-label="إرسال الرسالة الصوتية"
                onClick={() => void handleStopAndSendRecording()}
                className="w-9 h-9 rounded-full bg-[var(--wa-accent)] text-white flex items-center justify-center hover:brightness-95 cursor-pointer"
              >
                <Square className="w-3.5 h-3.5 fill-current" aria-hidden="true" />
              </button>
            </div>
          </div>
        ) : (
          <div className="flex items-end gap-1.5 sm:gap-2">
            <button
              type="button"
              aria-label="الرموز التعبيرية والملصقات"
              title="الرموز التعبيرية والملصقات"
              onClick={() => {
                setShowEmojiPicker((v) => !v);
                setShowAttachMenu(false);
                setShowTemplatesPicker(false);
                setShowMoreMenu(false);
                setActiveMsgMenu(null);
                setActiveReceipt(null);
              }}
              className="w-9 h-9 sm:w-10 sm:h-10 rounded-full flex items-center justify-center text-[#54656F] dark:text-[#AEBAC1] hover:bg-black/5 dark:hover:bg-white/10 shrink-0 cursor-pointer"
            >
              <Smile className="w-5 h-5" aria-hidden="true" />
            </button>

            <button
              type="button"
              aria-label="قوالب الرد السريع"
              title="قوالب الرد السريع"
              onClick={() => {
                setShowTemplatesPicker((v) => !v);
                setShowEmojiPicker(false);
                setShowAttachMenu(false);
                setShowMoreMenu(false);
                setActiveMsgMenu(null);
              }}
              className={`w-9 h-9 sm:w-10 sm:h-10 rounded-full flex items-center justify-center shrink-0 transition-colors cursor-pointer ${
                showTemplatesPicker
                  ? 'bg-[var(--wa-accent-soft)] text-[var(--wa-accent-strong)]'
                  : 'text-[#54656F] dark:text-[#AEBAC1] hover:bg-black/5 dark:hover:bg-white/10'
              }`}
            >
              <Zap className="w-4.5 h-4.5" aria-hidden="true" />
            </button>

            <button
              type="button"
              aria-label="إرفاق ملف أو صورة أو استطلاع"
              onClick={() => {
                setShowAttachMenu((v) => !v);
                setShowEmojiPicker(false);
                setShowTemplatesPicker(false);
                setShowMoreMenu(false);
                setActiveMsgMenu(null);
              }}
              className="w-9 h-9 sm:w-10 sm:h-10 rounded-full flex items-center justify-center text-[#54656F] dark:text-[#AEBAC1] hover:bg-black/5 dark:hover:bg-white/10 shrink-0 cursor-pointer"
            >
              <Plus className="w-5 h-5" aria-hidden="true" />
            </button>

            <div className="flex-1 min-w-0 bg-white dark:bg-[#2A3942] rounded-xl px-3 sm:px-3.5 py-2 flex items-center">
              <textarea
                ref={textareaRef}
                rows={1}
                value={text}
                onChange={(e) => {
                  const val = e.target.value;
                  setText(val);
                  onTypingChange?.(val.trim().length > 0);
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Escape') {
                    if (editingMsg) {
                      e.preventDefault();
                      setEditingMsg(null);
                      setText('');
                      onTypingChange?.(false);
                      return;
                    }
                    if (replyingTo) {
                      e.preventDefault();
                      setReplyingTo(null);
                      return;
                    }
                  }
                  if ((e.key === 'Enter' && !e.shiftKey) || ((e.ctrlKey || e.metaKey) && e.key === 'Enter')) {
                    e.preventDefault();
                    onTypingChange?.(false);
                    void handleSendText();
                  }
                }}
                placeholder={
                  editingMsg
                    ? 'عدّل نص الرسالة ثم اضغط حفظ...'
                    : chat.type === 'community' && chat.adminOnlyPost
                      ? 'اكتب رسالة بث لمتابعي القناة...'
                      : 'اكتب رسالة مشفرة...'
                }
                aria-label={editingMsg ? 'تعديل الرسالة' : 'اكتب رسالة'}
                className="w-full bg-transparent text-sm text-[#111B21] dark:text-[#E9EDEF] placeholder:text-[#667781] dark:placeholder:text-[#8696A0] resize-none focus:outline-none max-h-28 leading-6"
              />
            </div>

            {text.trim() ? (
              <button
                type="button"
                aria-label={editingMsg ? 'حفظ التعديل (Ctrl + Enter)' : 'إرسال الرسالة (Ctrl + Enter)'}
                title={editingMsg ? 'حفظ التعديل (Ctrl + Enter)' : 'إرسال الرسالة (Ctrl + Enter)'}
                onClick={() => {
                  onTypingChange?.(false);
                  void handleSendText();
                }}
                className="w-10 h-10 rounded-full bg-[var(--wa-accent)] text-white flex items-center justify-center hover:brightness-95 transition-all shrink-0 cursor-pointer"
              >
                {editingMsg ? (
                  <Check className="w-5 h-5" aria-hidden="true" />
                ) : (
                  <SendHorizontal className="w-5 h-5 rotate-180" aria-hidden="true" />
                )}
              </button>
            ) : (
              <button
                type="button"
                aria-label="تسجيل رسالة صوتية"
                onClick={() => void handleStartRecording()}
                className="w-10 h-10 rounded-full flex items-center justify-center text-[#54656F] dark:text-[#AEBAC1] hover:bg-black/5 dark:hover:bg-white/10 shrink-0 cursor-pointer"
              >
                <Mic className="w-5 h-5" aria-hidden="true" />
              </button>
            )}
          </div>
        )}
          </>
        )}
      </footer>

      {/* Poll Creation Modal */}
      {showPollModal && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="إنشاء استطلاع رأي"
          className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4"
        >
          <form
            onSubmit={(e) => void handleCreatePoll(e)}
            className="w-full max-w-md bg-white dark:bg-[#202C33] rounded-2xl p-6 shadow-2xl border border-[#E9EDEF] dark:border-[#374248] space-y-4"
          >
            <div className="flex items-center justify-between">
              <h3 className="font-display text-lg font-bold text-[#111B21] dark:text-[#E9EDEF]">
                إنشاء استطلاع رأي مشفر
              </h3>
              <button
                type="button"
                aria-label="إغلاق"
                onClick={() => setShowPollModal(false)}
                className="p-1.5 rounded-full text-[#54656F] hover:bg-black/5 cursor-pointer"
              >
                <X className="w-5 h-5" aria-hidden="true" />
              </button>
            </div>

            <div>
              <label className="block text-xs font-medium text-[#54656F] dark:text-[#8696A0] mb-1">
                السؤال
              </label>
              <input
                type="text"
                required
                value={pollQuestion}
                onChange={(e) => setPollQuestion(e.target.value)}
                placeholder="مثال: متى نبدأ الاجتماع القادم؟"
                className="w-full rounded-lg bg-[#F0F2F5] dark:bg-[#2A3942] px-3 py-2 text-sm text-[#111B21] dark:text-[#E9EDEF] focus:outline-none focus:ring-2 focus:ring-[var(--wa-accent)]"
              />
            </div>

            <div className="space-y-2">
              <label className="block text-xs font-medium text-[#54656F] dark:text-[#8696A0]">
                الخيارات
              </label>
              {pollOptions.map((opt, idx) => (
                <input
                  key={idx}
                  type="text"
                  value={opt}
                  onChange={(e) => {
                    const next = [...pollOptions];
                    next[idx] = e.target.value;
                    setPollOptions(next);
                  }}
                  placeholder={`خيار ${idx + 1}`}
                  className="w-full rounded-lg bg-[#F0F2F5] dark:bg-[#2A3942] px-3 py-2 text-sm text-[#111B21] dark:text-[#E9EDEF] focus:outline-none focus:ring-2 focus:ring-[var(--wa-accent)]"
                />
              ))}
            </div>

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setShowPollModal(false)}
                className="px-4 py-2 rounded-lg text-xs font-medium text-[#54656F] dark:text-[#AEBAC1] hover:bg-black/5 cursor-pointer"
              >
                إلغاء
              </button>
              <button
                type="submit"
                className="px-5 py-2 rounded-lg bg-[var(--wa-accent)] text-white text-xs font-semibold hover:brightness-95 cursor-pointer"
              >
                إرسال الاستطلاع
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Forward Message Modal */}
      {forwardMsg && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="تحويل الرسالة"
          className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4"
        >
          <div className="w-full max-w-md bg-white dark:bg-[#202C33] rounded-2xl shadow-2xl border border-[#E9EDEF] dark:border-[#374248] overflow-hidden flex flex-col max-h-[80vh]">
            <div className="px-5 py-4 border-b border-[#E9EDEF] dark:border-[#2A3942] flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Forward className="w-4 h-4 text-[var(--wa-accent)]" aria-hidden="true" />
                <h3 className="font-display text-base font-bold text-[#111B21] dark:text-[#E9EDEF]">
                  تحويل الرسالة إلى...
                </h3>
              </div>
              <button
                type="button"
                aria-label="إغلاق نافذة التحويل"
                onClick={() => setForwardMsg(null)}
                className="p-1.5 rounded-full text-[#54656F] dark:text-[#AEBAC1] hover:bg-black/5 cursor-pointer"
              >
                <X className="w-5 h-5" aria-hidden="true" />
              </button>
            </div>

            <div className="px-5 py-2.5 bg-[#F8FAFB] dark:bg-[#182229] border-b border-[#E9EDEF] dark:border-[#2A3942] text-xs text-[#54656F] dark:text-[#AEBAC1] truncate">
              {forwardMsg.payload.text}
            </div>

            <ul className="flex-1 overflow-y-auto p-3 space-y-1">
              {chats.map((target) => (
                <li key={target.id}>
                  <button
                    type="button"
                    disabled={forwardingToId === target.id}
                    onClick={() => void handleConfirmForward(target.id)}
                    className="w-full p-2.5 rounded-xl flex items-center justify-between gap-3 hover:bg-[#F5F6F6] dark:hover:bg-[#182229] text-right transition-colors cursor-pointer"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <Avatar
                        src={target.avatarUrl}
                        name={target.title}
                        size="md"
                        isOnline={target.isOnline}
                        isGroup={target.type !== 'direct'}
                      />
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-[#111B21] dark:text-[#E9EDEF] truncate">
                          {target.title}
                        </p>
                        <p className="text-[11px] text-[#54656F] dark:text-[#8696A0] truncate">
                          {target.type === 'direct' ? 'محادثة مباشرة' : 'مجموعة مشفرة'}
                        </p>
                      </div>
                    </div>
                    <span className="px-3 py-1 rounded-full bg-[var(--wa-accent-soft)] text-[var(--wa-accent-strong)] text-xs font-semibold shrink-0">
                      {forwardingToId === target.id ? 'جاري التحويل...' : 'إرسال'}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}

      {lightboxImage && (
        <ImageViewerModal
          mediaUrl={lightboxImage.mediaUrl}
          images={lightboxImage.images}
          initialIndex={lightboxImage.initialIndex}
          caption={lightboxImage.caption}
          onClose={() => setLightboxImage(null)}
        />
      )}

      {showScheduleModal && chat && onScheduleMessage && (
        <ScheduleMessageModal
          chatId={chat.id}
          initialText={text}
          onClose={() => setShowScheduleModal(false)}
          onConfirmSchedule={async (sendAtMs, msgText) => {
            await onScheduleMessage(chat.id, sendAtMs, msgText);
            setText('');
          }}
        />
      )}

      {/* Viewport-Clamped Fixed Per-Message Action Menu */}
      {activeMsgMenu && (() => {
        const msg = visibleMessages.find((m) => m.id === activeMsgMenu.msgId);
        if (!msg || msg.isDeleted) return null;
        const isMine = msg.senderId === myUid;
        const isStarred = msg.starredBy.includes(myUid);
        const isStickerMsg =
          msg.type === 'text' &&
          (Boolean(getStickerById(msg.payload.stickerId)) ||
            Boolean(msg.payload.lottieId) ||
            isValidLottieData(msg.payload.lottieData));
        return (
          <div
            data-chat-floating="true"
            role="menu"
            style={{
              left: activeMsgMenu.left,
              ...(activeMsgMenu.top !== undefined
                ? { top: activeMsgMenu.top }
                : { bottom: activeMsgMenu.bottom }),
              maxHeight: activeMsgMenu.maxHeight
            }}
            className="fixed z-[100] w-54 max-w-[calc(100vw-1.5rem)] overflow-y-auto rounded-xl bg-white dark:bg-[#233138] shadow-2xl border border-[#E9EDEF] dark:border-[#374248] py-1.5 text-xs text-[#111B21] dark:text-[#E9EDEF]"
          >
            <div className="px-2.5 py-1.5 flex items-center justify-between border-b border-[#E9EDEF] dark:border-[#374248]">
              {['❤️', '👍', '😂', '😮', '🙏'].map((emoji) => (
                <button
                  key={emoji}
                  type="button"
                  onClick={() => {
                    onReactMessage(msg.id, emoji);
                    setActiveMsgMenu(null);
                  }}
                  className="w-7 h-7 rounded-full hover:bg-[#F0F2F5] dark:hover:bg-[#182229] flex items-center justify-center text-base cursor-pointer"
                >
                  {emoji}
                </button>
              ))}
            </div>
            <button
              type="button"
              role="menuitem"
              onClick={() => openQuickReplyForMessage(msg)}
              className="w-full px-3.5 py-2 text-right flex items-center gap-2 hover:bg-[#F5F6F6] dark:hover:bg-[#182229] cursor-pointer"
            >
              <Reply className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
              <span>رد على الرسالة</span>
            </button>
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                setForwardMsg(msg);
                setActiveMsgMenu(null);
              }}
              className="w-full px-3.5 py-2 text-right flex items-center gap-2 hover:bg-[#F5F6F6] dark:hover:bg-[#182229] cursor-pointer"
            >
              <Forward className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
              <span>تحويل الرسالة</span>
            </button>
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                onToggleStarMessage(msg.id);
                setActiveMsgMenu(null);
              }}
              className="w-full px-3.5 py-2 text-right flex items-center gap-2 hover:bg-[#F5F6F6] dark:hover:bg-[#182229] cursor-pointer"
            >
              <Star className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
              <span>{isStarred ? 'إزالة النجمة' : 'تمييز بنجمة'}</span>
            </button>
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                void navigator.clipboard?.writeText(msg.payload.text);
                setActiveMsgMenu(null);
              }}
              className="w-full px-3.5 py-2 text-right flex items-center gap-2 hover:bg-[#F5F6F6] dark:hover:bg-[#182229] cursor-pointer"
            >
              <Copy className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
              <span>نسخ النص</span>
            </button>
            {Boolean(getTranslatableMessageText(msg)) && !isStickerMsg && (
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  setActiveMsgMenu(null);
                  if (translatedMessages[msg.id]) {
                    handleHideTranslation(msg.id);
                  } else {
                    void handleTranslateMessage(msg);
                  }
                }}
                className="w-full px-3.5 py-2 text-right flex items-center gap-2 hover:bg-[#F5F6F6] dark:hover:bg-[#182229] cursor-pointer"
              >
                <Languages className="w-3.5 h-3.5 text-[var(--wa-accent)] shrink-0" aria-hidden="true" />
                <span>{translatedMessages[msg.id] ? 'إخفاء الترجمة' : 'ترجمة الرسالة'}</span>
              </button>
            )}
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                onOpenRightPanel('encryption', msg.id);
                setActiveMsgMenu(null);
              }}
              className="w-full px-3.5 py-2 text-right flex items-center gap-2 hover:bg-[#F5F6F6] dark:hover:bg-[#182229] text-[var(--wa-accent-strong)] cursor-pointer"
            >
              <Lock className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
              <span>معاينة النص المشفر</span>
            </button>
            {isMine && msg.status !== 'sending' && msg.status !== 'failed' && (
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  const anchorRect = activeMsgMenu.triggerRect;
                  setActiveMsgMenu(null);
                  setActiveReceipt({
                    msgId: msg.id,
                    ...computeClampedFloatingPosition(anchorRect, 256, 200)
                  });
                }}
                className="w-full px-3.5 py-2 text-right flex items-center gap-2 hover:bg-[#F5F6F6] dark:hover:bg-[#182229] cursor-pointer"
              >
                <CheckCheck className="w-3.5 h-3.5 text-[#0284C7] dark:text-[#53BDEB] shrink-0" aria-hidden="true" />
                <span>حالة الاستلام والقراءة</span>
              </button>
            )}
            {isMine &&
              !isStickerMsg &&
              !msg.payload.decryptionFailed &&
              (msg.type === 'text' || msg.type === 'image') &&
              onEditMessage && (
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    setEditingMsg(msg);
                    setReplyTo(null);
                    setText(msg.payload.text);
                    setActiveMsgMenu(null);
                    window.requestAnimationFrame(() => textareaRef.current?.focus());
                  }}
                  className="w-full px-3.5 py-2 text-right flex items-center gap-2 hover:bg-[#F5F6F6] dark:hover:bg-[#182229] cursor-pointer"
                >
                  <Pencil className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                  <span>تعديل الرسالة</span>
                </button>
              )}
            {isMine ? (
              <>
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    onDeleteMessage(msg.id);
                    setActiveMsgMenu(null);
                  }}
                  className="w-full px-3.5 py-2 text-right flex items-center gap-2 hover:bg-[#F5F6F6] dark:hover:bg-[#182229] cursor-pointer text-amber-600 dark:text-amber-400"
                >
                  <Trash2 className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                  <span>حذف لي</span>
                </button>
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    onDeleteMessage(msg.id);
                    setActiveMsgMenu(null);
                  }}
                  className="w-full px-3.5 py-2 text-right flex items-center gap-2 hover:bg-red-50 dark:hover:bg-red-950/40 text-red-600 dark:text-red-400 cursor-pointer"
                >
                  <ShieldAlert className="w-3.5 h-3.5 shrink-0 text-red-500 animate-pulse" aria-hidden="true" />
                  <span>حذف للجميع</span>
                </button>
              </>
            ) : (
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  onDeleteMessage(msg.id);
                  setActiveMsgMenu(null);
                }}
                className="w-full px-3.5 py-2 text-right flex items-center gap-2 hover:bg-[#F5F6F6] dark:hover:bg-[#182229] cursor-pointer text-amber-600 dark:text-amber-400"
              >
                <Trash2 className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                <span>حذف لي</span>
              </button>
            )}
          </div>
        );
      })()}

      {/* Viewport-Clamped Fixed Receipt Details Popover */}
      {activeReceipt && (() => {
        const msg = visibleMessages.find((m) => m.id === activeReceipt.msgId);
        if (!msg || msg.isDeleted) return null;
        const isGroupChat = chat.type !== 'direct';
        const receipt = getMessageReceiptDetails(msg, isGroupChat);
        const resolvePeerName = (peerId: string) => {
          const match = contacts.find((c) => c.uid === peerId);
          if (match?.displayName) return match.displayName;
          if (!isGroupChat && chat.title) return chat.title;
          return `${peerId.slice(0, 6)}…`;
        };
        return (
          <div
            data-chat-floating="true"
            role="dialog"
            aria-label="تفاصيل حالة الرسالة"
            style={{
              left: activeReceipt.left,
              ...(activeReceipt.top !== undefined
                ? { top: activeReceipt.top }
                : { bottom: activeReceipt.bottom }),
              maxHeight: activeReceipt.maxHeight
            }}
            className="fixed z-[100] w-64 max-w-[calc(100vw-1.5rem)] overflow-y-auto rounded-xl bg-white dark:bg-[#233138] shadow-2xl border border-[#E9EDEF] dark:border-[#374248] p-3 text-right font-sans text-xs text-[#111B21] dark:text-[#E9EDEF]"
          >
            <div className="flex items-center justify-between gap-2 pb-2 mb-2 border-b border-[#E9EDEF] dark:border-[#374248]">
              <span className="font-bold text-[12px]">حالة الرسالة</span>
              <span
                className={`text-[11px] font-semibold ${
                  receipt.status === 'read'
                    ? 'text-[#0284C7] dark:text-[#53BDEB]'
                    : receipt.status === 'delivered'
                      ? 'text-[var(--wa-accent-strong)]'
                      : 'text-[#667781] dark:text-[#AEBAC1]'
                }`}
              >
                {receipt.label}
              </span>
            </div>

            <div className="space-y-2 text-[11px]">
              <div className="flex items-start gap-2">
                <Check
                  className="w-3.5 h-3.5 mt-0.5 shrink-0 text-[#54656F] dark:text-[#AEBAC1]"
                  aria-hidden="true"
                />
                <div className="min-w-0 flex-1">
                  <p className="font-semibold">مرسلة</p>
                  <p className="text-[#667781] dark:text-[#8696A0]">
                    تم الإرسال في {formatWhatsAppTime(msg.createdAtMs)}
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-2">
                <CheckCheck
                  className={`w-3.5 h-3.5 mt-0.5 shrink-0 ${
                    receipt.deliveredPeerIds.length > 0
                      ? 'text-[#54656F] dark:text-[#E9EDEF]'
                      : 'text-[#8696A0]/45'
                  }`}
                  aria-hidden="true"
                />
                <div className="min-w-0 flex-1">
                  <p
                    className={`font-semibold ${
                      receipt.deliveredPeerIds.length > 0
                        ? ''
                        : 'text-[#8696A0] dark:text-[#667781]'
                    }`}
                  >
                    مستلمة ({receipt.deliveredPeerIds.length})
                  </p>
                  <p className="text-[#667781] dark:text-[#8696A0] truncate">
                    {receipt.deliveredPeerIds.length > 0
                      ? receipt.deliveredPeerIds.map(resolvePeerName).join('، ')
                      : 'لم تصل إلى جهاز الطرف الآخر بعد'}
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-2">
                <CheckCheck
                  className={`w-3.5 h-3.5 mt-0.5 shrink-0 ${
                    receipt.readPeerIds.length > 0
                      ? 'text-[#0284C7] dark:text-[#53BDEB]'
                      : 'text-[#8696A0]/45'
                  }`}
                  aria-hidden="true"
                />
                <div className="min-w-0 flex-1">
                  <p
                    className={`font-semibold ${
                      receipt.readPeerIds.length > 0
                        ? 'text-[#0284C7] dark:text-[#53BDEB]'
                        : 'text-[#8696A0] dark:text-[#667781]'
                    }`}
                  >
                    مقروءة ({receipt.readPeerIds.length})
                  </p>
                  <p className="text-[#667781] dark:text-[#8696A0] truncate">
                    {receipt.readPeerIds.length > 0
                      ? receipt.readPeerIds.map(resolvePeerName).join('، ')
                      : 'في انتظار القراءة'}
                  </p>
                </div>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Delete Chat Confirmation Modal */}
      {showDeleteChatConfirm && onDeleteChat && (
        <div
          data-chat-floating="true"
          role="dialog"
          aria-modal="true"
          aria-label="تأكيد حذف المحادثة"
          className="fixed inset-0 z-50 bg-black/55 backdrop-blur-xs flex items-center justify-center p-4"
        >
          <div className="w-full max-w-sm bg-white dark:bg-[#202C33] rounded-2xl p-6 shadow-2xl border border-[#E9EDEF] dark:border-[#374248] space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-11 h-11 rounded-full bg-rose-100 dark:bg-rose-950/50 text-rose-600 dark:text-rose-400 flex items-center justify-center shrink-0">
                <Trash2 className="w-5 h-5" aria-hidden="true" />
              </div>
              <div className="min-w-0">
                <h3 className="font-display text-base font-bold text-[#111B21] dark:text-[#E9EDEF]">
                  حذف المحادثة نهائياً
                </h3>
                <p className="text-xs text-[#54656F] dark:text-[#8696A0] truncate">
                  {chat.title}
                </p>
              </div>
            </div>
            <p className="text-xs text-[#54656F] dark:text-[#AEBAC1] leading-relaxed">
              هل أنت متأكد من حذف هذه المحادثة؟ سيتم إزالتها من قائمة محادثاتك مع إمكانية بدء محادثة جديدة مع نفس جهة الاتصال لاحقاً.
            </p>
            <div className="flex items-center justify-end gap-2 pt-1">
              <button
                type="button"
                disabled={isDeletingChat}
                onClick={() => setShowDeleteChatConfirm(false)}
                className="px-4 py-2 rounded-xl text-xs font-semibold text-[#54656F] dark:text-[#AEBAC1] hover:bg-black/5 dark:hover:bg-white/5 cursor-pointer"
              >
                إلغاء
              </button>
              <button
                type="button"
                disabled={isDeletingChat}
                onClick={() => {
                  setIsDeletingChat(true);
                  Promise.resolve(onDeleteChat(chat.id))
                    .catch(() => {})
                    .finally(() => {
                      setIsDeletingChat(false);
                      setShowDeleteChatConfirm(false);
                    });
                }}
                className="px-4 py-2 rounded-xl bg-rose-600 text-white text-xs font-bold hover:bg-rose-700 disabled:opacity-60 flex items-center gap-1.5 cursor-pointer"
              >
                <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
                <span>{isDeletingChat ? 'جاري الحذف...' : 'حذف المحادثة'}</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
