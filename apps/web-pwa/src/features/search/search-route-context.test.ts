import { describe, expect, it } from "vitest";

import { parseSearchRouteContext, serializeSearchRouteContext } from "./search-route-context";

describe("search route context", () => {
  it("round-trips a bounded query and filter", () => {
    const context = parseSearchRouteContext("#/search?q=%E7%A7%91%E5%B9%BB&filter=%E4%B9%A6%E5%90%8D");
    expect(context).toEqual({ query: "科幻", filter: "书名" });
    expect(serializeSearchRouteContext(context)).toBe(
      "/search?q=%E7%A7%91%E5%B9%BB&filter=%E4%B9%A6%E5%90%8D",
    );
  });

  it("fails closed for unknown or oversized values", () => {
    expect(
      parseSearchRouteContext(`#/search?q=${"x".repeat(121)}&filter=unknown`),
    ).toEqual({ query: "", filter: "综合" });
  });
});
