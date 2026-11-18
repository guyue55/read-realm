import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("settings page persistence contract", () => {
  const source = readFileSync(new URL("./page.tsx", import.meta.url), "utf8");

  it("makes every reading slider keyboard-addressable and commits on blur", () => {
    for (const name of ["字号", "行高", "段落间距", "字符间距"]) {
      expect(source).toContain(`aria-label="${name}"`);
    }
    expect(source.match(/onBlur=\{\(\) => void handleSettingCommit\(settings\)\}/g)).toHaveLength(4);
  });

  it("shows settings persistence failures and serializes restore actions", () => {
    expect(source).toContain("设置保存失败");
    expect(source).toContain('role="alert"');
    expect(source).toContain("restoreMutexRef");
  });

  it("静态模式显示运行环境说明卡，列出可用与不可用功能", () => {
    expect(source).toContain("isStaticMode");
    expect(source).toContain("运行环境");
    expect(source).toContain("此静态环境不可用");
    expect(source).toContain("网址导入说明");
  });
});
