import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("PublicLibraryBookDetailModal and In-Library Reading Contract", () => {
  const modalSource = readFileSync(
    new URL("./PublicLibraryBookDetailModal.tsx", import.meta.url),
    "utf8",
  );
  const pageSource = readFileSync(
    new URL("../../app/public-library/page.tsx", import.meta.url),
    "utf8",
  );
  const readerSource = readFileSync(
    new URL("../../app/reader/[bookId]/ReaderDefault.tsx", import.meta.url),
    "utf8",
  );
  const topBarSource = readFileSync(
    new URL("../../components/reader/ReaderTopBar.tsx", import.meta.url),
    "utf8",
  );

  it("modal enforces comprehensive TOC controls: real-time search, forward/reverse sort", () => {
    expect(modalSource).toContain("搜索目录章节");
    expect(modalSource).toContain("isTocReverse");
    expect(modalSource).toContain("tocSearch");
    expect(modalSource).toContain("filteredChapters");
  });

  it("modal provides full preview typography controls and 3 paper themes", () => {
    expect(modalSource).toContain("previewFontSize");
    expect(modalSource).toContain("setPreviewFontSize");
    expect(modalSource).toContain("previewTheme");
    expect(modalSource).toContain("setPreviewTheme");
    expect(modalSource).toContain("宣纸纸色");
    expect(modalSource).toContain("白昼晨光");
    expect(modalSource).toContain("水墨暗夜");
  });

  it("modal and page provide direct reading with ?from=public-library route contract", () => {
    expect(modalSource).toContain("?from=public-library");
    expect(modalSource).toContain("即刻开卷");
    expect(modalSource).toContain("继续阅读");
    expect(pageSource).toContain("?from=public-library");
    expect(pageSource).toContain("getBatchLocalStatesForPublicBooks");
    expect(pageSource).toContain("openBook");
    expect(pageSource).toContain("joinBookOnly");
  });

  it("reader correctly handles from=public-library parameter and dynamic back label", () => {
    expect(readerSource).toContain("from=public-library");
    expect(readerSource).toContain('router.push("/public-library")');
    expect(readerSource).toContain("返回藏经阁");
    expect(topBarSource).toContain("backLabel");
  });
});
