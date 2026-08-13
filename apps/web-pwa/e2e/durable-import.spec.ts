import { expect, test, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";
import path from "node:path";

type StoredImportTask = {
  id: string;
  chapters: unknown[];
  bookMetadata: {
    id: string;
    sourceRightsConfirmedAt?: string;
    sourceCheckPreference?: { enabled: boolean; intervalHours: number };
  };
  lifecycle?: {
    state: string;
    source: { kind: string; url?: string };
  };
};

async function readImportTasks(page: Page): Promise<StoredImportTask[]> {
  return page.evaluate(async () => {
    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open("ReaderDatabase");
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    try {
      return await new Promise<StoredImportTask[]>((resolve, reject) => {
        const transaction = database.transaction("importTasks", "readonly");
        const request = transaction.objectStore("importTasks").getAll();
        request.onsuccess = () => resolve(request.result as StoredImportTask[]);
        request.onerror = () => reject(request.error);
      });
    } finally {
      database.close();
    }
  });
}

async function readBooks(page: Page): Promise<StoredImportTask["bookMetadata"][]> {
  return page.evaluate(async () => {
    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open("ReaderDatabase");
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    try {
      return await new Promise<StoredImportTask["bookMetadata"][]>((resolve, reject) => {
        const transaction = database.transaction("books", "readonly");
        const request = transaction.objectStore("books").getAll();
        request.onsuccess = () => resolve(request.result as StoredImportTask["bookMetadata"][]);
        request.onerror = () => reject(request.error);
      });
    } finally {
      database.close();
    }
  });
}

test("batch TXT files use durable worker tasks before atomic bookshelf commit", async ({ page }) => {
  const fixture = readFileSync(path.join(process.cwd(), "e2e/fixtures/short-novel.txt"));
  await page.goto("/#/import");
  await page.getByRole("button", { name: "批量上传" }).click();
  await page.locator('input[type="file"][multiple]').setInputFiles([
    { name: "batch-one.txt", mimeType: "text/plain", buffer: fixture },
    { name: "batch-two.txt", mimeType: "text/plain", buffer: fixture },
  ]);

  await expect(page.getByText("✓ 成功")).toHaveCount(2, { timeout: 20_000 });
  await expect.poll(async () => {
    const tasks = await readImportTasks(page);
    return tasks.map((task) => ({
      state: task.lifecycle?.state,
      retainedChapterCount: task.chapters.length,
    }));
  }, { timeout: 10_000 }).toEqual([
    { state: "completed", retainedChapterCount: 0 },
    { state: "completed", retainedChapterCount: 0 },
  ]);
});

test("legal URL import persists source identity before entering preview", async ({ page }) => {
  const legalUrl = "https://legal.example/novel";
  const content = "这是一个经过授权的固定测试页面，用于验证合法链接导入。".repeat(8);
  await page.route("https://legal.example/**", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "text/html; charset=utf-8",
      headers: { "access-control-allow-origin": "*" },
      body: `<html><head><title>合法测试小说</title></head><body><article>${content}</article></body></html>`,
    });
  });

  await page.goto("/#/import");
  await page.getByRole("button", { name: "URL 解析" }).click();
  await page.locator('input[type="url"]').fill(legalUrl);
  await page.getByLabel(/我确认有权访问和保存/).check();
  await page.getByRole("button", { name: "解析 URL" }).click();

  await expect(page.getByRole("heading", { name: "解析预览" })).toBeVisible({
    timeout: 15_000,
  });
  const [task] = await readImportTasks(page);
  expect(task.lifecycle).toMatchObject({
    state: "preview",
    source: { kind: "url", url: legalUrl },
  });
  expect(task.chapters).toHaveLength(1);
  expect(task.bookMetadata.sourceRightsConfirmedAt).toMatch(/^2026-|^20\d{2}-/);
  expect(task.bookMetadata.sourceCheckPreference).toEqual({
    enabled: false,
    intervalHours: 24,
  });
});

test("URL import stops at login/paywall/anti-bot pages without backend bypass", async ({ page }) => {
  let backendFallbackCount = 0;
  await page.route("https://blocked.example/**", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "text/html; charset=utf-8",
      headers: { "access-control-allow-origin": "*" },
      body: "<html><body><main>安全验证：请登录后阅读并完成验证码</main></body></html>",
    });
  });
  await page.route("**/imports/url/parse", async (route) => {
    backendFallbackCount += 1;
    await route.fulfill({ status: 500, body: "should not be called" });
  });

  await page.goto("/#/import");
  await page.getByRole("button", { name: "URL 解析" }).click();
  await page.locator('input[type="url"]').fill("https://blocked.example/book");
  await page.getByLabel(/我确认有权访问和保存/).check();
  await page.getByRole("button", { name: "解析 URL" }).click();

  await expect(page.getByText(/为保护来源边界，已停止解析/)).toBeVisible();
  expect(backendFallbackCount).toBe(0);
});

test("manual source check stores preview metadata without overwriting chapters", async ({ page }) => {
  const legalUrl = "https://legal.example/preview";
  let sourceVisit = 0;
  await page.route("https://legal.example/**", async (route) => {
    sourceVisit += 1;
    const title = sourceVisit <= 2 ? "合法测试小说" : "合法测试小说·新版";
    const content = "这是一个经过授权的固定测试页面，用于验证来源预览。".repeat(8);
    await route.fulfill({
      status: 200,
      contentType: "text/html; charset=utf-8",
      headers: { "access-control-allow-origin": "*" },
      body: `<html><head><title>${title}</title></head><body><article>${content}</article></body></html>`,
    });
  });

  await page.goto("/#/import");
  await page.getByRole("button", { name: "URL 解析" }).click();
  await page.locator('input[type="url"]').fill(legalUrl);
  await page.getByLabel(/我确认有权访问和保存/).check();
  await page.getByRole("button", { name: "解析 URL" }).click();
  await expect(page.getByRole("heading", { name: "解析预览" })).toBeVisible();
  await page.getByRole("button", { name: "加入书架" }).click();
  const [savedBook] = await readBooks(page);
  await page.goto(`/#/book/${savedBook.id}`);
  await expect(page.getByRole("heading", { name: "公开来源检查" })).toBeVisible();

  const chapterCountBefore = await page.evaluate(async () => {
    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open("ReaderDatabase");
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const transaction = database.transaction("chapters", "readonly");
    const count = await new Promise<number>((resolve, reject) => {
      const request = transaction.objectStore("chapters").count();
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    database.close();
    return count;
  });
  await page.getByRole("button", { name: "立即检查" }).click();
  await expect(page.getByRole("status")).toContainText("这只是预览，本地内容未改动");
  const [bookAfterCheck] = await readBooks(page);
  expect(bookAfterCheck.sourceCheckPreference).toEqual({ enabled: false, intervalHours: 24 });
  expect(await page.evaluate(async () => {
    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open("ReaderDatabase");
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const transaction = database.transaction("chapters", "readonly");
    const count = await new Promise<number>((resolve, reject) => {
      const request = transaction.objectStore("chapters").count();
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    database.close();
    return count;
  })).toBe(chapterCountBefore);
});
