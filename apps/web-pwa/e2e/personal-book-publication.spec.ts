import { expect, test, type Locator, type Page } from "@playwright/test";
import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import { join, relative } from "node:path";

const apiBase = "http://127.0.0.1:4100";
const token = "personal-publication-key";
const bookId = "personal-publication-book";

test.use({ serviceWorkers: "block", viewport: { width: 390, height: 844 } });

async function seedLocalBook(page: Page) {
  await page.evaluate(
    ({ targetBookId }) =>
      new Promise<void>((resolve, reject) => {
        const request = indexedDB.open("ReaderDatabase");
        request.onerror = () => reject(request.error);
        request.onsuccess = () => {
          const database = request.result;
          const transaction = database.transaction(
            ["books", "chapters", "progress", "bookmarks"],
            "readwrite",
          );
          const now = "2026-08-15T09:00:00.000Z";
          transaction.objectStore("books").put({
            id: targetBookId,
            title: "已上云的个人藏书",
            author: "古月",
            description: "个人云发布固定样本",
            sourceType: "cloud_cache",
            format: "txt",
            status: "reading",
            tags: [],
            chapterCount: 2,
            cacheStatus: "chapters_full",
            sourceAvailability: "full_cached",
            createdAt: now,
            updatedAt: now,
          });
          for (let index = 0; index < 2; index += 1) {
            transaction.objectStore("chapters").put({
              id: `${targetBookId}-chapter-${index}`,
              bookId: targetBookId,
              index,
              title: `第 ${index + 1} 章`,
              content: `个人云正文 ${index + 1}`,
            });
          }
          transaction.objectStore("progress").put({
            bookId: targetBookId,
            chapterId: `${targetBookId}-chapter-0`,
            chapterIndex: 0,
            offset: 4,
            percentage: 25,
            updatedAt: now,
          });
          transaction.objectStore("bookmarks").put({
            id: "publication-note",
            bookId: targetBookId,
            chapterId: `${targetBookId}-chapter-0`,
            chapterIndex: 0,
            position: 4,
            createdAt: now,
            note: "私人笔记不得公开",
          });
          transaction.oncomplete = () => {
            database.close();
            resolve();
          };
          transaction.onerror = () => reject(transaction.error);
          transaction.onabort = () => reject(transaction.error);
        };
      }),
    { targetBookId: bookId },
  );
}

async function readLocalFacts(page: Page) {
  return page.evaluate(
    ({ targetBookId }) =>
      new Promise<unknown>((resolve, reject) => {
        const request = indexedDB.open("ReaderDatabase");
        request.onerror = () => reject(request.error);
        request.onsuccess = () => {
          const database = request.result;
          const transaction = database.transaction(
            ["books", "chapters", "progress", "bookmarks"],
            "readonly",
          );
          const bookRequest = transaction
            .objectStore("books")
            .get(targetBookId);
          const chapterRequest = transaction
            .objectStore("chapters")
            .index("bookId")
            .getAll(targetBookId);
          const progressRequest = transaction
            .objectStore("progress")
            .get(targetBookId);
          const bookmarkRequest = transaction
            .objectStore("bookmarks")
            .index("bookId")
            .getAll(targetBookId);
          transaction.oncomplete = () => {
            database.close();
            resolve({
              book: bookRequest.result,
              chapters: chapterRequest.result,
              progress: progressRequest.result,
              bookmarks: bookmarkRequest.result,
              syncTasks: localStorage.getItem("reader-active-sync-tasks"),
            });
          };
          transaction.onerror = () => reject(transaction.error);
        };
      }),
    { targetBookId: bookId },
  );
}

async function blobTreeHash(root: string) {
  const entries = await readdir(root, { recursive: true, withFileTypes: true });
  const files = entries
    .filter((entry) => entry.isFile())
    .map((entry) => join(entry.parentPath, entry.name))
    .sort();
  const digest = createHash("sha256");
  for (const path of files) {
    digest.update(relative(root, path));
    digest.update(await readFile(path));
  }
  return { hash: digest.digest("hex"), fileCount: files.length };
}

async function expectTouchSafe(locator: Locator) {
  const box = await locator.boundingBox();
  expect(box).not.toBeNull();
  expect(box!.width).toBeGreaterThanOrEqual(44);
  expect(box!.height).toBeGreaterThanOrEqual(44);
}

test("verified personal cloud book publishes without changing private facts", async ({
  page,
  request,
}) => {
  const remotePayload = {
    metadata: {
      id: bookId,
      title: "已上云的个人藏书",
      author: "古月",
      description: "个人云发布固定样本",
      sourceType: "upload",
      format: "txt",
      status: "reading",
      tags: [],
      chapterCount: 2,
      createdAt: "2026-08-15T09:00:00.000Z",
      updatedAt: "2026-08-15T09:00:00.000Z",
    },
    chapters: [0, 1].map((index) => ({
      id: `${bookId}-chapter-${index}`,
      index,
      title: `第 ${index + 1} 章`,
      content: `个人云正文 ${index + 1}`,
    })),
    replaceExisting: true,
  };
  await request
    .post(`${apiBase}/books/import`, {
      headers: { "x-share-token": token },
      data: remotePayload,
    })
    .then((response) => expect(response.ok()).toBe(true));

  await page.addInitScript(() => {
    localStorage.setItem("reader-sync-auto-startup", "false");
    localStorage.setItem(
      "reader-active-sync-tasks",
      JSON.stringify({
        "sentinel::sentinel": {
          bookId: "sentinel",
          action: "upload",
          shareToken: "sentinel",
        },
      }),
    );
  });
  await page.goto("/#/library");
  await seedLocalBook(page);
  await page.reload();

  const card = page.locator(`[data-book-id="${bookId}"]`);
  await expect(card).toBeVisible();
  const governanceTrigger = card.getByRole("button", { name: /操作菜单/ });
  await expectTouchSafe(governanceTrigger);
  await governanceTrigger.click();
  await page.getByRole("menuitem", { name: "管理书籍" }).click();
  let governance = page.getByRole("dialog", { name: /书籍管理/ });
  await expect(governance).toBeVisible();
  const publishTrigger = governance.getByRole("button", { name: "发布公共副本" });
  await expect(publishTrigger).toBeDisabled();
  await expectTouchSafe(publishTrigger);
  await expectTouchSafe(
    governance.getByRole("button", { name: "关闭书籍管理" }),
  );
  await expectTouchSafe(governance.getByRole("button", { name: "保存到本机" }));
  await expectTouchSafe(governance.getByRole("button", { name: "移除" }));
  const folderSelect = governance.getByRole("combobox");
  await expectTouchSafe(folderSelect);
  await folderSelect.selectOption("__create__");
  await expectTouchSafe(governance.getByPlaceholder("请输入新书箧名称..."));
  await expectTouchSafe(governance.getByRole("button", { name: "新建并移入" }));
  const cancelCreateFolder = governance.getByRole("button", { name: "取消" });
  await expectTouchSafe(cancelCreateFolder);
  await cancelCreateFolder.click();
  await expect(folderSelect).toBeVisible();
  await expect(
    governance.getByText(/需先在同步设置绑定私有云密钥/),
  ).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(governance).toBeHidden();
  await expect(governanceTrigger).toBeFocused();

  await page.evaluate((shareToken) => {
    localStorage.setItem("reader-share-token", shareToken);
  }, token);
  await page.reload();

  const privateRequests: Array<Record<string, string>> = [];
  const publicRequests: Array<Record<string, string>> = [];
  page.on("request", (browserRequest) => {
    const path = new URL(browserRequest.url()).pathname;
    if (path === "/books" || path.includes("/publication-export")) {
      privateRequests.push(browserRequest.headers());
    }
    if (path === "/public-library/maintenance/personal-snapshots") {
      publicRequests.push(browserRequest.headers());
    }
  });

  const remoteBefore = await Promise.all([
    request
      .get(`${apiBase}/books`, { headers: { "x-share-token": token } })
      .then((r) => r.json()),
    request
      .get(`${apiBase}/books/${bookId}/chapters`, {
        headers: { "x-share-token": token },
      })
      .then((r) => r.json()),
  ]);
  const localBefore = await readLocalFacts(page);
  const isolatedRoot =
    process.env.READING_WORLD_PERSONAL_PUBLICATION_E2E_TEMP_ROOT;
  expect(isolatedRoot).toBeTruthy();
  const privateBlobHashBefore = await blobTreeHash(
    join(isolatedRoot!, "personal-blobs"),
  );
  expect(privateBlobHashBefore.fileCount).toBe(2);

  let releaseFirstExport!: () => void;
  const firstExportPaused = new Promise<void>((resolvePaused) => {
    let intercepted = false;
    void page.route("**/publication-export**", async (route) => {
      if (!intercepted) {
        intercepted = true;
        resolvePaused();
        await new Promise<void>((resolveRelease) => {
          releaseFirstExport = resolveRelease;
        });
      }
      await route.continue();
    });
  });

  const freshCard = page.locator(`[data-book-id="${bookId}"]`);
  const freshGovernanceTrigger = freshCard.getByRole("button", {
    name: /操作菜单/,
  });
  await freshGovernanceTrigger.click();
  await page.getByRole("menuitem", { name: "管理书籍" }).click();
  governance = page.getByRole("dialog", { name: /书籍管理/ });
  await governance.getByRole("button", { name: "发布公共副本" }).click();
  const publication = page.getByRole("dialog", { name: /发布.*到藏经阁/ });
  await expect(publication.getByText(/将创建公共明文副本/)).toBeVisible();
  const confirmButton = publication.getByRole("button", {
    name: "确认公开入阁",
  });
  const confirmBox = await confirmButton.boundingBox();
  expect(confirmBox?.height).toBeGreaterThanOrEqual(44);
  await confirmButton.click();
  await firstExportPaused;
  await page.evaluate(() =>
    localStorage.setItem("reader-share-token", "other-private-key"),
  );
  releaseFirstExport();
  await expect(
    publication.getByText("公共明文副本已入阁", { exact: true }),
  ).toBeVisible({ timeout: 20_000 });

  for (const headers of privateRequests) {
    expect(headers["x-share-token"]).toBe(token);
    expect(headers["x-public-library-maintenance-key"]).toBeUndefined();
  }
  expect(privateRequests.length).toBeGreaterThanOrEqual(3);
  expect(publicRequests).toHaveLength(1);
  expect(publicRequests[0]?.["x-public-library-maintenance-key"]).toBe(token);
  expect(publicRequests[0]?.["x-share-token"]).toBeUndefined();

  await publication.getByRole("button", { name: "完成" }).click();
  await expect(
    governance.getByRole("button", { name: "发布公共副本" }),
  ).toBeFocused();
  await governance.getByRole("button", { name: "发布公共副本" }).click();
  await publication.getByRole("button", { name: "确认公开入阁" }).click();
  await expect(publication.getByText("已在阁中", { exact: true })).toBeVisible({
    timeout: 20_000,
  });

  await publication.getByRole("button", { name: "完成" }).click();
  await expect(
    governance.getByRole("button", { name: "发布公共副本" }),
  ).toBeFocused();
  await page.route(
    "**/public-library/maintenance/personal-snapshots",
    async (route) =>
      route.fulfill({
        status: 500,
        contentType: "application/json",
        body: JSON.stringify({ message: "fixed public failure" }),
      }),
    { times: 1 },
  );
  await governance.getByRole("button", { name: "发布公共副本" }).click();
  await publication.getByRole("button", { name: "确认公开入阁" }).click();
  await expect(
    publication.getByRole("alert").filter({ hasText: "私人原书没有改动" }),
  ).toBeVisible({ timeout: 20_000 });
  await expect(
    publication.getByText("公共明文副本已入阁", { exact: true }),
  ).toBeHidden();
  await expect(
    publication.getByRole("button", { name: "重新核验" }),
  ).toBeVisible();

  await page.setViewportSize({ width: 340, height: 844 });
  const closeBox = await publication
    .getByRole("button", { name: "关闭发布确认" })
    .boundingBox();
  expect(closeBox).not.toBeNull();
  expect(closeBox!.width).toBeGreaterThanOrEqual(44);
  expect(closeBox!.height).toBeGreaterThanOrEqual(44);
  expect(closeBox!.x + closeBox!.width).toBeLessThanOrEqual(340);
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth),
  ).toBeLessThanOrEqual(340);
  await page.keyboard.press("Escape");
  await expect(publication).toBeHidden();
  await page.keyboard.press("Escape");
  await expect(governance).toBeHidden();
  await expect(freshGovernanceTrigger).toBeFocused();

  for (const headers of privateRequests) {
    expect(headers["x-share-token"]).toBe(token);
    expect(headers["x-public-library-maintenance-key"]).toBeUndefined();
  }
  expect(privateRequests.length).toBeGreaterThanOrEqual(9);
  expect(publicRequests).toHaveLength(3);
  for (const headers of publicRequests) {
    expect(headers["x-public-library-maintenance-key"]).toBe(token);
    expect(headers["x-share-token"]).toBeUndefined();
  }

  const [remoteAfter, localAfter, privateBlobHashAfter] = await Promise.all([
    Promise.all([
      request
        .get(`${apiBase}/books`, { headers: { "x-share-token": token } })
        .then((r) => r.json()),
      request
        .get(`${apiBase}/books/${bookId}/chapters`, {
          headers: { "x-share-token": token },
        })
        .then((r) => r.json()),
    ]),
    readLocalFacts(page),
    blobTreeHash(join(isolatedRoot!, "personal-blobs")),
  ]);
  expect(remoteAfter).toEqual(remoteBefore);
  expect(localAfter).toEqual(localBefore);
  expect(privateBlobHashAfter).toEqual(privateBlobHashBefore);

  const publicBooks = await request
    .get(`${apiBase}/public-library/books?page=1&pageSize=24`)
    .then((response) => response.json());
  expect(publicBooks.total).toBe(1);
  expect(publicBooks.items[0]?.title).toBe("已上云的个人藏书");
  expect(JSON.stringify(publicBooks)).not.toContain("私人笔记不得公开");
  expect(JSON.stringify(publicBooks)).not.toContain(bookId);
});
