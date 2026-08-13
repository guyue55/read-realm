export function clampRatio(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, value));
}

export function getChapterRelativeOffset(
  containerOffset: number,
  chapterOffset: number,
): number {
  if (!Number.isFinite(containerOffset) || !Number.isFinite(chapterOffset)) {
    return 0;
  }
  return Math.max(0, containerOffset - chapterOffset);
}

export function getChapterOffsetRatio(
  relativeOffset: number,
  chapterExtent: number,
  viewportExtent: number,
): number {
  const maxOffset = Math.max(0, chapterExtent - viewportExtent);
  if (maxOffset <= 0) return 0;
  return clampRatio(relativeOffset / maxOffset);
}

export function getChapterAbsoluteOffset(
  chapterOffset: number,
  relativeOffset: number,
): number {
  return Math.max(0, chapterOffset + Math.max(0, relativeOffset));
}

export function getScrollChapterWindow(
  activeChapterIndex: number,
  chapterCount: number,
  radius = 1,
): number[] {
  const count = Math.max(0, Math.trunc(chapterCount));
  if (count === 0) return [];
  const active = Math.max(0, Math.min(count - 1, Math.trunc(activeChapterIndex)));
  const safeRadius = Math.max(0, Math.trunc(radius));
  const start = Math.max(0, active - safeRadius);
  const end = Math.min(count - 1, active + safeRadius);
  return Array.from({ length: end - start + 1 }, (_, offset) => start + offset);
}

export function compensateScrollOffset(
  scrollOffset: number,
  previousAnchorOffset: number,
  nextAnchorOffset: number,
): number {
  if (
    !Number.isFinite(scrollOffset) ||
    !Number.isFinite(previousAnchorOffset) ||
    !Number.isFinite(nextAnchorOffset)
  ) {
    return 0;
  }
  return Math.max(0, scrollOffset + nextAnchorOffset - previousAnchorOffset);
}
