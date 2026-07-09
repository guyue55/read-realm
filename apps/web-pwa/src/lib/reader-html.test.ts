import { describe, expect, it } from "vitest";
import { buildReaderHtml, escapeReaderHtmlText } from "./reader-html";

describe("buildReaderHtml", () => {
  it("escapes reader title text before html injection", () => {
    expect(escapeReaderHtmlText('标题 <img src=x onerror="alert(1)"> & 结束')).toBe(
      "标题 &lt;img src=x onerror=&quot;alert(1)&quot;&gt; &amp; 结束",
    );
  });

  it("escapes raw TXT content before injecting paragraph html", () => {
    const html = buildReaderHtml("第一行 <script>alert(1)</script> & 正文");

    expect(html).toContain("&lt;script&gt;alert(1)&lt;/script&gt;");
    expect(html).toContain("&amp; 正文");
    expect(html).not.toContain("<script>");
  });

  it("adds paragraph indexes to sanitized html paragraphs without rewriting content", () => {
    const html = buildReaderHtml("<p>第一段</p><p class=\"note\">第二段</p>");

    expect(html).toContain('<p data-idx="0">第一段</p>');
    expect(html).toContain('<p data-idx="1" class="note">第二段</p>');
  });

  it("removes executable html before reader injection", () => {
    const html = buildReaderHtml(
      '<p onclick="alert(1)">正文</p><script>alert(2)</script><a href="javascript:alert(3)">链接</a>',
    );

    expect(html).toContain('<p data-idx="0">正文</p>');
    expect(html).not.toContain("onclick");
    expect(html).not.toContain("<script>");
    expect(html).not.toContain("javascript:");
  });
});
