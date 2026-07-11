import { describe, expect, it } from "vitest";
import type { Book } from "@reader/shared-types";
import { mergeSearchResults } from "./search-results";

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
