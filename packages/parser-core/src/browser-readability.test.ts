import { describe, it, expect } from "vitest";
import { JSDOM } from "jsdom";
import {
  extractArticleFromDocument,
  sanitizeExtractedHtml,
} from "./browser-readability";

function toDocument(html: string): Document {
  return new JSDOM(html).window.document;
}

describe("browser-readability", () => {
  it("should extract title and text content from a standard page", () => {
    const doc = toDocument(`
      <!DOCTYPE html>
      <html>
        <head><title>小说章节目录</title></head>
        <body>
          <header><h1>站点导航</h1><nav><a href="/">首页</a></nav></header>
          <article>
            <h1>第一章 启程</h1>
            <p>夜色如墨，少年踏上旅途。</p>
            <p>这是第二段正文内容，用于验证提取。</p>
          </article>
          <footer><p>© 2026</p></footer>
        </body>
      </html>
    `);

    const result = extractArticleFromDocument(doc, "https://example.com/ch/1");
    expect(result.textContent).toContain("夜色如墨，少年踏上旅途。");
    expect(result.textContent).toContain("这是第二段正文内容");
    expect(result.textContent).not.toContain("站点导航");
    expect(result.textContent).not.toContain("首页");
  });

  it("should strip script/style/iframe from extracted content", () => {
    const doc = toDocument(`
      <html>
        <body>
          <article>
            <h1>正文标题</h1>
            <p>正文第一段。</p>
            <script>alert("xss")</script>
            <style>.hidden{display:none}</style>
            <iframe src="https://evil.example"></iframe>
            <p>正文第二段。</p>
          </article>
        </body>
      </html>
    `);

    const result = extractArticleFromDocument(doc);
    expect(result.content).not.toContain("<script");
    expect(result.content).not.toContain("<iframe");
    expect(result.content).not.toContain("<style");
    expect(result.textContent).not.toContain("alert");
  });

  it("should throw for empty document", () => {
    const doc = toDocument("<html><body></body></html>");
    expect(() => extractArticleFromDocument(doc)).toThrow();
  });

  it("sanitizeExtractedHtml keeps whitelisted tags and strips events", () => {
    const raw =
      '<div><p onclick="alert(1)">你好</p><a href="javascript:void(0)">x</a><a href="https://ok.example">y</a><span>尾</span></div>';
    const cleaned = sanitizeExtractedHtml(raw);
    expect(cleaned).toContain("<p>");
    expect(cleaned).not.toContain("onclick");
    expect(cleaned).not.toContain("javascript:");
    expect(cleaned).toContain('href="https://ok.example"');
    expect(cleaned).toContain("你好");
  });
});
