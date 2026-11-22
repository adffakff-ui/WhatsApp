import { useState, useRef, useEffect, useCallback } from 'react';
import {
  X,
  ZoomIn,
  ZoomOut,
  Download,
  RotateCcw,
  ChevronLeft,
  ChevronRight,
  Images
} from 'lucide-react';
import { resolveBundledAssetUrl } from '../data/assets';

export interface ImageViewerModalProps {
  mediaUrl?: string;
  images?: string[];
  initialIndex?: number;
  caption?: string;
  onClose: () => void;
}

export function ImageViewerModal({
  mediaUrl,
  images,
  initialIndex = 0,
  caption,
  onClose
}: ImageViewerModalProps) {
  // Normalize image list: either images array or single mediaUrl
  const imageList = images && images.length > 0 ? images : mediaUrl ? [mediaUrl] : [];
  const [currentIndex, setCurrentIndex] = useState(() =>
    Math.min(Math.max(0, initialIndex), Math.max(0, imageList.length - 1))
  );

  const [scale, setScale] = useState(1);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const dragStartRef = useRef({ x: 0, y: 0 });
  const imgRef = useRef<HTMLImageElement>(null);

  const currentMediaUrl = imageList[currentIndex] || mediaUrl || '';
  const resolvedUrl = resolveBundledAssetUrl(currentMediaUrl);

  const resetTransform = useCallback(() => {
    setScale(1);
    setPosition({ x: 0, y: 0 });
  }, []);

  const handleNext = useCallback(() => {
    if (imageList.length <= 1) return;
    resetTransform();
    setCurrentIndex((prev) => (prev + 1) % imageList.length);
  }, [imageList.length, resetTransform]);

  const handlePrev = useCallback(() => {
    if (imageList.length <= 1) return;
    resetTransform();
    setCurrentIndex((prev) => (prev - 1 + imageList.length) % imageList.length);
  }, [imageList.length, resetTransform]);

  // Keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      } else if (e.key === 'ArrowRight') {
        handlePrev(); // RTL natural previous/next
      } else if (e.key === 'ArrowLeft') {
        handleNext();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleNext, handlePrev, onClose]);

  const handleZoomIn = () => {
    setScale((prev) => Math.min(prev + 0.5, 4));
  };

  const handleZoomOut = () => {
    setScale((prev) => {
      const next = Math.max(prev - 0.5, 1);
      if (next === 1) setPosition({ x: 0, y: 0 });
      return next;
    });
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    if (scale <= 1) return;
    setIsDragging(true);
    dragStartRef.current = { x: e.clientX - position.x, y: e.clientY - position.y };
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDragging || scale <= 1) return;
    setPosition({
      x: e.clientX - dragStartRef.current.x,
      y: e.clientY - dragStartRef.current.y
    });
  };

  const handleMouseUp = () => {
    setIsDragging(false);
  };

  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    if (e.deltaY < 0) {
      setScale((prev) => Math.min(prev + 0.3, 4));
    } else {
      setScale((prev) => {
        const next = Math.max(prev - 0.3, 1);
        if (next === 1) setPosition({ x: 0, y: 0 });
        return next;
      });
    }
  };

  const handleDoubleClick = () => {
    if (scale > 1) {
      resetTransform();
    } else {
      setScale(2.5);
    }
  };

  const handleDownload = () => {
    const a = document.createElement('a');
    a.href = resolvedUrl;
    a.download = `wasil-image-${currentIndex + 1}-${Date.now()}.jpg`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="عارض الصور التفاعلي"
      className="fixed inset-0 z-50 flex flex-col bg-black/92 backdrop-blur-md text-white select-none overflow-hidden animate-fade-in"
      onClick={onClose}
    >
      {/* Top Action Bar */}
      <div
        className="flex items-center justify-between px-4 py-3 bg-black/50 border-b border-white/10 shrink-0 z-20"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleZoomIn}
            className="w-9 h-9 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center transition-colors cursor-pointer"
            title="تكبير"
            aria-label="تكبير الصورة"
          >
            <ZoomIn className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={handleZoomOut}
            className="w-9 h-9 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center transition-colors cursor-pointer"
            title="تصغير"
            aria-label="تصغير الصورة"
          >
            <ZoomOut className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={resetTransform}
            className="w-9 h-9 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center transition-colors cursor-pointer"
            title="إعادة الضبط"
            aria-label="إعادة ضبط الحجم"
          >
            <RotateCcw className="w-4 h-4" />
          </button>
          <span className="text-xs font-mono-code px-2 py-1 rounded bg-white/10 text-white/90">
            {Math.round(scale * 100)}%
          </span>

          {imageList.length > 1 && (
            <div className="mr-2 flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-white/10 text-xs font-medium text-white/90">
              <Images className="w-3.5 h-3.5 text-[var(--wa-accent)]" aria-hidden="true" />
              <span>{`الصورة ${currentIndex + 1} من ${imageList.length}`}</span>
            </div>
          )}
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleDownload}
            className="px-3.5 py-1.5 rounded-xl bg-white/10 hover:bg-white/20 text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer"
            aria-label="تحميل الصورة الحالية"
          >
            <Download className="w-4 h-4" />
            <span className="hidden sm:inline">تحميل</span>
          </button>
          <button
            type="button"
            onClick={onClose}
            className="w-9 h-9 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center transition-colors cursor-pointer"
            title="إغلاق"
            aria-label="إغلاق عارض الصور"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* Main Image Container & Navigation Chevrons */}
      <div
        className="flex-1 relative flex items-center justify-center overflow-hidden p-4 cursor-grab active:cursor-grabbing"
        onClick={(e) => e.stopPropagation()}
        onWheel={handleWheel}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
      >
        {/* Previous Button */}
        {imageList.length > 1 && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              handlePrev();
            }}
            aria-label="الصورة السابقة"
            className="absolute right-4 z-30 w-11 h-11 rounded-full bg-black/60 hover:bg-black/80 text-white flex items-center justify-center shadow-lg transition-transform active:scale-95 cursor-pointer backdrop-blur-xs border border-white/10"
          >
            <ChevronRight className="w-6 h-6" />
          </button>
        )}

        {/* Current Image */}
        <div
          style={{
            transform: `translate(${position.x}px, ${position.y}px) scale(${scale})`,
            transition: isDragging ? 'none' : 'transform 0.2s cubic-bezier(0.16, 1, 0.3, 1)'
          }}
          className="relative max-w-full max-h-full flex items-center justify-center"
          onDoubleClick={handleDoubleClick}
        >
          <img
            ref={imgRef}
            src={resolvedUrl}
            alt={caption || `صورة ${currentIndex + 1}`}
            className="max-w-[90vw] max-h-[72vh] object-contain rounded-xl shadow-2xl pointer-events-auto select-none"
            draggable={false}
            referrerPolicy="no-referrer"
          />
        </div>

        {/* Next Button */}
        {imageList.length > 1 && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              handleNext();
            }}
            aria-label="الصورة التالية"
            className="absolute left-4 z-30 w-11 h-11 rounded-full bg-black/60 hover:bg-black/80 text-white flex items-center justify-center shadow-lg transition-transform active:scale-95 cursor-pointer backdrop-blur-xs border border-white/10"
          >
            <ChevronLeft className="w-6 h-6" />
          </button>
        )}
      </div>

      {/* Thumbnails Row for Albums */}
      {imageList.length > 1 && (
        <div
          className="px-4 py-2 bg-black/60 border-t border-white/10 flex items-center justify-center gap-2 overflow-x-auto shrink-0 z-20"
          onClick={(e) => e.stopPropagation()}
        >
          {imageList.map((url, idx) => (
            <button
              key={idx}
              type="button"
              onClick={() => {
                resetTransform();
                setCurrentIndex(idx);
              }}
              className={`relative w-12 h-12 rounded-lg overflow-hidden shrink-0 border-2 transition-all cursor-pointer ${
                idx === currentIndex
                  ? 'border-[var(--wa-accent)] scale-105 shadow-md'
                  : 'border-transparent opacity-60 hover:opacity-100'
              }`}
            >
              <img
                src={resolveBundledAssetUrl(url)}
                alt={`معاينة مصغرة ${idx + 1}`}
                className="w-full h-full object-cover"
              />
            </button>
          ))}
        </div>
      )}

      {/* Caption Footer */}
      {caption && (
        <div
          className="px-6 py-2.5 bg-black/75 backdrop-blur-md border-t border-white/10 text-center text-sm text-white/90 shrink-0 z-20"
          onClick={(e) => e.stopPropagation()}
        >
          <p className="max-w-xl mx-auto truncate">{caption}</p>
        </div>
      )}
    </div>
  );
}
