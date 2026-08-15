import { expect, test, type CDPSession, type Page } from "@playwright/test";

const bookId = "reader-mobile-touch-e2e-book";

async function seedTouchBook(page: Page) {
  await page.goto("/#/library");
  await expect(page.locator("[data-library-shelf]")).toBeAttached({ timeout: 15_000 });
  await expect.poll(async () => page.evaluate(async () => {
    const requiredStores = ["books", "chapters", "progress", "bookmarks"];
    const databases = await indexedDB.databases();
    const metadata = databases.find(({ name }) => name === "ReaderDatabase");
    if (!metadata || (metadata.version ?? 0) < 10) return false;

    return await new Promise<boolean>((resolve) => {
      const request = indexedDB.open("ReaderDatabase");
      request.onupgradeneeded = () => {
        request.transaction?.abort();
        resolve(false);
      };
      request.onsuccess = () => {
        const database = request.result;
        const ready = requiredStores.every((name) => database.objectStoreNames.contains(name));
        database.close();
        resolve(ready);
      };
      request.onerror = () => resolve(false);
      request.onblocked = () => resolve(false);
    });
  }), { timeout: 15_000 }).toBe(true);
  await page.evaluate(async (targetBookId) => {
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
        const now = "2026-08-15T00:00:00.000Z";
        transaction.objectStore("books").put({
          id: targetBookId,
          title: "真实触控阅读纵切",
          sourceType: "upload",
          format: "txt",
          status: "reading",
          tags: [],
          chapterCount: 2,
          toc: [
            { index: 0, title: "触控第一章" },
            { index: 1, title: "触控第二章" },
          ],
          parseStatus: "parsed",
          cacheStatus: "chapters_full",
          sourceAvailability: "full_cached",
          createdAt: now,
          updatedAt: now,
        });
        transaction.objectStore("chapters").put({
          id: `${targetBookId}-chapter-0`,
          bookId: targetBookId,
          index: 0,
          title: "触控第一章",
          content: `触控开篇锚点 ${"移动端分页正文。".repeat(65)} 触控收束锚点`,
        });
        transaction.objectStore("chapters").put({
          id: `${targetBookId}-chapter-1`,
          bookId: targetBookId,
          index: 1,
          title: "触控第二章",
          content: `第二章开篇 ${"稳定阅读。".repeat(120)} 第二章收束`,
        });
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
  }, bookId);
}

async function configureTouchMomentumBook(page: Page) {
  await page.evaluate(async (targetBookId) => {
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
        const transaction = database.transaction(["books", "chapters"], "readwrite");
        const bookRequest = transaction.objectStore("books").get(targetBookId);
        bookRequest.onsuccess = () => {
          transaction.objectStore("books").put({
            ...bookRequest.result,
            chapterCount: 1,
            toc: [{ index: 0, title: "触控惯性章节" }],
          });
        };
        transaction.objectStore("chapters").clear();
        transaction.objectStore("chapters").put({
          id: `${targetBookId}-chapter-0`,
          bookId: targetBookId,
          index: 0,
          title: "触控惯性章节",
          content: Array.from({ length: 90 }, (_, paragraphIndex) => (
            `<p>触控-P${paragraphIndex} ${"移动惯性语义锚点。".repeat(12)}</p>`
          )).join(""),
        });
        transaction.oncomplete = () => resolve();
        transaction.onerror = () => reject(transaction.error);
        transaction.onabort = () => reject(transaction.error);
      });
    } finally {
      database.close();
    }
  }, bookId);
}

async function readChapterIndex(page: Page) {
  return page.evaluate(async (targetBookId) => {
    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open("ReaderDatabase");
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    try {
      return await new Promise<number>((resolve, reject) => {
        const request = database.transaction("progress", "readonly")
          .objectStore("progress").get(targetBookId);
        request.onsuccess = () => resolve(request.result?.chapterIndex ?? -1);
        request.onerror = () => reject(request.error);
      });
    } finally {
      database.close();
    }
  }, bookId);
}

async function dispatchTrustedSwipe(
  session: CDPSession,
  start: { x: number; y: number },
  end: { x: number; y: number },
) {
  const point = (x: number, y: number) => ({
    x,
    y,
    radiusX: 1,
    radiusY: 1,
    force: 1,
    id: 0,
  });
  await session.send("Input.dispatchTouchEvent", {
    type: "touchStart",
    touchPoints: [point(start.x, start.y)],
  });
  await new Promise((resolve) => setTimeout(resolve, 40));
  for (let step = 1; step <= 4; step += 1) {
    await session.send("Input.dispatchTouchEvent", {
      type: "touchMove",
      touchPoints: [point(
        start.x + ((end.x - start.x) * step) / 4,
        start.y + ((end.y - start.y) * step) / 4,
      )],
    });
    await new Promise((resolve) => setTimeout(resolve, 40));
  }
  await session.send("Input.dispatchTouchEvent", {
    type: "touchEnd",
    touchPoints: [],
  });
}

test("mobile touch context completes pagination, drawer, progress and chapter boundary", async ({
  page,
  context,
}, testInfo) => {
  expect(testInfo.project.use.isMobile).toBe(true);
  expect(testInfo.project.use.hasTouch).toBe(true);
  await seedTouchBook(page);
  await page.goto(`/#/reader/${bookId}`);

  const environment = await page.evaluate(() => ({
    maxTouchPoints: navigator.maxTouchPoints,
    coarsePointer: matchMedia("(pointer: coarse)").matches,
  }));
  expect(environment.maxTouchPoints).toBeGreaterThan(0);
  expect(environment.coarsePointer).toBe(true);

  await page.evaluate(() => {
    const audit = { trustedTouchStarts: 0, trustedTouchEnds: 0 };
    (window as typeof window & { __phase04TouchAudit?: typeof audit }).__phase04TouchAudit = audit;
    document.addEventListener("touchstart", (event) => {
      if (event.isTrusted) {
        audit.trustedTouchStarts += 1;
      }
    }, { capture: true });
    document.addEventListener("touchend", (event) => {
      if (event.isTrusted) {
        audit.trustedTouchEnds += 1;
      }
    }, { capture: true });
  });

  const canvas = page.locator("[data-reader-content-canvas]");
  await expect(canvas).toHaveAttribute("data-reader-content-canvas", "mobile");
  const indicator = canvas.getByText(/\d+ \/ \d+/);
  await expect(indicator).toContainText("1 /", { timeout: 15_000 });
  const canvasBox = await canvas.boundingBox();
  expect(canvasBox).not.toBeNull();
  const session = await context.newCDPSession(page);
  await dispatchTrustedSwipe(
    session,
    { x: canvasBox!.x + canvasBox!.width * 0.8, y: canvasBox!.y + canvasBox!.height * 0.5 },
    { x: canvasBox!.x + canvasBox!.width * 0.2, y: canvasBox!.y + canvasBox!.height * 0.5 },
  );
  await expect(indicator).toContainText("2 /", { timeout: 5_000 });

  const nextPage = page.locator(
    '[data-reader-toolbar="bottom"] button[aria-label="下一页"]',
  );
  const paginationScroll = canvas.locator("[data-pagination-scroll]");
  const parseIndicator = async () => {
    const match = (await indicator.textContent())?.match(/(\d+)\s*\/\s*(\d+)/);
    if (!match) throw new Error("TOUCH_PAGINATION_INDICATOR_INVALID");
    return { current: Number(match[1]), total: Number(match[2]) };
  };
  const waitForSettledPage = async (oneBasedPage: number) => {
    await expect.poll(() => paginationScroll.evaluate((node, pageNumber) => {
      const expectedLeft = (pageNumber - 1) * (node.clientWidth + 24);
      return Math.abs(node.scrollLeft - expectedLeft) <= 2;
    }, oneBasedPage), { timeout: 5_000 }).toBe(true);
  };
  const pageState = await parseIndicator();
  expect(pageState).toEqual({ current: 2, total: 2 });
  await waitForSettledPage(pageState.current);
  await nextPage.tap();
  await expect(canvas.getByRole("heading", { name: "触控第二章" })).toBeVisible({
    timeout: 10_000,
  });
  await expect.poll(() => readChapterIndex(page)).toBe(1);

  await canvas.tap({ position: { x: canvasBox!.width / 2, y: canvasBox!.height / 2 } });
  await expect(page.locator('[data-reader-toolbar="bottom"]')).toBeVisible();
  await page.getByRole("button", { name: "进度" }).tap();
  const progressDialog = page.getByRole("dialog", { name: "阅读进度" });
  const slider = progressDialog.getByRole("slider", { name: "拖动阅读进度" });
  await expect(progressDialog).toBeVisible();
  await slider.scrollIntoViewIfNeeded();
  const sliderBox = await slider.boundingBox();
  expect(sliderBox).not.toBeNull();
  await dispatchTrustedSwipe(
    session,
    { x: sliderBox!.x + sliderBox!.width * 0.5, y: sliderBox!.y + sliderBox!.height / 2 },
    { x: sliderBox!.x + sliderBox!.width * 0.2, y: sliderBox!.y + sliderBox!.height / 2 },
  );
  await expect(progressDialog).toBeHidden({ timeout: 10_000 });
  await expect.poll(() => readChapterIndex(page)).toBe(0);

  await page.getByRole("button", { name: "阅读设置" }).tap();
  const settingsDialog = page.getByRole("dialog", { name: "阅读设置" });
  await expect(settingsDialog).toBeVisible();
  await page.getByRole("button", { name: "关闭阅读设置" }).tap();
  await expect(settingsDialog).toBeHidden();

  const audit = await page.evaluate(() => (
    (window as typeof window & {
      __phase04TouchAudit?: { trustedTouchStarts: number; trustedTouchEnds: number };
    }).__phase04TouchAudit
  ));
  expect(audit?.trustedTouchStarts).toBeGreaterThanOrEqual(5);
  expect(audit?.trustedTouchEnds).toBeGreaterThanOrEqual(5);
  await session.detach();

  console.log(`PHASE04_READER_SAMPLE=${JSON.stringify({
    scenario: "mobile-touch",
    projectName: testInfo.project.name,
    isMobile: testInfo.project.use.isMobile === true,
    hasTouch: testInfo.project.use.hasTouch === true,
    maxTouchPoints: environment.maxTouchPoints,
    coarsePointer: environment.coarsePointer,
    trustedTouchObserved: Boolean(
      audit && audit.trustedTouchStarts > 0 && audit.trustedTouchEnds > 0
    ),
    paginationSwipeObserved: true,
    drawerTapObserved: true,
    progressDragObserved: true,
    chapterBoundaryObserved: true,
  })}`);
});

test("touch momentum settles the final semantic anchor before a viewport handoff", async ({
  page,
  context,
}, testInfo) => {
  expect(testInfo.project.use.isMobile).toBe(true);
  expect(testInfo.project.use.hasTouch).toBe(true);
  await seedTouchBook(page);
  await configureTouchMomentumBook(page);
  await page.setViewportSize({ width: 340, height: 732 });
  await page.goto(`/#/reader/${bookId}`);

  const canvas = page.locator("[data-reader-content-canvas]");
  await expect(canvas).toHaveAttribute("data-reader-content-canvas", "mobile");
  await expect(canvas.locator('p[data-idx="20"]')).toBeVisible({ timeout: 15_000 });
  await canvas.locator('p[data-idx="20"]').evaluate((node) => (
    node.scrollIntoView({ block: "start", behavior: "auto" })
  ));

  const settings = page.getByRole("button", { name: "阅读设置" });
  await settings.tap();
  const dialog = page.getByRole("dialog", { name: "阅读设置" });
  await expect(dialog).toBeVisible();
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.setViewportSize({ width: 340, height: 732 });
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();

  const canvasBox = await canvas.boundingBox();
  expect(canvasBox).not.toBeNull();
  const session = await context.newCDPSession(page);
  await dispatchTrustedSwipe(
    session,
    { x: canvasBox!.x + canvasBox!.width / 2, y: canvasBox!.y + canvasBox!.height * 0.75 },
    { x: canvasBox!.x + canvasBox!.width / 2, y: canvasBox!.y + canvasBox!.height * 0.25 },
  );

  // Continue compositor-like momentum well beyond the old fixed 350ms window.
  // Each resulting scroll event must extend the trusted user sequence so the
  // final, not the gesture-start, semantic position becomes authoritative.
  for (let step = 0; step < 7; step += 1) {
    await page.waitForTimeout(100);
    await canvas.evaluate((node) => {
      node.scrollTop = Math.min(node.scrollHeight - node.clientHeight, node.scrollTop + 1_600);
    });
  }
  await page.waitForTimeout(350);

  const momentumAnchor = await canvas.evaluate((node) => {
    const line = node.getBoundingClientRect().top + 120;
    const paragraph = Array.from(node.querySelectorAll<HTMLElement>('p[data-idx]'))
      .find((candidate) => candidate.getBoundingClientRect().bottom > line);
    return Number.parseInt(paragraph?.dataset.idx ?? "-1", 10);
  });
  expect(momentumAnchor).toBeGreaterThan(25);
  expect(momentumAnchor).toBeLessThan(88);
  const retained = canvas.locator(`p[data-idx="${momentumAnchor}"]`).first();
  const expectRetainedVisible = async () => {
    await expect.poll(() => retained.evaluate((node) => {
      const container = node.closest("[data-reader-content-canvas]") as HTMLElement;
      const containerBox = container.getBoundingClientRect();
      const paragraphBox = node.getBoundingClientRect();
      return paragraphBox.bottom > containerBox.top && paragraphBox.top < containerBox.bottom;
    })).toBe(true);
  };

  await page.setViewportSize({ width: 1440, height: 900 });
  await page.waitForTimeout(1_200);
  await expectRetainedVisible();
  await page.setViewportSize({ width: 340, height: 732 });
  await page.waitForTimeout(1_200);
  await expectRetainedVisible();
  await session.detach();
});
