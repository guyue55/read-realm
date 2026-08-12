import type { ImportTask } from "@reader/storage-core";
import type { ParsedBook } from "@reader/parser-core/txt-parser";

export interface CompatibleImportStoragePort {
  put(task: ImportTask): Promise<void>;
  get(taskId: string): Promise<ImportTask | undefined>;
  remove(taskId: string): Promise<void>;
}

function describeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map(canonicalJson).join(",")}]`;
  }
  if (value && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, entry]) => entry !== undefined)
      .sort(([left], [right]) => left.localeCompare(right));
    return `{${entries
      .map(([key, entry]) => `${JSON.stringify(key)}:${canonicalJson(entry)}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

export interface BuildCompatibleImportTaskOptions {
  parsedBook: ParsedBook;
  format: "epub";
  createId: () => string;
  now?: () => string;
}

export function buildCompatibleImportTask({
  parsedBook,
  format,
  createId,
  now = () => new Date().toISOString(),
}: BuildCompatibleImportTaskOptions): ImportTask {
  if (parsedBook.chapters.length === 0) {
    throw new Error("COMPATIBLE_IMPORT_EMPTY_BOOK");
  }
  const createdAt = now();
  const taskId = createId();
  const bookId = createId();
  const chapters = parsedBook.chapters.map((chapter, index) => ({
    id: createId(),
    bookId,
    index,
    title: chapter.title.trim() || `第 ${index + 1} 章`,
    content: chapter.content,
  }));
  return {
    id: taskId,
    bookMetadata: {
      id: bookId,
      title: parsedBook.title.trim() || "未命名 EPUB",
      sourceType: "upload",
      format,
      status: "to_read",
      tags: [],
      chapterCount: chapters.length,
      wordCount: chapters.reduce((total, chapter) => total + chapter.content.length, 0),
      createdAt,
      updatedAt: createdAt,
    },
    chapters,
    createdAt,
  };
}

export async function persistCompatibleImportTask(
  port: CompatibleImportStoragePort,
  task: ImportTask,
): Promise<string> {
  try {
    await port.put(task);
  } catch (error) {
    throw new Error(`COMPATIBLE_IMPORT_WRITE_FAILED:${describeError(error)}`);
  }

  let verificationError: Error | null = null;
  try {
    const readback = await port.get(task.id);
    if (!readback) {
      throw new Error("COMPATIBLE_IMPORT_READBACK_MISSING");
    }
    if (canonicalJson(readback) !== canonicalJson(task)) {
      throw new Error("COMPATIBLE_IMPORT_READBACK_MISMATCH");
    }
  } catch (error) {
    verificationError =
      error instanceof Error && error.message.startsWith("COMPATIBLE_IMPORT_")
        ? error
        : new Error(`COMPATIBLE_IMPORT_READBACK_FAILED:${describeError(error)}`);
  }

  if (!verificationError) return task.id;

  try {
    await port.remove(task.id);
  } catch (error) {
    throw new Error(
      `COMPATIBLE_IMPORT_COMPENSATION_FAILED:${verificationError.message}:${describeError(error)}`,
    );
  }
  throw verificationError;
}
