import { describe, expect, it, vi } from "vitest";
import type { Bookmark, ReaderSettings, ReadingProgress } from "@reader/shared-types";
import {
  ReaderSession,
  type ChapterRepository,
  type ReaderSessionRepository,
} from "./session";

const chapters = [
  { id: "chapter-0", index: 0, title: "第一章", content: "第一章正文" },
  { id: "chapter-1", index: 1, title: "第二章", content: "第二章正文" },
];

const settings: ReaderSettings = {
  fontFamily: "songti",
  fontSize: 20,
  lineHeight: 1.8,
  theme: "paper",
  pageMode: "pagination",
  uiMode: "simple",
  paragraphSpacing: 18,
  letterSpacing: 0.04,
  autoFlipAtBottom: false,
};

function createRepositories(overrides: Partial<ReaderSessionRepository> = {}) {
  const chapterRepo: ChapterRepository = {
    getChapter: vi.fn(async (_bookId, index) => chapters[index] ?? null),
    getChapterCount: vi.fn(async () => chapters.length),
  };
  const sessionRepo: ReaderSessionRepository = {
    getProgress: vi.fn(async (): Promise<ReadingProgress | null> => ({
      bookId: "book-1",
      chapterId: "chapter-1",
      chapterIndex: 1,
      offset: 480,
      percentage: 75,
      paragraphIndex: 6,
      characterOffset: 12,
      updatedAt: "2026-08-14T00:00:00.000Z",
    })),
    saveProgress: vi.fn(async () => undefined),
    getSettings: vi.fn(async () => settings),
    saveSettings: vi.fn(async () => undefined),
    getBookmarks: vi.fn(async (): Promise<Bookmark[]> => [{
      id: "bookmark-1",
      bookId: "book-1",
      chapterIndex: 1,
      offset: 480,
      createdAt: "2026-08-14T00:00:00.000Z",
    }]),
    ...overrides,
  };
  return { chapterRepo, sessionRepo };
}

describe("ReaderSession", () => {
  it("exposes its book identity for stale callback guards", () => {
    const { chapterRepo, sessionRepo } = createRepositories();
    const session = new ReaderSession("book-1", chapterRepo, sessionRepo);

    expect(session.belongsTo("book-1")).toBe(true);
    expect(session.belongsTo("book-2")).toBe(false);
  });

  it("loads one coherent snapshot from progress, chapter, settings and bookmarks", async () => {
    const { chapterRepo, sessionRepo } = createRepositories();
    const session = new ReaderSession("book-1", chapterRepo, sessionRepo);

    const snapshot = await session.load();

    expect(snapshot).toEqual({
      bookId: "book-1",
      chapter: chapters[1],
      progress: expect.objectContaining({ chapterIndex: 1, offset: 480 }),
      settings,
      bookmarks: [expect.objectContaining({ id: "bookmark-1" })],
    });
    expect(chapterRepo.getChapter).toHaveBeenCalledWith("book-1", 1);
  });

  it("changes chapter and persists exactly once with a semantic anchor", async () => {
    const { chapterRepo, sessionRepo } = createRepositories();
    const session = new ReaderSession("book-1", chapterRepo, sessionRepo, {
      now: () => "2026-08-14T00:01:00.000Z",
    });
    await session.load();

    const snapshot = await session.goToChapter(0, {
      offset: 128,
      paragraphIndex: 2,
      characterOffset: 7,
      offsetRatio: 0.5,
    });

    expect(snapshot.chapter).toEqual(chapters[0]);
    expect(snapshot.progress).toEqual({
      bookId: "book-1",
      chapterId: "chapter-0",
      chapterIndex: 0,
      offset: 128,
      paragraphIndex: 2,
      characterOffset: 7,
      percentage: 25,
      updatedAt: "2026-08-14T00:01:00.000Z",
    });
    expect(sessionRepo.saveProgress).toHaveBeenCalledTimes(1);
  });

  it("commits the rendered position without fetching the chapter again", async () => {
    const { chapterRepo, sessionRepo } = createRepositories();
    const session = new ReaderSession("book-1", chapterRepo, sessionRepo, {
      now: () => "2026-08-14T00:02:00.000Z",
    });
    await session.load();
    vi.mocked(chapterRepo.getChapter).mockClear();

    const snapshot = await session.savePosition(chapters[0]!, {
      offset: 256,
      paragraphIndex: 4,
      characterOffset: 9,
      offsetRatio: 0.25,
    });

    expect(snapshot.chapter).toEqual(chapters[0]);
    expect(snapshot.progress).toEqual(expect.objectContaining({
      chapterIndex: 0,
      offset: 256,
      paragraphIndex: 4,
      characterOffset: 9,
      percentage: 12.5,
    }));
    expect(chapterRepo.getChapter).not.toHaveBeenCalled();
    expect(sessionRepo.saveProgress).toHaveBeenCalledTimes(1);
  });

  it("tracks frequent scroll positions without an extra persistence write", async () => {
    const { chapterRepo, sessionRepo } = createRepositories();
    const session = new ReaderSession("book-1", chapterRepo, sessionRepo, {
      now: () => "2026-08-14T00:03:00.000Z",
    });
    await session.load();

    const progress = session.trackPosition(chapters[0]!, {
      offset: 320,
      offsetRatio: 0.75,
    }, 2);

    expect(progress).toEqual(expect.objectContaining({
      chapterIndex: 0,
      offset: 320,
      percentage: 37.5,
    }));
    expect(session.getSnapshot()?.progress).toEqual(progress);
    expect(sessionRepo.saveProgress).not.toHaveBeenCalled();
  });

  it("keeps the current snapshot when an unavailable chapter is requested", async () => {
    const { chapterRepo, sessionRepo } = createRepositories();
    const session = new ReaderSession("book-1", chapterRepo, sessionRepo);
    const before = await session.load();

    await expect(session.goToChapter(3)).rejects.toThrow("READER_CHAPTER_NOT_FOUND:3");
    expect(session.getSnapshot()).toEqual(before);
    expect(sessionRepo.saveProgress).not.toHaveBeenCalled();
  });

  it("persists one normalized settings snapshot per update", async () => {
    const { chapterRepo, sessionRepo } = createRepositories();
    const session = new ReaderSession("book-1", chapterRepo, sessionRepo);
    await session.load();

    const snapshot = await session.updateSettings({ fontSize: 48, pageMode: "scroll" });

    expect(snapshot.settings.fontSize).toBe(36);
    expect(snapshot.settings.pageMode).toBe("scroll");
    expect(sessionRepo.saveSettings).toHaveBeenCalledTimes(1);
    expect(sessionRepo.saveSettings).toHaveBeenCalledWith(snapshot.settings);
  });

  it("delegates rapid settings writes immediately and derives each from the latest snapshot", async () => {
    const delegated: ReaderSettings[] = [];
    const { chapterRepo, sessionRepo } = createRepositories({
      saveSettings: vi.fn(async (nextSettings) => {
        delegated.push(nextSettings);
      }),
    });
    const session = new ReaderSession("book-1", chapterRepo, sessionRepo);
    await session.load();

    const fontWrite = session.updateSettings({ fontSize: 22 });
    const spacingWrite = session.updateSettings({ lineHeight: 2.1 });

    expect(session.getSnapshot()?.settings).toEqual(expect.objectContaining({
      fontSize: 22,
      lineHeight: 2.1,
    }));
    await Promise.all([fontWrite, spacingWrite]);

    expect(delegated).toHaveLength(2);
    expect(delegated[0]).toEqual(expect.objectContaining({ fontSize: 22, lineHeight: 1.8 }));
    expect(delegated[1]).toEqual(expect.objectContaining({ fontSize: 22, lineHeight: 2.1 }));
  });
});
