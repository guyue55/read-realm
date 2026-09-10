import { expect, test } from "@playwright/test";

/**
 * DoD-13：URL 导入流程五视口视觉走查。
 *
 * 覆盖：移动 340 / 移动 390 / 平板 768 / 桌面 1440 / 桌面 1920
 * 断言：URL 导入表单无横向溢出、无控制台错误、关键交互元素在视口内。
 */
const viewports = [
  { name: "mobile-340", width: 340, height: 740 },
  { name: "mobile-390", width: 390, height: 844 },
  { name: "tablet-768", width: 768, height: 1024 },
  { name: "desktop-1440", width: 1440, height: 900 },
  { name: "desktop-1920", width: 1920, height: 1080 },
] as const;

for (const viewport of viewports) {
  test(`URL 导入 ${viewport.name} 无溢出和无控制台错误`, async ({ page }) => {
    const errors: string[] = [];
    page.on("console", (message) => {
      if (message.type() === "error") errors.push(message.text());
    });
    page.on("pageerror", (error) => errors.push(error.message));

    await page.setViewportSize(viewport);
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto("/#/import");

    // 切到 URL 解析 tab
    await page.getByRole("button", { name: "URL 解析" }).click();

    // 关键交互元素可见
    await expect(page.getByRole("heading", { name: /粘贴小说目录页或章节页链接/ })).toBeVisible();
    await expect(page.locator('input[type="url"]')).toBeVisible();
    await expect(page.getByLabel(/我确认有权访问和保存/)).toBeVisible();
    await expect(page.getByRole("button", { name: "解析 URL" })).toBeVisible();

    const dimensions = await page.evaluate(() => ({
      clientWidth: document.documentElement.clientWidth,
      scrollWidth: document.documentElement.scrollWidth,
    }));
    expect(dimensions.scrollWidth).toBeLessThanOrEqual(dimensions.clientWidth);
    expect(errors).toEqual([]);

    await page.screenshot({
      path: `../../.tmp/verification/url-import-${viewport.name}.png`,
      fullPage: true,
    });
  });
}
