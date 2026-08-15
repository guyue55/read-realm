import { afterEach, describe, expect, it, vi } from "vitest";
import {
  PublicLibraryMaintenanceClient,
  PublicLibraryMaintenanceError,
} from "./public-library-maintenance-client";

const book = {
  id: "public-1",
  title: "入阁样本",
  format: "txt",
  category: "经典",
  chapterCount: 1,
  wordCount: 2,
  contentHash: "a".repeat(64),
  publishedAt: "2026-08-15T08:00:00.000Z",
};

function file(name = "book.txt") {
  return new File(["第一章\n正文"], name, { type: "text/plain" });
}

describe("PublicLibraryMaintenanceClient", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("snapshots the key and sends only the public maintenance header", async () => {
    const fetchMock = vi.fn<typeof fetch>(
      async () =>
        new Response(JSON.stringify({ outcome: "created", book }), {
          status: 201,
          headers: { "content-type": "application/json" },
        }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const client = new PublicLibraryMaintenanceClient("  藏-key  ");
    await expect(
      client.publishFile(file(), {
        category: "经典",
        relativePath: "古籍/经部/book.txt",
        rightsConfirmed: true,
      }),
    ).resolves.toEqual({ outcome: "created", book });

    const call = fetchMock.mock.calls[0];
    expect(call).toBeDefined();
    const [url, init] = call!;
    expect(String(url)).toContain("/public-library/maintenance/files");
    expect(String(url)).not.toContain("藏-key");
    expect(init?.headers).toEqual({
      "x-public-library-maintenance-key": "藏-key",
    });
    expect(init?.headers).not.toHaveProperty("x-share-token");
    expect(init?.body).toBeInstanceOf(FormData);
    expect((init?.body as FormData).get("relativePath")).toBe(
      "古籍/经部/book.txt",
    );
  });

  it("maps metadata conflict without exposing response text", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(
            JSON.stringify({
              code: "duplicate_metadata_conflict",
              existingBookId: "public-existing",
              message: "server details",
            }),
            { status: 409 },
          ),
      ),
    );
    const client = new PublicLibraryMaintenanceClient("configured-key");
    await expect(
      client.publishFile(file(), {
        category: "经典",
        rightsConfirmed: true,
      }),
    ).rejects.toEqual(
      new PublicLibraryMaintenanceError(
        "duplicate_metadata_conflict",
        "public-existing",
      ),
    );
  });

  it.each(["", "default", "bad key"])(
    "rejects an invalid credential snapshot before fetch: %p",
    async (key) => {
      const fetchMock = vi.fn();
      vi.stubGlobal("fetch", fetchMock);
      expect(() => new PublicLibraryMaintenanceClient(key)).toThrowError(
        new PublicLibraryMaintenanceError("credential_rejected"),
      );
      expect(fetchMock).not.toHaveBeenCalled();
    },
  );
});
