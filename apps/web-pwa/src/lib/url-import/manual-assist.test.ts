// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import {
  MANUAL_ASSIST_ERROR_CODES,
  isManualAssistError,
  manualAssistHint,
  parsePastedHtmlToChapter,
  buildManualAssistBook,
} from "./manual-assist";
import { UrlImportError } from "./index";

describe("manual-assist L3 手动协助通道", () => {
  it("识别登录/动态渲染/限流为需要手动协助", () => {
    expect(
      isManualAssistError(new UrlImportError("需要登录", "SOURCE_LOGIN_PAYWALL_REQUIRED")),
    ).toBe(true);
    expect(
      isManualAssistError(new UrlImportError("动态渲染", "URL_DYNAMIC_RENDER_REQUIRED")),
    ).toBe(true);
    expect(
      isManualAssistError(new UrlImportError("限流", "SOURCE_RATE_LIMITED")),
    ).toBe(true);
    expect(
      isManualAssistError(new UrlImportError("普通失败", "URL_PARSE_FAILED")),
    ).toBe(false);
  });

  it("错误码集合与提示文案对应", () => {
    expect(MANUAL_ASSIST_ERROR_CODES.has("SOURCE_LOGIN_PAYWALL_REQUIRED")).toBe(true);
    expect(manualAssistHint("SOURCE_LOGIN_PAYWALL_REQUIRED")).toContain("登录");
    expect(manualAssistHint("URL_DYNAMIC_RENDER_REQUIRED")).toContain("JavaScript");
    expect(manualAssistHint("SOURCE_RATE_LIMITED")).toContain("频率限制");
  });

  it("从粘贴 HTML 提取标题与正文", () => {
    const html =
      "<html><body><h1>粘贴的章节标题</h1><p>" + "粘贴正文内容".repeat(20) + "</p></body></html>";
    const chapter = parsePastedHtmlToChapter(html);
    expect(chapter.title).toBe("粘贴的章节标题");
    expect(chapter.content).toContain("粘贴正文内容");
  });

  it("组装手动导入结果为单章书", () => {
    const book = buildManualAssistBook({
      title: "手动章节",
      content: "正文".repeat(30),
    });
    expect(book.chapters).toHaveLength(1);
    expect(book.chapters[0]?.title).toBe("手动章节");
  });
});
