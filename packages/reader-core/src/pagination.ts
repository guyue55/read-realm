function clampOffset(offset: number, maxOffset: number): number {
  if (!Number.isFinite(offset)) return 0;
  return Math.max(0, Math.min(Math.max(0, maxOffset), offset));
}

export function getPaginationStep(
  containerWidth: number,
  contentWidth?: number,
  columnGap = 0,
): number {
  const baseWidth =
    Number.isFinite(contentWidth) && contentWidth && contentWidth > 0
      ? contentWidth
      : containerWidth;
  const safeGap = Number.isFinite(columnGap) && columnGap > 0 ? columnGap : 0;
  return Math.max(1, baseWidth + safeGap);
}

export function getSnappedPaginationOffset(
  offset: number,
  pageStep: number,
  maxOffset: number,
): number {
  if (!Number.isFinite(pageStep) || pageStep <= 0) {
    return clampOffset(offset, maxOffset);
  }
  const snappedOffset = Math.round(offset / pageStep) * pageStep;
  return clampOffset(snappedOffset, maxOffset);
}

export function getNextPaginationOffset(
  currentOffset: number,
  pageStep: number,
  maxOffset: number,
): number {
  if (!Number.isFinite(pageStep) || pageStep <= 0) {
    return clampOffset(currentOffset, maxOffset);
  }
  const currentPage = Math.floor(Math.max(0, currentOffset) / pageStep);
  return clampOffset((currentPage + 1) * pageStep, maxOffset);
}

export function getPreviousPaginationOffset(
  currentOffset: number,
  pageStep: number,
  maxOffset: number,
): number {
  if (!Number.isFinite(pageStep) || pageStep <= 0) {
    return clampOffset(currentOffset, maxOffset);
  }
  const currentPage = Math.ceil(Math.max(0, currentOffset) / pageStep);
  return clampOffset((currentPage - 1) * pageStep, maxOffset);
}
