import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("public library page expansion boundary", () => {
  const source = readFileSync(
    new URL("../../app/public-library/page.tsx", import.meta.url),
    "utf8",
  );
  const importDialog = readFileSync(
    new URL("./PublicLibraryImportDialog.tsx", import.meta.url),
    "utf8",
  );

  it("keeps maintenance bounded and exposes the F catalog views without a new app nav item", () => {
    expect(source).toContain("加入书架");
    expect(source).toContain("PublicLibraryImportDialog");
    expect(source).toContain("入阁");
    expect(source).not.toContain("上传文件");
    expect(source).toContain('label: "维护者标识"');
    expect(source).toContain('label: "分类"');
    expect(source).toContain('label: "标签"');
    expect(source).toContain("PublicLibraryCatalogEditorDialog");
    expect(source).not.toContain("x-public-library-maintenance-key");
    expect(importDialog).toContain("选择 TXT 文件夹");
    expect(importDialog).toContain("当前设备请多选 TXT 文件");
    expect(importDialog).toContain("服务端目录");
    expect(importDialog).toContain("只扫描运维预先配置的目录");
    expect(importDialog).toContain("scanJob.items.slice(0, 50)");
    expect(importDialog).not.toContain("个人书架发布");
    expect(importDialog).not.toContain("自定义标签模板");
  });
});
