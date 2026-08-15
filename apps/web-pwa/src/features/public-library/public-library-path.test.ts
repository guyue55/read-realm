import { describe, expect, it } from "vitest";
import { normalizePublicLibraryBrowserRelativePath } from "./public-library-path";

describe("public library browser relative paths", () => {
  it("matches the server path depth and traversal boundary", () => {
    expect(
      normalizePublicLibraryBrowserRelativePath("古籍/e\u0301/book.txt"),
    ).toBe("古籍/é/book.txt");
    for (const invalid of [
      "../escape.txt",
      "/absolute.txt",
      "C:\\escape.txt",
      "folder\\mixed/book.txt",
      "folder//empty.txt",
      "folder/./dot.txt",
      "folder/../escape.txt",
      `folder/${"deep/".repeat(12)}book.txt`,
      "folder/book.epub",
    ]) {
      expect(
        normalizePublicLibraryBrowserRelativePath(invalid),
      ).toBeUndefined();
    }
  });
});
