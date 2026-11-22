import { useEffect, useRef, useState } from 'react';
import type { ResolvedChatWallpaper } from '../lib/chatWallpaper';
import { loadLocalVideoWallpaperBlobUrl } from '../lib/videoWallpaperStore';

interface VideoWallpaperLayerProps {
  resolved: ResolvedChatWallpaper;
  className?: string;
}

export function VideoWallpaperLayer({ resolved, className = '' }: VideoWallpaperLayerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [localBlobUrl, setLocalBlobUrl] = useState<string | null>(null);

  useEffect(() => {
    if (resolved.mode !== 'video' || resolved.videoKind !== 'local' || !resolved.videoId) {
      setLocalBlobUrl(null);
      return;
    }

    let cancelled = false;
    let activeObjectUrl: string | null = null;

    void loadLocalVideoWallpaperBlobUrl(resolved.videoId).then((url) => {
      if (cancelled) {
        if (url) URL.revokeObjectURL(url);
        return;
      }
      activeObjectUrl = url;
      setLocalBlobUrl(url);
    });

    return () => {
      cancelled = true;
      if (activeObjectUrl) {
        URL.revokeObjectURL(activeObjectUrl);
      }
    };
  }, [resolved.mode, resolved.videoKind, resolved.videoId]);

  const effectiveSrc =
    resolved.mode === 'video'
      ? resolved.videoKind === 'local'
        ? localBlobUrl
        : resolved.videoSrc || null
      : null;

  const isMuted = resolved.videoMuted !== false;

  useEffect(() => {
    const videoEl = videoRef.current;
    if (!videoEl || !effectiveSrc) return;
    videoEl.muted = isMuted;
    videoEl.defaultMuted = isMuted;
    if (videoEl.paused) {
      void videoEl.play().catch(() => {
        // Browser autoplay policy blocked unmuted playback: fall back cleanly to muted autoplay
        if (!isMuted) {
          videoEl.muted = true;
          void videoEl.play().catch(() => {});
        }
      });
    }
  }, [effectiveSrc, isMuted]);

  if (resolved.mode !== 'video' || !effectiveSrc) return null;

  return (
    <div
      aria-hidden="true"
      className={`pointer-events-none absolute inset-0 overflow-hidden ${className}`}
    >
      <video
        ref={videoRef}
        src={effectiveSrc}
        autoPlay
        loop
        muted={isMuted}
        playsInline
        preload="auto"
        className="w-full h-full object-cover"
      />
      <div className="absolute inset-0 bg-[#0B141A]/25" />
    </div>
  );
}
