import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

describe("root view loading", () => {
  it("根页面不静态导入业务页面", async () => {
    const source = await readFile(new URL("./page.tsx", import.meta.url), "utf8");

    expect(source).not.toMatch(/import\s+LibraryPage\s+from/);
    expect(source).not.toMatch(/import\s+ReaderPageSwitch\s+from/);
    expect(source).toContain("dynamic(");
    expect(source.match(/ssr:\s*false/g)).toHaveLength(9);
  });

  it("九个业务视图都有独立动态加载入口", async () => {
    const source = await readFile(new URL("./page.tsx", import.meta.url), "utf8");
    const expectedImports = [
      "./library/page",
      "./reader/[bookId]/ReaderClient",
      "./book/[bookId]/BookDetailClient",
      "./search/page",
      "./notes/page",
      "./settings/page",
      "./import/page",
      "./import/preview/[taskId]/PreviewClient",
    ];

    for (const path of expectedImports) {
      expect(source).toContain(`import(\"${path}\")`);
    }
  });

  it("移除阻塞转场与生产调试暴露", async () => {
    const page = await readFile(new URL("./page.tsx", import.meta.url), "utf8");
    const provider = await readFile(
      new URL("../components/RouteProvider.tsx", import.meta.url),
      "utf8",
    );
    const nextConfig = await readFile(
      new URL("../../next.config.mjs", import.meta.url),
      "utf8",
    );

    expect(page).not.toMatch(/TransitionView|poison-test|blur-md|duration-500/);
    expect(provider).not.toMatch(/window\.db|\(window as any\)\.db/);
    expect(nextConfig).not.toContain("lxgw-wenkai");
  });

  it("数据库升级完成前不渲染业务视图，失败时提供可理解说明与重试", async () => {
    const provider = await readFile(
      new URL("../components/RouteProvider.tsx", import.meta.url),
      "utf8",
    );

    expect(provider).toContain('const connectDatabase = db["open"].bind(db)');
    expect(provider).toContain("await connectDatabase()");
    expect(provider).toContain("describeLocalDataMigrationError");
    expect(provider).toContain('role="alert"');
    expect(provider).toContain("重试打开本地数据");
    expect(provider).toContain('storageState !== "ready"');
  });
});
