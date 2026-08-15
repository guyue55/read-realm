import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("public library page expansion boundary", () => {
  const source = readFileSync(
    new URL("../../app/public-library/page.tsx", import.meta.url),
    "utf8",
  );

  it("adds only the bounded file entry while later expansion stays absent", () => {
    expect(source).toContain("加入书架");
    expect(source).toContain("PublicLibraryImportDialog");
    expect(source).toContain("入阁");
    expect(source).not.toContain("上传文件");
    expect(source).not.toContain("扫描目录");
    expect(source).not.toContain("维护者视图");
    expect(source).not.toContain("x-public-library-maintenance-key");
  });
});
