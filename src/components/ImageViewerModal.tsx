import { useState, useRef } from 'react';
import { X, ZoomIn, ZoomOut, Download, RotateCcw } from 'lucide-react';
import { resolveBundledAssetUrl } from '../data/assets';

interface ImageViewerModalProps {
  mediaUrl: string;
  caption?: string;
  onClose: () => void;
}

export function ImageViewerModal({ mediaUrl, caption, onClose }: ImageViewerModalProps) {
  const [scale, setScale] = useState(1);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const dragStartRef = useRef({ x: 0, y: 0 });
  const imgRef = useRef<HTMLImageElement>(null);

  const resolvedUrl = resolveBundledAssetUrl(mediaUrl);

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

  const handleResetZoom = () => {
    setScale(1);
    setPosition({ x: 0, y: 0 });
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
      handleResetZoom();
    } else {
      setScale(2.5);
    }
  };

  const handleDownload = () => {
    const a = document.createElement('a');
    a.href = resolvedUrl;
    a.download = `wasil-image-${Date.now()}.jpg`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="عراض الصور التفاعلي"
      className="fixed inset-0 z-50 flex flex-col bg-black/90 backdrop-blur-md text-white select-none overflow-hidden animate-fade-in"
      onClick={onClose}
    >
      {/* Top Action Bar */}
      <div
        className="flex items-center justify-between px-4 py-3 bg-black/40 border-b border-white/10 shrink-0"
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
            onClick={handleResetZoom}
            className="w-9 h-9 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center transition-colors cursor-pointer"
            title="إعادة الضبط"
            aria-label="إعادة ضبط الحجم"
          >
            <RotateCcw className="w-4 h-4" />
          </button>
          <span className="text-xs font-mono-code px-2 py-1 rounded bg-white/10 text-white/90">
            {Math.round(scale * 100)}%
          </span>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleDownload}
            className="px-3.5 py-1.5 rounded-xl bg-white/10 hover:bg-white/20 text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer"
            aria-label="تحميل الصورة"
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

      {/* Main Image Container */}
      <div
        className="flex-1 relative flex items-center justify-center overflow-hidden p-4 cursor-grab active:cursor-grabbing"
        onClick={(e) => e.stopPropagation()}
        onWheel={handleWheel}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
      >
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
            alt={caption || 'صورة مكبرة'}
            className="max-w-[90vw] max-h-[75vh] object-contain rounded-xl shadow-2xl pointer-events-auto"
            draggable={false}
            referrerPolicy="no-referrer"
          />
        </div>
      </div>

      {/* Caption Footer */}
      {caption && (
        <div
          className="px-6 py-3 bg-black/60 backdrop-blur-md border-t border-white/10 text-center text-sm text-white/90 shrink-0"
          onClick={(e) => e.stopPropagation()}
        >
          <p className="max-w-xl mx-auto truncate">{caption}</p>
        </div>
      )}
    </div>
  );
}
