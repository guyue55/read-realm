import { describe, expect, it } from "vitest";
import type { LocalDataSnapshotEnvelope } from "@reader/shared-types";
import * as storageCore from "./index";

const snapshot: LocalDataSnapshotEnvelope = {
  kind: "read-realm-local-snapshot",
  schemaVersion: 1,
  createdAt: "2026-08-13T03:30:00+08:00",
  source: { appVersion: "0.1.0", databaseVersion: 9 },
  data: {
    books: [
      {
        id: "book-1",
        title: "短篇测试",
        sourceType: "upload",
        format: "txt",
        status: "reading",
        tags: [],
        chapterCount: 1,
        createdAt: "2026-08-13T03:00:00+08:00",
        updatedAt: "2026-08-13T03:00:00+08:00",
      },
    ],
    chapters: [
      {
        id: "book-1:0",
        bookId: "book-1",
        index: 0,
        title: "第一章",
        content: "清晨，林舟推开了窗。",
      },
    ],
    progress: [],
    bookmarks: [],
    settings: {
      fontFamily: "kaiti",
      fontSize: 18,
      lineHeight: 1.8,
      theme: "paper",
      pageMode: "scroll",
      uiMode: "default",
      paragraphSpacing: 16,
      letterSpacing: 0.03,
      autoFlipAtBottom: false,
    },
    fileRefs: [],
  },
};

describe("local snapshot codec", () => {
  it("round-trips a validated snapshot through a stable JSON boundary", () => {
    const codec = storageCore as unknown as {
      serializeLocalDataSnapshot?: (
        value: LocalDataSnapshotEnvelope,
      ) => string;
      parseLocalDataSnapshot?: (value: string) => LocalDataSnapshotEnvelope;
    };

    expect(codec.serializeLocalDataSnapshot).toBeDefined();
    expect(codec.parseLocalDataSnapshot).toBeDefined();

    const serialized = codec.serializeLocalDataSnapshot!(snapshot);
    expect(serialized).toBe(`${JSON.stringify(snapshot, null, 2)}\n`);
    expect(codec.parseLocalDataSnapshot!(serialized)).toEqual(snapshot);
  });

  it("rejects a future schema version with a stable recovery error", () => {
    const future = JSON.stringify({
      ...snapshot,
      schemaVersion: 2,
    });

    expect(() => storageCore.parseLocalDataSnapshot(future)).toThrow(
      "UNSUPPORTED_LOCAL_DATA_SCHEMA_VERSION:2",
    );
  });
});
