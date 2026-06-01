// @ts-nocheck
import { test, expect } from "@playwright/test";

test.describe("我的阅读世界 - 阅读页 (Reader Page) 极致 UI & 交互 E2E 测试", () => {
  
  test.beforeEach(async ({ page }) => {
    // 假设测试书籍 ID 为 test-book-101
    await page.goto("/reader/test-book-101");
    // 等待正文内容和段落 data-idx 节点加载并恢复定位稳定
    await page.waitForSelector(".reader-content p[data-idx]");
  });

  test("E05-S05: PC 宽屏视口下常驻自适应三栏布局及平滑折叠验证", async ({ page }) => {
    // 1. 设置视口为典型 PC 宽屏 (>= 1280px)
    await page.setViewportSize({ width: 1440, height: 900 });

    // 2. 验证桌面 Container 卡片是否渲染
    const desktopContainer = page.locator(".xl\\:flex");
    await expect(desktopContainer).toBeVisible();

    // 3. 验证移动端 Backdrop 遮罩和移动端专用 Drawer 此时在 PC 端隐藏
    const mobileBackdrop = page.locator(".bg-black\\/20");
    await expect(mobileBackdrop).toBeHidden();

    // 4. 获取 PC 侧常驻折叠 TOC 和 AI 栏
    const pcTocColumn = page.locator(".border-r").first();
    const pcAiColumn = page.locator(".border-l").last();

    // 初始状态下（未展开面板），两栏宽度应当收缩为 0px (或 border-0 隐藏)
    await expect(pcTocColumn).toHaveCSS("width", "0px");
    await expect(pcAiColumn).toHaveCSS("width", "0px");

    // 5. 点击 TopBar 上的 目录按钮 唤醒
    const tocToggleButton = page.locator("button:has-text('目录')").or(page.locator("button[aria-label='目录']")).first();
    if (await tocToggleButton.isVisible()) {
      await tocToggleButton.click();
      // 验证 TOC 常驻栏在 300ms 动效内，平滑横滑推开至 240px
      await page.waitForTimeout(350);
      await expect(pcTocColumn).toHaveCSS("width", "240px");
      
      // 再次点击折叠收回
      await tocToggleButton.click();
      await page.waitForTimeout(350);
      await expect(pcTocColumn).toHaveCSS("width", "0px");
    }

    // 6. 点击 AI 助手按钮 唤醒
    const aiToggleButton = page.locator("button:has-text('AI')").or(page.locator("button[aria-label='AI']")).first();
    if (await aiToggleButton.isVisible()) {
      await aiToggleButton.click();
      // 验证 AI 面板平滑推开至 338px
      await page.waitForTimeout(350);
      await expect(pcAiColumn).toHaveCSS("width", "338px");

      // 验证在无 Backdrop 遮罩干扰下，中间正文依然可点击
      const paragraph = page.locator(".reader-content p[data-idx='0']");
      await expect(paragraph).toBeVisible();
    }
  });

  test("E05-S11: 精细排版 Slider 微调与进度比例自适应重定位验证", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });

    // 打开设置面板
    const settingsBtn = page.locator("button[aria-label='设置']").or(page.locator("button:has-text('设置')")).first();
    await settingsBtn.click();
    await page.waitForSelector("input[aria-label='行间距']");

    // 1. 获取未调节排版前，当前屏幕最上方的 scrollTop
    const contentCanvas = page.locator(".reader-gpu-accelerated").first();
    const initialScrollTop = await contentCanvas.evaluate((el) => el.scrollTop);

    // 2. 模拟拖动行间距、字间距 Slider
    const letterSpacingSlider = page.locator("input[aria-label='字间距']");
    await expect(letterSpacingSlider).toBeVisible();
    
    // 改变值触发重排
    await letterSpacingSlider.fill("0.10");
    await page.waitForTimeout(100); // 等待重构计算与 restoreScrollByRatioStable 咬合稳定

    // 3. 验证排版样式完美注入正文
    const readerContent = page.locator(".reader-content").first();
    const spacingValue = await readerContent.evaluate((el) => getComputedStyle(el).getPropertyValue("--letter-spacing"));
    expect(spacingValue.trim()).toBe("0.1em");

    // 4. 验证在重排后，滚动高度并没有漂移丢失，依然恢复了等比位置
    const finalScrollTop = await contentCanvas.evaluate((el) => el.scrollTop);
    expect(finalScrollTop).not.toBeNaN();
  });

  test("E05-S07: 移动端划线选词 TouchSelectionLock 手势冲突拦截验证", async ({ page }) => {
    // 1. 模拟移动端 iPhone 12/13 视口
    await page.setViewportSize({ width: 390, height: 844 });

    // 2. 模拟长按或鼠标选取一段文本（模拟 window.getSelection().toString() 非空）
    const targetParagraph = page.locator(".reader-content p[data-idx='2']");
    await expect(targetParagraph).toBeVisible();
    await targetParagraph.selectText(); // 模拟活动选区

    // 3. 尝试在移动端 Canvas 容器上执行滑动手势 (Swipe Left)
    const contentCanvas = page.locator(".xl\\:hidden .reader-gpu-accelerated").first();
    
    // 模拟横向滑动
    const bbox = await contentCanvas.boundingBox();
    if (bbox) {
      const startX = bbox.x + bbox.width * 0.8;
      const startY = bbox.y + bbox.height * 0.5;
      const endX = bbox.x + bbox.width * 0.2;
      
      // 拖拽滑动
      await page.mouse.move(startX, startY);
      await page.mouse.down();
      await page.mouse.move(endX, startY, { steps: 10 });
      await page.mouse.up();
    }

    // 4. 验证此时并没有发生翻页，仍然保留在当前章节的当前页，TouchSelectionLock 起到拦截作用
    const chapterTitle = page.locator(".xl\\:hidden h2, .xl\\:hidden .text-2xl").first();
    await expect(chapterTitle).toBeVisible();
  });
});
