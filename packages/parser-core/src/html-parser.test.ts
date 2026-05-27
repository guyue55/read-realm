import { describe, it, expect } from "vitest";
import { parseWebPageWithReadability } from "./html-parser";

describe("html-parser", () => {
  it("should successfully extract content and title from a standard HTML page", () => {
    const rawHtml = `
      <!DOCTYPE html>
      <html>
        <head>
          <title>Test Blog Post</title>
        </head>
        <body>
          <header>
            <h1>My Website Header</h1>
            <nav><a href="/">Home</a></nav>
          </header>
          <main>
            <article>
              <h1 class="entry-title">Deep Learning in 2026</h1>
              <p class="author">By Guyue</p>
              <p>Deep Learning has evolved significantly in the last few years.</p>
              <p>This is the second paragraph of the article.</p>
            </article>
          </main>
          <footer>
            <p>&copy; 2026 Guyue</p>
          </footer>
        </body>
      </html>
    `;

    const result = parseWebPageWithReadability(rawHtml, "https://example.com/blog/1");

    expect(result.title).toBe("Test Blog Post");
    expect(result.content).toContain("<p>Deep Learning has evolved significantly in the last few years.</p>");
    expect(result.content).toContain("<p>This is the second paragraph of the article.</p>");
    expect(result.content).not.toContain("My Website Header"); // Header element stripped
    expect(result.textContent).toContain("Deep Learning has evolved significantly in the last few years.");
  });

  it("should throw an error for empty HTML", () => {
    expect(() => parseWebPageWithReadability("")).toThrow("HTML 内容为空，无法解析");
  });
});
