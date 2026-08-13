import { expect, test, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";
import path from "node:path";

type StoredImportTask = {
  id: string;
  chapters: unknown[];
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
});
