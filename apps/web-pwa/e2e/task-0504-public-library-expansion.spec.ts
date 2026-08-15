import { expect, test, type Page } from "@playwright/test";

const apiBase = "http://127.0.0.1:4100";
const maintenanceKey = "task-0504-fixture-key";
const prefix = "TASK-0504-LIVE-";
const personalBookId = "task-0504-personal-book";
const personalTitle = `${prefix}personal`;
const directTitle = `${prefix}direct`;

async function seedLocalPersonalBook(page: Page) {
  await page.evaluate(
    ({ bookId, title }) =>
      new Promise<void>((resolve, reject) => {
        const request = indexedDB.open("ReaderDatabase");
        request.onerror = () => reject(request.error);
        request.onsuccess = () => {
          const database = request.result;
          const transaction = database.transaction(
            ["books", "chapters", "progress", "bookmarks"],
            "readwrite",
          );
          const now = "2026-08-15T00:00:00.000Z";
          transaction.objectStore("books").put({
            id: bookId,
            title,
            author: "TASK-0504 validator",
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
              id: `${bookId}-chapter-${index}`,
              bookId,
              index,
              title: `第 ${index + 1} 章`,
              content: `TASK-0504 个人云正文 ${index + 1}`,
            });
          }
          transaction.objectStore("progress").put({
            bookId,
            chapterId: `${bookId}-chapter-0`,
            chapterIndex: 0,
            offset: 3,
            percentage: 20,
            updatedAt: now,
          });
          transaction.objectStore("bookmarks").put({
            id: "task-0504-private-note",
            bookId,
            chapterId: `${bookId}-chapter-0`,
            chapterIndex: 0,
            position: 3,
            createdAt: now,
            note: "不得公开的验证笔记",
          });
          transaction.oncomplete = () => {
            database.close();
            resolve();
          };
          transaction.onerror = () => reject(transaction.error);
          transaction.onabort = () => reject(transaction.error);
        };
      }),
    { bookId: personalBookId, title: personalTitle },
  );
}

async function readLocalPersonalFacts(page: Page) {
  return page.evaluate(
    ({ bookId }) =>
      new Promise<unknown>((resolve, reject) => {
        const request = indexedDB.open("ReaderDatabase");
        request.onerror = () => reject(request.error);
        request.onsuccess = () => {
          const database = request.result;
          const transaction = database.transaction(
            ["books", "chapters", "progress", "bookmarks"],
            "readonly",
          );
          const book = transaction.objectStore("books").get(bookId);
          const chapters = transaction
            .objectStore("chapters")
            .index("bookId")
            .getAll(bookId);
          const progress = transaction.objectStore("progress").get(bookId);
          const bookmarks = transaction
            .objectStore("bookmarks")
            .index("bookId")
            .getAll(bookId);
          transaction.oncomplete = () => {
            database.close();
            resolve({
              book: book.result,
              chapters: chapters.result,
              progress: progress.result,
              bookmarks: bookmarks.result,
              syncTasks: localStorage.getItem("reader-active-sync-tasks"),
            });
          };
          transaction.onerror = () => reject(transaction.error);
        };
      }),
    { bookId: personalBookId },
  );
}

async function openImportDialog(page: Page) {
  if (!page.url().includes("#/public-library")) {
    await page.goto("/#/public-library");
  }
  const trigger = page.getByRole("button", { name: "入阁" });
  await trigger.click();
  const dialog = page.getByRole("dialog", { name: "入阁" });
  await expect(dialog).toBeVisible();
  return dialog;
}

async function acceptPublicCopy(page: Page) {
  await page.getByRole("checkbox", { name: /将创建公共明文副本/ }).check();
}

async function expectTouchSafe(locator: ReturnType<Page["locator"]>) {
  const box = await locator.boundingBox();
  expect(box).not.toBeNull();
  expect(box!.width).toBeGreaterThanOrEqual(44);
  expect(box!.height).toBeGreaterThanOrEqual(44);
}

async function readJoinedBookThroughShelf(page: Page, bookId: string) {
  await page.goto("/#/library");
  await page.evaluate(
    (id) =>
      new Promise<void>((resolve, reject) => {
        const request = indexedDB.open("ReaderDatabase");
        request.onerror = () => reject(request.error);
        request.onsuccess = () => {
          const database = request.result;
          const transaction = database.transaction("progress", "readwrite");
          transaction.objectStore("progress").delete(id);
          transaction.oncomplete = () => {
            database.close();
            resolve();
          };
          transaction.onerror = () => reject(transaction.error);
        };
      }),
    bookId,
  );
  const card = page.locator(`[data-book-id="${bookId}"]`);
  await expect(card).toBeVisible();
  await card.getByText(directTitle, { exact: true }).click();
  await expect(page.getByText("TASK-0504 直接正文一")).toBeVisible();
  await page.getByRole("button", { name: "下一章" }).click();
  await expect(page.getByText("TASK-0504 直接正文二")).toBeVisible();
  await page.goto("/#/library");
  await expect(page).toHaveURL(/#\/library$/u);
}

test.use({ viewport: { width: 390, height: 844 } });

test("TASK-0504 mixed-source production expansion journey", async ({
  page,
  request,
  context,
}) => {
  const publicWrites: Array<Record<string, string>> = [];
  const maintenanceReads: Array<Record<string, string>> = [];
  const anonymousReads: Array<Record<string, string>> = [];
  const personalRequests: Array<Record<string, string>> = [];
  page.on("request", (browserRequest) => {
    const url = new URL(browserRequest.url());
    if (
      browserRequest.method() === "GET" &&
      url.pathname.startsWith("/public-library/maintenance/")
    ) {
      maintenanceReads.push(browserRequest.headers());
    } else if (
      browserRequest.method() === "GET" &&
      url.pathname.startsWith("/public-library/")
    ) {
      anonymousReads.push(browserRequest.headers());
    }
    if (
      browserRequest.method() !== "GET" &&
      url.pathname.startsWith("/public-library/")
    ) {
      publicWrites.push(browserRequest.headers());
    }
    if (
      url.pathname === "/books" ||
      url.pathname.includes("publication-export")
    ) {
      personalRequests.push(browserRequest.headers());
    }
  });
  await page.addInitScript(() => {
    if (localStorage.getItem("task-0504-maintenance-enabled") === "true") {
      localStorage.setItem("reader-share-token", "task-0504-fixture-key");
    } else {
      localStorage.removeItem("reader-share-token");
    }
    localStorage.setItem("reader-sync-auto-startup", "false");
    localStorage.setItem(
      "reader-active-sync-tasks",
      JSON.stringify({
        "sentinel::sentinel": {
          action: "upload",
          bookId: "sentinel",
          shareToken: "sentinel",
        },
      }),
    );
  });
  await page.goto("/#/library");
  await expect(
    page.getByText("私人藏书", { exact: false }).first(),
  ).toBeVisible();
  await seedLocalPersonalBook(page);
  await page.reload();
  const localPersonalFactsBefore = await readLocalPersonalFacts(page);
  console.log("TASK0504_PRODUCT_STAGE_ENTERED=TASK-0504");

  await page.getByRole("link", { name: "公共藏书" }).click();
  await expect(page.getByRole("heading", { name: "藏经阁" })).toBeVisible();
  await expect(page.getByRole("button", { name: "入阁" })).toBeDisabled();
  const invalidCredentialHeaders: Array<Record<string, string>> = [
    {},
    { "x-public-library-maintenance-key": "default" },
    { "x-public-library-maintenance-key": "wrong" },
    { "x-share-token": maintenanceKey },
  ];
  for (const headers of invalidCredentialHeaders) {
    const rejected = await request.post(`${apiBase}/public-library/books`, {
      headers,
      data: {
        title: `${prefix}rejected`,
        category: "其他",
        content: "不得写入",
        rightsConfirmed: true,
      },
    });
    expect(rejected.status()).toBe(403);
  }

  await page.evaluate((key) => {
    localStorage.setItem("task-0504-maintenance-enabled", "true");
    localStorage.setItem("reader-share-token", key);
  }, maintenanceKey);
  await page.reload();
  let dialog = await openImportDialog(page);
  await expect(
    dialog.getByRole("button", { name: "关闭入阁面板" }),
  ).toBeFocused();
  for (let index = 0; index < 16; index += 1) {
    await page.keyboard.press("Tab");
    expect(
      await dialog.evaluate((surface) =>
        surface.contains(document.activeElement),
      ),
    ).toBe(true);
  }
  await page.setViewportSize({ width: 340, height: 760 });
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth),
  ).toBeLessThanOrEqual(340);
  const dialogControls = dialog.locator(
    "button, select, label:has(input[type=checkbox]), label:has(input[type=file])",
  );
  for (let index = 0; index < (await dialogControls.count()); index += 1) {
    const control = dialogControls.nth(index);
    if (await control.isVisible()) await expectTouchSafe(control);
  }
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  await expect(page.getByRole("button", { name: "入阁" })).toBeFocused();
  await page.setViewportSize({ width: 390, height: 844 });
  dialog = await openImportDialog(page);
  await page.getByLabel("选择 TXT 文件", { exact: true }).setInputFiles([
    {
      name: `${directTitle}.txt`,
      mimeType: "text/plain",
      buffer: Buffer.from(
        `第一章 入阁\nTASK-0504 直接正文一\n\n第二章 离线\nTASK-0504 直接正文二`,
      ),
    },
    {
      name: `${prefix}invalid.epub`,
      mimeType: "application/epub+zip",
      buffer: Buffer.from("invalid"),
    },
  ]);
  await acceptPublicCopy(page);
  await page.getByRole("button", { name: "开始入阁" }).click();
  await expect(page.getByText("已入阁 1", { exact: true })).toBeVisible();
  await expect(page.getByText("未入阁 1", { exact: true })).toBeVisible();
  await dialog.getByRole("button", { name: "关闭入阁面板" }).click();

  await page.goto("/#/public-library");
  let search = page.getByRole("textbox", { name: "检索公共馆藏" });
  await search.fill(directTitle);
  await page.getByRole("button", { name: "检索", exact: true }).click();
  await page.getByRole("button", { name: "加入书架" }).click();
  await expect(page.getByText("TASK-0504 直接正文一")).toBeVisible();
  const joinedBookId = decodeURIComponent(
    page.url().split("#/reader/")[1]?.split("?")[0] ?? "",
  );
  expect(joinedBookId).not.toMatch(/^public-/u);
  await page.getByRole("button", { name: "返回书架" }).click();

  dialog = await openImportDialog(page);
  const folderInput = page.getByLabel("选择 TXT 文件夹", { exact: true });
  await folderInput.evaluate((input, titlePrefix) => {
    const transfer = new DataTransfer();
    for (let index = 0; index < 7; index += 1) {
      const suffix = String(index).padStart(2, "0");
      const file = new File(
        [`第一章\nTASK-0504 文件夹正文 ${suffix}`],
        `${titlePrefix}folder-${suffix}.txt`,
        { type: "text/plain" },
      );
      Object.defineProperty(file, "webkitRelativePath", {
        configurable: true,
        value: `${titlePrefix}folder/经部/${titlePrefix}folder-${suffix}.txt`,
      });
      transfer.items.add(file);
    }
    Object.defineProperty(input, "files", {
      configurable: true,
      value: transfer.files,
    });
    input.dispatchEvent(new Event("change", { bubbles: true }));
  }, prefix);
  await expect(page.locator("[data-public-library-task-list] li")).toHaveCount(
    7,
  );
  await acceptPublicCopy(page);
  await page.getByRole("button", { name: "开始入阁" }).click();
  await expect(page.getByText("已入阁 7", { exact: true })).toBeVisible();
  await dialog.getByRole("button", { name: "关闭入阁面板" }).click();

  dialog = await openImportDialog(page);
  const mixedReplayInput = page.getByLabel("选择 TXT 文件夹", {
    exact: true,
  });
  await mixedReplayInput.evaluate((input, titlePrefix) => {
    const transfer = new DataTransfer();
    for (const suffix of ["00", "01"]) {
      const file = new File(
        [`第一章\nTASK-0504 文件夹正文 ${suffix}`],
        `${titlePrefix}folder-${suffix}.txt`,
        { type: "text/plain" },
      );
      Object.defineProperty(file, "webkitRelativePath", {
        configurable: true,
        value: `${titlePrefix}folder/经部/${titlePrefix}folder-${suffix}.txt`,
      });
      transfer.items.add(file);
    }
    const invalid = new File(["invalid"], `${titlePrefix}mixed-invalid.epub`, {
      type: "application/epub+zip",
    });
    Object.defineProperty(invalid, "webkitRelativePath", {
      configurable: true,
      value: `${titlePrefix}folder/经部/${titlePrefix}mixed-invalid.epub`,
    });
    transfer.items.add(invalid);
    Object.defineProperty(input, "files", {
      configurable: true,
      value: transfer.files,
    });
    input.dispatchEvent(new Event("change", { bubbles: true }));
  }, prefix);
  await expect(page.locator("[data-public-library-task-list] li")).toHaveCount(
    3,
  );
  await acceptPublicCopy(page);
  await page.getByRole("button", { name: "开始入阁" }).click();
  await expect(page.getByText("已存在 2", { exact: true })).toBeVisible();
  await expect(page.getByText("未入阁 1", { exact: true })).toBeVisible();
  for (const suffix of ["00", "01"]) {
    const row = page
      .locator("[data-public-library-task-list] li")
      .filter({ hasText: `${prefix}folder-${suffix}.txt` });
    await expect(row.getByText("已在阁中", { exact: true })).toBeVisible();
  }
  const invalidRow = page
    .locator("[data-public-library-task-list] li")
    .filter({ hasText: `${prefix}mixed-invalid.epub` });
  await expect(invalidRow.getByText("未入阁", { exact: true })).toBeVisible();
  await expect(invalidRow.getByText("仅支持 TXT 文件")).toBeVisible();
  await dialog.getByRole("button", { name: "关闭入阁面板" }).click();

  dialog = await openImportDialog(page);
  await acceptPublicCopy(page);
  await page.route(
    "**/public-library/maintenance/scans",
    (route) =>
      route.fulfill({
        status: 503,
        contentType: "application/json",
        body: JSON.stringify({ message: "fixed scan failure" }),
      }),
    { times: 1 },
  );
  await dialog.getByRole("button", { name: "扫描并入阁" }).click();
  await expect(
    dialog.getByText("服务端目录扫描失败，既有馆藏未受影响。"),
  ).toBeVisible();
  expect(await readLocalPersonalFacts(page)).toEqual(localPersonalFactsBefore);
  await dialog.getByRole("button", { name: "关闭入阁面板" }).click();
  await readJoinedBookThroughShelf(page, joinedBookId);
  dialog = await openImportDialog(page);
  await acceptPublicCopy(page);
  await dialog.getByRole("button", { name: "扫描并入阁" }).click();
  await expect(dialog.getByText("维护目录扫描完成。")).toBeVisible({
    timeout: 30_000,
  });
  await expect(dialog.getByText(/新入阁 16/)).toBeVisible();
  await dialog.getByRole("button", { name: "扫描并入阁" }).click();
  await expect(dialog.getByText(/新入阁 0 · 已存在 16/)).toBeVisible({
    timeout: 30_000,
  });
  await dialog.getByRole("button", { name: "关闭入阁面板" }).click();

  await page.goto("/#/library");
  const personalCard = page.locator(`[data-book-id="${personalBookId}"]`);
  await expect(personalCard).toBeVisible();
  await personalCard.getByRole("button", { name: /治理/ }).click();
  const governance = page.getByRole("dialog", { name: /藏书治理/ });
  await governance.getByRole("button", { name: "公开入阁" }).click();
  const publication = page.getByRole("dialog", { name: /发布.*到藏经阁/ });
  await page.route(
    "**/public-library/maintenance/personal-snapshots",
    (route) =>
      route.fulfill({
        status: 500,
        contentType: "application/json",
        body: JSON.stringify({ message: "fixed public failure" }),
      }),
    { times: 1 },
  );
  await publication.getByRole("button", { name: "确认公开入阁" }).click();
  await expect(
    publication.getByRole("alert").filter({ hasText: "私人原书没有改动" }),
  ).toBeVisible({ timeout: 30_000 });
  expect(await readLocalPersonalFacts(page)).toEqual(localPersonalFactsBefore);
  await publication.getByRole("button", { name: "暂不发布" }).click();
  await page.keyboard.press("Escape");
  await readJoinedBookThroughShelf(page, joinedBookId);
  const personalCardAfterFailure = page.locator(
    `[data-book-id="${personalBookId}"]`,
  );
  await personalCardAfterFailure.getByRole("button", { name: /治理/ }).click();
  const governanceAfterFailure = page.getByRole("dialog", {
    name: /藏书治理/,
  });
  await governanceAfterFailure
    .getByRole("button", { name: "公开入阁" })
    .click();
  const publicationRetry = page.getByRole("dialog", {
    name: /发布.*到藏经阁/,
  });
  await publicationRetry.getByRole("button", { name: "确认公开入阁" }).click();
  await expect(
    publicationRetry.getByText("公共明文副本已入阁", { exact: true }),
  ).toBeVisible({
    timeout: 30_000,
  });
  await publicationRetry.getByRole("button", { name: "完成" }).click();
  await page.keyboard.press("Escape");
  expect(await readLocalPersonalFacts(page)).toEqual(localPersonalFactsBefore);

  await page.goto("/#/public-library");
  search = page.getByRole("textbox", { name: "检索公共馆藏" });
  await search.fill(prefix);
  await page.getByRole("button", { name: "检索", exact: true }).click();
  await expect(page.locator("[data-public-library-book]")).toHaveCount(24);
  await expect(page.getByText("1 / 2", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "下一页" }).click();
  await expect(page.locator("[data-public-library-book]")).toHaveCount(1);
  await expect(page.getByText("2 / 2", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "上一页" }).click();

  for (const width of [340, 390, 768, 1440]) {
    await page.setViewportSize({ width, height: width <= 390 ? 844 : 900 });
    await expect(page.getByRole("heading", { name: "藏经阁" })).toBeVisible();
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth),
    ).toBeLessThanOrEqual(width);
    if (width === 340) {
      const controls = page.locator(
        '[role="tab"], [data-public-library-book] button, nav[aria-label="馆藏分页"] button',
      );
      for (let index = 0; index < (await controls.count()); index += 1) {
        const control = controls.nth(index);
        if (await control.isVisible()) await expectTouchSafe(control);
      }
    }
  }
  await page.setViewportSize({ width: 390, height: 844 });

  const firstPage = await request.get(
    `${apiBase}/public-library/books?q=${encodeURIComponent(prefix)}&page=1&pageSize=24`,
  );
  expect(firstPage.ok()).toBe(true);
  const firstPayload = (await firstPage.json()) as {
    snapshotRevision: number;
    items: Array<{
      id: string;
      metadataVersion: number;
      contentHash: string;
    }>;
  };
  const overlayTarget = firstPayload.items[0]!;
  const packageBefore = await request
    .get(`${apiBase}/public-library/books/${overlayTarget.id}/package`)
    .then((response) => response.json());
  const extra = await request.post(`${apiBase}/public-library/books`, {
    headers: { "x-public-library-maintenance-key": maintenanceKey },
    data: {
      title: `${prefix}revision-extra`,
      category: "其他",
      content: "第一章\nrevision extra",
      rightsConfirmed: true,
    },
  });
  expect(extra.ok()).toBe(true);
  const patched = await request.patch(
    `${apiBase}/public-library/books/${overlayTarget.id}/catalog`,
    {
      headers: { "x-public-library-maintenance-key": maintenanceKey },
      data: {
        metadataVersion: overlayTarget.metadataVersion,
        categoryId: "technology",
        tagIds: ["product"],
        collectionPath: "验证/精选",
      },
    },
  );
  expect(patched.ok()).toBe(true);
  const packageAfter = await request
    .get(`${apiBase}/public-library/books/${overlayTarget.id}/package`)
    .then((response) => response.json());
  expect(packageAfter.chapters).toEqual(packageBefore.chapters);
  expect(packageAfter.book).toMatchObject({
    contentHash: overlayTarget.contentHash,
    categoryId: "technology",
    tags: [{ id: "product", label: "产品" }],
    collectionPath: "验证/精选",
  });
  await page.getByRole("button", { name: "下一页" }).click();
  await expect(
    page.getByText("馆藏刚刚有更新，已从第一页重新整理。"),
  ).toBeVisible();
  await expect(page.locator("[data-public-library-book]")).toHaveCount(24);
  await expect(page.getByText("1 / 2", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "下一页" }).click();
  await expect(page.locator("[data-public-library-book]")).toHaveCount(2);
  await page.getByRole("button", { name: "上一页" }).click();
  const staleBooks = await request.get(
    `${apiBase}/public-library/books?page=2&pageSize=24&snapshotRevision=${firstPayload.snapshotRevision}`,
  );
  expect(staleBooks.status()).toBe(409);
  let staleFacetCount = 0;
  for (const view of ["maintainers", "categories", "tags"]) {
    const stale = await request.get(
      `${apiBase}/public-library/facets?view=${view}&page=2&pageSize=24&snapshotRevision=${firstPayload.snapshotRevision}`,
    );
    expect(stale.status()).toBe(409);
    staleFacetCount += 1;
  }
  const restartedOne = await request
    .get(`${apiBase}/public-library/books?page=1&pageSize=24`)
    .then((response) => response.json());
  const restartedTwo = await request
    .get(
      `${apiBase}/public-library/books?page=2&pageSize=24&snapshotRevision=${restartedOne.snapshotRevision}`,
    )
    .then((response) => response.json());
  const restartedIds = [...restartedOne.items, ...restartedTwo.items].map(
    (book: { id: string }) => book.id,
  );
  expect(restartedIds).toHaveLength(26);
  expect(new Set(restartedIds).size).toBe(26);

  await search.fill("");
  await page.getByRole("button", { name: "检索", exact: true }).click();
  await page.getByRole("tab", { name: "分类" }).click();
  await expect(page.locator("[data-public-library-facet]")).toHaveCount(3);
  await page.getByRole("button", { name: /技术/ }).last().click();
  await expect(
    page.getByRole("heading", { name: packageAfter.book.title }),
  ).toBeVisible();
  await page.getByRole("tab", { name: "标签" }).click();
  await page.getByRole("button", { name: /产品/ }).click();
  await expect(
    page.getByRole("heading", { name: packageAfter.book.title }),
  ).toBeVisible();
  await page.getByRole("tab", { name: "维护者" }).click();
  await page.getByRole("button", { name: /本阁维护者/ }).click();
  await expect(page.locator("[data-public-library-book]")).toHaveCount(24);

  await page.getByRole("tab", { name: "书籍" }).click();
  search = page.getByRole("textbox", { name: "检索公共馆藏" });
  let releaseOldResponse = () => {};
  const oldResponseGate = new Promise<void>((resolve) => {
    releaseOldResponse = resolve;
  });
  await page.route("**/public-library/books?*", async (route) => {
    const url = new URL(route.request().url());
    if (url.searchParams.get("q") === directTitle) await oldResponseGate;
    await route.continue();
  });
  await search.fill(directTitle);
  const oldRequest = page.waitForRequest(
    (request) => new URL(request.url()).searchParams.get("q") === directTitle,
  );
  await page.getByRole("button", { name: "检索", exact: true }).click();
  await oldRequest;
  await search.fill(`${prefix}revision-extra`);
  await page.getByRole("button", { name: "检索", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: `${prefix}revision-extra` }),
  ).toBeVisible();
  const delayedOldResponse = page.waitForResponse(
    (response) => new URL(response.url()).searchParams.get("q") === directTitle,
  );
  releaseOldResponse();
  await delayedOldResponse;
  await expect(
    page.getByRole("heading", { name: `${prefix}revision-extra` }),
  ).toBeVisible();
  await expect(page.getByRole("heading", { name: directTitle })).toHaveCount(0);

  await page.route("**/public-library/**", (route) =>
    route.abort("internetdisconnected"),
  );
  await context.setOffline(true);
  await page.goto("/#/library");
  await page.evaluate(
    (id) =>
      new Promise<void>((resolve, reject) => {
        const request = indexedDB.open("ReaderDatabase");
        request.onerror = () => reject(request.error);
        request.onsuccess = () => {
          const database = request.result;
          const transaction = database.transaction("progress", "readwrite");
          transaction.objectStore("progress").delete(id);
          transaction.oncomplete = () => {
            database.close();
            resolve();
          };
          transaction.onerror = () => reject(transaction.error);
        };
      }),
    joinedBookId,
  );
  await page
    .locator(`[data-book-id="${joinedBookId}"]`)
    .getByText(directTitle, { exact: true })
    .click();
  await expect(page.getByText("TASK-0504 直接正文一")).toBeVisible();
  await page.getByRole("button", { name: "下一章" }).click();
  await expect(page.getByText("TASK-0504 直接正文二")).toBeVisible();

  for (const headers of publicWrites) {
    expect(headers["x-public-library-maintenance-key"]).toBe(maintenanceKey);
    expect(headers["x-share-token"]).toBeUndefined();
  }
  for (const headers of anonymousReads) {
    expect(headers["x-public-library-maintenance-key"]).toBeUndefined();
    expect(headers["x-share-token"]).toBeUndefined();
  }
  for (const headers of maintenanceReads) {
    expect(headers["x-public-library-maintenance-key"]).toBe(maintenanceKey);
    expect(headers["x-share-token"]).toBeUndefined();
  }
  for (const headers of personalRequests) {
    expect(headers["x-share-token"]).toBe(maintenanceKey);
    expect(headers["x-public-library-maintenance-key"]).toBeUndefined();
  }
  expect(publicWrites.length).toBeGreaterThanOrEqual(10);
  expect(anonymousReads.length).toBeGreaterThanOrEqual(4);
  expect(maintenanceReads.length).toBeGreaterThanOrEqual(3);
  expect(personalRequests.length).toBeGreaterThanOrEqual(3);
  console.log(
    `TASK0504_EXPANSION_OBSERVATION=${JSON.stringify({
      baselineBookCount: 25,
      pageOneCount: 24,
      pageTwoCount: 1,
      scanCreatedCount: 16,
      folderCreatedCount: 7,
      directCreatedCount: 1,
      personalCreatedCount: 1,
      oldBooksRevisionRejected: true,
      oldFacetRevisionsRejected: staleFacetCount,
      offlineChaptersRead: 2,
      personalBrowserFactsUnchanged: true,
    })}`,
  );
});
