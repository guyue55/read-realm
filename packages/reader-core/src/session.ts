import {
  BookmarkSchema,
  ReaderSettingsSchema,
  ReadingProgressSchema,
  type Bookmark,
  type ReaderSettings,
  type ReadingProgress,
} from "@reader/shared-types";
import type { ChapterData, ChapterRepository } from "./engine.js";

export type { ChapterRepository } from "./engine.js";

export interface ReaderSessionRepository {
  getProgress(bookId: string): Promise<ReadingProgress | null>;
  saveProgress(progress: ReadingProgress): Promise<void>;
  getSettings(): Promise<ReaderSettings>;
  saveSettings(settings: ReaderSettings): Promise<void>;
  getBookmarks(bookId: string): Promise<Bookmark[]>;
}

export interface ReaderSessionSnapshot {
  bookId: string;
  chapter: ChapterData;
  progress: ReadingProgress;
  settings: ReaderSettings;
  bookmarks: Bookmark[];
}

export interface ReaderPositionInput {
  offset?: number;
  paragraphIndex?: number;
  characterOffset?: number;
  offsetRatio?: number;
}

export interface ReaderSessionOptions {
  now?: () => string;
}

const defaultSettings: ReaderSettings = ReaderSettingsSchema.parse({
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

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, Number.isFinite(value) ? value : min));
}

function normalizeSettings(settings: ReaderSettings): ReaderSettings {
  return ReaderSettingsSchema.parse({
    ...settings,
    fontSize: clamp(settings.fontSize, 14, 36),
    lineHeight: clamp(settings.lineHeight, 1.2, 2.5),
    paragraphSpacing: clamp(settings.paragraphSpacing, 0, 40),
    letterSpacing: clamp(settings.letterSpacing, -0.05, 0.25),
  });
}

export class ReaderSession {
  private snapshot: ReaderSessionSnapshot | null = null;
  private readonly now: () => string;

  constructor(
    private readonly bookId: string,
    private readonly chapterRepo: ChapterRepository,
    private readonly sessionRepo: ReaderSessionRepository,
    options: ReaderSessionOptions = {},
  ) {
    this.now = options.now ?? (() => new Date().toISOString());
  }

  getSnapshot(): ReaderSessionSnapshot | null {
    return this.snapshot ? structuredClone(this.snapshot) : null;
  }

  belongsTo(bookId: string): boolean {
    return this.bookId === bookId;
  }

  async load(): Promise<ReaderSessionSnapshot> {
    const [storedProgress, storedSettings, storedBookmarks, chapterCount] = await Promise.all([
      this.sessionRepo.getProgress(this.bookId),
      this.sessionRepo.getSettings(),
      this.sessionRepo.getBookmarks(this.bookId),
      this.chapterRepo.getChapterCount(this.bookId),
    ]);
    const targetChapterIndex = Math.max(0, Math.trunc(storedProgress?.chapterIndex ?? 0));
    if (targetChapterIndex >= chapterCount) {
      throw new Error(`READER_CHAPTER_OUT_OF_RANGE:${targetChapterIndex}/${chapterCount}`);
    }
    const chapter = await this.chapterRepo.getChapter(this.bookId, targetChapterIndex);
    if (!chapter) throw new Error(`READER_CHAPTER_NOT_FOUND:${targetChapterIndex}`);
    const progress = storedProgress
      ? ReadingProgressSchema.parse(storedProgress)
      : this.buildProgress(chapter, {}, chapterCount);
    this.snapshot = {
      bookId: this.bookId,
      chapter,
      progress,
      settings: normalizeSettings(storedSettings ?? defaultSettings),
      bookmarks: storedBookmarks.map((bookmark) => BookmarkSchema.parse(bookmark)),
    };
    return this.requireSnapshot();
  }

  async goToChapter(
    chapterIndex: number,
    position: ReaderPositionInput = {},
  ): Promise<ReaderSessionSnapshot> {
    this.requireSnapshot();
    const normalizedIndex = Math.max(0, Math.trunc(chapterIndex));
    const chapter = await this.chapterRepo.getChapter(this.bookId, normalizedIndex);
    if (!chapter) throw new Error(`READER_CHAPTER_NOT_FOUND:${normalizedIndex}`);
    return this.savePosition(chapter, position);
  }

  async savePosition(
    chapter: ChapterData,
    position: ReaderPositionInput = {},
  ): Promise<ReaderSessionSnapshot> {
    this.requireSnapshot();
    const chapterCount = await this.chapterRepo.getChapterCount(this.bookId);
    const progress = this.buildProgress(chapter, position, chapterCount);
    await this.sessionRepo.saveProgress(progress);
    this.snapshot = { ...this.snapshot!, chapter: { ...chapter }, progress };
    return this.requireSnapshot();
  }

  trackPosition(
    chapter: ChapterData,
    position: ReaderPositionInput,
    chapterCount: number,
  ): ReadingProgress {
    if (!this.snapshot) throw new Error("READER_SESSION_NOT_LOADED");
    const progress = this.buildProgress(chapter, position, chapterCount);
    this.snapshot = { ...this.snapshot, chapter: { ...chapter }, progress };
    return { ...progress };
  }

  async nextChapter(position: ReaderPositionInput = {}): Promise<ReaderSessionSnapshot> {
    const current = this.requireSnapshot();
    const count = await this.chapterRepo.getChapterCount(this.bookId);
    if (current.chapter.index + 1 >= count) throw new Error("READER_END_OF_BOOK");
    return this.goToChapter(current.chapter.index + 1, position);
  }

  async previousChapter(position: ReaderPositionInput = {}): Promise<ReaderSessionSnapshot> {
    const current = this.requireSnapshot();
    if (current.chapter.index <= 0) throw new Error("READER_START_OF_BOOK");
    return this.goToChapter(current.chapter.index - 1, position);
  }

  async updateSettings(patch: Partial<ReaderSettings>): Promise<ReaderSessionSnapshot> {
    const current = this.requireSnapshot();
    const settings = normalizeSettings({ ...current.settings, ...patch });
    this.snapshot = { ...current, settings };
    const result = this.requireSnapshot();
    await this.sessionRepo.saveSettings(settings);
    return result;
  }

  replaceBookmarks(bookmarks: Bookmark[]): ReaderSessionSnapshot {
    const current = this.requireSnapshot();
    this.snapshot = {
      ...current,
      bookmarks: bookmarks.map((bookmark) => BookmarkSchema.parse(bookmark)),
    };
    return this.requireSnapshot();
  }

  private buildProgress(
    chapter: ChapterData,
    position: ReaderPositionInput,
    chapterCount: number,
  ): ReadingProgress {
    if (!Number.isInteger(chapter.index) || chapter.index < 0 || chapter.index >= chapterCount) {
      throw new Error(`READER_CHAPTER_OUT_OF_RANGE:${chapter.index}/${chapterCount}`);
    }
    const ratio = clamp(position.offsetRatio ?? 0, 0, 1);
    const percentage = chapterCount <= 0
      ? 0
      : clamp(((chapter.index + ratio) / chapterCount) * 100, 0, 100);
    return ReadingProgressSchema.parse({
      bookId: this.bookId,
      chapterId: chapter.id,
      chapterIndex: chapter.index,
      offset: Math.max(0, position.offset ?? 0),
      percentage,
      updatedAt: this.now(),
      ...(position.paragraphIndex === undefined
        ? {}
        : { paragraphIndex: Math.max(0, Math.trunc(position.paragraphIndex)) }),
      ...(position.characterOffset === undefined
        ? {}
        : { characterOffset: Math.max(0, Math.trunc(position.characterOffset)) }),
    });
  }

  private requireSnapshot(): ReaderSessionSnapshot {
    if (!this.snapshot) throw new Error("READER_SESSION_NOT_LOADED");
    return structuredClone(this.snapshot);
  }
}
