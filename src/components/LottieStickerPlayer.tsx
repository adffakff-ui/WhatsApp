import { useEffect, useRef, useState } from 'react';
import lottie, { type AnimationItem } from 'lottie-web';
import {
  cloneLottieData,
  getLottieAnimationById,
  isValidLottieData,
  type LottieAnimationData
} from '../lib/lottieStickers';

interface LottieStickerPlayerProps {
  lottieId?: string;
  lottieData?: unknown;
  fallbackEmoji?: string;
  label?: string;
  sizeClassName?: string;
  loop?: boolean;
  interactiveReplay?: boolean;
}

export function LottieStickerPlayer({
  lottieId,
  lottieData,
  fallbackEmoji = '✨',
  label = 'ملصق متحرك',
  sizeClassName = 'w-22 h-22',
  loop = true,
  interactiveReplay = true
}: LottieStickerPlayerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const animRef = useRef<AnimationItem | null>(null);
  const [hasError, setHasError] = useState(false);

  const resolvedData: LottieAnimationData | undefined =
    (isValidLottieData(lottieData) ? lottieData : undefined) ||
    getLottieAnimationById(lottieId);

  const serializedKey = resolvedData
    ? lottieId || `${resolvedData.nm}_${resolvedData.w}x${resolvedData.h}_${resolvedData.op}`
    : '';

  useEffect(() => {
    const container = containerRef.current;
    if (!container || !resolvedData) {
      setHasError(!resolvedData);
      return;
    }

    setHasError(false);
    const prefersReducedMotion =
      typeof window !== 'undefined' &&
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    let anim: AnimationItem | null = null;
    try {
      anim = lottie.loadAnimation({
        container,
        renderer: 'svg',
        loop,
        autoplay: !prefersReducedMotion,
        animationData: cloneLottieData(resolvedData),
        rendererSettings: {
          preserveAspectRatio: 'xMidYMid meet',
          progressiveLoad: true
        }
      });
      animRef.current = anim;

      if (prefersReducedMotion) {
        const midpoint = Math.round((resolvedData.op - resolvedData.ip) * 0.45);
        anim.goToAndStop(midpoint, true);
      }
    } catch {
      setHasError(true);
      return;
    }

    let observer: IntersectionObserver | null = null;
    if (!prefersReducedMotion && typeof IntersectionObserver !== 'undefined') {
      observer = new IntersectionObserver(
        (entries) => {
          const entry = entries[0];
          if (!entry || !animRef.current) return;
          if (entry.isIntersecting) {
            animRef.current.play();
          } else {
            animRef.current.pause();
          }
        },
        { threshold: 0.1 }
      );
      observer.observe(container);
    }

    return () => {
      observer?.disconnect();
      anim?.destroy();
      animRef.current = null;
    };
  }, [serializedKey, loop]);

  const handleReplay = () => {
    if (!interactiveReplay || !animRef.current) return;
    animRef.current.goToAndPlay(0, true);
  };

  if (hasError || !resolvedData) {
    return (
      <div
        role="img"
        aria-label={label}
        className={`${sizeClassName} flex items-center justify-center text-3xl leading-none select-none`}
      >
        {fallbackEmoji}
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      role="img"
      aria-label={label}
      onClick={interactiveReplay ? handleReplay : undefined}
      title={interactiveReplay ? 'انقر لإعادة تشغيل الحركة' : undefined}
      className={`${sizeClassName} shrink-0 select-none ${
        interactiveReplay ? 'cursor-pointer' : ''
      }`}
    />
  );
}
