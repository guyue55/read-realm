import { describe, it, expect, vi } from "vitest";
import {
  ReaderEngine,
  type ChapterRepository,
  type ProgressRepository,
} from "./engine";

describe("ReaderEngine Settings", () => {
  const mockChapterRepo: ChapterRepository = {
    getChapter: vi.fn(),
    getChapterCount: vi.fn(),
  };
  const mockProgressRepo: ProgressRepository = {
    getProgress: vi.fn(),
    saveProgress: vi.fn(),
  };

  it("should have default settings", () => {
    const engine = new ReaderEngine(
      "book-1",
      mockChapterRepo,
      mockProgressRepo,
    );
    const settings = engine.getSettings();
    expect(settings).toEqual({
      fontFamily: "sans-serif",
      fontSize: 18,
      lineHeight: 1.7,
      theme: "paper",
      pageMode: "scroll",
      uiMode: "default",
      paragraphSpacing: 16,
      letterSpacing: 0.03,
      autoFlipAtBottom: false,
    });
  });

  it("should update settings", () => {
    const engine = new ReaderEngine(
      "book-1",
      mockChapterRepo,
      mockProgressRepo,
    );
    engine.updateSettings({ fontSize: 20, theme: "dark" });
    const settings = engine.getSettings();
    expect(settings.fontSize).toBe(20);
    expect(settings.theme).toBe("dark");
    expect(settings.fontFamily).toBe("sans-serif"); // unchanged
  });

  it("hydrates a chapter snapshot without fetching it again", async () => {
    const chapterRepo: ChapterRepository = {
      getChapter: vi.fn(async () => null),
      getChapterCount: vi.fn(async () => 1),
    };
    const engine = new ReaderEngine("book-1", chapterRepo, mockProgressRepo);
    const chapter = {
      id: "chapter-3",
      index: 3,
      title: "第四章",
      content: "正文",
    };

    engine.hydrateChapter(chapter);

    expect(engine.getCurrentChapter()).toEqual(chapter);
    expect(chapterRepo.getChapter).not.toHaveBeenCalledWith("book-1", 3);
  });

  it("reads a chapter for a render window without changing the active chapter", async () => {
    const chapterRepo: ChapterRepository = {
      getChapter: vi.fn(async (_bookId, index) => ({
        id: `chapter-${index}`,
        index,
        title: `第 ${index + 1} 章`,
        content: `正文 ${index}`,
      })),
      getChapterCount: vi.fn(async () => 3),
    };
    const engine = new ReaderEngine("book-1", chapterRepo, mockProgressRepo);
    await engine.loadChapter(1);
    const before = engine.getCurrentChapter();

    const prefetched = await engine.getChapter(2);

    expect(prefetched?.index).toBe(2);
    expect(engine.getCurrentChapter()).toEqual(before);
  });

  it("keeps the chapter cache within its hard limit", async () => {
    const getChapter = vi.fn(async (_bookId: string, index: number) => ({
      id: `chapter-${index}`,
      index,
      title: `第 ${index + 1} 章`,
      content: `正文 ${index}`,
    }));
    const chapterRepo: ChapterRepository = {
      getChapter,
      getChapterCount: vi.fn(async () => 10),
    };
    const engine = new ReaderEngine("book-1", chapterRepo, mockProgressRepo);

    for (let index = 0; index < 7; index += 1) {
      await engine.getChapter(index);
    }
    await engine.getChapter(0);

    expect(getChapter.mock.calls.filter(([, index]) => index === 0)).toHaveLength(2);
  });
});
