export interface ReaderAnchor {
  chapterIndex: number;
  paragraphIndex: number;
  characterOffset: number;
  percentage: number;
}

export interface ReaderLayoutBounds {
  chapterCount: number;
  paragraphCount: number;
  paragraphLength?: number;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, Number.isFinite(value) ? value : min));
}

export function captureReaderAnchor(anchor: Partial<ReaderAnchor>): ReaderAnchor {
  return {
    chapterIndex: Math.max(0, Math.trunc(anchor.chapterIndex ?? 0)),
    paragraphIndex: Math.max(0, Math.trunc(anchor.paragraphIndex ?? 0)),
    characterOffset: Math.max(0, Math.trunc(anchor.characterOffset ?? 0)),
    percentage: clamp(anchor.percentage ?? 0, 0, 100),
  };
}

export function restoreReaderAnchor(
  anchor: ReaderAnchor,
  layout: ReaderLayoutBounds,
): Omit<ReaderAnchor, "percentage"> {
  return {
    chapterIndex: clamp(anchor.chapterIndex, 0, Math.max(0, layout.chapterCount - 1)),
    paragraphIndex: clamp(anchor.paragraphIndex, 0, Math.max(0, layout.paragraphCount - 1)),
    characterOffset: clamp(anchor.characterOffset, 0, Math.max(0, layout.paragraphLength ?? anchor.characterOffset)),
  };
}
