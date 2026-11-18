import { afterEach, describe, expect, it, vi } from "vitest";

/** 动态加载模块，确保每个用例都能以不同的 NEXT_PUBLIC_STATIC_MODE 重新求值。 */
async function loadStaticMode(value?: string) {
  if (value === undefined) {
    vi.stubEnv("NEXT_PUBLIC_STATIC_MODE", undefined);
  } else {
    vi.stubEnv("NEXT_PUBLIC_STATIC_MODE", value);
  }
  vi.resetModules();
  return import("./static-mode");
}

describe("static-mode 静态部署开关", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it("默认（未设置）为非静态模式，保持完整功能", async () => {
    const { isStaticMode } = await loadStaticMode();
    expect(isStaticMode).toBe(false);
  });

  it("只有值精确为 true 才开启静态模式", async () => {
    expect((await loadStaticMode("true")).isStaticMode).toBe(true);
    expect((await loadStaticMode("false")).isStaticMode).toBe(false);
    expect((await loadStaticMode("TRUE")).isStaticMode).toBe(false);
    expect((await loadStaticMode("1")).isStaticMode).toBe(false);
  });
});
