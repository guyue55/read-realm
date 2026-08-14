import { describe, expect, it } from "vitest";
import type { Book } from "@reader/shared-types";
import { mergeSearchResults, searchLocalBooks } from "./search-results";

describe("mergeSearchResults", () => {
  it("keeps local results when remote search fails", () => {
    const local = [{ id: "book-1", title: "本地书" }] as Book[];
    expect(mergeSearchResults(local, { status: "failed", items: [] })).toEqual({
      local,
      remote: [],
      remoteStatus: "failed",
    });
  });
});

describe("searchLocalBooks", () => {
  const books = [
    {
      id: "book-2",
      title: "山谷回声",
      author: "甲",
      tags: ["自然"],
      status: "finished",
    },
    {
      id: "book-1",
      title: "河流",
      author: "山谷作者",
      tags: ["游记"],
      status: "reading",
    },
  ] as Book[];

  it("filters the one local snapshot without querying storage per keystroke", () => {
    expect(searchLocalBooks(books, "山谷", "综合").map((book) => book.id)).toEqual([
      "book-2",
      "book-1",
    ]);
    expect(searchLocalBooks(books, "山谷", "书名").map((book) => book.id)).toEqual([
      "book-2",
    ]);
    expect(searchLocalBooks(books, "自然", "标签").map((book) => book.id)).toEqual([
      "book-2",
    ]);
  });

  it("caps the rendered result set while preserving the complete source snapshot", () => {
    const many = Array.from({ length: 30 }, (_, index) => ({
      ...books[0],
      id: `book-${index}`,
      title: `样本 ${index}`,
    })) as Book[];

    expect(searchLocalBooks(many, "样本", "综合")).toHaveLength(12);
    expect(many).toHaveLength(30);
  });
});
