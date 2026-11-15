import { useEffect, useRef, useState } from 'react';
import {
  Phone,
  Video,
  Search,
  MoreVertical,
  Lock,
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
  Timer
} from 'lucide-react';
import { Avatar } from './Avatar';
import { formatCallDuration, formatDisappearingLabel, formatWhatsAppTime } from '../lib/chatLogic';
import type {
  ChatRoom,
  DecryptedMessage,
  MessagePayload,
  MessageType,
  RightPanelMode
} from '../types/chat';

interface ChatWindowProps {
  chat: ChatRoom | null;
  messages: DecryptedMessage[];
  myUid: string;
  onBackMobile: () => void;
  onSendMessage: (type: MessageType, payload: MessagePayload, replyToId?: string) => Promise<void>;
  onVotePoll: (messageId: string, optionId: string) => void;
  onReactMessage: (messageId: string, emoji: string) => void;
  onToggleStarMessage: (messageId: string) => void;
  onDeleteMessage: (messageId: string) => void;
  onStartCall: (callType: 'audio' | 'video') => void;
  onOpenRightPanel: (mode: RightPanelMode, inspectMessageId?: string) => void;
  onClearChat: (chatId: string) => void;
  onSetDisappearing: (chatId: string, seconds: number) => void;
}

const EMOJI_PALETTE = ['❤️', '👍', '😂', '😮', '🙏', '🔥', '🎉', '👏', '💯', '✅', '🔒', '✨'];

export function ChatWindow({
  chat,
  messages,
  myUid,
  onBackMobile,
  onSendMessage,
  onVotePoll,
  onReactMessage,
  onToggleStarMessage,
  onDeleteMessage,
  onStartCall,
  onOpenRightPanel,
  onClearChat,
  onSetDisappearing
}: ChatWindowProps) {
  const [text, setText] = useState('');
  const [replyTo, setReplyTo] = useState<DecryptedMessage | null>(null);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
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
  const imageInputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recordTimerRef = useRef<number | null>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length, chat?.id]);

  useEffect(() => {
    setReplyTo(null);
    setShowEmojiPicker(false);
    setShowAttachMenu(false);
    setShowMoreMenu(false);
    setActiveMsgMenu(null);
  }, [chat?.id]);

  if (!chat) {
    return (
      <div className="hidden md:flex flex-1 flex-col items-center justify-center bg-[#F0F2F5] dark:bg-[#222E35] border-b-[6px] border-[#00A884] px-8 text-center">
        <div className="w-20 h-20 rounded-full bg-[#00A884]/15 flex items-center justify-center text-[#00A884] mb-6">
          <Lock className="w-9 h-9" aria-hidden="true" />
        </div>
        <h2 className="font-display text-2xl font-bold text-[#111B21] dark:text-[#E9EDEF]">
          تواصل ويب · محادثات مشفرة بالكامل
        </h2>
        <p className="mt-3 text-sm text-[#54656F] dark:text-[#8696A0] max-w-md leading-relaxed">
          اختر محادثة من القائمة الجانبية لبدء المراسلة الفورية أو إجراء مكالمة صوتية ومرئية مشفرة بتقنية AES-GCM-256 ومزامنة سحابية لحظية.
        </p>
        <div className="mt-8 flex items-center gap-2 text-xs text-[#667781] dark:text-[#8696A0]">
          <ShieldCheck className="w-4 h-4 text-[#00A884]" aria-hidden="true" />
          <span>مشفرة تماماً بين الطرفين · End-to-End Encrypted</span>
        </div>
      </div>
    );
  }

  const handleSendText = async () => {
    const trimmed = text.trim();
    if (!trimmed) return;
    setText('');
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
    recordTimerRef.current = window.setInterval(() => {
      setRecordSeconds((s) => s + 1);
    }, 1000);

    try {
      if (navigator.mediaDevices?.getUserMedia) {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        const recorder = new MediaRecorder(stream);
        mediaRecorderRef.current = recorder;
        recorder.onstop = () => {
          stream.getTracks().forEach((t) => t.stop());
        };
        recorder.start();
      }
    } catch {
      // Headless or mic-denied environment: timer still captures simulated voice note smoothly
    }
  };

  const handleStopAndSendRecording = async () => {
    if (recordTimerRef.current) {
      window.clearInterval(recordTimerRef.current);
      recordTimerRef.current = null;
    }
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
    }
    const dur = Math.max(2, recordSeconds);
    setIsRecording(false);
    setRecordSeconds(0);
    await onSendMessage('voice', {
      text: `رسالة صوتية (${formatCallDuration(dur)})`,
      voiceDurationSec: dur,
      voiceWaveform: [30, 55, 70, 40, 90, 65, 50, 80, 95, 60, 45, 75, 85, 40, 60, 35, 50, 70, 45, 30]
    });
  };

  const handleCancelRecording = () => {
    if (recordTimerRef.current) {
      window.clearInterval(recordTimerRef.current);
      recordTimerRef.current = null;
    }
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
    }
    setIsRecording(false);
    setRecordSeconds(0);
  };

  const handleImagePick = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        void onSendMessage('image', {
          text: file.name,
          mediaUrl: reader.result
        });
      }
    };
    reader.readAsDataURL(file);
    e.target.value = '';
    setShowAttachMenu(false);
  };

  const handleFilePick = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const sizeKb = Math.max(1, Math.round(file.size / 1024));
    const sizeLabel = sizeKb > 1024 ? `${(sizeKb / 1024).toFixed(1)} MB` : `${sizeKb} KB`;
    void onSendMessage('file', {
      text: `مستند: ${file.name}`,
      fileName: file.name,
      fileSizeLabel: sizeLabel
    });
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

  const togglePlayVoice = (msgId: string, durationSec: number) => {
    if (playingVoiceId === msgId) {
      setPlayingVoiceId(null);
      return;
    }
    setPlayingVoiceId(msgId);
    // Subtle Web Audio confirmation tone for tactile audio feedback
    try {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
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

  return (
    <section aria-label={`محادثة ${chat.title}`} className="flex-1 flex flex-col h-full min-w-0 relative">
      {/* Chat Header */}
      <header className="h-16 px-3 md:px-4 shrink-0 bg-[#F0F2F5] dark:bg-[#202C33] border-b border-[#E9EDEF] dark:border-[#222D34] flex items-center justify-between gap-2 z-20">
        <div className="flex items-center gap-2.5 min-w-0">
          <button
            type="button"
            aria-label="العودة إلى قائمة الدردشات"
            onClick={onBackMobile}
            className="md:hidden w-10 h-10 rounded-full flex items-center justify-center text-[#54656F] dark:text-[#AEBAC1] hover:bg-black/5 dark:hover:bg-white/5 cursor-pointer"
          >
            <ArrowRight className="w-5 h-5" aria-hidden="true" />
          </button>

          <button
            type="button"
            onClick={() => onOpenRightPanel('info')}
            className="flex items-center gap-3 min-w-0 text-right hover:opacity-90 transition-opacity cursor-pointer"
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
                {chat.disappearingSeconds > 0 && (
                  <Timer
                    className="w-3.5 h-3.5 text-[#00A884] shrink-0"
                    aria-label={`الرسائل ذاتية الاختفاء: ${formatDisappearingLabel(chat.disappearingSeconds)}`}
                  />
                )}
              </div>
              <p className="text-xs text-[#54656F] dark:text-[#8696A0] truncate">
                {chat.isTyping
                  ? 'يكتب الآن...'
                  : chat.type !== 'direct'
                    ? `${chat.memberIds.length} أعضاء · مشفرة تماماً`
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
            className="hidden sm:flex items-center gap-1.5 px-2.5 h-9 rounded-full bg-[#D9FDD3]/70 dark:bg-[#0A332C] text-[#008069] dark:text-[#06CF9C] text-xs font-medium hover:brightness-95 transition-all whitespace-nowrap cursor-pointer"
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

          <button
            type="button"
            aria-label="خيارات المحادثة"
            aria-expanded={showMoreMenu}
            onClick={() => setShowMoreMenu((v) => !v)}
            className="w-9 h-9 sm:w-10 sm:h-10 rounded-full flex items-center justify-center text-[#54656F] dark:text-[#AEBAC1] hover:bg-black/5 dark:hover:bg-white/10 transition-colors cursor-pointer"
          >
            <MoreVertical className="w-5 h-5" aria-hidden="true" />
          </button>

          {showMoreMenu && (
            <div
              role="menu"
              className="absolute left-0 top-12 z-30 w-52 rounded-xl bg-white dark:bg-[#233138] shadow-xl border border-[#E9EDEF] dark:border-[#374248] py-1.5 text-sm"
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
      </header>

      {/* Messages Canvas */}
      <div className="flex-1 overflow-y-auto wa-chat-pattern px-4 md:px-10 py-4 space-y-2.5">
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

        {messages.map((msg) => {
          const isMine = msg.senderId === myUid;
          const isStarred = msg.starredBy.includes(myUid);
          const totalPollVotes =
            msg.payload.pollOptions?.reduce((sum, o) => sum + o.voterIds.length, 0) || 0;
          const reactionEntries = Object.entries(msg.reactions).filter(([, users]) => users.length > 0);

          return (
            <div
              key={msg.id}
              className={`flex flex-col ${isMine ? 'items-start' : 'items-end'}`}
            >
              <div
                className={`group relative max-w-[85%] sm:max-w-[70%] md:max-w-[62%] rounded-xl px-3 py-2 shadow-xs ${
                  isMine
                    ? 'bg-[#D9FDD3] dark:bg-[#005C4B] text-[#111B21] dark:text-[#E9EDEF] rounded-tr-xs'
                    : 'bg-white dark:bg-[#202C33] text-[#111B21] dark:text-[#E9EDEF] rounded-tl-xs'
                }`}
              >
                {/* Group sender name */}
                {!isMine && chat.type !== 'direct' && (
                  <p className="text-xs font-semibold text-[#008069] dark:text-[#06CF9C] mb-1">
                    {msg.senderName}
                  </p>
                )}

                {/* Reply Quote */}
                {msg.payload.replyToText && (
                  <div className="mb-1.5 rounded-lg bg-black/5 dark:bg-black/25 px-2.5 py-1.5 text-xs border-r-[3px] border-[#00A884]">
                    <p className="font-semibold text-[#008069] dark:text-[#06CF9C]">
                      {msg.payload.replyToSender || 'رسالة'}
                    </p>
                    <p className="text-[#54656F] dark:text-[#AEBAC1] line-clamp-1">
                      {msg.payload.replyToText}
                    </p>
                  </div>
                )}

                {/* Message Content by Type */}
                {msg.isDeleted ? (
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
                      <p className="text-sm leading-relaxed whitespace-pre-wrap">{msg.payload.text}</p>
                    )}
                  </div>
                ) : msg.type === 'voice' ? (
                  <div className="flex items-center gap-3 min-w-[220px] py-1">
                    <button
                      type="button"
                      aria-label={playingVoiceId === msg.id ? 'إيقاف الرسالة الصوتية' : 'تشغيل الرسالة الصوتية'}
                      onClick={() => togglePlayVoice(msg.id, msg.payload.voiceDurationSec || 10)}
                      className="w-9 h-9 rounded-full bg-[#00A884] text-white flex items-center justify-center shrink-0 hover:bg-[#008069] transition-colors cursor-pointer"
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
                                  ? 'bg-[#00A884] dark:bg-[#06CF9C]'
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
                    <div className="w-10 h-10 rounded-lg bg-[#00A884]/15 text-[#008069] dark:text-[#06CF9C] flex items-center justify-center shrink-0">
                      <FileText className="w-5 h-5" aria-hidden="true" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium truncate">{msg.payload.fileName || msg.payload.text}</p>
                      <p className="text-[11px] text-[#54656F] dark:text-[#AEBAC1] font-mono-code">
                        {msg.payload.fileSizeLabel || 'PDF'} · مشفر
                      </p>
                    </div>
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
                                      ? 'bg-[#00A884] border-[#00A884] text-white'
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
                                className="h-full bg-[#00A884] rounded-full transition-all duration-300"
                              />
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ) : (
                  <p className="text-[14.5px] leading-relaxed whitespace-pre-wrap break-words">
                    {msg.payload.text}
                  </p>
                )}

                {/* Timestamp, Star & Ticks */}
                <div className="mt-1 flex items-center justify-end gap-1.5 text-[11px] text-[#667781] dark:text-[#AEBAC1] font-mono-code">
                  {isStarred && <Star className="w-3 h-3 fill-amber-400 text-amber-400" aria-label="مميزة بنجمة" />}
                  <span>{formatWhatsAppTime(msg.createdAtMs)}</span>
                  {isMine && !msg.isDeleted && (
                    <span>
                      {msg.status === 'read' ? (
                        <CheckCheck className="w-3.5 h-3.5 text-[#53BDEB]" aria-label="تمت القراءة" />
                      ) : msg.status === 'delivered' ? (
                        <CheckCheck className="w-3.5 h-3.5" aria-label="تم الاستلام" />
                      ) : (
                        <Check className="w-3.5 h-3.5" aria-label="تم الإرسال" />
                      )}
                    </span>
                  )}
                </div>

                {/* Hover Quick Action Trigger */}
                {!msg.isDeleted && (
                  <button
                    type="button"
                    aria-label="خيارات الرسالة"
                    onClick={() => setActiveMsgMenu(activeMsgMenu === msg.id ? null : msg.id)}
                    className="opacity-0 group-hover:opacity-100 focus:opacity-100 absolute top-1.5 left-1.5 w-6 h-6 rounded-full bg-white/90 dark:bg-[#233138] shadow-xs flex items-center justify-center text-[#54656F] dark:text-[#AEBAC1] transition-opacity cursor-pointer"
                  >
                    <MoreVertical className="w-3.5 h-3.5" aria-hidden="true" />
                  </button>
                )}

                {/* Per-Message Action Menu */}
                {activeMsgMenu === msg.id && (
                  <div
                    role="menu"
                    className="absolute top-8 left-2 z-30 w-48 rounded-xl bg-white dark:bg-[#233138] shadow-xl border border-[#E9EDEF] dark:border-[#374248] py-1.5 text-xs"
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
                      className="w-full px-3.5 py-2 text-right flex items-center gap-2 hover:bg-[#F5F6F6] dark:hover:bg-[#182229] text-[#008069] dark:text-[#06CF9C] cursor-pointer"
                    >
                      <Lock className="w-3.5 h-3.5" aria-hidden="true" />
                      <span>معاينة النص المشفر</span>
                    </button>
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

      {/* Reply Preview Strip */}
      {replyTo && (
        <div className="px-4 py-2 bg-[#F0F2F5] dark:bg-[#202C33] border-t border-[#E9EDEF] dark:border-[#222D34] flex items-center justify-between gap-3">
          <div className="flex-1 min-w-0 bg-white dark:bg-[#111B21] rounded-lg px-3 py-2 border-r-4 border-[#00A884]">
            <p className="text-xs font-semibold text-[#008069] dark:text-[#06CF9C]">
              الرد على {replyTo.senderId === myUid ? 'نفسك' : replyTo.senderName}
            </p>
            <p className="text-xs text-[#54656F] dark:text-[#8696A0] truncate">
              {replyTo.payload.text}
            </p>
          </div>
          <button
            type="button"
            aria-label="إلغاء الرد"
            onClick={() => setReplyTo(null)}
            className="w-8 h-8 rounded-full flex items-center justify-center text-[#54656F] hover:bg-black/5 cursor-pointer"
          >
            <X className="w-4 h-4" aria-hidden="true" />
          </button>
        </div>
      )}

      {/* Composer Bar */}
      <footer className="px-3 py-2.5 bg-[#F0F2F5] dark:bg-[#202C33] border-t border-[#E9EDEF] dark:border-[#222D34] relative shrink-0">
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
              <BarChart3 className="w-4 h-4 text-[#00A884]" aria-hidden="true" />
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
                className="w-9 h-9 rounded-full bg-[#00A884] text-white flex items-center justify-center hover:bg-[#008069] cursor-pointer"
              >
                <Square className="w-3.5 h-3.5 fill-current" aria-hidden="true" />
              </button>
            </div>
          </div>
        ) : (
          <div className="flex items-end gap-2">
            <button
              type="button"
              aria-label="الرموز التعبيرية"
              onClick={() => {
                setShowEmojiPicker((v) => !v);
                setShowAttachMenu(false);
              }}
              className="w-10 h-10 rounded-full flex items-center justify-center text-[#54656F] dark:text-[#AEBAC1] hover:bg-black/5 dark:hover:bg-white/10 shrink-0 cursor-pointer"
            >
              <Smile className="w-5 h-5" aria-hidden="true" />
            </button>

            <button
              type="button"
              aria-label="إرفاق ملف أو صورة أو استطلاع"
              onClick={() => {
                setShowAttachMenu((v) => !v);
                setShowEmojiPicker(false);
              }}
              className="w-10 h-10 rounded-full flex items-center justify-center text-[#54656F] dark:text-[#AEBAC1] hover:bg-black/5 dark:hover:bg-white/10 shrink-0 cursor-pointer"
            >
              <Plus className="w-5 h-5" aria-hidden="true" />
            </button>

            <div className="flex-1 bg-white dark:bg-[#2A3942] rounded-xl px-3.5 py-2 flex items-center">
              <textarea
                rows={1}
                value={text}
                onChange={(e) => setText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    void handleSendText();
                  }
                }}
                placeholder="اكتب رسالة مشفرة..."
                aria-label="اكتب رسالة"
                className="w-full bg-transparent text-sm text-[#111B21] dark:text-[#E9EDEF] placeholder:text-[#667781] dark:placeholder:text-[#8696A0] resize-none focus:outline-none max-h-28 leading-6"
              />
            </div>

            {text.trim() ? (
              <button
                type="button"
                aria-label="إرسال الرسالة"
                onClick={() => void handleSendText()}
                className="w-10 h-10 rounded-full bg-[#00A884] text-white flex items-center justify-center hover:bg-[#008069] transition-colors shrink-0 cursor-pointer"
              >
                <SendHorizontal className="w-5 h-5 rotate-180" aria-hidden="true" />
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
                className="w-full rounded-lg bg-[#F0F2F5] dark:bg-[#2A3942] px-3 py-2 text-sm text-[#111B21] dark:text-[#E9EDEF] focus:outline-none focus:ring-2 focus:ring-[#00A884]"
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
                  className="w-full rounded-lg bg-[#F0F2F5] dark:bg-[#2A3942] px-3 py-2 text-sm text-[#111B21] dark:text-[#E9EDEF] focus:outline-none focus:ring-2 focus:ring-[#00A884]"
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
                className="px-5 py-2 rounded-lg bg-[#00A884] text-white text-xs font-semibold hover:bg-[#008069] cursor-pointer"
              >
                إرسال الاستطلاع
              </button>
            </div>
          </form>
        </div>
      )}
    </section>
  );
}
