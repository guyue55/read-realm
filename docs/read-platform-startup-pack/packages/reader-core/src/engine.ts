import type { ReadingProgress, ReaderSettings } from '@reader/shared-types';

export interface ChapterData {
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
    pageMode: 'scroll'
  };

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

  async loadChapter(index: number): Promise<void> {
    this.currentChapter = await this.chapterRepo.getChapter(this.bookId, index);
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
