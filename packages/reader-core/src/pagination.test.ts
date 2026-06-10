import { describe, expect, it } from "vitest";
import {
  getNextPaginationOffset,
  getPaginationStep,
  getPreviousPaginationOffset,
  getSnappedPaginationOffset,
} from "./pagination";

describe("pagination helpers", () => {
  it("uses content column width plus gap as the page step when available", () => {
    expect(getPaginationStep(1200, 700, 48)).toBe(748);
  });

  it("falls back to the visible container width when content width is unavailable", () => {
    expect(getPaginationStep(960, undefined, 48)).toBe(1008);
    expect(getPaginationStep(960, 0, 0)).toBe(960);
  });

  it("snaps progress restoration to pagination columns", () => {
    expect(getSnappedPaginationOffset(760, 748, 3000)).toBe(748);
    expect(getSnappedPaginationOffset(2990, 748, 2800)).toBe(2800);
  });

  it("advances and reverses by one page from partially settled offsets", () => {
    expect(getNextPaginationOffset(100, 748, 3000)).toBe(748);
    expect(getNextPaginationOffset(800, 748, 3000)).toBe(1496);
    expect(getPreviousPaginationOffset(800, 748, 3000)).toBe(748);
    expect(getPreviousPaginationOffset(100, 748, 3000)).toBe(0);
  });
});
