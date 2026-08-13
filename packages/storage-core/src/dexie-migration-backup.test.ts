import { describe, expect, it } from "vitest";

import {
  buildPreUpgradeSnapshot,
  describeLocalDataMigrationError,
} from "./dexie-migration-backup";

const book = {
  id: "book-1",
  title: "上一稳定版",
  sourceType: "upload" as const,
  format: "txt" as const,
  status: "reading" as const,
  tags: [],
  chapterCount: 1,
  createdAt: "2026-08-13T10:00:00+08:00",
  updatedAt: "2026-08-13T10:00:00+08:00",
};

describe("Dexie pre-upgrade backup", () => {
  it("captures the complete v8 reading snapshot before v9 commits", () => {
    const snapshot = buildPreUpgradeSnapshot({
      databaseVersion: 8,
      createdAt: "2026-08-13T10:10:00+08:00",
      books: [book],
      chapters: [{ id: "chapter-1", bookId: book.id, index: 0, title: "第一章", content: "旧数据可读。" }],
      progress: [{
        bookId: book.id,
        chapterId: "chapter-1",
        chapterIndex: 0,
        offset: 6,
        percentage: 10,
        updatedAt: "2026-08-13T10:05:00+08:00",
      }],
      bookmarks: [{
        id: "bookmark-1",
        bookId: book.id,
        chapterIndex: 0,
        offset: 2,
        createdAt: "2026-08-13T10:06:00+08:00",
      }],
      indexedFiles: [{
        id: "file-1",
        sourceId: "source-1",
        name: "legacy.txt",
        relativePath: "legacy.txt",
        kind: "file" as const,
        format: "txt" as const,
        status: "cached" as const,
        bookId: book.id,
        createdAt: "2026-08-13T10:00:00+08:00",
        updatedAt: "2026-08-13T10:00:00+08:00",
      }],
      sources: [{
        id: "source-1",
        name: "本地上传",
        type: "manual_upload" as const,
        rootName: "uploads",
        permissionState: "granted" as const,
        scanMode: "manual" as const,
        createdAt: "2026-08-13T10:00:00+08:00",
        updatedAt: "2026-08-13T10:00:00+08:00",
      }],
      settingsValue: JSON.stringify({
        fontFamily: "kaiti",
        fontSize: 19,
        lineHeight: 1.9,
        theme: "paper",
        pageMode: "scroll",
      }),
    });

    expect(snapshot.source.databaseVersion).toBe(8);
    expect(snapshot.data.books).toEqual([book]);
    expect(snapshot.data.chapters[0]?.content).toBe("旧数据可读。");
    expect(snapshot.data.progress[0]?.chapterId).toBe("chapter-1");
    expect(snapshot.data.bookmarks).toHaveLength(1);
    expect(snapshot.data.fileRefs).toEqual([
      expect.objectContaining({
        id: "file-1",
        bookId: book.id,
        sourceType: "manual_upload",
        relativePath: "legacy.txt",
        format: "txt",
      }),
    ]);
    expect(snapshot.data.settings).toMatchObject({
      fontSize: 19,
      paragraphSpacing: 16,
      letterSpacing: 0.03,
      autoFlipAtBottom: false,
    });
  });

  it("gives non-technical next steps for every migration failure class", () => {
    expect(describeLocalDataMigrationError(new Error("LOCAL_DATA_MIGRATION_FAILED_BEFORE_WRITE:x")))
      .toContain("未改动");
    expect(describeLocalDataMigrationError(new Error("LOCAL_DATA_MIGRATION_FAILED_ROLLED_BACK:x")))
      .toContain("继续阅读");
    expect(describeLocalDataMigrationError(new Error("LOCAL_DATA_MIGRATION_FAILED_ROLLBACK_FAILED:x:y")))
      .toContain("保留备份");
  });

  it("rejects corrupted settings instead of silently replacing user data", () => {
    expect(() => buildPreUpgradeSnapshot({
      databaseVersion: 9,
      createdAt: "2026-08-13T10:10:00+08:00",
      books: [],
      chapters: [],
      progress: [],
      bookmarks: [],
      indexedFiles: [],
      sources: [],
      settingsValue: "{broken-json",
    })).toThrow("LOCAL_DATA_MIGRATION_SETTINGS_INVALID");
  });
});
