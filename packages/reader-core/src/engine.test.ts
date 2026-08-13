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
});
