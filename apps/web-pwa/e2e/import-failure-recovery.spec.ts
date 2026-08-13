import { expect, test, type Page } from "@playwright/test";
import path from "node:path";

type TaskProbe = {
  id: string;
  state?: string;
  attempt?: number;
  sourceKind?: string;
  retainedChapters: number;
};

async function readTasks(page: Page): Promise<TaskProbe[]> {
  return page.evaluate(async () => {
    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open("ReaderDatabase");
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    try {
      return await new Promise<TaskProbe[]>((resolve, reject) => {
        const request = database.transaction("importTasks", "readonly").objectStore("importTasks").getAll();
        request.onsuccess = () => resolve((request.result as Array<{
          id: string;
          chapters: unknown[];
          lifecycle?: { state: string; attempt: number; source: { kind: string } };
        }>).map((task) => ({
          id: task.id,
          state: task.lifecycle?.state,
          attempt: task.lifecycle?.attempt,
          sourceKind: task.lifecycle?.source.kind,
          retainedChapters: task.chapters.length,
        })));
        request.onerror = () => reject(request.error);
      });
    } finally {
      database.close();
    }
  });
}

async function installPermissionFailureThenOpfsPicker(page: Page) {
  await page.evaluate(async () => {
    const opfs = await navigator.storage.getDirectory();
    const root = await opfs.getDirectoryHandle("权限测试书库", { create: true });
    const fileHandle = await root.getFileHandle("授权小说.txt", { create: true });
    const writable = await fileHandle.createWritable();
    await writable.write("第一章 恢复\n重新授权后可以继续。");
    await writable.close();
    let failPermission = true;
    Object.defineProperty(window, "showDirectoryPicker", {
      configurable: true,
      value: async () => {
        if (!failPermission) return root;
        failPermission = false;
        return {
          kind: "directory",
          name: root.name,
          async *values() {
            yield {
              kind: "file",
              name: "授权小说.txt",
              getFile: async () => {
                throw new DOMException("permission lost", "NotAllowedError");
              },
            };
          },
        };
      },
    });
  });
}

test("quota failure keeps the parsed draft and retry commits it", async ({ page }) => {
  await page.goto("/#/import");
  await page.getByLabel("选择 TXT 或 EPUB 文件").setInputFiles(
    path.join(process.cwd(), "e2e/fixtures/short-novel.txt"),
  );
  await expect(page.getByRole("heading", { name: "解析预览" })).toBeVisible();
  await page.evaluate(() => {
    const originalAdd = IDBObjectStore.prototype.add;
    let failOnce = true;
    IDBObjectStore.prototype.add = function (...args) {
      if (failOnce && this.name === "books") {
        failOnce = false;
        throw new DOMException("quota injected", "QuotaExceededError");
      }
      return originalAdd.apply(this, args as Parameters<IDBObjectStore["add"]>);
    };
  });

  await page.getByRole("button", { name: "加入书架" }).click();
  await expect(page.getByText(/本地存储空间不足.*使用原草稿重试/)).toBeVisible();
  await expect(page.getByRole("button", { name: "重新保存" })).toBeVisible();
  const [failed] = await readTasks(page);
  expect(failed).toMatchObject({ state: "failed", attempt: 1 });
  expect(failed.retainedChapters).toBeGreaterThan(0);

  await page.getByRole("button", { name: "重新保存" }).click();
  await expect(page.getByText("short-novel", { exact: true })).toBeVisible();
});

test("directory permission loss preserves the task and reauthorization rescans it", async ({ page }) => {
  await page.goto("/#/import");
  await installPermissionFailureThenOpfsPicker(page);
  await page.getByRole("button", { name: "绑定文件夹" }).click();
  await page.getByRole("button", { name: "选择本地小说文件夹" }).click();

  await expect(page.getByText(/本地目录权限已拒绝或失效.*重新选择并授权原目录/)).toBeVisible();
  const [failed] = await readTasks(page);
  expect(failed).toMatchObject({ state: "failed", attempt: 1, sourceKind: "folder" });

  await page.getByRole("button", { name: "选择本地小说文件夹" }).click();
  await expect(page.getByRole("heading", { name: "📂 勘测与预览" })).toBeVisible();
  await expect.poll(async () => (await readTasks(page))[0]).toMatchObject({
    id: failed.id,
    state: "preview",
    attempt: 2,
  });
});

test("forced worker termination exposes retry and the same task reaches preview", async ({ page }) => {
  await page.goto("/#/import");
  await page.evaluate(() => {
    const originalPostMessage = Worker.prototype.postMessage;
    let failOnce = true;
    Object.defineProperty(Worker.prototype, "postMessage", {
      configurable: true,
      value: function (
        this: Worker,
        message: unknown,
        optionsOrTransfer?: StructuredSerializeOptions | Transferable[],
      ) {
        if (failOnce) {
          failOnce = false;
          queueMicrotask(() => this.dispatchEvent(new ErrorEvent("error", {
            message: "FORCED_WORKER_TERMINATION",
          })));
          return;
        }
        Reflect.apply(originalPostMessage, this, optionsOrTransfer === undefined
          ? [message]
          : [message, optionsOrTransfer]);
      },
    });
  });
  await page.getByLabel("选择 TXT 或 EPUB 文件").setInputFiles(
    path.join(process.cwd(), "e2e/fixtures/short-novel.txt"),
  );

  await expect(page.getByText(/后台解析引擎已中断.*立即重试/)).toBeVisible();
  await expect(page.getByRole("button", { name: "立即重试" })).toBeVisible();
  const [failed] = await readTasks(page);
  expect(failed).toMatchObject({ state: "failed", attempt: 1, sourceKind: "file" });

  await page.getByRole("button", { name: "立即重试" }).click();
  await expect(page.getByRole("heading", { name: "解析预览" })).toBeVisible();
  await expect.poll(async () => (await readTasks(page))[0]).toMatchObject({
    id: failed.id,
    state: "preview",
    attempt: 2,
  });
});
