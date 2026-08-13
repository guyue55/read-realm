import { describe, expect, it } from "vitest";
import {
  getChapterAbsoluteOffset,
  getChapterOffsetRatio,
  getChapterRelativeOffset,
  getScrollChapterWindow,
  compensateScrollOffset,
} from "./scroll-progress";

describe("scroll progress helpers", () => {
  it("stores offsets relative to the active chapter in a stitched scroll container", () => {
    expect(getChapterRelativeOffset(2600, 2200)).toBe(400);
  });

  it("restores a chapter-relative offset back to a stitched container position", () => {
    expect(getChapterAbsoluteOffset(2200, 400)).toBe(2600);
  });

  it("clamps the in-chapter ratio to the active chapter instead of the whole book container", () => {
    expect(getChapterOffsetRatio(400, 1200, 800)).toBe(1);
    expect(getChapterOffsetRatio(200, 1200, 800)).toBe(0.5);
  });

  it("keeps only the active chapter and one adjacent chapter on each side", () => {
    expect(getScrollChapterWindow(50, 100)).toEqual([49, 50, 51]);
    expect(getScrollChapterWindow(0, 100)).toEqual([0, 1]);
    expect(getScrollChapterWindow(99, 100)).toEqual([98, 99]);
  });

  it("compensates scrollTop by the active chapter layout delta", () => {
    expect(compensateScrollOffset(2600, 2200, 900)).toBe(1300);
    expect(compensateScrollOffset(50, 2200, 0)).toBe(0);
  });
});
