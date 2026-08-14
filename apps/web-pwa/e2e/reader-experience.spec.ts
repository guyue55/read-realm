import { expect, test, type Page } from "@playwright/test";

test.use({ viewport: { width: 390, height: 844 } });

const fixtureContentFor = (index: number) => (
  `第 ${index + 1} 章开篇锚点 ${"安静阅读的正文。".repeat(240)} 第 ${index + 1} 章收束锚点`
);

const fixtureTitleFor = (index: number) => (
  ["第一章", "第二章", "第三章"][index] ?? `第 ${index + 1} 章`
);

async function seedReaderBook(
  page: Page,
  {
    bookId,
    pageMode,
    chapterCount,
    contentFor,
  }: {
    bookId: string;
    pageMode: "scroll" | "pagination";
    chapterCount: number;
    contentFor: (index: number) => string;
  },
) {
  const chapters = Array.from({ length: chapterCount }, (_, index) => ({
    id: `${bookId}-chapter-${index}`,
    bookId,
    index,
    title: fixtureTitleFor(index),
    content: contentFor(index),
  }));
  await page.goto("/#/library");
  await page.evaluate(async ({ targetBookId, targetPageMode, targetChapters }) => {
    Object.defineProperty(navigator, "onLine", {
      configurable: true,
      get: () => false,
    });
    localStorage.setItem("reader-settings", JSON.stringify({
      fontFamily: "kaiti",
      fontSize: 18,
      lineHeight: 1.7,
      theme: "paper",
      pageMode: targetPageMode,
      uiMode: "default",
      paragraphSpacing: 16,
      letterSpacing: 0.03,
      autoFlipAtBottom: false,
    }));
    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open("ReaderDatabase");
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    try {
      await new Promise<void>((resolve, reject) => {
        const transaction = database.transaction(
          ["books", "chapters", "progress", "bookmarks"],
          "readwrite",
        );
        for (const name of ["books", "chapters", "progress", "bookmarks"]) {
          transaction.objectStore(name).clear();
        }
        const now = "2026-08-14T12:00:00.000Z";
        transaction.objectStore("books").put({
          id: targetBookId,
          title: "移动阅读打磨纵切",
          sourceType: "upload",
          format: "txt",
          status: "reading",
          tags: [],
          chapterCount: targetChapters.length,
          toc: targetChapters.map(({ index, title }) => ({ index, title })),
          parseStatus: "parsed",
          cacheStatus: "chapters_full",
          sourceAvailability: "full_cached",
          createdAt: now,
          updatedAt: now,
        });
        for (const chapter of targetChapters) {
          transaction.objectStore("chapters").put(chapter);
        }
        transaction.objectStore("progress").put({
          bookId: targetBookId,
          chapterId: `${targetBookId}-chapter-0`,
          chapterIndex: 0,
          offset: 0,
          paragraphIndex: 0,
          characterOffset: 0,
          percentage: 0,
          updatedAt: now,
        });
        transaction.oncomplete = () => resolve();
        transaction.onerror = () => reject(transaction.error);
        transaction.onabort = () => reject(transaction.error);
      });
    } finally {
      database.close();
    }
  }, {
    targetBookId: bookId,
    targetPageMode: pageMode,
    targetChapters: chapters,
  });
}

async function readProgress(
  page: import("@playwright/test").Page,
  bookId = "pagination-e2e-book",
) {
  return await page.evaluate(async (targetBookId) => {
    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open("ReaderDatabase");
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    try {
      return await new Promise<{
        chapterIndex: number;
        paragraphIndex: number;
        characterOffset: number;
      }>((resolve, reject) => {
        const request = database.transaction("progress", "readonly")
          .objectStore("progress").get(targetBookId);
        request.onsuccess = () => resolve({
          chapterIndex: request.result?.chapterIndex ?? -1,
          paragraphIndex: request.result?.paragraphIndex ?? 0,
          characterOffset: request.result?.characterOffset ?? 0,
        });
        request.onerror = () => reject(request.error);
      });
    } finally {
      database.close();
    }
  }, bookId);
}

test("layout and page-mode changes preserve the current semantic anchor", async ({ page }) => {
  const bookId = "reader-layout-anchor-e2e-book";
  await seedReaderBook(page, {
    bookId,
    pageMode: "scroll",
    chapterCount: 3,
    contentFor: (chapterIndex) => Array.from({ length: 90 }, (_, paragraphIndex) => (
      `<p>C${chapterIndex}-P${paragraphIndex}-BEGIN ${"语义位置正文".repeat(16)} C${chapterIndex}-P${paragraphIndex}-END</p>`
    )).join(""),
  });
  await page.goto(`/#/reader/${bookId}`);

  const canvas = page.locator('[data-reader-content-canvas="mobile"]');
  const chapter = canvas.locator('[data-chapter-index="1"]');
  await expect(chapter).toBeAttached({ timeout: 15_000 });
  await chapter.evaluate((node) => node.scrollIntoView({ block: "start", behavior: "auto" }));
  await expect.poll(async () => (await readProgress(page, bookId)).chapterIndex, {
    timeout: 5_000,
  }).toBe(1);
  await expect.poll(async () => canvas.locator("[data-chapter-index]").evaluateAll((nodes) => (
    nodes.map((node) => Number((node as HTMLElement).dataset.chapterIndex))
  )), { timeout: 15_000 }).toEqual([0, 1, 2]);
  const target = canvas.locator('[data-chapter-index="1"] p[data-idx="60"]');
  await expect(target).toBeAttached({ timeout: 15_000 });
  await target.evaluate((node) => {
    const container = node.closest('[data-reader-content-canvas="mobile"]') as HTMLElement;
    const targetRect = node.getBoundingClientRect();
    const containerRect = container.getBoundingClientRect();
    container.scrollTop += targetRect.top - containerRect.top;
  });
  await expect.poll(async () => (await readProgress(page, bookId)).chapterIndex, {
    timeout: 5_000,
  }).toBe(1);
  await page.waitForTimeout(750);
  const readVisibleAnchor = () => canvas.evaluate((container) => {
    const bounds = container.getBoundingClientRect();
    const readingLine = bounds.top + Math.min(120, Math.max(12, bounds.height * 0.12));
    const paragraph = Array.from(container.querySelectorAll("p[data-idx]")).find((node) => {
      const rect = node.getBoundingClientRect();
      return rect.right > bounds.left && rect.left < bounds.right && rect.bottom > readingLine;
    });
    const chapter = paragraph?.closest("[data-chapter-index]") as HTMLElement | null;
    return {
      chapterIndex: Number(chapter?.dataset.chapterIndex ?? -1),
      paragraphIndex: Number(paragraph?.getAttribute("data-idx") ?? -1),
    };
  });
  const before = await readVisibleAnchor();
  expect(before.chapterIndex).toBe(1);
  expect(before.paragraphIndex).toBeGreaterThan(10);

  const layoutStartedAt = Date.now();
  await page.getByRole("button", { name: "阅读设置" }).click();
  const settings = page.getByRole("dialog", { name: "阅读设置" });
  await settings.getByRole("button", { name: "增大字号" }).click();
  await settings.getByRole("button", { name: "左右翻页" }).click();
  await page.keyboard.press("Escape");

  const paginationState = canvas.locator("[data-anchor-page]");
  await expect(paginationState).toHaveAttribute("data-anchor-restored", "true", {
    timeout: 15_000,
  });
  await expect(canvas.locator(
    `[data-page-index]:visible p[data-idx="${before.paragraphIndex}"]`,
  )).toBeVisible({ timeout: 15_000 });
  await expect.poll(async () => (await readProgress(page, bookId)).chapterIndex, {
    timeout: 5_000,
  }).toBe(before.chapterIndex);

  await page.getByRole("button", { name: "阅读设置" }).click();
  await page.getByRole("dialog", { name: "阅读设置" })
    .getByRole("button", { name: "上下滚动" })
    .click();
  await page.keyboard.press("Escape");
  const restoredParagraph = canvas.locator(
    `[data-chapter-index="${before.chapterIndex}"] p[data-idx="${before.paragraphIndex}"]`,
  );
  await expect(restoredParagraph).toBeVisible({ timeout: 5_000 });
  await expect.poll(async () => restoredParagraph.evaluate((node) => {
    const container = node.closest('[data-reader-content-canvas="mobile"]') as HTMLElement;
    const bounds = container.getBoundingClientRect();
    const paragraph = node.getBoundingClientRect();
    return paragraph.bottom > bounds.top && paragraph.top < bounds.bottom;
  }), { timeout: 5_000 }).toBe(true);
  console.log(`PHASE04_READER_SAMPLE=${JSON.stringify({
    scenario: "semantic-layout",
    semanticAnchorVisible: true,
    stabilizationMs: Date.now() - layoutStartedAt,
  })}`);
});

test("mobile pagination advances one page before changing chapters and restores its anchor", async ({ page }) => {
  await page.goto("/#/library");
  await page.evaluate(async () => {
    localStorage.setItem("reader-settings", JSON.stringify({
      fontFamily: "kaiti",
      fontSize: 18,
      lineHeight: 1.7,
      theme: "paper",
      pageMode: "pagination",
      uiMode: "default",
      paragraphSpacing: 16,
      letterSpacing: 0.03,
      autoFlipAtBottom: false,
    }));
    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open("ReaderDatabase");
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    try {
      await new Promise<void>((resolve, reject) => {
        const transaction = database.transaction(
          ["books", "chapters", "progress", "bookmarks"],
          "readwrite",
        );
        for (const name of ["books", "chapters", "progress", "bookmarks"]) {
          transaction.objectStore(name).clear();
        }
        const now = "2026-08-14T01:30:00.000Z";
        transaction.objectStore("books").put({
          id: "pagination-e2e-book",
          title: "分页纵切",
          sourceType: "upload",
          format: "txt",
          status: "reading",
          tags: [],
          chapterCount: 2,
          toc: [
            { index: 0, title: "第一章" },
            { index: 1, title: "第二章" },
          ],
          parseStatus: "parsed",
          cacheStatus: "chapters_full",
          sourceAvailability: "full_cached",
          createdAt: now,
          updatedAt: now,
        });
        transaction.objectStore("chapters").put({
          id: "pagination-chapter-0",
          bookId: "pagination-e2e-book",
          index: 0,
          title: "第一章",
          content: `起点${"长段正文".repeat(3_000)}终点`,
        });
        transaction.objectStore("chapters").put({
          id: "pagination-chapter-1",
          bookId: "pagination-e2e-book",
          index: 1,
          title: "第二章",
          content: "第二章正文。",
        });
        transaction.objectStore("progress").put({
          bookId: "pagination-e2e-book",
          chapterId: "pagination-chapter-0",
          chapterIndex: 0,
          offset: 0,
          paragraphIndex: 0,
          characterOffset: 0,
          percentage: 0,
          updatedAt: now,
        });
        transaction.oncomplete = () => resolve();
        transaction.onerror = () => reject(transaction.error);
        transaction.onabort = () => reject(transaction.error);
      });
    } finally {
      database.close();
    }
  });

  await page.goto("/#/reader/pagination-e2e-book");
  const mobileCanvas = page.locator('[data-reader-content-canvas="mobile"]');
  const pageIndicator = mobileCanvas.getByText(/\d+ \/ \d+/);
  await expect(pageIndicator).toContainText("1 /", { timeout: 15_000 });
  await expect(page.locator('[data-page-index]:visible')).toHaveCount(2);
  await expect(mobileCanvas.getByRole("heading", { name: "第一章" })).toBeVisible();

  const persistenceStartedAt = Date.now();
  await page.locator('[data-reader-toolbar="bottom"] button[aria-label="下一页"]').click();
  await expect(pageIndicator).toContainText("2 /", { timeout: 5_000 });
  expect(await page.locator('[data-page-index]:visible').count()).toBeLessThanOrEqual(3);
  await expect.poll(async () => (await readProgress(page)).chapterIndex, {
    timeout: 1_000,
    intervals: [50, 100, 200],
  }).toBe(0);

  await expect.poll(async () => (await readProgress(page)).characterOffset, {
    timeout: 1_000,
    intervals: [50, 100, 200],
  }).toBeGreaterThan(0);
  const persistenceMs = Date.now() - persistenceStartedAt;
  const beforeReload = await readProgress(page);

  await page.reload();
  await expect.poll(async () => await readProgress(page), { timeout: 15_000 }).toEqual(beforeReload);
  const paginationState = mobileCanvas.locator('[data-anchor-page]');
  await expect(paginationState).toHaveAttribute("data-anchor-restored", "true", {
    timeout: 15_000,
  });
  await expect(paginationState).toHaveAttribute("data-anchor-page", "1");
  await expect(paginationState).toHaveAttribute("data-current-page", "1");
  await expect(pageIndicator).toContainText("2 /", { timeout: 15_000 });
  await expect.poll(async () => (await readProgress(page)).chapterIndex).toBe(0);

  const semanticCharacter = (await readProgress(page)).characterOffset;
  const expectVisiblePageContainsAnchor = async () => {
    await expect.poll(async () => page.locator('[data-page-index]:visible').evaluateAll(
      (nodes, anchor) => nodes.some((node) => {
        const start = Number((node as HTMLElement).dataset.startCharacter ?? 0);
        const end = Number((node as HTMLElement).dataset.endCharacter ?? 0);
        return start <= anchor && anchor < end;
      }),
      semanticCharacter,
    ), { timeout: 15_000 }).toBe(true);
  };

  await page.setViewportSize({ width: 1024, height: 900 });
  await expectVisiblePageContainsAnchor();
  await page.setViewportSize({ width: 390, height: 844 });
  await expectVisiblePageContainsAnchor();

  const visibleIndicator = page.locator('[data-reader-content-canvas="mobile"]')
    .getByText(/\d+ \/ \d+/);
  const nextPage = page.locator(
    '[data-reader-toolbar="bottom"] button[aria-label="下一页"]',
  );
  const parseIndicator = async () => {
    const text = await visibleIndicator.textContent();
    const match = text?.match(/(\d+)\s*\/\s*(\d+)/);
    if (!match) throw new Error(`PAGINATION_INDICATOR_INVALID:${text}`);
    return { current: Number(match[1]), total: Number(match[2]) };
  };
  let indicator = await parseIndicator();
  while (indicator.current < indicator.total) {
    const expectedPage = indicator.current + 1;
    await nextPage.click();
    await expect.poll(async () => (await parseIndicator()).current, {
      timeout: 5_000,
    }).toBe(expectedPage);
    expect((await readProgress(page)).chapterIndex).toBe(0);
    indicator = await parseIndicator();
  }

  await page.keyboard.press("ArrowRight");
  await expect.poll(async () => (await readProgress(page)).chapterIndex, {
    timeout: 5_000,
  }).toBe(1);
  await expect(mobileCanvas.getByRole("heading", { name: "第二章" })).toBeVisible();
  console.log(`PHASE04_READER_SAMPLE=${JSON.stringify({
    scenario: "pagination-persistence",
    persistenceMs,
    semanticAnchorVisible: true,
  })}`);
});

test("pagehide flush and true offline continuation preserve progress", async ({ page, context }) => {
  const bookId = "reader-lifecycle-offline-e2e-book";
  await seedReaderBook(page, {
    bookId,
    pageMode: "pagination",
    chapterCount: 2,
    contentFor: (index) => `生命周期章节 ${index} ${"离线阅读正文".repeat(2_000)}`,
  });
  await page.goto(`/#/reader/${bookId}`);
  const canvas = page.locator('[data-reader-content-canvas="mobile"]');
  await expect(canvas.getByText(/1\s*\/\s*\d+/)).toBeVisible({ timeout: 15_000 });

  await page.locator('[data-reader-toolbar="bottom"] button[aria-label="下一页"]').click();
  await page.reload();
  await expect.poll(async () => (await readProgress(page, bookId)).characterOffset, {
    timeout: 15_000,
    intervals: [50, 100, 200],
  }).toBeGreaterThan(0);
  const saved = await readProgress(page, bookId);
  await context.setOffline(true);
  await expect.poll(() => page.evaluate(() => navigator.onLine)).toBe(false);
  const indicator = canvas.getByText(/\d+\s*\/\s*\d+/);
  const beforeOfflinePage = Number((await indicator.textContent())?.match(/^(\d+)/)?.[1] ?? 0);
  await page.locator('[data-reader-toolbar="bottom"] button[aria-label="下一页"]').click();
  await expect.poll(async () => Number((await indicator.textContent())?.match(/^(\d+)/)?.[1] ?? 0), {
    timeout: 5_000,
  }).toBe(beforeOfflinePage + 1);
  await expect.poll(async () => (await readProgress(page, bookId)).characterOffset, {
    timeout: 1_000,
  }).toBeGreaterThan(saved.characterOffset);
  await expect(canvas.locator('[data-page-index]:visible').filter({
    hasText: "离线阅读正文",
  }).first()).toBeVisible();
  await context.setOffline(false);

  console.log(`PHASE04_READER_SAMPLE=${JSON.stringify({
    scenario: "lifecycle-offline",
    pagehideRestored: true,
    offlineObserved: true,
    semanticAnchorVisible: true,
  })}`);
});

test("continuous scroll keeps an active three-chapter window while moving both directions", async ({ page }) => {
  await page.goto("/#/library");
  await page.evaluate(async () => {
    localStorage.setItem("reader-settings", JSON.stringify({
      fontFamily: "kaiti",
      fontSize: 18,
      lineHeight: 1.7,
      theme: "paper",
      pageMode: "scroll",
      uiMode: "default",
      paragraphSpacing: 16,
      letterSpacing: 0.03,
      autoFlipAtBottom: false,
    }));
    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open("ReaderDatabase");
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    try {
      await new Promise<void>((resolve, reject) => {
        const transaction = database.transaction(
          ["books", "chapters", "progress", "bookmarks"],
          "readwrite",
        );
        for (const name of ["books", "chapters", "progress", "bookmarks"]) {
          transaction.objectStore(name).clear();
        }
        const now = "2026-08-14T02:55:00.000Z";
        const toc = Array.from({ length: 20 }, (_, index) => ({
          index,
          title: `第 ${index + 1} 章`,
        }));
        transaction.objectStore("books").put({
          id: "scroll-window-e2e-book",
          title: "滚动窗口纵切",
          sourceType: "upload",
          format: "txt",
          status: "reading",
          tags: [],
          chapterCount: toc.length,
          toc,
          parseStatus: "parsed",
          cacheStatus: "chapters_full",
          sourceAvailability: "full_cached",
          createdAt: now,
          updatedAt: now,
        });
        for (const item of toc) {
          transaction.objectStore("chapters").put({
            id: `scroll-window-chapter-${item.index}`,
            bookId: "scroll-window-e2e-book",
            index: item.index,
            title: item.title,
            content: `章节锚点 ${item.index} ${"正文段落".repeat(180)}`,
          });
        }
        transaction.objectStore("progress").put({
          bookId: "scroll-window-e2e-book",
          chapterId: "scroll-window-chapter-0",
          chapterIndex: 0,
          offset: 0,
          paragraphIndex: 0,
          characterOffset: 0,
          percentage: 0,
          updatedAt: now,
        });
        transaction.oncomplete = () => resolve();
        transaction.onerror = () => reject(transaction.error);
        transaction.onabort = () => reject(transaction.error);
      });
    } finally {
      database.close();
    }
  });

  await page.goto("/#/reader/scroll-window-e2e-book");
  const mobileCanvas = page.locator('[data-reader-content-canvas="mobile"]');
  const chapterNodes = mobileCanvas.locator(".chapter-container");
  let maxChapterDom = 0;
  await expect(chapterNodes).toHaveCount(2, { timeout: 15_000 });

  const waitForWindow = async (expected: number[]) => {
    await expect.poll(async () => chapterNodes.evaluateAll((nodes) =>
      nodes.map((node) => Number((node as HTMLElement).dataset.chapterIndex)),
    ), { timeout: 15_000 }).toEqual(expected);
    expect(await chapterNodes.count()).toBeLessThanOrEqual(3);
    maxChapterDom = Math.max(maxChapterDom, await chapterNodes.count());
    await page.evaluate(() => new Promise<void>((resolve) => {
      requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
    }));
  };
  const scrollToChapter = async (index: number) => {
    await mobileCanvas.locator(`[data-chapter-index="${index}"]`).evaluate((node) => {
      const chapterElement = node as HTMLElement;
      const container = chapterElement.closest(
        '[data-reader-content-canvas="mobile"]',
      ) as HTMLElement | null;
      if (!container) throw new Error("SCROLL_CONTAINER_NOT_FOUND");
      const previousBehavior = container.style.scrollBehavior;
      container.style.scrollBehavior = "auto";
      container.scrollTop = chapterElement.offsetTop;
      requestAnimationFrame(() => {
        container.style.scrollBehavior = previousBehavior;
      });
    });
  };

  for (let index = 1; index <= 11; index += 1) {
    await scrollToChapter(index);
    await waitForWindow([index - 1, index, index + 1]);
  }
  await expect.poll(async () => (
    await readProgress(page, "scroll-window-e2e-book")
  ).chapterIndex).toBe(11);

  for (let index = 10; index >= 8; index -= 1) {
    await scrollToChapter(index);
    await waitForWindow([index - 1, index, index + 1]);
  }
  await expect.poll(async () => (
    await readProgress(page, "scroll-window-e2e-book")
  ).chapterIndex).toBe(8);
  await expect(mobileCanvas.getByText("章节锚点 8", { exact: false })).toBeVisible();

  const savedAtChapterEight = await readProgress(page, "scroll-window-e2e-book");
  await page.reload();
  await expect.poll(async () => (
    await readProgress(page, "scroll-window-e2e-book")
  )).toEqual(savedAtChapterEight);
  await waitForWindow([7, 8, 9]);
  await expect(mobileCanvas.getByText("章节锚点 8", { exact: false })).toBeVisible();

  const tocButton = page.locator("button:visible").filter({ hasText: "目录" }).first();
  await tocButton.click();
  const targetChapterButton = page.locator("button:visible").filter({ hasText: "第 18 章" });
  await targetChapterButton.click();
  await waitForWindow([16, 17, 18]);
  await expect.poll(async () => (
    await readProgress(page, "scroll-window-e2e-book")
  ).chapterIndex).toBe(17);
  await expect(mobileCanvas.getByText("章节锚点 17", { exact: false })).toBeVisible();
  console.log(`PHASE04_READER_SAMPLE=${JSON.stringify({
    scenario: "bounded-scroll",
    maxChapterDom,
    semanticAnchorVisible: true,
  })}`);
});

test("reader dialogs contain and restore focus", async ({ page }) => {
  await seedReaderBook(page, {
    bookId: "reader-dialog-e2e-book",
    pageMode: "scroll",
    chapterCount: 1,
    contentFor: fixtureContentFor,
  });
  await page.goto("/#/reader/reader-dialog-e2e-book");
  await expect(page.getByRole("heading", { name: "第一章" })).toBeVisible({
    timeout: 15_000,
  });

  const settingsTrigger = page.locator('button[aria-label="阅读设置"]:visible');
  await settingsTrigger.focus();
  await page.keyboard.press("Enter");

  const dialog = page.getByRole("dialog", { name: "阅读设置" });
  await expect(dialog).toBeVisible();
  await expect.poll(() => dialog.evaluate((node) => (
    node.contains(document.activeElement)
  ))).toBe(true);

  await page.keyboard.press("Shift+Tab");
  await expect.poll(() => dialog.evaluate((node) => (
    node.contains(document.activeElement)
  ))).toBe(true);
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  await expect(settingsTrigger).toBeFocused();

  const canvas = page.locator('[data-reader-content-canvas="mobile"]');
  await canvas.click({ position: { x: 190, y: 350 } });
  const hiddenToolbars = page.locator('[data-reader-toolbar][aria-hidden="true"]');
  await expect(hiddenToolbars).toHaveCount(2);
  await page.keyboard.press("Tab");
  await expect.poll(async () => hiddenToolbars.evaluateAll((toolbars) => (
    toolbars.every((toolbar) => !toolbar.contains(document.activeElement))
  ))).toBe(true);
});

test("mobile drawers fall back to the canvas when their toolbar trigger becomes inert", async ({ page }) => {
  const bookId = "reader-mobile-drawer-focus-e2e-book";
  await seedReaderBook(page, {
    bookId,
    pageMode: "scroll",
    chapterCount: 2,
    contentFor: fixtureContentFor,
  });
  await page.route("**/ai/analyze", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ summary: "离线伴读测试" }),
    });
  });
  await page.goto(`/#/reader/${bookId}`);
  const canvas = page.locator('[data-reader-content-canvas="mobile"]');
  await expect(page.getByRole("heading", { name: "第一章" })).toBeVisible({
    timeout: 15_000,
  });

  await page.getByRole("button", { name: "伴读" }).click();
  const aiDialog = page.getByRole("dialog", { name: "伴读" });
  await expect(aiDialog).toBeVisible();
  await expect(page.locator(
    '.reader-mobile-root [data-reader-toolbar][aria-hidden="true"]',
  )).toHaveCount(2);
  await page.keyboard.press("Escape");
  await expect(aiDialog).toBeHidden();
  await expect(canvas).toBeFocused();

  await page.reload();
  await expect(page.getByRole("heading", { name: "第一章" })).toBeVisible({
    timeout: 15_000,
  });
  const tocTrigger = page.getByRole("button", { name: "目录" });
  await tocTrigger.focus();
  await page.keyboard.press("Enter");
  const tocDialog = page.getByRole("dialog", { name: "阅读目录" });
  await expect(tocDialog).toBeVisible();
  await tocDialog.getByRole("button", { name: /2\s+第二章/ }).click();
  await expect(tocDialog).toBeHidden();
  await expect(page.getByRole("heading", { name: "第二章" })).toBeVisible();
  await expect(canvas).toBeFocused();
});

test("mobile toolbars never cover pagination content", async ({ page }) => {
  await seedReaderBook(page, {
    bookId: "reader-pagination-geometry-e2e-book",
    pageMode: "pagination",
    chapterCount: 1,
    contentFor: fixtureContentFor,
  });
  await page.goto("/#/reader/reader-pagination-geometry-e2e-book");

  const topBar = page.locator('[data-reader-toolbar="top"]:visible');
  const bottomBar = page.locator('[data-reader-toolbar="bottom"]:visible');
  const readableRegion = page.locator(
    '[data-page-index]:visible .reader-content',
  ).first();
  const pageIndicator = page
    .locator('[data-reader-content-canvas="mobile"]')
    .getByText(/\d+ \/ \d+/);
  await expect(readableRegion).toBeVisible({ timeout: 15_000 });

  const [topBox, bottomBox, readableBox, indicatorBox, padding] = await Promise.all([
    topBar.boundingBox(),
    bottomBar.boundingBox(),
    readableRegion.boundingBox(),
    pageIndicator.boundingBox(),
    readableRegion.evaluate((node) => {
      const style = getComputedStyle(node);
      return {
        top: Number.parseFloat(style.paddingTop),
        bottom: Number.parseFloat(style.paddingBottom),
      };
    }),
  ]);
  expect(readableBox!.y + padding.top).toBeGreaterThanOrEqual(
    topBox!.y + topBox!.height,
  );
  expect(readableBox!.y + readableBox!.height - padding.bottom).toBeLessThanOrEqual(
    bottomBox!.y,
  );
  const overflow = await readableRegion.evaluate((node) => ({
    clientHeight: node.clientHeight,
    scrollHeight: node.scrollHeight,
  }));
  expect(overflow.scrollHeight).toBeLessThanOrEqual(overflow.clientHeight);
  expect(indicatorBox!.y + indicatorBox!.height).toBeLessThanOrEqual(bottomBox!.y);

  await page.locator('[data-reader-content-canvas="mobile"]').click({
    position: { x: 195, y: 360 },
  });
  await expect(page.locator('[data-reader-toolbar][aria-hidden="true"]')).toHaveCount(2);
  await expect.poll(() => readableRegion.evaluate((node, shownPadding) => {
    const style = getComputedStyle(node);
    return Number.parseFloat(style.paddingTop) < shownPadding.top &&
      Number.parseFloat(style.paddingBottom) < shownPadding.bottom;
  }, padding)).toBe(true);
});

test("mobile toolbars never cover scroll content", async ({ page }) => {
  await seedReaderBook(page, {
    bookId: "reader-scroll-geometry-e2e-book",
    pageMode: "scroll",
    chapterCount: 1,
    contentFor: fixtureContentFor,
  });
  await page.goto("/#/reader/reader-scroll-geometry-e2e-book");

  const canvas = page.locator('[data-reader-content-canvas="mobile"]');
  const topBar = page.locator('[data-reader-toolbar="top"]:visible');
  const bottomBar = page.locator('[data-reader-toolbar="bottom"]:visible');
  const heading = canvas.getByRole("heading", { name: "第一章" });
  await expect(heading).toBeVisible({ timeout: 15_000 });

  const [topBox, headingBox] = await Promise.all([
    topBar.boundingBox(),
    heading.boundingBox(),
  ]);
  expect(headingBox!.y).toBeGreaterThanOrEqual(topBox!.y + topBox!.height);
  const visiblePadding = await canvas.evaluate((node) => {
    const style = getComputedStyle(node);
    return {
      top: Number.parseFloat(style.paddingTop),
      bottom: Number.parseFloat(style.paddingBottom),
    };
  });

  await canvas.evaluate((node) => {
    node.scrollTop = node.scrollHeight;
  });
  await expect.poll(() => canvas.evaluate((node) => (
    Math.round(node.scrollTop + node.clientHeight) >= Math.round(node.scrollHeight)
  ))).toBe(true);
  const lastParagraph = canvas.locator(".chapter-container p").last();
  const [bottomBox, paragraphBox] = await Promise.all([
    bottomBar.boundingBox(),
    lastParagraph.boundingBox(),
  ]);
  expect(paragraphBox!.y + paragraphBox!.height).toBeLessThanOrEqual(bottomBox!.y);

  await canvas.click({ position: { x: 195, y: 360 } });
  await expect(page.locator('[data-reader-toolbar][aria-hidden="true"]')).toHaveCount(2);
  await expect.poll(() => canvas.evaluate((node, shownPadding) => {
    const style = getComputedStyle(node);
    return Number.parseFloat(style.paddingTop) < shownPadding.top &&
      Number.parseFloat(style.paddingBottom) < shownPadding.bottom;
  }, visiblePadding)).toBe(true);
});

test("reader controls are touch safe and use coherent icons", async ({ page }) => {
  await seedReaderBook(page, {
    bookId: "reader-controls-e2e-book",
    pageMode: "scroll",
    chapterCount: 1,
    contentFor: fixtureContentFor,
  });
  await page.goto("/#/reader/reader-controls-e2e-book");

  const assertTouchSafe = async () => {
    const controls = page.locator('[data-reader-control]:visible');
    await expect.poll(() => controls.count()).toBeGreaterThan(0);
    const boxes = await controls.evaluateAll((nodes) => nodes.map((node) => {
      const box = node.getBoundingClientRect();
      return {
        label: node.getAttribute("aria-label") ?? node.textContent?.trim(),
        width: box.width,
        height: box.height,
      };
    }));
    expect(boxes.filter((box) => (
      Math.round(box.width) < 44 || Math.round(box.height) < 44
    ))).toEqual([]);
  };

  await expect(page.locator('[data-reader-toolbar="bottom"]:visible')).toBeVisible({
    timeout: 15_000,
  });
  await assertTouchSafe();

  const toolbarText = await page.locator('[data-reader-toolbar]:visible').allTextContents();
  expect(toolbarText.join(" ")).not.toMatch(/[✨⚙☾⏮⏭◷☰☆]/u);
  const iconOnlyButtons = page.locator('button[data-icon-only="true"]:visible');
  await expect.poll(() => iconOnlyButtons.count()).toBeGreaterThan(0);
  const unnamedIconButtons = await iconOnlyButtons.evaluateAll((buttons) => (
    buttons.filter((button) => !button.getAttribute("aria-label")?.trim()).length
  ));
  expect(unnamedIconButtons).toBe(0);

  const settingsButton = page.getByRole("button", { name: "阅读设置" }).first();
  await settingsButton.focus();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("dialog", { name: "阅读设置" })).toBeVisible();
  await assertTouchSafe();
  await page.getByRole("button", { name: "关闭阅读设置" }).click();

  const tocButton = page.getByRole("button", { name: "目录" });
  await tocButton.click();
  await expect(page.getByRole("dialog", { name: "阅读目录" })).toBeVisible();
  await assertTouchSafe();
  await page.getByRole("button", { name: "关闭目录" }).click();

  const progressButton = page.getByRole("button", { name: "进度" });
  await progressButton.focus();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("dialog", { name: "阅读进度" })).toBeVisible();
  await assertTouchSafe();
});

test("mobile progress preview commits only after dragging ends", async ({ page }) => {
  const bookId = "reader-progress-drag-e2e-book";
  await seedReaderBook(page, {
    bookId,
    pageMode: "scroll",
    chapterCount: 4,
    contentFor: fixtureContentFor,
  });
  await page.goto(`/#/reader/${bookId}`);
  await expect(page.getByRole("heading", { name: "第一章" })).toBeVisible({
    timeout: 15_000,
  });

  await page.getByRole("button", { name: "进度" }).click();
  const dialog = page.getByRole("dialog", { name: "阅读进度" });
  const range = dialog.getByRole("slider", { name: "拖动阅读进度" });
  await expect(dialog).toBeVisible();
  await range.evaluate((input) => {
    const slider = input as HTMLInputElement;
    const setValue = Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      "value",
    )?.set;
    setValue?.call(slider, "80");
    slider.dispatchEvent(new Event("input", { bubbles: true }));
  });

  await expect(dialog).toBeVisible();
  expect((await readProgress(page, bookId)).chapterIndex).toBe(0);

  await range.dispatchEvent("pointerup");
  await expect(dialog).toBeHidden();
  await expect.poll(async () => (await readProgress(page, bookId)).chapterIndex).toBe(3);
});

test("reader note dialog contains focus and uses touch-safe actions", async ({ page }) => {
  const bookId = "reader-note-dialog-e2e-book";
  await seedReaderBook(page, {
    bookId,
    pageMode: "pagination",
    chapterCount: 1,
    contentFor: fixtureContentFor,
  });
  await page.goto(`/#/reader/${bookId}`);
  const canvas = page.locator('[data-reader-content-canvas="mobile"]');
  const paginationScroll = canvas.locator("[data-pagination-scroll]");
  const paragraph = canvas.locator("[data-page-index]:visible p").first();
  await expect(paragraph).toBeVisible({ timeout: 15_000 });
  await expect(paginationScroll).toHaveAttribute("tabindex", "-1");
  await paragraph.evaluate((node) => {
    const text = node.firstChild;
    if (!text) throw new Error("missing reader text node");
    const range = document.createRange();
    range.setStart(text, 0);
    range.setEnd(text, Math.min(8, text.textContent?.length ?? 0));
    const selection = window.getSelection();
    selection?.removeAllRanges();
    selection?.addRange(range);
    document.dispatchEvent(new MouseEvent("mouseup", { bubbles: true }));
  });

  const noteTrigger = page.getByRole("button", { name: "记笔记" });
  await expect(noteTrigger).toBeVisible();
  await noteTrigger.focus();
  await page.keyboard.press("Enter");
  const noteDialog = page.getByRole("dialog", { name: "记录读书笔记" });
  await expect(noteDialog).toBeVisible();
  await expect(canvas).toHaveAttribute("inert");
  await expect.poll(() => noteDialog.evaluate((dialog) => (
    dialog.contains(document.activeElement)
  ))).toBe(true);
  const undersizedActions = await noteDialog.locator("button").evaluateAll((buttons) => (
    buttons.map((button) => {
      const box = button.getBoundingClientRect();
      return { width: Math.round(box.width), height: Math.round(box.height) };
    }).filter(({ width, height }) => width < 44 || height < 44)
  ));
  expect(undersizedActions).toEqual([]);
  await page.keyboard.press("Shift+Tab");
  await expect.poll(() => noteDialog.evaluate((dialog) => (
    dialog.contains(document.activeElement)
  ))).toBe(true);
  await page.keyboard.press("Escape");
  await expect(noteDialog).toBeHidden();
  await expect(canvas).toBeFocused();
});

test("desktop reader drawers trap focus, close with Escape, and restore their triggers", async ({ page }) => {
  const bookId = "reader-desktop-drawers-e2e-book";
  await seedReaderBook(page, {
    bookId,
    pageMode: "pagination",
    chapterCount: 2,
    contentFor: (index) => (
      `第 ${index + 1} 章开篇锚点 ${"安静阅读的正文。".repeat(900)} 第 ${index + 1} 章收束锚点`
    ),
  });
  await page.setViewportSize({ width: 1024, height: 900 });
  await page.route("**/ai/analyze", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ summary: "离线伴读测试" }),
    });
  });
  await page.goto(`/#/reader/${bookId}`);

  const tocTrigger = page.getByRole("button", { name: "展开目录" });
  await tocTrigger.focus();
  await page.keyboard.press("Enter");
  const tocDialog = page.getByRole("dialog", { name: "阅读目录" });
  await expect(tocDialog).toBeVisible();
  await expect.poll(async () => tocDialog.evaluate((dialog) => (
    dialog.contains(document.activeElement)
  ))).toBe(true);
  const paginatedReader = page.locator(
    '[data-reader-content-canvas="desktop"] [data-current-page]',
  );
  const pageBeforeDialogKey = await paginatedReader.getAttribute("data-current-page");
  await page.keyboard.press("ArrowRight");
  await page.waitForTimeout(500);
  await expect(paginatedReader).toHaveAttribute("data-current-page", pageBeforeDialogKey!);
  await page.keyboard.press("Escape");
  await expect(tocDialog).toBeHidden();
  await expect(tocTrigger).toBeFocused();

  const aiTrigger = page.getByRole("button", { name: "智能阅读助手" });
  await aiTrigger.focus();
  await page.keyboard.press("Enter");
  const aiDialog = page.getByRole("dialog", { name: "伴读" });
  await expect(aiDialog).toBeVisible();
  await expect.poll(async () => aiDialog.evaluate((dialog) => (
    dialog.contains(document.activeElement)
  ))).toBe(true);
  const clearSession = aiDialog.getByRole("button", { name: "清除伴读会话" });
  await expect(clearSession).toBeVisible();
  await clearSession.click();
  const confirmDialog = page.getByRole("dialog", { name: "拂尘扫尘" });
  await expect(confirmDialog).toBeVisible();
  await expect.poll(() => confirmDialog.evaluate((dialog) => (
    dialog.contains(document.activeElement)
  ))).toBe(true);
  const confirmActions = await confirmDialog.locator("button").evaluateAll((buttons) => (
    buttons.map((button) => {
      const box = button.getBoundingClientRect();
      return { width: Math.round(box.width), height: Math.round(box.height) };
    }).filter(({ width, height }) => width < 44 || height < 44)
  ));
  expect(confirmActions).toEqual([]);
  await page.keyboard.press("Escape");
  await expect(confirmDialog).toBeHidden();
  await expect(aiDialog).toBeVisible();
  await expect(clearSession).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(aiDialog).toBeHidden();
  await expect(aiTrigger).toBeFocused();
});

test("reader layout stays contained across viewports and reduced motion", async ({ page }) => {
  const bookId = "reader-responsive-e2e-book";
  await seedReaderBook(page, {
    bookId,
    pageMode: "scroll",
    chapterCount: 2,
    contentFor: fixtureContentFor,
  });
  await page.goto(`/#/reader/${bookId}`);

  const viewports = [
    { width: 375, height: 812 },
    { width: 390, height: 844 },
    { width: 844, height: 390 },
    { width: 1024, height: 900 },
  ];

  for (const viewport of viewports) {
    await page.setViewportSize(viewport);
    const canvas = page.locator('[data-reader-content-canvas]:visible');
    await expect(canvas).toBeVisible({ timeout: 15_000 });
    expect(await page.evaluate(() => ({
      clientWidth: document.documentElement.clientWidth,
      scrollWidth: document.documentElement.scrollWidth,
    }))).toEqual({
      clientWidth: viewport.width,
      scrollWidth: viewport.width,
    });

    if (viewport.width === 844 && viewport.height === 390) {
      const undersizedControls = await page
        .locator('[data-reader-toolbar]:visible [data-reader-control]:visible')
        .evaluateAll((controls) => controls.map((control) => {
          const box = control.getBoundingClientRect();
          return {
            label: control.getAttribute("aria-label") ?? control.textContent?.trim(),
            width: Math.round(box.width),
            height: Math.round(box.height),
          };
        }).filter(({ width, height }) => width < 44 || height < 44));
      expect(undersizedControls).toEqual([]);
    }

    const settingsTrigger = page.locator('button[aria-label="阅读设置"]:visible');
    await settingsTrigger.focus();
    await page.keyboard.press("Enter");
    const dialog = page.getByRole("dialog", { name: "阅读设置" });
    await expect(dialog).toBeVisible();
    const panel = viewport.width >= 768
      ? dialog.locator(":scope > div > div").first()
      : dialog;
    await expect.poll(async () => {
      const panelBox = await panel.boundingBox();
      return Boolean(
        panelBox &&
        panelBox.x >= 0 &&
        panelBox.y >= 0 &&
        panelBox.x + panelBox.width <= viewport.width &&
        panelBox.y + panelBox.height <= viewport.height
      );
    }).toBe(true);
    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();
  }

  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await expect(page.locator(
    '[data-reader-content-canvas="mobile"] .chapter-container',
  ).first()).toBeVisible();
  const settingsTrigger = page.locator('button[aria-label="阅读设置"]:visible');
  await settingsTrigger.focus();
  await page.keyboard.press("Enter");
  const dialog = page.getByRole("dialog", { name: "阅读设置" });
  await expect(dialog).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
});
