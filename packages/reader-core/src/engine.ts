import type { ReadingProgress, ReaderSettings } from '@reader/shared-types';

export interface ChapterData {
  id: string;
  index: number;
  title: string;
  content: string;
}

export interface ChapterRepository {
  getChapter(bookId: string, chapterIndex: number): Promise<ChapterData | null>;
  getChapterCount(bookId: string): Promise<number>;
}

export interface ProgressRepository {
  getProgress(bookId: string): Promise<ReadingProgress | null>;
  saveProgress(progress: ReadingProgress): Promise<void>;
}

export class ReaderEngine {
  private bookId: string;
  private currentChapter: ChapterData | null = null;
  private progress: ReadingProgress | null = null;
  private settings: ReaderSettings = {
    fontFamily: 'sans-serif',
    fontSize: 18,
    lineHeight: 1.7,
    theme: 'paper',
    pageMode: 'scroll',
    uiMode: 'default'
  };

  // Cache for instant navigation (LRU-like approach)
  private cache = new Map<number, ChapterData>();
  private readonly MAX_CACHE_SIZE = 5;

  constructor(
    bookId: string,
    private chapterRepo: ChapterRepository,
    private progressRepo: ProgressRepository
  ) {
    this.bookId = bookId;
  }

  getSettings(): ReaderSettings {
    return { ...this.settings };
  }

  updateSettings(newSettings: Partial<ReaderSettings>): void {
    this.settings = {
      ...this.settings,
      ...newSettings
    };
  }

  async load(): Promise<void> {
    this.progress = await this.progressRepo.getProgress(this.bookId);
    const targetIndex = this.progress ? this.progress.chapterIndex : 0;
    await this.loadChapter(targetIndex);
  }

  private async fetchChapter(index: number): Promise<ChapterData | null> {
    if (this.cache.has(index)) {
      return this.cache.get(index) || null;
    }
    const data = await this.chapterRepo.getChapter(this.bookId, index);
    if (data) {
      if (this.cache.size >= this.MAX_CACHE_SIZE) {
        // Remove the oldest entry (Map iterates in insertion order)
        const firstKey = this.cache.keys().next().value;
        if (firstKey !== undefined) {
          this.cache.delete(firstKey);
        }
      }
      this.cache.set(index, data);
    }
    return data;
  }

  // Preloads adjacent chapters in the background
  private preloadAdjacent(index: number): void {
    Promise.all([
      this.fetchChapter(index + 1),
      index > 0 ? this.fetchChapter(index - 1) : Promise.resolve(null)
    ]).catch((err) => {
      console.warn("Preload failed", err);
    });
  }

  async loadChapter(index: number): Promise<void> {
    this.currentChapter = await this.fetchChapter(index);
    if (this.currentChapter) {
      this.preloadAdjacent(index);
    }
  }

  getCurrentChapter(): ChapterData | null {
    return this.currentChapter;
  }

  async nextChapter(): Promise<boolean> {
    if (!this.currentChapter) return false;
    const count = await this.chapterRepo.getChapterCount(this.bookId);
    if (this.currentChapter.index + 1 < count) {
      await this.loadChapter(this.currentChapter.index + 1);
      return true;
    }
    return false;
  }

  async previousChapter(): Promise<boolean> {
    if (!this.currentChapter || this.currentChapter.index <= 0) return false;
    await this.loadChapter(this.currentChapter.index - 1);
    return true;
  }
}
