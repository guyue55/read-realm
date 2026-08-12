import type { ImportTask } from "@reader/storage-core";

type StreamingChapter = { title?: string; content: string };

export type StreamingImportMessage =
  | {
      type: "METADATA";
      success: true;
      title: string;
      chapterCount: number;
    }
  | {
      type: "CHUNK";
      success: true;
      startIndex: number;
      chapters: StreamingChapter[];
      isFinished: boolean;
    }
  | { type: "FINISHED"; success: true }
  | { success: false; error: string };

export interface StreamingImportSessionOptions {
  filename: string;
  format: "txt" | "epub";
  createId: () => string;
  now?: () => string;
  saveTask: (task: ImportTask) => Promise<void>;
}

export type StreamingImportSessionResult =
  | { state: "collecting"; receivedChapterCount: number }
  | { state: "completed"; taskId: string };

export function createStreamingImportSession({
  filename,
  format,
  createId,
  now = () => new Date().toISOString(),
  saveTask,
}: StreamingImportSessionOptions) {
  const taskId = createId();
  const bookId = createId();
  const createdAt = now();
  let metadata: { title: string; chapterCount: number } | null = null;
  const chaptersByIndex = new Map<number, StreamingChapter>();
  let completed: StreamingImportSessionResult | null = null;
  let failed = false;

  return {
    async accept(
      message: StreamingImportMessage,
    ): Promise<StreamingImportSessionResult> {
      if (completed) return completed;
      if (failed) throw new Error("STREAMING_IMPORT_SESSION_FAILED");
      if (!message.success) {
        failed = true;
        throw new Error(`STREAMING_IMPORT_WORKER_FAILED:${message.error}`);
      }

      if (message.type === "METADATA") {
        if (!Number.isInteger(message.chapterCount) || message.chapterCount <= 0) {
          failed = true;
          throw new Error("STREAMING_IMPORT_INVALID_CHAPTER_COUNT");
        }
        metadata = {
          title: message.title.trim() || filename.replace(/\.[^/.]+$/, ""),
          chapterCount: message.chapterCount,
        };
        return { state: "collecting", receivedChapterCount: chaptersByIndex.size };
      }

      if (!metadata) {
        failed = true;
        throw new Error("STREAMING_IMPORT_METADATA_REQUIRED");
      }

      if (message.type === "CHUNK") {
        for (const [offset, chapter] of message.chapters.entries()) {
          const index = message.startIndex + offset;
          if (
            index < 0 ||
            index >= metadata.chapterCount ||
            chaptersByIndex.has(index)
          ) {
            failed = true;
            throw new Error(`STREAMING_IMPORT_CHAPTER_INDEX_INVALID:${index}`);
          }
          chaptersByIndex.set(index, chapter);
        }
        return { state: "collecting", receivedChapterCount: chaptersByIndex.size };
      }

      if (chaptersByIndex.size !== metadata.chapterCount) {
        failed = true;
        throw new Error(
          `STREAMING_IMPORT_CHAPTERS_INCOMPLETE:${chaptersByIndex.size}:${metadata.chapterCount}`,
        );
      }

      const chapters = Array.from({ length: metadata.chapterCount }, (_, index) => {
        const chapter = chaptersByIndex.get(index);
        if (!chapter) throw new Error(`STREAMING_IMPORT_CHAPTER_MISSING:${index}`);
        return {
          id: createId(),
          bookId,
          index,
          title: chapter.title?.trim() || `第 ${index + 1} 章`,
          content: chapter.content,
          wordCount: chapter.content.length,
          createdAt,
          updatedAt: createdAt,
        };
      });
      const task: ImportTask = {
        id: taskId,
        bookMetadata: {
          id: bookId,
          title: metadata.title,
          sourceType: "upload",
          format,
          status: "to_read",
          tags: [],
          chapterCount: metadata.chapterCount,
          wordCount: chapters.reduce((total, chapter) => total + chapter.content.length, 0),
          createdAt,
          updatedAt: createdAt,
        },
        chapters,
        createdAt,
      };

      await saveTask(task);
      completed = { state: "completed", taskId };
      return completed;
    },
  };
}
