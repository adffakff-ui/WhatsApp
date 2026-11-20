export interface VirtualWindowInput {
  totalCount: number;
  itemHeight: number;
  viewportHeight: number;
  scrollTop: number;
  overscan?: number;
}

export interface VirtualWindowResult {
  startIndex: number;
  endIndex: number;
  topSpacerHeight: number;
  bottomSpacerHeight: number;
  totalHeight: number;
}

/**
 * Computes the visible slice [startIndex, endIndex) and spacer heights
 * for fixed-height list virtualization without absolute positioning pitfalls.
 */
export function computeVirtualWindow({
  totalCount,
  itemHeight,
  viewportHeight,
  scrollTop,
  overscan = 6
}: VirtualWindowInput): VirtualWindowResult {
  const safeCount = Math.max(0, Math.floor(totalCount));
  const safeItemHeight = Math.max(1, itemHeight);
  const totalHeight = safeCount * safeItemHeight;

  if (safeCount === 0) {
    return {
      startIndex: 0,
      endIndex: 0,
      topSpacerHeight: 0,
      bottomSpacerHeight: 0,
      totalHeight: 0
    };
  }

  const safeViewport = Math.max(safeItemHeight, viewportHeight);
  const maxScrollTop = Math.max(0, totalHeight - safeViewport);
  const clampedScrollTop = Math.max(0, Math.min(scrollTop, maxScrollTop));
  const safeOverscan = Math.max(0, Math.floor(overscan));

  const firstVisible = Math.floor(clampedScrollTop / safeItemHeight);
  const visibleCount = Math.ceil(safeViewport / safeItemHeight);

  const startIndex = Math.max(0, firstVisible - safeOverscan);
  const endIndex = Math.min(safeCount, firstVisible + visibleCount + safeOverscan);

  const topSpacerHeight = startIndex * safeItemHeight;
  const bottomSpacerHeight = Math.max(0, (safeCount - endIndex) * safeItemHeight);

  return {
    startIndex,
    endIndex,
    topSpacerHeight,
    bottomSpacerHeight,
    totalHeight
  };
}
