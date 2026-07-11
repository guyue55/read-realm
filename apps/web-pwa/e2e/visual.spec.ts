import { expect, test } from "@playwright/test";

const viewports = [
  { name: "mobile-340", width: 340, height: 740 },
  { name: "mobile-390", width: 390, height: 844 },
  { name: "tablet-768", width: 768, height: 1024 },
  { name: "desktop-1440", width: 1440, height: 900 },
  { name: "desktop-1920", width: 1920, height: 1080 },
] as const;

for (const viewport of viewports) {
  test(`${viewport.name} 主界面无溢出和控制台错误`, async ({ page }) => {
    const errors: string[] = [];
    page.on("console", (message) => {
      if (message.type() === "error") errors.push(message.text());
    });
    page.on("pageerror", (error) => errors.push(error.message));

    await page.setViewportSize(viewport);
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto("/#/library");
    await expect(page.getByRole("heading", { name: "书架还是空的" })).toBeVisible();
    await expect(page.getByRole("navigation", { name: "主导航" }).first()).toBeAttached();

    const dimensions = await page.evaluate(() => ({
      clientWidth: document.documentElement.clientWidth,
      scrollWidth: document.documentElement.scrollWidth,
    }));
    expect(dimensions.scrollWidth).toBeLessThanOrEqual(dimensions.clientWidth);
    expect(errors).toEqual([]);

    await page.screenshot({
      path: `../../.tmp/verification/${viewport.name}.png`,
      fullPage: true,
    });
  });
}
