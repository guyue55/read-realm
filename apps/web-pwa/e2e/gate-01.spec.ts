import { expect, test, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";
import path from "node:path";

type StoredProgress = {
  bookId: string;
  chapterId: string;
  chapterIndex: number;
  offset: number;
  percentage: number;
  updatedAt: string;
};

async function readStore<T>(page: Page, storeName: string): Promise<T[]> {
  return page.evaluate(async (name) => {
    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB["open"]("ReaderDatabase");
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    try {
      return await new Promise<T[]>((resolve, reject) => {
        const transaction = database.transaction(name, "readonly");
        const request = transaction.objectStore(name).getAll();
        request.onsuccess = () => resolve(request.result as T[]);
        request.onerror = () => reject(request.error);
      });
    } finally {
      database.close();
    }
  }, storeName);
}

test("EXP-01 fixed TXT survives progress, refresh, true offline, backup and isolated restore", async ({
  browser,
  context,
  page,
}) => {
  await page.goto("/#/library");
  await expect(page.getByRole("heading", { name: "书架还是空的" })).toBeVisible();

  await page.getByRole("button", { name: /导入本地书籍/ }).click();
  await page.getByLabel("选择 TXT 或 EPUB 文件").setInputFiles(
    path.join(process.cwd(), "e2e/fixtures/short-novel.txt"),
  );
  await expect(page.getByRole("heading", { name: "解析预览" })).toBeVisible({
    timeout: 15_000,
  });
  await page.getByRole("button", { name: "加入书架" }).click();
  await expect(page.getByText("short-novel", { exact: true })).toBeVisible();

  await page.getByRole("button", { name: "打开《short-novel》", exact: true }).click();
  await expect(page.locator(".reader-content:visible").first()).toContainText("清晨，林舟");
  await page.locator('button[aria-label="添加书签"]:visible').click();

  // 桌面端进度滑块位于「阅读进度」面板内，先点击顶部栏进度徽标打开面板
  await page.locator('button[title^="拖动阅读进度"]').click();
  await expect(page.locator('input[aria-label="拖动阅读进度"]:visible')).toBeVisible();

  const slider = page.locator('input[aria-label="拖动阅读进度"]:visible');
  const saveStartedAt = Date.now();
  await slider.fill("60");
  await slider.dispatchEvent("pointerup", { pointerType: "mouse" });

  let savedProgress: StoredProgress | undefined;
  await expect
    .poll(
      async () => {
        savedProgress = (await readStore<StoredProgress>(page, "progress"))[0];
        return savedProgress?.chapterIndex;
      },
      { timeout: 1_000, intervals: [25, 50, 100] },
    )
    .toBe(1);
  const saveDurationMs = Date.now() - saveStartedAt;
  expect(saveDurationMs).toBeLessThanOrEqual(1_000);

  await page.reload();
  await expect(page.getByText("傍晚，林舟").first()).toContainText("傍晚，林舟", {
    timeout: 15_000,
  });

  const isControlled = await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
    return Boolean(navigator.serviceWorker.controller);
  });
  if (!isControlled) await page.reload();
  await expect
    .poll(() => page.evaluate(() => Boolean(navigator.serviceWorker.controller)), {
      timeout: 15_000,
    })
    .toBe(true);
  await expect(page.getByText("傍晚，林舟").first()).toContainText("傍晚，林舟");

  await context.setOffline(true);
  await page.reload();
  await expect(page.getByText("傍晚，林舟").first()).toContainText("傍晚，林舟", {
    timeout: 15_000,
  });
  await expect(page.getByText("离线", { exact: true }).first()).toBeVisible();
  await context.setOffline(false);

  await page.goto("/#/settings");
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "下载完整备份包" }).click();
  const download = await downloadPromise;
  const stream = await download.createReadStream();
  const chunks: Buffer[] = [];
  for await (const chunk of stream) chunks.push(Buffer.from(chunk));
  const backupBuffer = Buffer.concat(chunks);
  const backup = JSON.parse(backupBuffer.toString("utf8"));
  const restoredSnapshot = JSON.parse(backup.entries["data/local-snapshot-v1.json"]);
  expect(backup).toMatchObject({
    kind: "read-realm-portable-backup",
    packageVersion: 1,
    manifest: { algorithm: "SHA-256", entryCount: 1 },
  });
  expect(restoredSnapshot).toMatchObject({
    kind: "read-realm-local-snapshot",
    schemaVersion: 1,
    source: { databaseVersion: 10 },
  });
  expect(restoredSnapshot.data.books).toHaveLength(1);
  expect(restoredSnapshot.data.chapters).toHaveLength(2);
  expect(restoredSnapshot.data.progress[0].chapterIndex).toBe(1);
  expect(restoredSnapshot.data.bookmarks).toHaveLength(1);

  const restoreContext = await browser.newContext();
  const restorePage = await restoreContext.newPage();
  try {
    await restorePage.goto("/#/settings");
    await restorePage.getByLabel("选择阅读备份文件").setInputFiles({
      name: download.suggestedFilename(),
      mimeType: "application/json",
      buffer: backupBuffer,
    });
    await expect(restorePage.getByLabel("备份恢复预览")).toBeVisible();
    await restorePage.getByRole("button", { name: "确认恢复到空书架" }).click();
    await expect(restorePage.getByRole("status")).toContainText("恢复完成：1 本书、2 章、1 条进度");

    const [books, chapters, progress, bookmarks] = await Promise.all([
      readStore<{ id: string; title: string }>(restorePage, "books"),
      readStore<{ id: string; content: string }>(restorePage, "chapters"),
      readStore<StoredProgress>(restorePage, "progress"),
      readStore<{ id: string }>(restorePage, "bookmarks"),
    ]);
    expect(books.map((book) => book.title)).toEqual(["short-novel"]);
    expect(chapters).toHaveLength(2);
    expect(chapters.map((chapter) => chapter.content).join("\n")).toContain("清晨，林舟");
    expect(progress[0]?.chapterIndex).toBe(1);
    expect(bookmarks).toHaveLength(1);
    expect(
      await restorePage.evaluate(() =>
        JSON.parse(localStorage.getItem("reader-settings") ?? "null"),
      ),
    ).toEqual(restoredSnapshot.data.settings);

    await restorePage.goto("/#/library");
    await restorePage.getByRole("button", { name: "打开《short-novel》", exact: true }).click();
    await expect(restorePage.getByText("傍晚，林舟").first()).toContainText("傍晚，林舟", {
      timeout: 15_000,
    });
  } finally {
    await restoreContext.close();
  }
});

test("EXP-02 worker stream and session adapter survive the same user outcomes", async ({
  browser,
  context,
  page,
}) => {
  await page.goto("/#/library");
  await expect(page.getByRole("heading", { name: "书架还是空的" })).toBeVisible();

  await page.getByRole("button", { name: /导入本地书籍/ }).click();
  await page.getByLabel("选择 TXT 或 EPUB 文件").setInputFiles(
    path.join(process.cwd(), "e2e/fixtures/short-novel.txt"),
  );
  await expect(page.getByRole("heading", { name: "解析预览" })).toBeVisible({
    timeout: 15_000,
  });
  await page.getByRole("button", { name: "加入书架" }).click();
  await expect(page.getByText("short-novel", { exact: true })).toBeVisible();

  await page.getByRole("button", { name: "打开《short-novel》", exact: true }).click();
  await expect(page.locator(".reader-content:visible").first()).toContainText("清晨，林舟");
  await page.locator('button[aria-label="添加书签"]:visible').click();

  const saveStartedAt = Date.now();
  await page.locator('button[aria-label="下一章"]:visible').click();
  await expect
    .poll(
      async () => (await readStore<StoredProgress>(page, "progress"))[0]?.chapterIndex,
      { timeout: 1_000, intervals: [25, 50, 100] },
    )
    .toBe(1);
  expect(Date.now() - saveStartedAt).toBeLessThanOrEqual(1_000);
  await expect(page.getByText("傍晚，林舟").first()).toContainText("傍晚，林舟");

  await page.reload();
  await expect(page.getByText("傍晚，林舟").first()).toContainText("傍晚，林舟", {
    timeout: 15_000,
  });

  const isControlled = await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
    return Boolean(navigator.serviceWorker.controller);
  });
  if (!isControlled) await page.reload();
  await expect
    .poll(() => page.evaluate(() => Boolean(navigator.serviceWorker.controller)), {
      timeout: 15_000,
    })
    .toBe(true);

  await context.setOffline(true);
  await page.reload();
  await expect(page.getByText("傍晚，林舟").first()).toContainText("傍晚，林舟", {
    timeout: 15_000,
  });
  await expect(page.getByText("离线", { exact: true }).first()).toBeVisible();
  await context.setOffline(false);

  await page.goto("/#/settings");
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "下载完整备份包" }).click();
  const download = await downloadPromise;
  const stream = await download.createReadStream();
  const chunks: Buffer[] = [];
  for await (const chunk of stream) chunks.push(Buffer.from(chunk));
  const backupBuffer = Buffer.concat(chunks);
  const backup = JSON.parse(backupBuffer.toString("utf8"));
  const restoredSnapshot = JSON.parse(backup.entries["data/local-snapshot-v1.json"]);
  expect(restoredSnapshot.data.books).toHaveLength(1);
  expect(restoredSnapshot.data.chapters).toHaveLength(2);
  expect(restoredSnapshot.data.progress[0].chapterIndex).toBe(1);
  expect(restoredSnapshot.data.bookmarks).toHaveLength(1);

  const restoreContext = await browser.newContext();
  const restorePage = await restoreContext.newPage();
  try {
    await restorePage.goto("/#/settings");
    await restorePage.getByLabel("选择阅读备份文件").setInputFiles({
      name: download.suggestedFilename(),
      mimeType: "application/json",
      buffer: backupBuffer,
    });
    await expect(restorePage.getByLabel("备份恢复预览")).toBeVisible();
    await restorePage.getByRole("button", { name: "确认恢复到空书架" }).click();
    await expect(restorePage.getByRole("status")).toContainText("恢复完成：1 本书、2 章、1 条进度");
    expect((await readStore<StoredProgress>(restorePage, "progress"))[0]?.chapterIndex).toBe(1);
    expect(await readStore(restorePage, "bookmarks")).toHaveLength(1);
    expect(
      await restorePage.evaluate(() =>
        JSON.parse(localStorage.getItem("reader-settings") ?? "null"),
      ),
    ).toEqual(restoredSnapshot.data.settings);

    await restorePage.goto("/#/library");
    await restorePage.getByRole("button", { name: "打开《short-novel》", exact: true }).click();
    await expect(restorePage.getByText("傍晚，林舟").first()).toContainText("傍晚，林舟", {
      timeout: 15_000,
    });
  } finally {
    await restoreContext.close();
  }
});

test("EXP-03 fixed EPUB through compatible storage survives the same user outcomes", async ({
  browser,
  context,
  page,
}) => {
  const fixtureBase64 = readFileSync(
    path.join(process.cwd(), "e2e/fixtures/fixed-two-chapter.epub.base64"),
    "utf8",
  ).trim();

  await page.goto("/#/library");
  await expect(page.getByRole("heading", { name: "书架还是空的" })).toBeVisible();
  await page.getByRole("button", { name: /导入本地书籍/ }).click();
  await page.getByLabel("选择 TXT 或 EPUB 文件").setInputFiles({
    name: "fixed-two-chapter.epub",
    mimeType: "application/epub+zip",
    buffer: Buffer.from(fixtureBase64, "base64"),
  });
  await expect(page.getByRole("heading", { name: "解析预览" })).toBeVisible({
    timeout: 15_000,
  });
  await page.getByRole("button", { name: "加入书架" }).click();
  await expect(page.getByText("固定 EPUB", { exact: true })).toBeVisible();

  await page.getByRole("button", { name: "打开《固定 EPUB》", exact: true }).click();
  await expect(page.locator(".reader-content:visible").first()).toContainText("清晨，林舟");
  await page.locator('button[aria-label="添加书签"]:visible').click();

  const saveStartedAt = Date.now();
  await page.locator('button[aria-label="下一章"]:visible').click();
  await expect
    .poll(
      async () => (await readStore<StoredProgress>(page, "progress"))[0]?.chapterIndex,
      { timeout: 1_000, intervals: [25, 50, 100] },
    )
    .toBe(1);
  expect(Date.now() - saveStartedAt).toBeLessThanOrEqual(1_000);
  await expect(page.getByText("傍晚，林舟").first()).toContainText("傍晚，林舟");

  await page.reload();
  await expect(page.getByText("傍晚，林舟").first()).toContainText("傍晚，林舟", {
    timeout: 15_000,
  });
  const isControlled = await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
    return Boolean(navigator.serviceWorker.controller);
  });
  if (!isControlled) await page.reload();
  await expect
    .poll(() => page.evaluate(() => Boolean(navigator.serviceWorker.controller)), {
      timeout: 15_000,
    })
    .toBe(true);

  await context.setOffline(true);
  await page.reload();
  await expect(page.getByText("傍晚，林舟").first()).toContainText("傍晚，林舟", {
    timeout: 15_000,
  });
  await expect(page.getByText("离线", { exact: true }).first()).toBeVisible();
  await context.setOffline(false);

  await page.goto("/#/settings");
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "下载完整备份包" }).click();
  const download = await downloadPromise;
  const stream = await download.createReadStream();
  const chunks: Buffer[] = [];
  for await (const chunk of stream) chunks.push(Buffer.from(chunk));
  const backupBuffer = Buffer.concat(chunks);
  const backup = JSON.parse(backupBuffer.toString("utf8"));
  const restoredSnapshot = JSON.parse(backup.entries["data/local-snapshot-v1.json"]);
  expect(restoredSnapshot.data.books).toHaveLength(1);
  expect(restoredSnapshot.data.chapters).toHaveLength(2);
  expect(restoredSnapshot.data.progress[0].chapterIndex).toBe(1);
  expect(restoredSnapshot.data.bookmarks).toHaveLength(1);

  const restoreContext = await browser.newContext();
  const restorePage = await restoreContext.newPage();
  try {
    await restorePage.goto("/#/settings");
    await restorePage.getByLabel("选择阅读备份文件").setInputFiles({
      name: download.suggestedFilename(),
      mimeType: "application/json",
      buffer: backupBuffer,
    });
    await expect(restorePage.getByLabel("备份恢复预览")).toBeVisible();
    await restorePage.getByRole("button", { name: "确认恢复到空书架" }).click();
    await expect(restorePage.getByRole("status")).toContainText("恢复完成：1 本书、2 章、1 条进度");
    expect((await readStore<StoredProgress>(restorePage, "progress"))[0]?.chapterIndex).toBe(1);
    expect(await readStore(restorePage, "bookmarks")).toHaveLength(1);
    expect(
      await restorePage.evaluate(() =>
        JSON.parse(localStorage.getItem("reader-settings") ?? "null"),
      ),
    ).toEqual(restoredSnapshot.data.settings);

    await restorePage.goto("/#/library");
    await restorePage.getByRole("button", { name: "打开《固定 EPUB》", exact: true }).click();
    await expect(restorePage.getByText("傍晚，林舟").first()).toContainText("傍晚，林舟", {
      timeout: 15_000,
    });
  } finally {
    await restoreContext.close();
  }
});

test("EXP-09 fixed EPUB uses the restored book ID for the complete vertical slice", async ({
  browser,
  context,
  page,
}) => {
  const fixtureBase64 = readFileSync(
    path.join(process.cwd(), "e2e/fixtures/fixed-two-chapter.epub.base64"),
    "utf8",
  ).trim();

  await page.goto("/#/library");
  await expect(page.getByRole("heading", { name: "书架还是空的" })).toBeVisible();
  await page.getByRole("button", { name: /导入本地书籍/ }).click();
  await page.getByLabel("选择 TXT 或 EPUB 文件").setInputFiles({
    name: "fixed-two-chapter.epub",
    mimeType: "application/epub+zip",
    buffer: Buffer.from(fixtureBase64, "base64"),
  });
  await expect(page.getByRole("heading", { name: "解析预览" })).toBeVisible({
    timeout: 15_000,
  });
  await page.getByRole("button", { name: "加入书架" }).click();

  const [importedBook] = await readStore<{ id: string; title: string }>(page, "books");
  expect(importedBook?.title).toBe("固定 EPUB");
  const importedCard = page.locator(`[data-book-id="${importedBook.id}"]`);
  await expect(importedCard).toHaveCount(1);
  await importedCard.click();
  await expect(page.locator(".reader-content:visible").first()).toContainText("清晨，林舟");
  await page.locator('button[aria-label="添加书签"]:visible').click();

  const saveStartedAt = Date.now();
  await page.locator('button[aria-label="下一章"]:visible').click();
  await expect
    .poll(
      async () => (await readStore<StoredProgress>(page, "progress"))[0]?.chapterIndex,
      { timeout: 1_000, intervals: [25, 50, 100] },
    )
    .toBe(1);
  expect(Date.now() - saveStartedAt).toBeLessThanOrEqual(1_000);
  await expect(page.getByText("傍晚，林舟").first()).toContainText("傍晚，林舟");

  await page.reload();
  await expect(page.getByText("傍晚，林舟").first()).toContainText("傍晚，林舟", {
    timeout: 15_000,
  });
  const isControlled = await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
    return Boolean(navigator.serviceWorker.controller);
  });
  if (!isControlled) await page.reload();
  await expect
    .poll(() => page.evaluate(() => Boolean(navigator.serviceWorker.controller)), {
      timeout: 15_000,
    })
    .toBe(true);

  await context.setOffline(true);
  await page.reload();
  await expect(page.getByText("傍晚，林舟").first()).toContainText("傍晚，林舟", {
    timeout: 15_000,
  });
  await expect(page.getByText("离线", { exact: true }).first()).toBeVisible();
  await context.setOffline(false);

  await page.goto("/#/settings");
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "下载完整备份包" }).click();
  const download = await downloadPromise;
  const stream = await download.createReadStream();
  const chunks: Buffer[] = [];
  for await (const chunk of stream) chunks.push(Buffer.from(chunk));
  const backupBuffer = Buffer.concat(chunks);
  const backup = JSON.parse(backupBuffer.toString("utf8"));
  const restoredSnapshot = JSON.parse(backup.entries["data/local-snapshot-v1.json"]);
  expect(restoredSnapshot.data.books).toHaveLength(1);
  expect(restoredSnapshot.data.chapters).toHaveLength(2);
  expect(restoredSnapshot.data.progress[0].chapterIndex).toBe(1);
  expect(restoredSnapshot.data.bookmarks).toHaveLength(1);
  const restoredBookId = restoredSnapshot.data.books[0].id;
  expect(restoredBookId).toBe(importedBook.id);

  const restoreContext = await browser.newContext();
  const restorePage = await restoreContext.newPage();
  try {
    await restorePage.goto("/#/settings");
    await restorePage.getByLabel("选择阅读备份文件").setInputFiles({
      name: download.suggestedFilename(),
      mimeType: "application/json",
      buffer: backupBuffer,
    });
    await expect(restorePage.getByLabel("备份恢复预览")).toBeVisible();
    await restorePage.getByRole("button", { name: "确认恢复到空书架" }).click();
    await expect(restorePage.getByRole("status")).toContainText(
      "恢复完成：1 本书、2 章、1 条进度",
    );
    expect((await readStore<StoredProgress>(restorePage, "progress"))[0]?.chapterIndex).toBe(1);
    expect(await readStore(restorePage, "bookmarks")).toHaveLength(1);
    expect(
      await restorePage.evaluate(() =>
        JSON.parse(localStorage.getItem("reader-settings") ?? "null"),
      ),
    ).toEqual(restoredSnapshot.data.settings);

    await restorePage.goto("/#/library");
    const restoredCard = restorePage.locator(`[data-book-id="${restoredBookId}"]`);
    await expect(restoredCard).toHaveCount(1);
    await restoredCard.click();
    await expect(restorePage.getByText("傍晚，林舟").first()).toContainText("傍晚，林舟", {
      timeout: 15_000,
    });
  } finally {
    await restoreContext.close();
  }
});
