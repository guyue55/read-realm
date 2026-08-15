import { afterEach, describe, expect, it, vi } from "vitest";
import type { VerifiedPersonalPublicationSnapshot } from "@reader/shared-types";
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

  it("publishes a verified personal snapshot without either private identity field", async () => {
    const snapshot: VerifiedPersonalPublicationSnapshot = {
      schemaVersion: 1,
      snapshotHash: "a".repeat(64),
      sourceRef: "b".repeat(64),
      book: { title: "云上书", format: "txt", chapterCount: 1 },
      chapters: [
        {
          index: 0,
          title: "第一章",
          content: "正文",
          contentHash: "c".repeat(64),
        },
      ],
    };
    const fetchMock = vi.fn<typeof fetch>(
      async () =>
        new Response(JSON.stringify({ outcome: "created", book }), {
          status: 201,
        }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const client = new PublicLibraryMaintenanceClient("private-a");

    await client.publishPersonalSnapshot(snapshot, {
      category: "其他",
      rightsConfirmed: true,
    });

    const [url, init] = fetchMock.mock.calls[0]!;
    expect(String(url)).toContain("/maintenance/personal-snapshots");
    expect(init?.headers).toEqual({
      "x-public-library-maintenance-key": "private-a",
    });
    expect(init?.headers).not.toHaveProperty("x-share-token");
    const body = init?.body as FormData;
    expect(body.get("category")).toBe("其他");
    const uploaded = body.get("snapshot") as File;
    expect(await uploaded.text()).not.toContain("private-a");
    expect(await uploaded.text()).not.toContain("book-1");
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

  it("lists and runs allowlisted scans with the same credential snapshot", async () => {
    const scanJob = {
      scanId: "3caac92c-5a53-4c0b-8da0-0cb37d2c8428",
      rootId: "classics",
      rootLabel: "古籍目录",
      status: "running",
      discoveredCount: 0,
      processedCount: 0,
      createdCount: 0,
      unchangedCount: 0,
      duplicateCount: 0,
      failedCount: 0,
      skippedCount: 0,
      totalBytes: 0,
      items: [],
    };
    const fetchMock = vi.fn<typeof fetch>(async (input) => {
      const url = String(input);
      return new Response(
        JSON.stringify(
          url.endsWith("scan-roots")
            ? { items: [{ rootId: "classics", label: "古籍目录" }] }
            : scanJob,
        ),
        { status: url.endsWith("/scans") ? 202 : 200 },
      );
    });
    vi.stubGlobal("fetch", fetchMock);
    const client = new PublicLibraryMaintenanceClient("configured-key");
    await expect(client.listScanRoots()).resolves.toEqual([
      { rootId: "classics", label: "古籍目录" },
    ]);
    await expect(client.startScan("classics")).resolves.toMatchObject(scanJob);
    await expect(client.getScan(scanJob.scanId)).resolves.toMatchObject(
      scanJob,
    );
    for (const [, init] of fetchMock.mock.calls) {
      expect(init?.headers).toMatchObject({
        "x-public-library-maintenance-key": "configured-key",
      });
      expect(init?.headers).not.toHaveProperty("x-share-token");
      expect(JSON.stringify(init)).not.toContain("/Users/");
    }
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
