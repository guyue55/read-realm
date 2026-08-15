import { expect, test } from "@playwright/test";

const apiBase = "http://127.0.0.1:4100";
const fixturePrefix = "GATE-03-EXP14-";
const maintenanceKey = "gate-03-fixture-key";

test.use({ serviceWorkers: "block" });

test("EXP-14 isolates publication, browses a real page boundary, joins atomically, and reads offline", async ({
  page,
  request,
  context,
}) => {
  const personalRequests: string[] = [];
  const anonymousPublicReads: Array<Record<string, string>> = [];
  page.on("request", (networkRequest) => {
    const url = new URL(networkRequest.url());
    if (url.pathname === "/books" || url.pathname.startsWith("/books/")) {
      personalRequests.push(url.pathname);
    }
    if (
      networkRequest.method() === "GET" &&
      url.pathname.startsWith("/public-library/")
    ) {
      anonymousPublicReads.push(networkRequest.headers());
    }
  });
  await page.addInitScript(() => {
    localStorage.removeItem("reader-share-token");
    localStorage.setItem("reader-sync-auto-startup", "false");
  });
  await page.goto("/#/library");
  await expect(
    page.getByText("私人藏书", { exact: false }).first(),
  ).toBeVisible();
  console.log("GATE03_PRODUCT_STAGE_ENTERED=EXP-14");
  await page.getByRole("link", { name: "公共藏书" }).click();
  await expect(page).toHaveURL(/#\/public-library$/);
  await expect(page.getByRole("heading", { name: "藏经阁" })).toBeVisible();
  await expect(page.getByRole("button", { name: "入阁" })).toBeDisabled();

  const rejectedHeaders: Array<Record<string, string>> = [
    {},
    { "x-public-library-maintenance-key": "default" },
    { "x-public-library-maintenance-key": "wrong-key" },
    { "x-share-token": maintenanceKey },
  ];
  for (const headers of rejectedHeaders) {
    const rejected = await request.post(`${apiBase}/public-library/books`, {
      headers,
      data: {
        title: `${fixturePrefix}REJECTED`,
        category: "经典",
        content: "不得入阁",
        rightsConfirmed: true,
      },
    });
    expect(rejected.status()).toBe(403);
  }

  for (let index = 0; index < 25; index += 1) {
    const suffix = String(index).padStart(2, "0");
    const title = `${fixturePrefix}${suffix}`;
    const published = await request.post(`${apiBase}/public-library/books`, {
      headers: { "x-public-library-maintenance-key": maintenanceKey },
      data: {
        title,
        author: "隔离维护样本",
        category: "经典",
        content: `第一章 入阁\n公共正文第一章 ${title}\n\n第二章 离线\n公共正文第二章 ${title}`,
        rightsConfirmed: true,
      },
    });
    expect(published.ok()).toBeTruthy();
  }
  for (const noise of [
    {
      title: `${fixturePrefix}FOREIGN-CATEGORY`,
      category: "文学",
    },
    {
      title: "GATE-03-NOISE-CLASSIC",
      category: "经典",
    },
  ] as const) {
    const published = await request.post(`${apiBase}/public-library/books`, {
      headers: { "x-public-library-maintenance-key": maintenanceKey },
      data: {
        ...noise,
        content: `第一章\n干扰样本 ${noise.title}`,
        rightsConfirmed: true,
      },
    });
    expect(published.ok()).toBeTruthy();
  }

  const tasksBefore = await page.evaluate(() =>
    localStorage.getItem("reader-active-sync-tasks"),
  );
  await page.getByRole("button", { name: "经典" }).click();
  await page.getByRole("textbox", { name: "检索公共馆藏" }).fill(fixturePrefix);
  await page.getByRole("button", { name: "检索", exact: true }).click();
  await expect(page.getByText("1 / 2", { exact: true })).toBeVisible();
  await expect(page.locator("article")).toHaveCount(24);
  await page.getByRole("button", { name: "下一页" }).click();
  await expect(page.getByText("2 / 2", { exact: true })).toBeVisible();
  await expect(page.locator("article")).toHaveCount(1);

  await page.getByRole("button", { name: "上一页" }).click();
  await expect(page.getByText("1 / 2", { exact: true })).toBeVisible();

  let releaseOldPage: () => void = () => {};
  let oldPageHeld = false;
  let oldPageReleased = false;
  const holdOldPage = new Promise<void>((resolve) => {
    releaseOldPage = resolve;
  });
  await page.route("**/public-library/books?*", async (route) => {
    const url = new URL(route.request().url());
    if (
      !oldPageHeld &&
      url.searchParams.get("q") === fixturePrefix &&
      url.searchParams.get("page") === "2"
    ) {
      oldPageHeld = true;
      const response = await route.fetch();
      await holdOldPage;
      await route.fulfill({ response });
      oldPageReleased = true;
      return;
    }
    await route.continue();
  });
  await page.getByRole("button", { name: "下一页" }).click();
  await expect.poll(() => oldPageHeld).toBe(true);

  const selectedTitle = `${fixturePrefix}00`;
  await page.getByRole("textbox", { name: "检索公共馆藏" }).fill(selectedTitle);
  await page.getByRole("button", { name: "检索", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: selectedTitle }),
  ).toBeVisible();
  releaseOldPage();
  await expect.poll(() => oldPageReleased).toBe(true);
  await page.waitForTimeout(200);
  await expect(
    page.getByRole("heading", { name: selectedTitle }),
  ).toBeVisible();
  await expect(page.locator("article")).toHaveCount(1);
  await page.getByRole("button", { name: "加入书架" }).click();

  await expect(page).toHaveURL(/#\/reader\//);
  const localBookId = decodeURIComponent(
    page.url().split("#/reader/")[1]?.split("?")[0] ?? "",
  );
  expect(localBookId).not.toMatch(/^public-/);
  await expect(page.getByText(`公共正文第一章 ${selectedTitle}`)).toBeVisible();

  await page.route("**/public-library/**", (route) =>
    route.abort("internetdisconnected"),
  );
  await context.setOffline(true);
  await page.getByRole("button", { name: "返回书架" }).click();
  await expect(page.locator("body")).toContainText(/私人藏书|页面暂时无法打开/);
  const appError = page.getByRole("alert", { name: "页面暂时无法打开" });
  if (await appError.isVisible()) {
    await page.getByText("查看错误信息").click();
    throw new Error(`offline shelf error: ${await appError.innerText()}`);
  }
  await page.getByText(selectedTitle, { exact: true }).first().click();
  await expect(page.getByText(`公共正文第一章 ${selectedTitle}`)).toBeVisible();
  await page.getByRole("button", { name: "下一章" }).click();
  await expect(page.getByText(`公共正文第二章 ${selectedTitle}`)).toBeVisible();

  const tasksAfter = await page.evaluate(() =>
    localStorage.getItem("reader-active-sync-tasks"),
  );
  expect(tasksAfter).toBe(tasksBefore);
  expect(personalRequests).toEqual([]);
  expect(anonymousPublicReads.length).toBeGreaterThanOrEqual(3);
  for (const headers of anonymousPublicReads) {
    expect(headers["x-share-token"]).toBeUndefined();
    expect(headers["x-public-library-maintenance-key"]).toBeUndefined();
  }
});
