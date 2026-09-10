import { expect, test } from "@playwright/test";

test.use({ serviceWorkers: "block", viewport: { width: 1440, height: 900 } });

/**
 * keep-alive 视图缓存契约：
 * 1. 固定视图首次访问后常驻挂载，切换仅切 display，不卸载不重建
 * 2. 页面内部状态（搜索词）跨视图切换保持
 * 3. 切换过程中不出现"正在打开"占位（视图已常驻）
 * 4. 刷新后从 URL query 恢复搜索词
 */
test("keep-alive 固定视图常驻、状态跨切换保持、刷新按 URL 恢复", async ({
  page,
}) => {
  await page.goto("/#/library");
  await page.waitForTimeout(800);

  // 1. 进入搜索页并输入关键词（URL 同步为带 query）
  await page.evaluate(() => {
    window.location.hash = "#/search?q=墨问常驻";
    window.dispatchEvent(new Event("popstate"));
  });
  await page.waitForTimeout(900);
  const input = page.locator("#search-input-field");
  await expect(input).toHaveValue("墨问常驻");

  // 2. 切到书架：search 视图应常驻（display:none 而非卸载）
  await page.evaluate(() => {
    window.location.hash = "#/library";
    window.dispatchEvent(new Event("popstate"));
  });
  await page.waitForTimeout(700);
  const searchDisplay = await page.evaluate(() => {
    const el = document.querySelector('[data-view-keepalive="search"]');
    return el ? getComputedStyle(el).display : "missing";
  });
  expect(searchDisplay).toBe("none");

  // 3. 切回搜索：输入框值保持（组件未卸载，state 未丢）
  await page.evaluate(() => {
    window.location.hash = "#/search?q=墨问常驻";
    window.dispatchEvent(new Event("popstate"));
  });
  await page.waitForTimeout(900);
  await expect(input).toHaveValue("墨问常驻");

  // 4. 刷新页面：从 URL query 恢复搜索词（刷新恢复）
  await page.reload();
  await page.waitForTimeout(900);
  await expect(page.locator("#search-input-field")).toHaveValue("墨问常驻");

  // 5. 切换过程无"正在打开"占位（视图常驻后无加载态）
  const loadingCount = await page
    .locator('[role="status"]:has-text("正在打开")')
    .count();
  expect(loadingCount).toBe(0);
});
