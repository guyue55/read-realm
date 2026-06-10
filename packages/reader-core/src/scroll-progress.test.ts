import { describe, expect, it } from "vitest";
import {
  getChapterAbsoluteOffset,
  getChapterOffsetRatio,
  getChapterRelativeOffset,
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
});
