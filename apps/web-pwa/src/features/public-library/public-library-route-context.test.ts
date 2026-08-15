import { describe, expect, it } from "vitest";

import {
  parsePublicLibraryRouteContext,
  serializePublicLibraryRouteContext,
} from "./public-library-route-context";

describe("public library route context", () => {
  it("round-trips the active view, filters, query, and page", () => {
    const context = parsePublicLibraryRouteContext(
      "#/public-library?view=tags&q=%E7%A7%91%E5%B9%BB&category=technology&tag=fiction&maintainer=keeper&page=3",
    );

    expect(context).toEqual({
      view: "tags",
      query: "科幻",
      categoryId: "technology",
      tagId: "fiction",
      maintainerId: "keeper",
      page: 3,
    });
    expect(serializePublicLibraryRouteContext(context)).toContain("page=3");
  });

  it("rejects unknown taxonomy and unbounded route values", () => {
    expect(
      parsePublicLibraryRouteContext(
        `#/public-library?view=bad&category=bad&tag=bad&page=0&q=${"x".repeat(240)}`,
      ),
    ).toEqual({
      view: "books",
      query: "",
      categoryId: "",
      tagId: "",
      maintainerId: "",
      page: 1,
    });
    expect(
      parsePublicLibraryRouteContext(
        `#/public-library?q=${"q".repeat(121)}&maintainer=${"m".repeat(65)}`,
      ),
    ).toMatchObject({ query: "", maintainerId: "" });
  });
});
