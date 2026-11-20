import { useEffect, useRef, useState } from 'react';
import { Check, ImagePlus, Palette, RotateCcw, Sparkles, Upload, X } from 'lucide-react';
import { FONT_SIZE_OPTIONS, WALLPAPERS } from '../lib/omarConfig';
import {
  compressWallpaperImageFile,
  CURATED_SOLID_WALLPAPERS,
  normalizeChatWallpaper,
  resolveChatWallpaper
} from '../lib/chatWallpaper';
import type { ChatRoom, OmarSettings } from '../types/chat';

interface ChatWallpaperModalProps {
  chat: ChatRoom;
  omarSettings: OmarSettings;
  onClose: () => void;
  onSaveWallpaper: (chatId: string, wallpaper: string) => Promise<void>;
}

type WallpaperTab = 'presets' | 'colors' | 'photo';

export function ChatWallpaperModal({
  chat,
  omarSettings,
  onClose,
  onSaveWallpaper
}: ChatWallpaperModalProps) {
  const initialWallpaper = normalizeChatWallpaper(chat.wallpaper);
  const [draftWallpaper, setDraftWallpaper] = useState<string>(initialWallpaper);
  const [activeTab, setActiveTab] = useState<WallpaperTab>(() => {
    const resolved = resolveChatWallpaper(initialWallpaper, omarSettings.wallpaper);
    if (resolved.mode === 'color') return 'colors';
    if (resolved.mode === 'image') return 'photo';
    return 'presets';
  });
  const [isProcessingImage, setIsProcessingImage] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

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

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setUploadError(null);
    setIsProcessingImage(true);
    try {
      const compressed = await compressWallpaperImageFile(file);
      setDraftWallpaper(compressed);
    } catch (err) {
      setUploadError(
        err instanceof Error ? err.message : 'تعذر تحميل الصورة المختارة، يرجى تجربة صورة أخرى.'
      );
    } finally {
      setIsProcessingImage(false);
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
          <div className="relative z-10 h-full px-4 py-3 flex flex-col justify-between">
            <div className="flex justify-center">
              <span className="px-2.5 py-0.5 rounded-full bg-white/85 dark:bg-[#111B21]/85 backdrop-blur-xs text-[10px] font-semibold text-[#111B21] dark:text-[#E9EDEF] shadow-xs">
                معاينة: {previewResolved.label}
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
          className="px-4 pt-3 pb-2 flex items-center gap-1.5 border-b border-[#F0F2F5] dark:border-[#2A3942] shrink-0"
        >
          {[
            { id: 'presets' as const, label: 'الأنماط الجاهزة', icon: Sparkles },
            { id: 'colors' as const, label: 'ألوان مخصصة', icon: Palette },
            { id: 'photo' as const, label: 'صورة من الجهاز', icon: ImagePlus }
          ].map((tab) => {
            const Icon = tab.icon;
            const active = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => setActiveTab(tab.id)}
                className={`flex-1 py-2 px-2.5 rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors cursor-pointer ${
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
                ref={fileInputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                onChange={(e) => void handleImageUpload(e)}
                className="hidden"
              />
              <button
                type="button"
                disabled={isProcessingImage}
                onClick={() => fileInputRef.current?.click()}
                className="w-full py-6 px-4 rounded-2xl border-2 border-dashed border-[#D1D7DB] dark:border-[#374248] bg-[#F8FAFB] dark:bg-[#111B21] hover:border-[var(--wa-accent)] transition-colors flex flex-col items-center justify-center gap-2 text-center cursor-pointer disabled:opacity-60"
              >
                <div className="w-11 h-11 rounded-full bg-[var(--wa-accent-soft)] text-[var(--wa-accent-strong)] flex items-center justify-center">
                  <Upload className="w-5 h-5" aria-hidden="true" />
                </div>
                <p className="text-xs font-bold text-[#111B21] dark:text-[#E9EDEF]">
                  {isProcessingImage ? 'جاري ضغط وتجهيز الصورة...' : 'اختر صورة من جهازك كخلفية للمحادثة'}
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
              disabled={isSaving || isProcessingImage}
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
