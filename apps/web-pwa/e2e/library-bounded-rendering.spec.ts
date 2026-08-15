import { expect, test } from "@playwright/test";

const BOOK_COUNT = 500;
const PAGE_SIZE = 48;

function remoteBook(index: number) {
  const suffix = String(index).padStart(3, "0");
  return {
    id: `cloud-book-${suffix}`,
    title: `云端藏书 ${suffix}`,
    sourceType: "cloud_cache",
    format: "txt",
    status: "reading",
    tags: [],
    chapterCount: 2,
    createdAt: "2026-08-15T00:00:00.000Z",
    updatedAt: "2026-08-15T00:00:00.000Z",
  };
}

async function expectVisibleTouchTargets(
  locator: import("@playwright/test").Locator,
) {
  for (const target of await locator.all()) {
    if (!(await target.isVisible())) continue;
    const box = await target.boundingBox();
    expect(Math.round(box?.width ?? 0)).toBeGreaterThanOrEqual(44);
    expect(Math.round(box?.height ?? 0)).toBeGreaterThanOrEqual(44);
  }
}

async function seedLargeShelf(page: import("@playwright/test").Page) {
  await page.evaluate(
    ({ bookCount }) =>
      new Promise<void>((resolve, reject) => {
        const request = indexedDB.open("ReaderDatabase");
        request.onerror = () => reject(request.error);
        request.onsuccess = () => {
          const database = request.result;
          const transaction = database.transaction("books", "readwrite");
          const store = transaction.objectStore("books");
          for (let index = 0; index < bookCount; index += 1) {
            const suffix = String(index).padStart(3, "0");
            store.put({
              id: `bounded-book-${suffix}`,
              title: `有界书架 ${suffix}`,
              sourceType: "upload",
              format: "epub",
              status: "reading",
              tags: [],
              chapterCount: 1,
              createdAt: "2026-08-15T00:00:00.000Z",
              updatedAt: "2026-08-15T00:00:00.000Z",
            });
          }
          transaction.oncomplete = () => {
            database.close();
            resolve();
          };
          transaction.onerror = () => reject(transaction.error);
          transaction.onabort = () => reject(transaction.error);
        };
      }),
    { bookCount: BOOK_COUNT },
  );
}

async function seedLargeFolderShelf(page: import("@playwright/test").Page) {
  await page.evaluate(
    ({ itemCount }) =>
      new Promise<void>((resolve, reject) => {
        const request = indexedDB.open("ReaderDatabase");
        request.onerror = () => reject(request.error);
        request.onsuccess = () => {
          const database = request.result;
          const transaction = database.transaction(
            ["books", "libraryFolders"],
            "readwrite",
          );
          const bookStore = transaction.objectStore("books");
          const folderStore = transaction.objectStore("libraryFolders");
          for (let index = 0; index < itemCount; index += 1) {
            const suffix = String(index).padStart(3, "0");
            const folderId = `bounded-folder-${suffix}`;
            folderStore.put({
              id: folderId,
              name: `有界书箧 ${suffix}`,
              sourceType: "virtual",
              depth: 0,
              sortOrder: index,
              createdAt: "2026-08-15T00:00:00.000Z",
              updatedAt: "2026-08-15T00:00:00.000Z",
            });
            bookStore.put({
              id: `folder-book-${suffix}`,
              title: `书箧藏书 ${suffix}`,
              sourceType: "upload",
              sourceFolderId: folderId,
              format: "epub",
              status: "reading",
              tags: [],
              chapterCount: 1,
              createdAt: "2026-08-15T00:00:00.000Z",
              updatedAt: "2026-08-15T00:00:00.000Z",
            });
          }
          transaction.oncomplete = () => {
            database.close();
            resolve();
          };
          transaction.onerror = () => reject(transaction.error);
          transaction.onabort = () => reject(transaction.error);
        };
      }),
    { itemCount: BOOK_COUNT },
  );
}

async function seedSmallMixedShelf(page: import("@playwright/test").Page) {
  await page.evaluate(
    () =>
      new Promise<void>((resolve, reject) => {
        const request = indexedDB.open("ReaderDatabase");
        request.onerror = () => reject(request.error);
        request.onsuccess = () => {
          const database = request.result;
          const transaction = database.transaction(
            ["books", "libraryFolders"],
            "readwrite",
          );
          transaction.objectStore("books").put({
            id: "mobile-menu-book",
            title: "移动菜单验证书",
            sourceType: "upload",
            format: "epub",
            status: "reading",
            tags: [],
            chapterCount: 1,
            createdAt: "2026-08-15T00:00:00.000Z",
            updatedAt: "2026-08-15T00:00:00.000Z",
          });
          transaction.objectStore("libraryFolders").put({
            id: "mobile-menu-folder",
            name: "移动书箧",
            sourceType: "virtual",
            depth: 0,
            sortOrder: 0,
            createdAt: "2026-08-15T00:00:00.000Z",
            updatedAt: "2026-08-15T00:00:00.000Z",
          });
          transaction.oncomplete = () => {
            database.close();
            resolve();
          };
          transaction.onerror = () => reject(transaction.error);
          transaction.onabort = () => reject(transaction.error);
        };
      }),
  );
}

test("340px shelf exposes first-use sync, unclipped menus, and the registered UI font", async ({
  page,
}) => {
  await page.setViewportSize({ width: 340, height: 760 });
  await page.addInitScript(() => {
    localStorage.removeItem("reader-share-token");
    localStorage.setItem("reader-sync-auto-startup", "false");
  });
  await page.goto("/library");
  await expect(
    page.getByRole("heading", { name: "书架还是空的" }),
  ).toBeVisible();
  await seedSmallMixedShelf(page);
  await page.reload();

  await expect(page.locator("[data-library-sync]")).toBeVisible();
  await page.getByRole("button", { name: /私人云同步设置/u }).click();
  await expect(page.getByLabel("私人云访问口令")).toBeVisible();

  const fontFacts = await page.evaluate(() => ({
    rootToken: getComputedStyle(document.documentElement)
      .getPropertyValue("--font-ui")
      .trim(),
    buttonFont: getComputedStyle(document.querySelector("button")!).fontFamily,
  }));
  expect(fontFacts.rootToken).not.toBe("");
  expect(fontFacts.buttonFont.toLowerCase()).toContain("geist");

  const bookCard = page.locator('[data-book-id="mobile-menu-book"]');
  const bookMenuTrigger = bookCard.getByRole("button", {
    name: /操作菜单/u,
  });
  await bookMenuTrigger.click();
  const bookMenu = bookCard.getByRole("menu");
  await expect(bookMenu).toBeVisible();
  await bookMenu.getByRole("menuitem", { name: "管理书籍" }).click();
  await expect(page.getByRole("dialog", { name: /书籍管理/u })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(bookMenuTrigger).toBeFocused();

  const folderCard = page.locator('[data-folder-id="mobile-menu-folder"]');
  const folderTrigger = folderCard.getByRole("button", { name: /操作菜单/u });
  await expect(folderCard.getByRole("button", { name: "解散" })).toHaveCount(0);
  await folderTrigger.click();
  const folderMenu = folderCard.getByRole("menu");
  await expect(folderMenu.getByRole("menuitem", { name: "解散书箧" })).toBeVisible();
  await page.keyboard.press("Home");
  await expect(folderMenu.getByRole("menuitem").first()).toBeFocused();
  await page.keyboard.press("End");
  await expect(folderMenu.getByRole("menuitem").last()).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(folderTrigger).toBeFocused();
  await expect(page.locator("html")).toHaveJSProperty("scrollWidth", 340);
});

test("500-book shelf stays bounded across views, pages, mobile, and offline", async ({
  context,
  page,
}) => {
  test.setTimeout(60_000);
  await page.addInitScript(() => {
    localStorage.setItem("reader-share-token", "bounded-render-key");
    localStorage.setItem("reader-sync-auto-startup", "false");
  });
  await page.goto("/library");
  await expect(
    page.getByRole("heading", { name: "书架还是空的" }),
  ).toBeVisible();
  await seedLargeShelf(page);
  await page.reload();

  const cards = page.locator("[data-library-shelf] [data-book-id]");
  const pagination = page.locator("[data-library-pagination]");
  await expect(cards).toHaveCount(PAGE_SIZE);
  await expect(pagination).toContainText("第 1 / 11 页");
  await expect(pagination).toContainText("当前 1–48 项，共 500 项");

  await page.getByRole("button", { name: "紧凑", exact: true }).click();
  await expect(cards).toHaveCount(PAGE_SIZE);
  await page.getByRole("button", { name: "列表", exact: true }).click();
  await expect(cards).toHaveCount(PAGE_SIZE);

  await page.getByRole("button", { name: "下一页", exact: true }).click();
  await expect(pagination).toContainText("第 2 / 11 页");
  await expect(page.locator('[data-book-id="bounded-book-048"]')).toHaveCount(
    1,
  );
  await expect(page.locator('[data-book-id="bounded-book-000"]')).toHaveCount(
    0,
  );

  await page.getByRole("button", { name: "末页", exact: true }).click();
  await expect(cards).toHaveCount(BOOK_COUNT - PAGE_SIZE * 10);
  await expect(pagination).toContainText("当前 481–500 项，共 500 项");
  await expect(page.locator('[data-book-id="bounded-book-499"]')).toHaveCount(
    1,
  );

  await page.setViewportSize({ width: 390, height: 844 });
  await expect(cards).toHaveCount(20);
  const paginationButtons = pagination.getByRole("button");
  expect(await paginationButtons.count()).toBe(4);
  for (const button of await paginationButtons.all()) {
    const box = await button.boundingBox();
    expect(box?.height ?? 0).toBeGreaterThanOrEqual(44);
  }

  await page.getByRole("button", { name: /私人云同步设置/u }).click();
  await expectVisibleTouchTargets(
    page.locator(
      "[data-library-sync] button, [data-library-sync] input, [data-library-sync] select",
    ),
  );
  const firstVisibleBook = cards.first();
  const firstBookMenu = firstVisibleBook.getByRole("button", {
    name: /操作菜单/u,
  });
  await expect(
    firstVisibleBook.locator("[data-library-entry-primary]"),
  ).toHaveCount(1);
  await expect(firstBookMenu).toHaveCount(1);
  await firstBookMenu.click();
  const actionMenu = firstVisibleBook.getByRole("menu");
  await expect(actionMenu).toBeVisible();
  await expectVisibleTouchTargets(actionMenu.getByRole("menuitem"));
  await page.keyboard.press("Escape");
  await expect(actionMenu).toHaveCount(0);
  await expect(firstBookMenu).toBeFocused();

  await firstBookMenu.click();
  await actionMenu.getByRole("menuitem", { name: "管理书籍" }).click();
  const governanceDialog = page.getByRole("dialog", { name: /书籍管理/u });
  await expect(governanceDialog).toBeVisible();
  await expectVisibleTouchTargets(
    governanceDialog.locator("button, input, select"),
  );
  await page.keyboard.press("Escape");
  await expect(governanceDialog).toHaveCount(0);
  await expect(firstBookMenu).toBeFocused();

  await context.setOffline(true);
  await page.getByRole("button", { name: "上一页", exact: true }).click();
  await expect(pagination).toContainText("第 10 / 11 页");
  await expect(cards).toHaveCount(PAGE_SIZE);
  await context.setOffline(false);

  await page.getByRole("button", { name: "书名", exact: true }).click();
  await expect(pagination).toContainText("第 1 / 11 页");
  await expect(page.locator('[data-book-id="bounded-book-000"]')).toHaveCount(
    1,
  );

  await page.goto("/#/library?page=8&sort=title&view=list");
  await expect(pagination).toContainText("第 8 / 11 页");
  const sourceCard = page.locator('[data-book-id="bounded-book-342"]');
  await expect(sourceCard).toHaveCount(1);
  const main = page.locator("[data-app-main]");
  await sourceCard.evaluate((element) => {
    element.scrollIntoView({ block: "center" });
    element.closest("[data-app-main]")?.dispatchEvent(new Event("scroll"));
  });
  const rememberedScroll = await main.evaluate((element) => element.scrollTop);
  expect(rememberedScroll).toBeGreaterThan(0);

  await page.evaluate(() => {
    history.replaceState(
      { __NA: true, __PRIVATE_NEXTJS_INTERNALS_TREE: {} },
      "",
      location.href,
    );
  });

  const sourcePrimary = sourceCard.locator("[data-library-entry-primary]");
  await sourcePrimary.click();
  await expect(page).toHaveURL(/#\/reader\/bounded-book-342$/u);
  await page.goBack();
  await expect(page).toHaveURL(/#\/library\?page=8&sort=title&view=list$/u);
  await expect(pagination).toContainText("第 8 / 11 页");
  await expect(sourcePrimary).toBeFocused();

  await sourcePrimary.press("Enter");
  await expect(page).toHaveURL(/#\/reader\/bounded-book-342$/u);
  await page.goBack();
  await expect(page).toHaveURL(/#\/library\?page=8&sort=title&view=list$/u);
  await expect(pagination).toContainText("第 8 / 11 页");
  await expect(
    sourceCard.locator("[data-library-entry-primary]"),
  ).toBeFocused();
  await expect
    .poll(() =>
      page.evaluate(() =>
        sessionStorage.getItem("reading_world_view_scroll:library"),
      ),
    )
    .toBe(String(rememberedScroll));
  await expect
    .poll(() => main.evaluate((element) => element.scrollTop))
    .toBe(rememberedScroll);

  await page.reload();
  await expect(pagination).toContainText("第 8 / 11 页");
  await expect(
    sourceCard.locator("[data-library-entry-primary]"),
  ).toBeFocused();
  await expect
    .poll(() => main.evaluate((element) => element.scrollTop))
    .toBe(rememberedScroll);
});

test("500 root folders share the same hard DOM bound as books", async ({
  page,
}) => {
  await page.goto("/library");
  await expect(
    page.getByRole("heading", { name: "书架还是空的" }),
  ).toBeVisible();
  await seedLargeFolderShelf(page);
  await page.reload();

  const shelfEntries = page.locator(
    "[data-library-shelf] [data-folder-id], [data-library-shelf] [data-book-id]",
  );
  const pagination = page.locator("[data-library-pagination]");
  await expect(shelfEntries).toHaveCount(PAGE_SIZE);
  await expect(
    page.locator("[data-library-shelf] [data-folder-id]"),
  ).toHaveCount(PAGE_SIZE);
  await expect(page.locator("[data-library-shelf] [data-book-id]")).toHaveCount(
    0,
  );
  await expect(pagination).toContainText("第 1 / 11 页");

  await page.locator('[data-folder-id="bounded-folder-000"]').click();
  await expect(page.locator('[data-book-id="folder-book-000"]')).toHaveCount(1);
  await expect(page.locator("[data-library-pagination]")).toHaveCount(0);

  await page.getByRole("button", { name: "我的书架", exact: true }).click();
  await expect(shelfEntries).toHaveCount(PAGE_SIZE);
  await page.getByRole("button", { name: "下一页", exact: true }).click();
  await expect(pagination).toContainText("第 2 / 11 页");
  await expect(
    page.locator('[data-folder-id="bounded-folder-048"]'),
  ).toHaveCount(1);
  await expect(
    page.locator('[data-folder-id="bounded-folder-000"]'),
  ).toHaveCount(0);
});

test("deep page waits for the matching private-cloud inventory before clamping", async ({
  page,
}) => {
  await page.addInitScript(() => {
    localStorage.setItem("reader-share-token", "delayed-cloud-key");
    localStorage.setItem("reader-sync-auto-startup", "false");
  });

  let releaseInventory: () => void = () => undefined;
  const inventoryGate = new Promise<void>((resolve) => {
    releaseInventory = resolve;
  });
  await page.route("**/books", async (route) => {
    await inventoryGate;
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(
        Array.from({ length: 120 }, (_, index) => remoteBook(index)),
      ),
    });
  });

  await page.goto("/#/library?page=3&sort=title&view=list");
  await page.waitForTimeout(250);
  await expect(page).toHaveURL(/#\/library\?page=3&sort=title&view=list$/u);

  releaseInventory();
  const pagination = page.locator("[data-library-pagination]");
  await expect(pagination).toContainText("第 3 / 3 页");
  await expect(pagination).toContainText("当前 97–120 项，共 120 项");
  await expect(page.locator('[data-book-id="cloud-book-096"]')).toHaveCount(1);
  await expect(page).toHaveURL(/#\/library\?page=3&sort=title&view=list$/u);
});

test("an older same-key inventory cannot overwrite a verified cloud clear", async ({
  page,
}) => {
  await page.addInitScript(() => {
    localStorage.setItem("reader-share-token", "same-key-generation");
    localStorage.setItem("reader-sync-auto-startup", "false");
  });

  let releaseOldInventory: () => void = () => undefined;
  const oldInventoryGate = new Promise<void>((resolve) => {
    releaseOldInventory = resolve;
  });
  let requestCount = 0;
  await page.route("**/books", async (route) => {
    if (route.request().method() === "DELETE") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ success: true }),
      });
      return;
    }
    requestCount += 1;
    if (requestCount === 1) {
      await oldInventoryGate;
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(
          Array.from({ length: 120 }, (_, index) => remoteBook(index)),
        ),
      });
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: "[]",
    });
  });

  await page.goto("/#/library?view=list");
  await page.getByRole("button", { name: /私人云同步设置/u }).click();
  await page.getByRole("button", { name: /清空云端备份/u }).click();
  const dialog = page.getByRole("dialog", { name: /清空私人云端备份/u });
  await dialog.getByRole("button", { name: "确认", exact: true }).click();
  await expect.poll(() => requestCount).toBeGreaterThanOrEqual(2);
  await expect(dialog).toHaveCount(0);

  releaseOldInventory();
  await page.waitForTimeout(250);
  await expect(page.locator("[data-library-shelf] [data-book-id]")).toHaveCount(
    0,
  );
  await expect(
    page.getByRole("heading", { name: "书架还是空的" }),
  ).toBeVisible();
});
