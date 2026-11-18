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
  Download
} from 'lucide-react';
import { Avatar } from './Avatar';
import {
  filterExpiredDisappearingMessages,
  formatCallDuration,
  formatDisappearingLabel,
  formatWhatsAppTime
} from '../lib/chatLogic';
import { FONT_SIZE_OPTIONS } from '../lib/omarConfig';
import type {
  ChatRoom,
  DecryptedMessage,
  MessagePayload,
  MessageType,
  OmarSettings,
  RightPanelMode
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
  onSetDisappearing: (chatId: string, seconds: number) => void;
  onToggleLockChat?: (chatId: string) => void;
  onTypingChange?: (isTyping: boolean) => void;
  isLocked?: boolean;
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

const EMOJI_PALETTE = ['❤️', '👍', '😂', '😮', '🙏', '🔥', '🎉', '👏', '💯', '✅', '🔒', '✨'];

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
  onSetDisappearing,
  onToggleLockChat,
  onTypingChange,
  isLocked = false
}: ChatWindowProps) {
  const [text, setText] = useState('');
  const [replyTo, setReplyTo] = useState<DecryptedMessage | null>(null);
  const [editingMsg, setEditingMsg] = useState<DecryptedMessage | null>(null);
  const [forwardMsg, setForwardMsg] = useState<DecryptedMessage | null>(null);
  const [forwardingToId, setForwardingToId] = useState<string | null>(null);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [showTemplatesPicker, setShowTemplatesPicker] = useState(false);
  const [showAttachMenu, setShowAttachMenu] = useState(false);
  const [showMoreMenu, setShowMoreMenu] = useState(false);
  const [activeMsgMenu, setActiveMsgMenu] = useState<string | null>(null);
  const [showPollModal, setShowPollModal] = useState(false);
  const [pollQuestion, setPollQuestion] = useState('');
  const [pollOptions, setPollOptions] = useState(['', '', '']);
  const [isRecording, setIsRecording] = useState(false);
  const [recordSeconds, setRecordSeconds] = useState(0);
  const [playingVoiceId, setPlayingVoiceId] = useState<string | null>(null);

  const bottomRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recordChunksRef = useRef<BlobPart[]>([]);
  const recordStreamRef = useRef<MediaStream | null>(null);
  const audioPlayerRef = useRef<HTMLAudioElement | null>(null);
  const recordTimerRef = useRef<number | null>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length, chat?.id]);

  useEffect(() => {
    setReplyTo(null);
    setEditingMsg(null);
    setText('');
    setForwardMsg(null);
    setShowEmojiPicker(false);
    setShowTemplatesPicker(false);
    setShowAttachMenu(false);
    setShowMoreMenu(false);
    setActiveMsgMenu(null);
  }, [chat?.id]);

  useEffect(() => {
    const hasFloatingOpen =
      showEmojiPicker ||
      showTemplatesPicker ||
      showAttachMenu ||
      showMoreMenu ||
      Boolean(activeMsgMenu) ||
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
    };

    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setShowEmojiPicker(false);
        setShowTemplatesPicker(false);
        setShowAttachMenu(false);
        setShowMoreMenu(false);
        setActiveMsgMenu(null);
        setShowPollModal(false);
        setForwardMsg(null);
        if (editingMsg) {
          setEditingMsg(null);
          setText('');
        }
      }
    };

    document.addEventListener('mousedown', handleOutside);
    window.addEventListener('keydown', handleEscape);
    return () => {
      document.removeEventListener('mousedown', handleOutside);
      window.removeEventListener('keydown', handleEscape);
    };
  }, [
    showEmojiPicker,
    showTemplatesPicker,
    showAttachMenu,
    showMoreMenu,
    activeMsgMenu,
    showPollModal,
    forwardMsg,
    editingMsg
  ]);

  if (!chat) {
    return (
      <div className="hidden md:flex flex-1 flex-col items-center justify-center bg-[#F0F2F5] dark:bg-[#222E35] border-b-[6px] border-[var(--wa-accent)] px-8 text-center">
        <div className="w-20 h-20 rounded-full bg-[var(--wa-accent-soft)] flex items-center justify-center text-[var(--wa-accent-strong)] mb-6">
          <Lock className="w-9 h-9" aria-hidden="true" />
        </div>
        <h2 className="font-display text-2xl font-bold text-[#111B21] dark:text-[#E9EDEF]">
          تواصل ويب · محادثات مشفرة بإضافات عمر
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
              replyToText: currentReply.payload.text.slice(0, 120),
              replyToSender: currentReply.senderId === myUid ? 'أنت' : currentReply.senderName
            }
          : {})
      },
      currentReply?.id
    );
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
    const file = e.target.files?.[0];
    e.target.value = '';
    setShowAttachMenu(false);
    if (!file) return;
    try {
      const compressedUrl = await compressChatImageToDataUrl(file);
      await onSendMessage('image', {
        text: file.name,
        mediaUrl: compressedUrl
      });
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

  return (
    <section aria-label={`محادثة ${chat.title}`} className="flex-1 flex flex-col h-full w-full max-w-full min-w-0 overflow-hidden relative">
      {/* Chat Header */}
      <header className="h-16 px-2.5 sm:px-3 md:px-4 shrink-0 bg-[#F0F2F5] dark:bg-[#202C33] border-b border-[#E9EDEF] dark:border-[#222D34] flex items-center justify-between gap-1.5 sm:gap-2 z-20 min-w-0 max-w-full">
        <div className="flex items-center gap-1.5 sm:gap-2.5 flex-1 min-w-0">
          <button
            type="button"
            aria-label="العودة إلى قائمة الدردشات"
            onClick={onBackMobile}
            className="md:hidden w-9 h-9 sm:w-10 sm:h-10 rounded-full flex items-center justify-center shrink-0 text-[#54656F] dark:text-[#AEBAC1] hover:bg-black/5 dark:hover:bg-white/5 cursor-pointer"
          >
            <ArrowRight className="w-5 h-5" aria-hidden="true" />
          </button>

          <button
            type="button"
            onClick={() => onOpenRightPanel('info')}
            className="flex items-center gap-2.5 sm:gap-3 flex-1 min-w-0 text-right hover:opacity-90 transition-opacity cursor-pointer"
          >
            <Avatar
              src={chat.avatarUrl}
              name={chat.title}
              size="md"
              isOnline={chat.isOnline}
              isGroup={chat.type !== 'direct'}
            />
            <div className="min-w-0">
              <div className="flex items-center gap-1.5">
                <h2 className="font-display text-base font-bold text-[#111B21] dark:text-[#E9EDEF] truncate">
                  {chat.title}
                </h2>
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
              <p className="text-xs text-[#54656F] dark:text-[#8696A0] truncate">
                {chat.isTyping && !omarSettings.hideTypingIndicator
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
              </p>
            </div>
          </button>
        </div>

        <div className="flex items-center gap-1 shrink-0 relative">
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
            title="مكالمة مرئية"
            onClick={() => onStartCall('video')}
            className="w-10 h-10 rounded-full flex items-center justify-center text-[#54656F] dark:text-[#AEBAC1] hover:bg-black/5 dark:hover:bg-white/10 transition-colors cursor-pointer"
          >
            <Video className="w-5 h-5" aria-hidden="true" />
          </button>

          <button
            type="button"
            aria-label="بدء مكالمة صوتية"
            title="مكالمة صوتية"
            onClick={() => onStartCall('audio')}
            className="w-10 h-10 rounded-full flex items-center justify-center text-[#54656F] dark:text-[#AEBAC1] hover:bg-black/5 dark:hover:bg-white/10 transition-colors cursor-pointer"
          >
            <Phone className="w-5 h-5" aria-hidden="true" />
          </button>

          <button
            type="button"
            aria-label="البحث في الرسائل"
            title="بحث في الدردشة"
            onClick={() => onOpenRightPanel('search')}
            className="hidden sm:flex w-10 h-10 rounded-full items-center justify-center text-[#54656F] dark:text-[#AEBAC1] hover:bg-black/5 dark:hover:bg-white/10 transition-colors cursor-pointer"
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
                className="absolute left-0 top-12 z-30 w-56 rounded-xl bg-white dark:bg-[#233138] shadow-xl border border-[#E9EDEF] dark:border-[#374248] py-1.5 text-sm"
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
                  onOpenRightPanel('search');
                  setShowMoreMenu(false);
                }}
                className="sm:hidden w-full px-4 py-2.5 text-right hover:bg-[#F5F6F6] dark:hover:bg-[#182229] text-[#111B21] dark:text-[#E9EDEF] cursor-pointer"
              >
                البحث في الرسائل
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
              </div>
            )}
          </div>
        </div>
      </header>

      {/* Messages Canvas */}
      <div className={`flex-1 min-w-0 overflow-y-auto overflow-x-hidden wa-wallpaper-${omarSettings.wallpaper} px-3 sm:px-4 md:px-10 py-4 space-y-2.5`}>
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

        {filterExpiredDisappearingMessages(messages, chat.disappearingSeconds).map((msg) => {
          const isMine = msg.senderId === myUid;
          const isStarred = msg.starredBy.includes(myUid);
          const totalPollVotes =
            msg.payload.pollOptions?.reduce((sum, o) => sum + o.voterIds.length, 0) || 0;
          const reactionEntries = Object.entries(msg.reactions).filter(([, users]) => users.length > 0);
          const showPreservedDeleted = msg.isDeleted && omarSettings.antiDeleteMessages && Boolean(msg.payload.text);

          return (
            <div
              key={msg.id}
              className={`flex flex-col ${isMine ? 'items-start' : 'items-end'}`}
            >
              <div
                className={`group relative max-w-[88%] sm:max-w-[70%] md:max-w-[62%] px-3 py-2 shadow-xs ${getBubbleRadiusClass(
                  isMine
                )} ${
                  isMine
                    ? 'bg-[var(--wa-outgoing-bg)] text-[#111B21] dark:text-[#E9EDEF]'
                    : 'bg-white dark:bg-[#202C33] text-[#111B21] dark:text-[#E9EDEF]'
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
                ) : msg.type === 'image' && msg.payload.mediaUrl ? (
                  <div className="space-y-1.5">
                    <img
                      src={msg.payload.mediaUrl}
                      alt={msg.payload.text || 'صورة مرفقة'}
                      referrerPolicy="no-referrer"
                      className="rounded-lg max-h-72 w-full object-cover bg-black/10"
                    />
                    {msg.payload.text && (
                      <p className={`${fontSizeClass} leading-relaxed whitespace-pre-wrap`}>{msg.payload.text}</p>
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
                      <p className="text-sm font-medium truncate">{msg.payload.fileName || msg.payload.text}</p>
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
                    <p className="text-sm font-bold">{msg.payload.pollQuestion}</p>
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
                                <span>{opt.text}</span>
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
                ) : (
                  <p className={`${fontSizeClass} leading-relaxed whitespace-pre-wrap break-words`}>
                    {msg.payload.text}
                  </p>
                )}

                {/* Timestamp, Edited badge, Star & Ticks */}
                <div className="mt-1 flex items-center justify-end gap-1.5 text-[11px] text-[#667781] dark:text-[#AEBAC1] font-mono-code">
                  {msg.payload.edited && !msg.isDeleted && (
                    <span className="text-[10px] font-sans font-medium opacity-80">
                      تم التعديل
                    </span>
                  )}
                  {isStarred && <Star className="w-3 h-3 fill-amber-400 text-amber-400" aria-label="مميزة بنجمة" />}
                  <span>{formatWhatsAppTime(msg.createdAtMs)}</span>
                  {isMine && !msg.isDeleted && (
                    <span
                      title={
                        msg.status === 'read'
                          ? 'تم الاستلام والمشاهدة'
                          : msg.status === 'delivered'
                            ? 'تم الاستلام على جهاز الطرف الآخر'
                            : msg.status === 'sent'
                              ? 'تم الإرسال — لم تُستلم بعد'
                              : msg.status === 'sending'
                                ? 'جاري الإرسال...'
                                : 'تعذر الإرسال'
                      }
                    >
                      {msg.status === 'sending' ? (
                        <Clock className="w-3.5 h-3.5 opacity-70 animate-pulse" aria-label="جاري الإرسال" />
                      ) : msg.status === 'failed' ? (
                        <button
                          type="button"
                          onClick={() => onRetryMessage && void onRetryMessage(msg)}
                          className="inline-flex items-center gap-1 text-red-600 dark:text-red-400 font-sans font-bold hover:underline cursor-pointer"
                        >
                          <RotateCcw className="w-3 h-3" aria-hidden="true" />
                          <span>إعادة</span>
                        </button>
                      ) : msg.status === 'read' ? (
                        <CheckCheck className="w-3.5 h-3.5 text-[#53BDEB]" aria-label="تمت القراءة والمشاهدة" />
                      ) : msg.status === 'delivered' ? (
                        <CheckCheck className="w-3.5 h-3.5 text-[#8696A0]" aria-label="تم الاستلام" />
                      ) : (
                        <Check className="w-3.5 h-3.5 text-[#8696A0]" aria-label="تم الإرسال (لم تُستلم بعد)" />
                      )}
                    </span>
                  )}
                </div>

                {/* Hover / Touch Quick Action Trigger */}
                {!msg.isDeleted && (
                  <div data-chat-floating="true" className="contents">
                    <button
                      type="button"
                      aria-label="خيارات الرسالة"
                      onClick={() => {
                        setActiveMsgMenu((curr) => (curr === msg.id ? null : msg.id));
                        setShowMoreMenu(false);
                        setShowEmojiPicker(false);
                        setShowAttachMenu(false);
                        setShowTemplatesPicker(false);
                      }}
                      className="opacity-75 md:opacity-0 md:group-hover:opacity-100 focus:opacity-100 absolute top-1.5 left-1.5 w-6 h-6 rounded-full bg-white/90 dark:bg-[#233138] shadow-xs flex items-center justify-center text-[#54656F] dark:text-[#AEBAC1] transition-opacity cursor-pointer"
                    >
                      <MoreVertical className="w-3.5 h-3.5" aria-hidden="true" />
                    </button>

                    {/* Per-Message Action Menu */}
                    {activeMsgMenu === msg.id && (
                      <div
                        role="menu"
                        className="absolute top-8 left-2 z-30 w-52 rounded-xl bg-white dark:bg-[#233138] shadow-xl border border-[#E9EDEF] dark:border-[#374248] py-1.5 text-xs"
                      >
                    {/* Quick emoji reaction strip */}
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
                      onClick={() => {
                        setReplyTo(msg);
                        setActiveMsgMenu(null);
                      }}
                      className="w-full px-3.5 py-2 text-right flex items-center gap-2 hover:bg-[#F5F6F6] dark:hover:bg-[#182229] cursor-pointer"
                    >
                      <Reply className="w-3.5 h-3.5" aria-hidden="true" />
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
                      <Forward className="w-3.5 h-3.5" aria-hidden="true" />
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
                      <Star className="w-3.5 h-3.5" aria-hidden="true" />
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
                      <Copy className="w-3.5 h-3.5" aria-hidden="true" />
                      <span>نسخ النص</span>
                    </button>
                    <button
                      type="button"
                      role="menuitem"
                      onClick={() => {
                        onOpenRightPanel('encryption', msg.id);
                        setActiveMsgMenu(null);
                      }}
                      className="w-full px-3.5 py-2 text-right flex items-center gap-2 hover:bg-[#F5F6F6] dark:hover:bg-[#182229] text-[var(--wa-accent-strong)] cursor-pointer"
                    >
                      <Lock className="w-3.5 h-3.5" aria-hidden="true" />
                      <span>معاينة النص المشفر</span>
                    </button>
                    {isMine && !msg.isDeleted && (msg.type === 'text' || msg.type === 'image') && onEditMessage && (
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
                        <Pencil className="w-3.5 h-3.5" aria-hidden="true" />
                        <span>تعديل الرسالة</span>
                      </button>
                    )}
                    {isMine && (
                      <button
                        type="button"
                        role="menuitem"
                        onClick={() => {
                          onDeleteMessage(msg.id);
                          setActiveMsgMenu(null);
                        }}
                        className="w-full px-3.5 py-2 text-right flex items-center gap-2 hover:bg-red-50 dark:hover:bg-red-950/40 text-red-600 dark:text-red-400 cursor-pointer"
                      >
                        <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
                        <span>حذف للجميع</span>
                      </button>
                    )}
                      </div>
                    )}
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

      {/* Reply / Edit Preview Strip */}
      {(replyTo || editingMsg) && (
        <div className="px-4 py-2 bg-[#F0F2F5] dark:bg-[#202C33] border-t border-[#E9EDEF] dark:border-[#222D34] flex items-center justify-between gap-3">
          <div className="flex-1 min-w-0 bg-white dark:bg-[#111B21] rounded-lg px-3 py-2 border-r-4 border-[var(--wa-accent)]">
            <p className="text-xs font-semibold text-[var(--wa-accent-strong)]">
              {editingMsg
                ? 'تعديل الرسالة'
                : `الرد على ${replyTo!.senderId === myUid ? 'نفسك' : replyTo!.senderName}`}
            </p>
            <p className="text-xs text-[#54656F] dark:text-[#8696A0] truncate">
              {editingMsg ? editingMsg.payload.text : replyTo!.payload.text}
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
            className="w-8 h-8 rounded-full flex items-center justify-center text-[#54656F] hover:bg-black/5 cursor-pointer"
          >
            <X className="w-4 h-4" aria-hidden="true" />
          </button>
        </div>
      )}

      {/* Composer Bar */}
      <footer
        data-chat-floating="true"
        className="px-2.5 sm:px-3 py-2.5 pb-safe bg-[#F0F2F5] dark:bg-[#202C33] border-t border-[#E9EDEF] dark:border-[#222D34] relative shrink-0"
      >
        {chat.type === 'community' && chat.adminOnlyPost && chat.id.startsWith('channel_') ? (
          <div className="py-2 px-3 rounded-xl bg-white/80 dark:bg-[#111B21]/70 text-center text-xs text-[#54656F] dark:text-[#AEBAC1] flex items-center justify-center gap-2">
            <Lock className="w-3.5 h-3.5 text-[var(--wa-accent)] shrink-0" aria-hidden="true" />
            <span>
              هذه القناة مخصصة لبث المشرفين فقط — يمكنك التفاعل بالرموز التعبيرية على الرسائل أعلاه.
            </span>
          </div>
        ) : (
          <>
        {showEmojiPicker && (
          <div className="absolute bottom-16 right-4 z-30 p-3 rounded-2xl bg-white dark:bg-[#233138] shadow-xl border border-[#E9EDEF] dark:border-[#374248] grid grid-cols-6 gap-1.5">
            {EMOJI_PALETTE.map((emoji) => (
              <button
                key={emoji}
                type="button"
                onClick={() => setText((t) => `${t}${emoji}`)}
                className="w-9 h-9 rounded-lg hover:bg-[#F0F2F5] dark:hover:bg-[#182229] text-lg flex items-center justify-center cursor-pointer"
              >
                {emoji}
              </button>
            ))}
          </div>
        )}

        {showTemplatesPicker && (
          <div className="absolute bottom-16 right-4 left-4 sm:left-auto sm:w-80 z-30 p-2.5 rounded-2xl bg-white dark:bg-[#233138] shadow-xl border border-[#E9EDEF] dark:border-[#374248] space-y-1.5">
            <div className="px-2 py-1 flex items-center justify-between border-b border-[#E9EDEF] dark:border-[#374248]">
              <span className="text-xs font-bold text-[var(--wa-accent-strong)] flex items-center gap-1.5">
                <Zap className="w-3.5 h-3.5" aria-hidden="true" />
                <span>قوالب عمر السريعة</span>
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
          </div>
        )}

        <input
          ref={imageInputRef}
          type="file"
          accept="image/*"
          onChange={handleImagePick}
          className="hidden"
        />
        <input
          ref={fileInputRef}
          type="file"
          onChange={handleFilePick}
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
              aria-label="الرموز التعبيرية"
              onClick={() => {
                setShowEmojiPicker((v) => !v);
                setShowAttachMenu(false);
                setShowTemplatesPicker(false);
                setShowMoreMenu(false);
                setActiveMsgMenu(null);
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
                  if (e.key === 'Escape' && editingMsg) {
                    e.preventDefault();
                    setEditingMsg(null);
                    setText('');
                    onTypingChange?.(false);
                    return;
                  }
                  if (e.key === 'Enter' && !e.shiftKey) {
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
                aria-label={editingMsg ? 'حفظ التعديل' : 'إرسال الرسالة'}
                title={editingMsg ? 'حفظ التعديل' : 'إرسال الرسالة'}
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
    </section>
  );
}
