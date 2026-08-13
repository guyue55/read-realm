import { expect, test, type Page } from "@playwright/test";

type FolderDatabaseProbe = {
  task: {
    id?: string;
    state?: string;
    attempt?: number;
    sourceKind?: string;
    scannedFiles?: number;
    scannedDirectories?: number;
    scanCompleted?: boolean;
  } | null;
  sources: Array<{ name: string; directoryHandle?: { kind?: string; name?: string } }>;
  folders: Array<{ name: string }>;
  books: Array<{ title: string; sourceType: string }>;
  indexedFiles: Array<{ name: string; status: string }>;
};

async function installOpfsDirectoryPicker(page: Page) {
  await page.evaluate(async () => {
    const opfs = await navigator.storage.getDirectory();
    const root = await opfs.getDirectoryHandle("本地书库", { create: true });
    const category = await root.getDirectoryHandle("科幻", { create: true });
    const books = [
      ["星海.txt", "第一章 启航\n星海正在等待。"],
      ["火星.txt", "第一章 抵达\n风吹过红色平原。"],
    ];
    for (const [name, content] of books) {
      const handle = await category.getFileHandle(name, { create: true });
      const writable = await handle.createWritable();
      await writable.write(content);
      await writable.close();
    }
    Object.defineProperty(window, "showDirectoryPicker", {
      configurable: true,
      value: async () => root,
    });
  });
}

async function readFolderDatabase(page: Page): Promise<FolderDatabaseProbe> {
  return page.evaluate(async () => {
    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open("ReaderDatabase");
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const readAll = (store: string) => new Promise<unknown[]>((resolve, reject) => {
      const request = database.transaction(store, "readonly").objectStore(store).getAll();
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    try {
      const [tasks, sources, folders, books, indexedFiles] = await Promise.all([
        readAll("importTasks"),
        readAll("librarySources"),
        readAll("libraryFolders"),
        readAll("books"),
        readAll("indexedNovelFiles"),
      ]) as [
        Array<{ id: string; lifecycle?: { state: string; attempt: number; source: { kind: string }; progress: Record<string, number | boolean | null> } }>,
        Array<{ name: string; directoryHandle?: { kind?: string; name?: string } }>,
        Array<{ name: string }>,
        Array<{ title: string; sourceType: string }>,
        Array<{ name: string; status: string }>,
      ];
      const folderTask = tasks.find((task) => task.lifecycle?.source.kind === "folder");
      return {
        task: folderTask?.lifecycle ? {
          id: folderTask.id,
          state: folderTask.lifecycle.state,
          attempt: folderTask.lifecycle.attempt,
          sourceKind: folderTask.lifecycle.source.kind,
          scannedFiles: folderTask.lifecycle.progress.scannedFiles as number | undefined,
          scannedDirectories: folderTask.lifecycle.progress.scannedDirectories as number | undefined,
          scanCompleted: folderTask.lifecycle.progress.scanCompleted as boolean | undefined,
        } : null,
        sources: sources.map((source) => ({
          name: source.name,
          directoryHandle: source.directoryHandle ? {
            kind: source.directoryHandle.kind,
            name: source.directoryHandle.name,
          } : undefined,
        })),
        folders,
        books,
        indexedFiles,
      };
    } finally {
      database.close();
    }
  });
}

test("OPFS directory handle reaches durable preview and atomic bookshelf commit", async ({ page }) => {
  await page.goto("/#/import");
  await installOpfsDirectoryPicker(page);
  await page.getByRole("button", { name: "绑定文件夹" }).click();
  await page.getByRole("button", { name: "选择本地小说文件夹" }).click();

  await expect(page.getByRole("heading", { name: "📂 勘测与预览" })).toBeVisible();
  await expect(page.getByText("星海.txt", { exact: true })).toBeVisible();
  await expect.poll(async () => (await readFolderDatabase(page)).task).toMatchObject({
    state: "preview",
    sourceKind: "folder",
    scannedFiles: 2,
    scannedDirectories: 2,
    scanCompleted: true,
  });

  await page.getByRole("button", { name: "🖋 一键入阁" }).click();
  await expect(page.getByText(/一键入阁大功告成/)).toBeVisible();

  const database = await readFolderDatabase(page);
  expect(database.task?.state).toBe("completed");
  expect(database.sources).toHaveLength(1);
  expect(database.sources[0]).toMatchObject({
    name: "本地书库",
    directoryHandle: { kind: "directory", name: "本地书库" },
  });
  expect(database.folders.map((folder) => folder.name)).toContain("科幻");
  expect(database.books.map((book) => book.title).sort()).toEqual(["星海", "火星"]);
  expect(database.indexedFiles).toHaveLength(2);
  expect(database.indexedFiles.every((file) => file.status === "indexed")).toBe(true);
});

test("folder preview refresh requires a real rescan on the same durable task", async ({ page }) => {
  await page.goto("/#/import");
  await installOpfsDirectoryPicker(page);
  await page.getByRole("button", { name: "绑定文件夹" }).click();
  await page.getByRole("button", { name: "选择本地小说文件夹" }).click();
  await expect(page.getByRole("heading", { name: "📂 勘测与预览" })).toBeVisible();
  const beforeRefresh = (await readFolderDatabase(page)).task;
  expect(beforeRefresh).toMatchObject({ state: "preview", attempt: 1 });

  await page.reload();
  await page.getByRole("button", { name: "绑定文件夹" }).click();
  await expect(page.getByText(/发现中断的目录任务.*第 2 次尝试/)).toBeVisible();
  await expect.poll(async () => (await readFolderDatabase(page)).task).toMatchObject({
    id: beforeRefresh?.id,
    state: "failed",
    attempt: 1,
  });

  await installOpfsDirectoryPicker(page);
  await page.getByRole("button", { name: "选择本地小说文件夹" }).click();
  await expect(page.getByRole("heading", { name: "📂 勘测与预览" })).toBeVisible();
  await expect.poll(async () => (await readFolderDatabase(page)).task).toMatchObject({
    id: beforeRefresh?.id,
    state: "preview",
    attempt: 2,
    scannedFiles: 2,
    scannedDirectories: 2,
    scanCompleted: true,
  });

  await page.getByRole("button", { name: "🖋 一键入阁" }).click();
  await expect.poll(async () => (await readFolderDatabase(page)).task?.state).toBe("completed");
});
