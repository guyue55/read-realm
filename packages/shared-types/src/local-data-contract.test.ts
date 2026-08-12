import { describe, expect, it } from "vitest";
import * as sharedTypes from "./index";

const fixedSnapshot = {
  kind: "read-realm-local-snapshot",
  schemaVersion: 1,
  createdAt: "2026-08-13T03:30:00+08:00",
  source: {
    appVersion: "0.1.0",
    databaseVersion: 9,
  },
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
    progress: [
      {
        bookId: "book-1",
        chapterId: "book-1:0",
        chapterIndex: 0,
        offset: 8,
        percentage: 0.5,
        updatedAt: "2026-08-13T03:20:00+08:00",
      },
    ],
    bookmarks: [
      {
        id: "bookmark-1",
        bookId: "book-1",
        chapterIndex: 0,
        offset: 8,
        contentPreview: "林舟推开了窗",
        createdAt: "2026-08-13T03:20:00+08:00",
      },
    ],
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
    fileRefs: [
      {
        id: "file-1",
        bookId: "book-1",
        sourceType: "manual_upload",
        relativePath: "短篇测试.txt",
        format: "txt",
        size: 42,
        quickFingerprint: "size:42:mtime:1786546800000",
      },
    ],
  },
} as const;

describe("local data contract", () => {
  it("parses one complete v1 snapshot without dropping a core collection", () => {
    const schema = (
      sharedTypes as unknown as {
        LocalDataSnapshotEnvelopeSchema?: {
          parse(value: unknown): typeof fixedSnapshot;
        };
      }
    ).LocalDataSnapshotEnvelopeSchema;

    expect(schema).toBeDefined();
    const parsed = schema!.parse(fixedSnapshot);

    expect(Object.keys(parsed.data).sort()).toEqual([
      "bookmarks",
      "books",
      "chapters",
      "fileRefs",
      "progress",
      "settings",
    ]);
    expect(parsed.data.chapters[0]?.content).toBe("清晨，林舟推开了窗。");
    expect(parsed.data.fileRefs[0]?.relativePath).toBe("短篇测试.txt");
    expect(parsed.data.settings).toEqual(fixedSnapshot.data.settings);
  });

  it("rejects an orphaned chapter before restore can write partial data", () => {
    const orphaned = {
      ...fixedSnapshot,
      data: {
        ...fixedSnapshot.data,
        chapters: [
          {
            ...fixedSnapshot.data.chapters[0],
            bookId: "missing-book",
          },
        ],
      },
    };

    expect(() =>
      sharedTypes.LocalDataSnapshotEnvelopeSchema.parse(orphaned),
    ).toThrow("章节引用了不存在的书籍");
  });

  it("rejects orphaned reading progress before restore", () => {
    const orphaned = {
      ...fixedSnapshot,
      data: {
        ...fixedSnapshot.data,
        progress: [
          {
            ...fixedSnapshot.data.progress[0],
            bookId: "missing-book",
          },
        ],
      },
    };

    expect(() =>
      sharedTypes.LocalDataSnapshotEnvelopeSchema.parse(orphaned),
    ).toThrow("阅读进度引用了不存在的书籍");
  });

  it("rejects an orphaned bookmark before restore", () => {
    const orphaned = {
      ...fixedSnapshot,
      data: {
        ...fixedSnapshot.data,
        bookmarks: [
          {
            ...fixedSnapshot.data.bookmarks[0],
            bookId: "missing-book",
          },
        ],
      },
    };

    expect(() =>
      sharedTypes.LocalDataSnapshotEnvelopeSchema.parse(orphaned),
    ).toThrow("书签引用了不存在的书籍");
  });

  it("rejects an orphaned file reference before restore", () => {
    const orphaned = {
      ...fixedSnapshot,
      data: {
        ...fixedSnapshot.data,
        fileRefs: [
          {
            ...fixedSnapshot.data.fileRefs[0],
            bookId: "missing-book",
          },
        ],
      },
    };

    expect(() =>
      sharedTypes.LocalDataSnapshotEnvelopeSchema.parse(orphaned),
    ).toThrow("文件引用了不存在的书籍");
  });

  it("rejects a file reference whose format is missing", () => {
    const { format: _format, ...withoutFormat } = fixedSnapshot.data.fileRefs[0];
    const malformed = {
      ...fixedSnapshot,
      data: {
        ...fixedSnapshot.data,
        fileRefs: [withoutFormat],
      },
    };

    expect(() =>
      sharedTypes.LocalDataSnapshotEnvelopeSchema.parse(malformed),
    ).toThrow();
  });

  it("rejects progress whose chapter anchor is missing", () => {
    const orphaned = {
      ...fixedSnapshot,
      data: {
        ...fixedSnapshot.data,
        progress: [
          {
            ...fixedSnapshot.data.progress[0],
            chapterId: "book-1:missing",
          },
        ],
      },
    };

    expect(() =>
      sharedTypes.LocalDataSnapshotEnvelopeSchema.parse(orphaned),
    ).toThrow("阅读进度引用了不存在的章节");
  });
});
