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
