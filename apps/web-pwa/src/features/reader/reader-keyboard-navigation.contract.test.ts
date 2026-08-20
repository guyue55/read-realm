import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";

describe("Reader keyboard navigation contract", () => {
  const readerDefaultFile = path.resolve(
    __dirname,
    "../../app/reader/[bookId]/ReaderDefault.tsx",
  );

  it("ensures keyboard event listener is registered and cleaned up", () => {
    const source = fs.readFileSync(readerDefaultFile, "utf-8");
    expect(source).toContain('window.addEventListener("keydown", handleKeyDown);');
    expect(source).toContain('window.removeEventListener("keydown", handleKeyDown);');
  });

  it("handles ArrowRight, PageDown, Space for next page and ArrowLeft, PageUp, Shift+Space for prev page", () => {
    const source = fs.readFileSync(readerDefaultFile, "utf-8");
    expect(source).toContain('event.key === "ArrowRight"');
    expect(source).toContain('event.key === "PageDown"');
    expect(source).toContain('event.key === " " && !event.shiftKey');
    expect(source).toContain('event.key === "ArrowLeft"');
    expect(source).toContain('event.key === "PageUp"');
    expect(source).toContain('event.key === " " && event.shiftKey');
  });

  it("safeguards input focus, note dialog, open panels, and text selections", () => {
    const source = fs.readFileSync(readerDefaultFile, "utf-8");
    // 不在可交互输入框打字时翻页
    expect(source).toContain("isInteractiveReaderTarget(event.target)");
    // 弹窗中按 Escape 优雅关闭
    expect(source).toContain("showNoteDialog");
    expect(source).toContain("closeNoteDialog();");
    // 抽屉面板开启时阻止底层翻页
    expect(source).toContain("if (activePanel) return;");
    // 选区存在时不拦截方向键
    expect(source).toContain("selection && !selection.isCollapsed");
  });
});
