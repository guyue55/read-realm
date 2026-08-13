import {
  transitionImportTask,
  type DurableImportTask,
} from "@reader/storage-core";
import type {
  Book,
  IndexedNovelFile,
  LibraryFolder,
  LibrarySource,
} from "@reader/shared-types";

export interface DurableFolderImportTransaction {
  getTask(taskId: string): Promise<DurableImportTask | undefined>;
  putTask(task: DurableImportTask): Promise<void>;
  putSource(source: LibrarySource & { directoryHandle?: FileSystemDirectoryHandle }): Promise<void>;
  addFolders(folders: LibraryFolder[]): Promise<void>;
  addBooks(books: Book[]): Promise<void>;
  addIndexedFiles(files: IndexedNovelFile[]): Promise<void>;
}

export interface DurableFolderImportPlan {
  source: LibrarySource & { directoryHandle?: FileSystemDirectoryHandle };
  folders: LibraryFolder[];
  books: Book[];
  indexedFiles: IndexedNovelFile[];
}

export interface DurableFolderImportPort {
  transaction(
    operation: (transaction: DurableFolderImportTransaction) => Promise<void>,
  ): Promise<void>;
}

export async function commitDurableFolderImport({
  port,
  taskId,
  plan,
  now = () => new Date().toISOString(),
}: {
  port: DurableFolderImportPort;
  taskId: string;
  plan: DurableFolderImportPlan;
  now?: () => string;
}) {
  await port.transaction(async (transaction) => {
    const task = await transaction.getTask(taskId);
    if (!task?.lifecycle) throw new Error(`DURABLE_FOLDER_TASK_MISSING:${taskId}`);
    if (task.lifecycle.source.kind !== "folder") {
      throw new Error(`DURABLE_FOLDER_TASK_SOURCE_INVALID:${task.lifecycle.source.kind}`);
    }
    if (task.lifecycle.state !== "preview" || task.lifecycle.progress.scanCompleted !== true) {
      throw new Error(`DURABLE_FOLDER_TASK_NOT_READY:${task.lifecycle.state}`);
    }
    const saving = transitionImportTask(task, { type: "saving", at: now() });
    await transaction.putTask(saving);
    await transaction.putSource(plan.source);
    if (plan.folders.length > 0) await transaction.addFolders(plan.folders);
    if (plan.books.length > 0) await transaction.addBooks(plan.books);
    if (plan.indexedFiles.length > 0) await transaction.addIndexedFiles(plan.indexedFiles);
    await transaction.putTask(
      transitionImportTask(saving, { type: "completed", at: now() }),
    );
  });
}
