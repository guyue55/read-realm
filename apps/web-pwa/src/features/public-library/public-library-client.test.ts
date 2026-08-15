import { afterEach, describe, expect, it, vi } from "vitest";
import {
  PublicLibraryApiClient,
  PublicLibraryCatalogStaleError,
} from "./public-library-client";

describe("PublicLibraryApiClient catalog snapshots", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("carries the server revision to a later page", async () => {
    const fetchMock = vi.fn<typeof fetch>(
      async () =>
        new Response(
          JSON.stringify({
            items: [],
            page: 2,
            pageSize: 24,
            total: 0,
            totalPages: 1,
            snapshotRevision: 7,
          }),
          { status: 200 },
        ),
    );
    vi.stubGlobal("fetch", fetchMock);
    const client = new PublicLibraryApiClient();
    await expect(
      client.list({ page: 2, pageSize: 24, snapshotRevision: 7 }),
    ).resolves.toMatchObject({ snapshotRevision: 7 });
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain(
      "snapshotRevision=7",
    );
  });

  it("maps a stale revision to an explicit restart signal", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn<typeof fetch>(async () => new Response("stale", { status: 409 })),
    );
    await expect(
      new PublicLibraryApiClient().list({
        page: 2,
        pageSize: 24,
        snapshotRevision: 1,
      }),
    ).rejects.toBeInstanceOf(PublicLibraryCatalogStaleError);
  });
});
