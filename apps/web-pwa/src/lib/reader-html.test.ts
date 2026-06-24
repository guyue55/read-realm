import { describe, expect, it } from "vitest";
import { buildReaderHtml } from "./reader-html";

describe("buildReaderHtml", () => {
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
});
