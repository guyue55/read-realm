import { expect, test } from "@playwright/test";

const apiBase = "http://127.0.0.1:4100";
const maintenanceKey = "gate-03-fixture-key";

test.use({ serviceWorkers: "block", viewport: { width: 390, height: 844 } });

test("taxonomy views, bounded pages and catalog overlay stay coherent", async ({
  page,
  request,
}) => {
  test.setTimeout(90_000);
  const prefix = `TASK-0504-F-${Date.now()}`;
  for (let index = 0; index < 26; index += 1) {
    const response = await request.post(`${apiBase}/public-library/books`, {
      headers: { "x-public-library-maintenance-key": maintenanceKey },
      data: {
        title: `${prefix}-${String(index).padStart(2, "0")}`,
        author: "本阁维护者",
        category: index % 2 === 0 ? "经典" : "技术",
        tagIds: index % 2 === 0 ? ["jing"] : ["programming"],
        content: `第一章\n${prefix} 正文 ${index}`,
        rightsConfirmed: true,
      },
    });
    expect(response.ok()).toBe(true);
  }

  const publicWrites: Array<Record<string, string>> = [];
  page.on("request", (request) => {
    const url = new URL(request.url());
    if (request.method() === "PATCH" && url.pathname.endsWith("/catalog")) {
      publicWrites.push(request.headers());
    }
  });
  await page.addInitScript((key) => {
    localStorage.setItem("reader-share-token", key);
    localStorage.setItem("reader-sync-auto-startup", "false");
  }, maintenanceKey);
  await page.goto("/#/public-library");

  const search = page.getByRole("textbox", { name: "检索公共馆藏" });
  await search.fill(prefix);
  await page.getByRole("button", { name: "检索", exact: true }).click();
  await expect(page.locator("[data-public-library-book]")).toHaveCount(24);
  await expect(page.getByText("1 / 2", { exact: true })).toBeVisible();
  const latePublication = await request.post(
    `${apiBase}/public-library/books`,
    {
      headers: { "x-public-library-maintenance-key": maintenanceKey },
      data: {
        title: `${prefix}-26`,
        category: "经典",
        tagIds: ["jing"],
        content: `第一章\n${prefix} 正文 26`,
        rightsConfirmed: true,
      },
    },
  );
  expect(latePublication.ok()).toBe(true);
  await page.getByRole("button", { name: "下一页" }).click();
  await expect(
    page.getByText("馆藏刚刚有更新，已从第一页重新整理。"),
  ).toBeVisible();
  await expect(page.locator("[data-public-library-book]")).toHaveCount(24);
  await page.getByRole("button", { name: "下一页" }).click();
  await expect(page.locator("[data-public-library-book]")).toHaveCount(3);
  await page.getByRole("button", { name: "上一页" }).click();
  await expect(page.locator("[data-public-library-book]")).toHaveCount(24);
  await page.getByRole("tab", { name: "书籍" }).click();
  await page.getByRole("button", { name: "全部", exact: true }).click();
  await expect(page.locator("[data-public-library-book]")).toHaveCount(24);

  const targetTitle = `${prefix}-24`;
  const editButton = page.getByRole("button", {
    name: `整理《${targetTitle}》目录`,
  });
  await editButton.click();
  const dialog = page.getByRole("dialog", { name: "整理馆藏目录" });
  await expect(dialog).toBeVisible();
  await expect(
    page.getByRole("button", { name: "关闭目录编辑" }),
  ).toBeFocused();
  for (let index = 0; index < 20; index += 1) {
    await page.keyboard.press("Tab");
    expect(
      await dialog.evaluate((surface) =>
        surface.contains(document.activeElement),
      ),
    ).toBe(true);
  }
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  await expect(editButton).toBeFocused();
  await editButton.click();
  await expect(dialog).toBeVisible();
  await page.setViewportSize({ width: 340, height: 760 });
  await expect
    .poll(() => page.evaluate(() => document.documentElement.scrollWidth))
    .toBeLessThanOrEqual(340);
  const dialogControls = dialog.locator(
    "button, select, input:not([type=checkbox]), label:has(input[type=checkbox])",
  );
  for (let index = 0; index < (await dialogControls.count()); index += 1) {
    const box = await dialogControls.nth(index).boundingBox();
    if (!box) continue;
    expect(box.height).toBeGreaterThanOrEqual(44);
    expect(box.width).toBeGreaterThanOrEqual(44);
  }
  await page.getByRole("checkbox", { name: "产品" }).check();
  await page.getByLabel("阁内路径").fill("精选/工程");
  await page.getByRole("button", { name: "保存目录" }).click();
  await expect(dialog).toBeHidden();
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(
    page.getByText("目录信息已更新，正文包保持不变。"),
  ).toBeVisible();
  expect(publicWrites).toHaveLength(1);
  expect(publicWrites[0]?.["x-public-library-maintenance-key"]).toBe(
    maintenanceKey,
  );
  expect(publicWrites[0]?.["x-share-token"]).toBeUndefined();

  await search.fill("");
  await page.getByRole("button", { name: "检索", exact: true }).click();
  await page.getByRole("tab", { name: "分类" }).click();
  await expect(page.locator("[data-public-library-facet]")).toHaveCount(2);
  await page.getByRole("button", { name: /经典/ }).last().click();
  await expect(page.getByRole("heading", { name: targetTitle })).toBeVisible();

  await page.getByRole("tab", { name: "标签" }).click();
  await page.getByRole("button", { name: /产品/ }).click();
  await expect(page.getByRole("heading", { name: targetTitle })).toBeVisible();

  await page.getByRole("tab", { name: "维护者" }).click();
  await page.getByRole("button", { name: /本阁维护者/ }).click();
  await expect(page.locator("[data-public-library-book]")).toHaveCount(24);

  await page.getByRole("tab", { name: "书籍" }).click();
  let releaseOldResponse: () => void = () => {};
  const oldResponseGate = new Promise<void>((resolve) => {
    releaseOldResponse = resolve;
  });
  await page.route("**/public-library/books?*", async (route) => {
    const url = new URL(route.request().url());
    if (url.searchParams.get("q") === `${prefix}-00`) {
      await oldResponseGate;
    }
    await route.continue();
  });
  await search.fill(`${prefix}-00`);
  const oldRequest = page.waitForRequest(
    (request) =>
      new URL(request.url()).searchParams.get("q") === `${prefix}-00`,
  );
  await page.getByRole("button", { name: "检索", exact: true }).click();
  await oldRequest;
  await search.fill(targetTitle);
  await page.getByRole("button", { name: "检索", exact: true }).click();
  await expect(page.getByRole("heading", { name: targetTitle })).toBeVisible();
  const oldResponse = page.waitForResponse(
    (response) =>
      new URL(response.url()).searchParams.get("q") === `${prefix}-00`,
  );
  releaseOldResponse();
  await oldResponse;
  await expect(page.getByRole("heading", { name: targetTitle })).toBeVisible();
  await expect(page.getByRole("heading", { name: `${prefix}-00` })).toHaveCount(
    0,
  );

  await page.setViewportSize({ width: 340, height: 760 });
  await expect
    .poll(() => page.evaluate(() => document.documentElement.scrollWidth))
    .toBeLessThanOrEqual(340);
  const controls = page.locator(
    '[role="tab"], [data-public-library-book] button, nav[aria-label="馆藏分页"] button',
  );
  for (let index = 0; index < (await controls.count()); index += 1) {
    const box = await controls.nth(index).boundingBox();
    if (!box) continue;
    expect(box.height).toBeGreaterThanOrEqual(44);
    expect(box.width).toBeGreaterThanOrEqual(44);
  }
  for (const width of [390, 768, 1440]) {
    await page.setViewportSize({ width, height: width < 768 ? 844 : 900 });
    await expect
      .poll(() => page.evaluate(() => document.documentElement.scrollWidth))
      .toBeLessThanOrEqual(width);
  }
});
