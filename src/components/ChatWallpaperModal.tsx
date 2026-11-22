import { useEffect, useRef, useState } from 'react';
import {
  Check,
  Film,
  ImagePlus,
  Palette,
  RotateCcw,
  Sparkles,
  Upload,
  Volume2,
  VolumeX,
  X
} from 'lucide-react';
import { FONT_SIZE_OPTIONS, WALLPAPERS } from '../lib/omarConfig';
import {
  compressWallpaperImageFile,
  CURATED_SOLID_WALLPAPERS,
  CURATED_VIDEO_WALLPAPERS,
  formatVideoWallpaperValue,
  normalizeChatWallpaper,
  parseVideoWallpaperValue,
  resolveChatWallpaper,
  withVideoWallpaperMuted
} from '../lib/chatWallpaper';
import { validateAndSaveLocalVideoWallpaper } from '../lib/videoWallpaperStore';
import { VideoWallpaperLayer } from './VideoWallpaperLayer';
import type { ChatRoom, OmarSettings } from '../types/chat';

interface ChatWallpaperModalProps {
  chat: ChatRoom;
  omarSettings: OmarSettings;
  onClose: () => void;
  onSaveWallpaper: (chatId: string, wallpaper: string) => Promise<void>;
}

type WallpaperTab = 'presets' | 'colors' | 'photo' | 'video';

export function ChatWallpaperModal({
  chat,
  omarSettings,
  onClose,
  onSaveWallpaper
}: ChatWallpaperModalProps) {
  const initialWallpaper = normalizeChatWallpaper(chat.wallpaper);
  const [draftWallpaper, setDraftWallpaper] = useState<string>(initialWallpaper);
  const [autoMuteVideo, setAutoMuteVideo] = useState<boolean>(() => {
    const parsed = parseVideoWallpaperValue(initialWallpaper);
    return parsed ? parsed.muted : true;
  });
  const [activeTab, setActiveTab] = useState<WallpaperTab>(() => {
    const resolved = resolveChatWallpaper(initialWallpaper, omarSettings.wallpaper);
    if (resolved.mode === 'color') return 'colors';
    if (resolved.mode === 'image') return 'photo';
    if (resolved.mode === 'video') return 'video';
    return 'presets';
  });
  const [isProcessingMedia, setIsProcessingMedia] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const videoInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !isSaving) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [isSaving, onClose]);

  const previewResolved = resolveChatWallpaper(draftWallpaper, omarSettings.wallpaper);
  const fontSizeClass =
    FONT_SIZE_OPTIONS.find((f) => f.id === omarSettings.fontSize)?.className || 'text-[14.5px]';

  const handleToggleAutoMute = () => {
    const nextMuted = !autoMuteVideo;
    setAutoMuteVideo(nextMuted);
    if (parseVideoWallpaperValue(draftWallpaper)) {
      setDraftWallpaper((prev) => withVideoWallpaperMuted(prev, nextMuted));
    }
  };

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setUploadError(null);
    setIsProcessingMedia(true);
    try {
      const compressed = await compressWallpaperImageFile(file);
      setDraftWallpaper(compressed);
    } catch (err) {
      setUploadError(
        err instanceof Error ? err.message : 'تعذر تحميل الصورة المختارة، يرجى تجربة صورة أخرى.'
      );
    } finally {
      setIsProcessingMedia(false);
    }
  };

  const handleVideoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setUploadError(null);
    setIsProcessingMedia(true);
    try {
      const { videoId } = await validateAndSaveLocalVideoWallpaper(file);
      setDraftWallpaper(formatVideoWallpaperValue('local', videoId, autoMuteVideo));
    } catch (err) {
      setUploadError(
        err instanceof Error
          ? err.message
          : 'تعذر تجهيز مقطع الفيديو المختار. يرجى اختيار مقطع MP4 أو WebM قصير.'
      );
    } finally {
      setIsProcessingMedia(false);
    }
  };

  const handleConfirmSave = async () => {
    setIsSaving(true);
    try {
      await onSaveWallpaper(chat.id, draftWallpaper);
      onClose();
    } finally {
      setIsSaving(false);
    }
  };

  const handleResetToDefault = async () => {
    setDraftWallpaper('');
    setIsSaving(true);
    try {
      await onSaveWallpaper(chat.id, '');
      onClose();
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`تخصيص خلفية محادثة ${chat.title}`}
      className="fixed inset-0 z-50 bg-black/55 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4"
    >
      <div className="w-full max-w-lg bg-white dark:bg-[#202C33] rounded-2xl shadow-2xl border border-[#E9EDEF] dark:border-[#374248] overflow-hidden flex flex-col max-h-[90dvh]">
        {/* Header */}
        <div className="px-4 sm:px-5 py-3.5 border-b border-[#E9EDEF] dark:border-[#2A3942] flex items-center justify-between gap-2 shrink-0">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-9 h-9 rounded-xl bg-[var(--wa-accent-soft)] text-[var(--wa-accent-strong)] flex items-center justify-center shrink-0">
              <Palette className="w-4.5 h-4.5" aria-hidden="true" />
            </div>
            <div className="min-w-0">
              <h3 className="font-display text-sm sm:text-base font-bold text-[#111B21] dark:text-[#E9EDEF] truncate">
                خلفية محادثة {chat.title}
              </h3>
              <p className="text-[11px] text-[#54656F] dark:text-[#8696A0] truncate">
                تُحفظ تلقائياً في إعداداتك السحابية على جميع أجهزتك
              </p>
            </div>
          </div>
          <button
            type="button"
            aria-label="إغلاق نافذة الخلفية"
            disabled={isSaving}
            onClick={onClose}
            className="p-1.5 rounded-full text-[#54656F] dark:text-[#AEBAC1] hover:bg-black/5 dark:hover:bg-white/10 cursor-pointer shrink-0"
          >
            <X className="w-5 h-5" aria-hidden="true" />
          </button>
        </div>

        {/* Live Wallpaper Preview */}
        <div className="relative h-44 sm:h-48 shrink-0 overflow-hidden border-b border-[#E9EDEF] dark:border-[#2A3942]">
          <div
            aria-hidden="true"
            className={`absolute inset-0 transition-all duration-200 ${previewResolved.className}`}
            style={previewResolved.style}
          />
          <VideoWallpaperLayer resolved={previewResolved} className="z-[1]" />
          <div className="relative z-10 h-full px-4 py-3 flex flex-col justify-between">
            <div className="flex justify-center items-center gap-2">
              <span className="px-2.5 py-0.5 rounded-full bg-white/85 dark:bg-[#111B21]/85 backdrop-blur-xs text-[10px] font-semibold text-[#111B21] dark:text-[#E9EDEF] shadow-xs flex items-center gap-1.5">
                <span>معاينة: {previewResolved.label}</span>
                {previewResolved.mode === 'video' && (
                  <span className="inline-flex items-center gap-0.5 text-[var(--wa-accent-strong)] dark:text-[var(--wa-accent)]">
                    {previewResolved.videoMuted !== false ? (
                      <>
                        <VolumeX className="w-3 h-3" aria-hidden="true" />
                        <span>مكتوم تلقائياً</span>
                      </>
                    ) : (
                      <>
                        <Volume2 className="w-3 h-3" aria-hidden="true" />
                        <span>بالصوت</span>
                      </>
                    )}
                  </span>
                )}
              </span>
            </div>

            <div className="space-y-2">
              <div className="flex justify-end">
                <div
                  className={`max-w-[78%] px-3 py-1.5 bg-white dark:bg-[#202C33] text-[#111B21] dark:text-[#E9EDEF] shadow-xs ${
                    omarSettings.bubbleStyle === 'rounded'
                      ? 'rounded-2xl'
                      : omarSettings.bubbleStyle === 'classic'
                        ? 'rounded-lg'
                        : 'rounded-xl rounded-tl-xs'
                  }`}
                >
                  <p className={`${fontSizeClass} leading-snug`}>مرحباً! كيف تبدو هذه الخلفية؟</p>
                </div>
              </div>
              <div className="flex justify-start">
                <div
                  className={`max-w-[78%] px-3 py-1.5 bg-[var(--wa-outgoing-bg)] text-[#111B21] dark:text-[#E9EDEF] shadow-xs ${
                    omarSettings.bubbleStyle === 'rounded'
                      ? 'rounded-2xl'
                      : omarSettings.bubbleStyle === 'classic'
                        ? 'rounded-lg'
                        : 'rounded-xl rounded-tr-xs'
                  }`}
                >
                  <p className={`${fontSizeClass} leading-snug`}>رائعة ومريحة جداً للقراءة ✨</p>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Tabs */}
        <div
          role="tablist"
          aria-label="أنواع الخلفيات"
          className="px-3 sm:px-4 pt-3 pb-2 flex items-center gap-1.5 border-b border-[#F0F2F5] dark:border-[#2A3942] shrink-0 overflow-x-auto no-scrollbar"
        >
          {[
            { id: 'presets' as const, label: 'الأنماط الجاهزة', icon: Sparkles },
            { id: 'colors' as const, label: 'ألوان مخصصة', icon: Palette },
            { id: 'photo' as const, label: 'صورة من الجهاز', icon: ImagePlus },
            { id: 'video' as const, label: 'فيديو قصير', icon: Film }
          ].map((tab) => {
            const Icon = tab.icon;
            const active = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => {
                  setUploadError(null);
                  setActiveTab(tab.id);
                }}
                className={`flex-1 min-w-[84px] py-2 px-2 rounded-xl text-[11px] sm:text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap ${
                  active
                    ? 'bg-[var(--wa-accent)] text-white shadow-xs'
                    : 'bg-[#F0F2F5] dark:bg-[#111B21] text-[#54656F] dark:text-[#AEBAC1] hover:brightness-95'
                }`}
              >
                <Icon className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                <span className="truncate">{tab.label}</span>
              </button>
            );
          })}
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {activeTab === 'presets' && (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
              <button
                type="button"
                onClick={() => setDraftWallpaper('')}
                className={`p-3 rounded-xl border text-right flex items-center gap-2.5 transition-all cursor-pointer ${
                  draftWallpaper === ''
                    ? 'border-[var(--wa-accent)] bg-[var(--wa-accent-soft)]/50 dark:bg-[#111B21]'
                    : 'border-[#E9EDEF] dark:border-[#2A3942] bg-[#F8FAFB] dark:bg-[#182229] hover:border-[#D1D7DB]'
                }`}
              >
                <span
                  className="w-7 h-7 rounded-lg border border-black/10 shrink-0 flex items-center justify-center"
                  style={{
                    backgroundColor:
                      WALLPAPERS.find((w) => w.id === omarSettings.wallpaper)?.swatch || '#EFEAE2'
                  }}
                >
                  {draftWallpaper === '' && (
                    <Check className="w-3.5 h-3.5 text-[#008069]" aria-hidden="true" />
                  )}
                </span>
                <div className="min-w-0">
                  <p className="text-xs font-bold text-[#111B21] dark:text-[#E9EDEF] truncate">
                    الافتراضي العام
                  </p>
                  <p className="text-[10px] text-[#54656F] dark:text-[#8696A0] truncate">
                    إعدادات المظهر
                  </p>
                </div>
              </button>

              {WALLPAPERS.map((wp) => {
                const selected = draftWallpaper === wp.id;
                return (
                  <button
                    key={wp.id}
                    type="button"
                    onClick={() => setDraftWallpaper(wp.id)}
                    className={`p-3 rounded-xl border text-right flex items-center gap-2.5 transition-all cursor-pointer ${
                      selected
                        ? 'border-[var(--wa-accent)] bg-[var(--wa-accent-soft)]/50 dark:bg-[#111B21]'
                        : 'border-[#E9EDEF] dark:border-[#2A3942] bg-[#F8FAFB] dark:bg-[#182229] hover:border-[#D1D7DB]'
                    }`}
                  >
                    <span
                      className="w-7 h-7 rounded-lg border border-black/10 shrink-0 flex items-center justify-center"
                      style={{ backgroundColor: wp.swatch }}
                    >
                      {selected && (
                        <Check className="w-3.5 h-3.5 text-[#008069]" aria-hidden="true" />
                      )}
                    </span>
                    <span className="text-xs font-semibold text-[#111B21] dark:text-[#E9EDEF] truncate">
                      {wp.name}
                    </span>
                  </button>
                );
              })}
            </div>
          )}

          {activeTab === 'colors' && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {CURATED_SOLID_WALLPAPERS.map((c) => {
                  const selected = draftWallpaper.toUpperCase() === c.hex.toUpperCase();
                  return (
                    <button
                      key={c.hex}
                      type="button"
                      onClick={() => setDraftWallpaper(c.hex)}
                      className={`p-2.5 rounded-xl border text-right flex items-center gap-2 transition-all cursor-pointer ${
                        selected
                          ? 'border-[var(--wa-accent)] bg-[var(--wa-accent-soft)]/40 dark:bg-[#111B21]'
                          : 'border-[#E9EDEF] dark:border-[#2A3942] bg-[#F8FAFB] dark:bg-[#182229]'
                      }`}
                    >
                      <span
                        className="w-6 h-6 rounded-lg border border-black/15 shrink-0 flex items-center justify-center"
                        style={{ backgroundColor: c.hex }}
                      >
                        {selected && (
                          <Check className="w-3.5 h-3.5 text-white drop-shadow" aria-hidden="true" />
                        )}
                      </span>
                      <span className="text-[11px] font-semibold text-[#111B21] dark:text-[#E9EDEF] truncate">
                        {c.name}
                      </span>
                    </button>
                  );
                })}
              </div>

              <div className="p-3 rounded-xl bg-[#F0F2F5] dark:bg-[#111B21] flex items-center justify-between gap-3">
                <div>
                  <p className="text-xs font-bold text-[#111B21] dark:text-[#E9EDEF]">
                    اختيار درجة لون مخصصة
                  </p>
                  <p className="text-[11px] text-[#54656F] dark:text-[#8696A0]">
                    اختر أي لون يناسب ذوقك لهذه المحادثة فقط
                  </p>
                </div>
                <label className="flex items-center gap-2 cursor-pointer">
                  <span
                    dir="ltr"
                    className="font-mono-code text-xs text-[#54656F] dark:text-[#AEBAC1]"
                  >
                    {/^#[0-9A-F]{6}$/i.test(draftWallpaper) ? draftWallpaper : '#0F172A'}
                  </span>
                  <input
                    type="color"
                    aria-label="منتقي اللون المخصص للخلفية"
                    value={/^#[0-9A-F]{6}$/i.test(draftWallpaper) ? draftWallpaper : '#0F172A'}
                    onChange={(e) => setDraftWallpaper(e.target.value.toUpperCase())}
                    className="w-9 h-9 rounded-lg border-0 bg-transparent cursor-pointer"
                  />
                </label>
              </div>
            </div>
          )}

          {activeTab === 'photo' && (
            <div className="space-y-3">
              <input
                ref={imageInputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                onChange={(e) => void handleImageUpload(e)}
                className="hidden"
              />
              <button
                type="button"
                disabled={isProcessingMedia}
                onClick={() => imageInputRef.current?.click()}
                className="w-full py-6 px-4 rounded-2xl border-2 border-dashed border-[#D1D7DB] dark:border-[#374248] bg-[#F8FAFB] dark:bg-[#111B21] hover:border-[var(--wa-accent)] transition-colors flex flex-col items-center justify-center gap-2 text-center cursor-pointer disabled:opacity-60"
              >
                <div className="w-11 h-11 rounded-full bg-[var(--wa-accent-soft)] text-[var(--wa-accent-strong)] flex items-center justify-center">
                  <Upload className="w-5 h-5" aria-hidden="true" />
                </div>
                <p className="text-xs font-bold text-[#111B21] dark:text-[#E9EDEF]">
                  {isProcessingMedia ? 'جاري ضغط وتجهيز الصورة...' : 'اختر صورة من جهازك كخلفية للمحادثة'}
                </p>
                <p className="text-[11px] text-[#54656F] dark:text-[#8696A0]">
                  يتم ضغط الصورة تلقائياً لتتم مزامنتها بسلاسة عبر حسابك في Firestore
                </p>
              </button>

              {uploadError && (
                <p role="alert" className="text-xs text-red-600 dark:text-red-400 text-center">
                  {uploadError}
                </p>
              )}

              {previewResolved.mode === 'image' && (
                <div className="flex items-center justify-between px-3 py-2 rounded-xl bg-[#F0F2F5] dark:bg-[#111B21] text-xs">
                  <span className="text-[#111B21] dark:text-[#E9EDEF] font-medium">
                    تم تحديد صورة مخصصة وجاهزة للحفظ
                  </span>
                  <button
                    type="button"
                    onClick={() => setDraftWallpaper('')}
                    className="text-red-600 dark:text-red-400 font-semibold hover:underline cursor-pointer"
                  >
                    إزالة الصورة
                  </button>
                </div>
              )}
            </div>
          )}

          {activeTab === 'video' && (
            <div className="space-y-4">
              {/* Auto-Mute Toggle */}
              <div className="p-3 rounded-xl bg-[#F0F2F5] dark:bg-[#111B21] border border-[#E9EDEF] dark:border-[#2A3942] flex items-center justify-between gap-3">
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className="w-9 h-9 rounded-xl bg-[var(--wa-accent-soft)] text-[var(--wa-accent-strong)] flex items-center justify-center shrink-0">
                    {autoMuteVideo ? (
                      <VolumeX className="w-4.5 h-4.5" aria-hidden="true" />
                    ) : (
                      <Volume2 className="w-4.5 h-4.5" aria-hidden="true" />
                    )}
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs font-bold text-[#111B21] dark:text-[#E9EDEF]">
                      كتم الصوت التلقائي للمقطع
                    </p>
                    <p className="text-[11px] text-[#54656F] dark:text-[#8696A0]">
                      {autoMuteVideo
                        ? 'يعمل الفيديو كخلفية صامتة تلقائياً دون مقاطعة صوت المحادثة'
                        : 'يتم تشغيل الصوت الخفيف المصاحب للمقطع عند فتح المحادثة'}
                    </p>
                  </div>
                </div>

                <button
                  type="button"
                  role="switch"
                  aria-checked={autoMuteVideo}
                  aria-label="كتم الصوت التلقائي للمقطع"
                  onClick={handleToggleAutoMute}
                  className={`relative w-11 h-6 rounded-full transition-colors cursor-pointer shrink-0 ${
                    autoMuteVideo ? 'bg-[var(--wa-accent)]' : 'bg-[#CBD5E1] dark:bg-[#374248]'
                  }`}
                >
                  <span
                    className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform ${
                      autoMuteVideo ? 'left-0.5' : 'left-[22px]'
                    }`}
                  />
                </button>
              </div>

              {/* Curated Built-in Looping Video Clips */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-[#111B21] dark:text-[#E9EDEF]">
                    مقاطع متحركة جاهزة (تتزامن عبر جميع أجهزتك)
                  </span>
                  <span className="text-[10px] text-[#54656F] dark:text-[#8696A0]">
                    تكرار سلس
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-2.5">
                  {CURATED_VIDEO_WALLPAPERS.map((clip) => {
                    const selected =
                      previewResolved.mode === 'video' &&
                      previewResolved.videoKind === 'curated' &&
                      previewResolved.videoId === clip.id;
                    return (
                      <button
                        key={clip.id}
                        type="button"
                        onClick={() =>
                          setDraftWallpaper(
                            formatVideoWallpaperValue('curated', clip.id, autoMuteVideo)
                          )
                        }
                        className={`group relative rounded-xl overflow-hidden border text-right transition-all cursor-pointer ${
                          selected
                            ? 'border-[var(--wa-accent)] ring-2 ring-[var(--wa-accent)]/35'
                            : 'border-[#E9EDEF] dark:border-[#2A3942] hover:border-[#D1D7DB]'
                        }`}
                      >
                        <div
                          className="relative h-20 w-full overflow-hidden"
                          style={{ backgroundColor: clip.accent }}
                        >
                          <video
                            src={clip.src}
                            autoPlay
                            loop
                            muted
                            playsInline
                            preload="metadata"
                            className="w-full h-full object-cover"
                          />
                          <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/15 to-transparent" />
                          <span className="absolute top-1.5 left-1.5 px-1.5 py-0.5 rounded-md bg-black/55 text-white text-[10px] font-mono-code">
                            {clip.durationLabel}
                          </span>
                          {selected && (
                            <span className="absolute top-1.5 right-1.5 w-5 h-5 rounded-full bg-[var(--wa-accent)] text-white flex items-center justify-center shadow">
                              <Check className="w-3 h-3" aria-hidden="true" />
                            </span>
                          )}
                          <span className="absolute bottom-1.5 right-2 left-2 text-[11px] font-bold text-white truncate">
                            {clip.name}
                          </span>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Upload Short Video From Device */}
              <div className="space-y-2">
                <input
                  ref={videoInputRef}
                  type="file"
                  accept="video/mp4,video/webm,video/quicktime"
                  onChange={(e) => void handleVideoUpload(e)}
                  className="hidden"
                />
                <button
                  type="button"
                  disabled={isProcessingMedia}
                  onClick={() => videoInputRef.current?.click()}
                  className="w-full py-4 px-4 rounded-2xl border-2 border-dashed border-[#D1D7DB] dark:border-[#374248] bg-[#F8FAFB] dark:bg-[#111B21] hover:border-[var(--wa-accent)] transition-colors flex items-center justify-center gap-3 text-right cursor-pointer disabled:opacity-60"
                >
                  <div className="w-10 h-10 rounded-full bg-[var(--wa-accent-soft)] text-[var(--wa-accent-strong)] flex items-center justify-center shrink-0">
                    <Film className="w-5 h-5" aria-hidden="true" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-bold text-[#111B21] dark:text-[#E9EDEF]">
                      {isProcessingMedia
                        ? 'جاري التحقق من مقطع الفيديو...'
                        : 'اختيار مقطع فيديو قصير من جهازك (MP4 / WebM)'}
                    </p>
                    <p className="text-[11px] text-[#54656F] dark:text-[#8696A0]">
                      بحد أقصى 30 ثانية و 12 ميجابايت — يُحفظ محلياً على هذا الجهاز لسرعة التشغيل
                    </p>
                  </div>
                </button>

                {uploadError && (
                  <p role="alert" className="text-xs text-red-600 dark:text-red-400 text-center">
                    {uploadError}
                  </p>
                )}

                {previewResolved.mode === 'video' && (
                  <div className="flex items-center justify-between px-3 py-2 rounded-xl bg-[#F0F2F5] dark:bg-[#111B21] text-xs">
                    <span className="text-[#111B21] dark:text-[#E9EDEF] font-medium truncate">
                      {previewResolved.videoKind === 'local'
                        ? 'تم اختيار مقطع فيديو من جهازك وجاهز للحفظ'
                        : `تم اختيار: ${previewResolved.label}`}
                    </span>
                    <button
                      type="button"
                      onClick={() => setDraftWallpaper('')}
                      className="text-red-600 dark:text-red-400 font-semibold hover:underline cursor-pointer shrink-0 mr-2"
                    >
                      إزالة الفيديو
                    </button>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-4 sm:px-5 py-3 border-t border-[#E9EDEF] dark:border-[#2A3942] flex items-center justify-between gap-2 shrink-0 bg-[#F8FAFB] dark:bg-[#182229]">
          <div>
            {(initialWallpaper || draftWallpaper) && (
              <button
                type="button"
                disabled={isSaving}
                onClick={() => void handleResetToDefault()}
                className="px-3 py-2 rounded-xl text-xs font-semibold text-[#54656F] dark:text-[#AEBAC1] hover:bg-black/5 dark:hover:bg-white/10 flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
              >
                <RotateCcw className="w-3.5 h-3.5" aria-hidden="true" />
                <span>استعادة الافتراضي</span>
              </button>
            )}
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={isSaving}
              onClick={onClose}
              className="px-4 py-2 rounded-xl text-xs font-semibold text-[#54656F] dark:text-[#AEBAC1] hover:bg-black/5 dark:hover:bg-white/10 cursor-pointer"
            >
              إلغاء
            </button>
            <button
              type="button"
              disabled={isSaving || isProcessingMedia}
              onClick={() => void handleConfirmSave()}
              className="px-5 py-2 rounded-xl bg-[var(--wa-accent)] text-white text-xs font-bold hover:brightness-95 cursor-pointer disabled:opacity-60"
            >
              {isSaving ? 'جاري الحفظ...' : 'حفظ الخلفية'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
