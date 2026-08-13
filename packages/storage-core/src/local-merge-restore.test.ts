import { describe, expect, it } from "vitest";
import type { LocalDataSnapshotData } from "@reader/shared-types";
import { buildLocalDataMergePlan } from "./local-merge-restore";

function data(title: string): LocalDataSnapshotData {
  return {
    books: [{
      id: "book-1",
      title,
      sourceType: "upload",
      format: "txt",
      status: "reading",
      tags: [],
      chapterCount: 1,
      createdAt: "2026-08-13T20:00:00+08:00",
      updatedAt: "2026-08-13T20:00:00+08:00",
    }],
    chapters: [{ id: "chapter-1", bookId: "book-1", index: 0, title: "第一章", content: "现有正文" }],
    progress: [{
      bookId: "book-1",
      chapterId: "chapter-1",
      chapterIndex: 0,
      offset: 10,
      percentage: 20,
      updatedAt: "2026-08-13T20:01:00+08:00",
    }],
    bookmarks: [{
      id: "bookmark-1",
      bookId: "book-1",
      chapterIndex: 0,
      offset: 10,
      createdAt: "2026-08-13T20:01:00+08:00",
      note: "现有笔记",
    }],
    settings: {
      fontFamily: "kaiti",
      fontSize: 18,
      lineHeight: 1.7,
      theme: "paper",
      pageMode: "scroll",
      uiMode: "default",
      paragraphSpacing: 16,
      letterSpacing: 0.03,
      autoFlipAtBottom: false,
    },
    fileRefs: [],
  };
}

describe("local merge restore plan", () => {
  it("adds new books and their dependent records without conflicts", () => {
    const current = data("现有书");
    const incoming = data("新书");
    incoming.books[0]!.id = "book-2";
    incoming.chapters[0] = { ...incoming.chapters[0]!, id: "chapter-2", bookId: "book-2" };
    incoming.progress[0] = { ...incoming.progress[0]!, bookId: "book-2", chapterId: "chapter-2" };
    incoming.bookmarks[0] = { ...incoming.bookmarks[0]!, id: "bookmark-2", bookId: "book-2" };

    const plan = buildLocalDataMergePlan({ current, incoming });

    expect(plan.executable).toBe(true);
    expect(plan.conflicts).toEqual([]);
    expect(plan.summary).toMatchObject({ addedBooks: 1, addedChapters: 1, addedBookmarks: 1 });
    expect(plan.result?.books.map((book) => book.id)).toEqual(["book-1", "book-2"]);
  });

  it("skips byte-identical records and never duplicates them", () => {
    const current = data("相同书");
    const plan = buildLocalDataMergePlan({ current, incoming: structuredClone(current) });

    expect(plan.executable).toBe(true);
    expect(plan.summary.skippedIdentical).toBeGreaterThanOrEqual(4);
    expect(plan.result).toEqual(current);
  });

  it("treats different object key insertion orders as the same value", () => {
    const current = data("相同书");
    const incoming = structuredClone(current);
    incoming.chapters[0] = {
      content: current.chapters[0]!.content,
      title: current.chapters[0]!.title,
      index: current.chapters[0]!.index,
      bookId: current.chapters[0]!.bookId,
      id: current.chapters[0]!.id,
    };

    const plan = buildLocalDataMergePlan({ current, incoming });

    expect(plan.conflicts).toEqual([]);
    expect(plan.executable).toBe(true);
  });

  it("ignores storage-only fields outside the public snapshot contract", () => {
    const current = data("相同书");
    (current.chapters[0] as unknown as Record<string, unknown>).wordCount = 4;
    (current.books[0] as unknown as Record<string, unknown>).legacyCacheHint = true;
    const incoming = data("相同书");

    const plan = buildLocalDataMergePlan({ current, incoming });

    expect(plan.conflicts).toEqual([]);
    expect(plan.executable).toBe(true);
  });

  it("requires explicit resolutions for divergent IDs and settings", () => {
    const current = data("现有标题");
    const incoming = data("备份标题");
    incoming.chapters[0]!.content = "备份正文";
    incoming.bookmarks[0]!.note = "备份笔记";
    incoming.settings.theme = "dark";

    const blocked = buildLocalDataMergePlan({ current, incoming });
    expect(blocked.executable).toBe(false);
    expect(blocked.result).toBeUndefined();
    expect(blocked.conflicts.map((conflict) => conflict.key)).toEqual([
      "book:book-1",
      "chapter:chapter-1",
      "bookmark:bookmark-1",
      "settings:reader",
    ]);

    const resolved = buildLocalDataMergePlan({
      current,
      incoming,
      resolutions: {
        "book:book-1": "use-incoming",
        "chapter:chapter-1": "keep-existing",
        "bookmark:bookmark-1": "use-incoming",
        "settings:reader": "keep-existing",
      },
    });
    expect(resolved.executable).toBe(true);
    expect(resolved.result?.books[0]?.title).toBe("备份标题");
    expect(resolved.result?.chapters[0]?.content).toBe("现有正文");
    expect(resolved.result?.bookmarks[0]?.note).toBe("备份笔记");
    expect(resolved.result?.settings.theme).toBe("paper");
  });

  it("advances progress only when the incoming timestamp is newer", () => {
    const current = data("同一本书");
    const incoming = structuredClone(current);
    incoming.progress[0] = {
      ...incoming.progress[0]!,
      offset: 90,
      percentage: 90,
      updatedAt: "2026-08-13T20:02:00+08:00",
    };
    expect(buildLocalDataMergePlan({ current, incoming }).result?.progress[0]?.offset).toBe(90);

    incoming.progress[0]!.updatedAt = "2026-08-13T19:59:00+08:00";
    expect(buildLocalDataMergePlan({ current, incoming }).result?.progress[0]?.offset).toBe(10);
  });

  it("rejects a resolution key that is not an actual conflict", () => {
    const current = data("相同书");
    expect(() => buildLocalDataMergePlan({
      current,
      incoming: structuredClone(current),
      resolutions: { "book:not-present": "use-incoming" },
    })).toThrow("LOCAL_DATA_MERGE_UNKNOWN_RESOLUTION:book:not-present");
  });
});
