import { describe, expect, it } from "vitest";

import {
  canClampLibraryRoutePage,
  canCommitCloudInventory,
  parseLibraryRouteContext,
  serializeLibraryRouteContext,
} from "./library-route-context";

describe("library route context", () => {
  it("round-trips folder, page, sort, and view through the hash route", () => {
    const context = parseLibraryRouteContext(
      "#/library?folder=classics&page=7&sort=title&view=list",
    );

    expect(context).toEqual({
      folderId: "classics",
      page: 7,
      sort: "title",
      view: "list",
    });
    expect(serializeLibraryRouteContext(context)).toBe(
      "/library?folder=classics&page=7&sort=title&view=list",
    );
  });

  it("fails closed to bounded defaults for malformed route values", () => {
    expect(
      parseLibraryRouteContext(
        "#/library?folder=%00bad&page=-2&sort=unknown&view=huge",
        "compact",
      ),
    ).toEqual({
      folderId: undefined,
      page: 1,
      sort: "recent",
      view: "compact",
    });
  });

  it("keeps the explicit view stable across a different local fallback", () => {
    expect(
      serializeLibraryRouteContext({
        folderId: undefined,
        page: 1,
        sort: "recent",
        view: "cover",
      }),
    ).toBe("/library?view=cover");
    expect(
      parseLibraryRouteContext("#/library?view=cover", "compact").view,
    ).toBe("cover");
  });

  it("does not clamp a deep page before the matching cloud inventory is known", () => {
    expect(
      canClampLibraryRoutePage({
        localInventoryReady: true,
        activeShareToken: "cloud-a",
        verifiedCloudToken: null,
      }),
    ).toBe(false);
    expect(
      canClampLibraryRoutePage({
        localInventoryReady: true,
        activeShareToken: "cloud-a",
        verifiedCloudToken: "cloud-b",
      }),
    ).toBe(false);
    expect(
      canClampLibraryRoutePage({
        localInventoryReady: true,
        activeShareToken: "cloud-a",
        verifiedCloudToken: "cloud-a",
      }),
    ).toBe(true);
    expect(
      canClampLibraryRoutePage({
        localInventoryReady: true,
        activeShareToken: "",
        verifiedCloudToken: null,
      }),
    ).toBe(true);
  });

  it("rejects an older inventory response even when the share token is unchanged", () => {
    expect(
      canCommitCloudInventory({
        activeShareToken: "cloud-a",
        activeGeneration: 4,
        requestShareToken: "cloud-a",
        requestGeneration: 3,
      }),
    ).toBe(false);
    expect(
      canCommitCloudInventory({
        activeShareToken: "cloud-a",
        activeGeneration: 4,
        requestShareToken: "cloud-a",
        requestGeneration: 4,
      }),
    ).toBe(true);
  });
});
