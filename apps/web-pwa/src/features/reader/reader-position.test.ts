import { describe, expect, it } from "vitest";
import { captureReaderAnchor, restoreReaderAnchor } from "./reader-position";

describe("reader position", () => {
  it("restores a paragraph anchor after layout changes", () => {
    const anchor = captureReaderAnchor({ chapterIndex: 4, paragraphIndex: 12, characterOffset: 8, percentage: 42.5 });
    expect(restoreReaderAnchor(anchor, { chapterCount: 10, paragraphCount: 30, paragraphLength: 60 })).toEqual({
      chapterIndex: 4,
      paragraphIndex: 12,
      characterOffset: 8,
    });
  });

  it("clamps stale anchors to the current document bounds", () => {
    const anchor = captureReaderAnchor({ chapterIndex: 20, paragraphIndex: 40, characterOffset: 80, percentage: 140 });
    expect(anchor.percentage).toBe(100);
    expect(restoreReaderAnchor(anchor, { chapterCount: 3, paragraphCount: 5, paragraphLength: 12 })).toEqual({
      chapterIndex: 2,
      paragraphIndex: 4,
      characterOffset: 12,
    });
  });
});
