import { describe, expect, it, vi } from "vitest";
import { PublicLibraryJoinService } from "./public-library-join";
import type { PublicLibraryPackage } from "./public-library-client";

const bundle: PublicLibraryPackage = {
  schemaVersion: 1,
  taxonomyVersion: "public-library-taxonomy-v1",
  book: {
    id: "public-1",
    title: "公共书",
    format: "txt",
    category: "经典",
    chapterCount: 1,
    wordCount: 2,
    contentHash: "a".repeat(64),
    publishedAt: "2026-08-15T00:00:00.000Z",
  },
  chapters: [
    {
      id: "remote-chapter",
      index: 0,
      title: "第一章",
      content: "正文",
      contentHash:
        "d661c3d96d53ebc0ca8a55aae24b5df4a4d1bf28d37337b982fe8ebf54846eeb",
    },
  ],
};

describe("PublicLibraryJoinService", () => {
  it("validates the full package before one local commit with a new identity", async () => {
    const local = { apply: vi.fn(async () => undefined) };
    const service = new PublicLibraryJoinService(
      { getPackage: vi.fn(async () => bundle) },
      local,
      () => "local-new-id",
      () => "2026-08-15T01:00:00.000Z",
    );
    await expect(service.join("public-1")).resolves.toEqual({
      localBookId: "local-new-id",
      chapterCount: 1,
    });
    expect(local.apply).toHaveBeenCalledWith({
      book: expect.objectContaining({
        id: "local-new-id",
        sourceType: "cloud_cache",
        cacheStatus: "chapters_full",
      }),
      chapters: [expect.objectContaining({ id: "local-new-id-chapter-0" })],
    });
  });

  it("makes zero local writes when a chapter hash is corrupted", async () => {
    const local = { apply: vi.fn(async () => undefined) };
    const service = new PublicLibraryJoinService(
      {
        getPackage: vi.fn(async () => ({
          ...bundle,
          chapters: [{ ...bundle.chapters[0], content: "篡改" }],
        })),
      },
      local,
    );
    await expect(service.join("public-1")).rejects.toThrow(
      "PUBLIC_LIBRARY_PACKAGE_INVALID",
    );
    expect(local.apply).not.toHaveBeenCalled();
  });
});
