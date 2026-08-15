import { describe, expect, it, vi } from "vitest";
import type { VerifiedPersonalPublicationSnapshot } from "@reader/shared-types";
import { PersonalBookPublicationService } from "./personal-book-publication";

const snapshot: VerifiedPersonalPublicationSnapshot = {
  schemaVersion: 1,
  snapshotHash: "a".repeat(64),
  sourceRef: "b".repeat(64),
  book: { title: "云上书", format: "txt", chapterCount: 1 },
  chapters: [
    { index: 0, title: "第一章", contentHash: "c".repeat(64), content: "正文" },
  ],
};

describe("PersonalBookPublicationService", () => {
  it("freezes a verified export before invoking the independent maintenance port", async () => {
    const exportPort = { export: vi.fn(async () => snapshot) };
    const maintenancePort = {
      publishPersonalSnapshot: vi.fn(async () => ({
        outcome: "created" as const,
        book: {
          id: "public-1",
          title: "云上书",
          format: "txt" as const,
          category: "其他" as const,
          chapterCount: 1,
          wordCount: 2,
          contentHash: "d".repeat(64),
          publishedAt: "2026-08-15T09:30:00.000Z",
        },
      })),
    };
    const service = new PersonalBookPublicationService(
      exportPort,
      maintenancePort,
    );

    await expect(service.publish("book-1")).resolves.toMatchObject({
      outcome: "created",
    });
    expect(exportPort.export).toHaveBeenCalledWith("book-1");
    expect(maintenancePort.publishPersonalSnapshot).toHaveBeenCalledWith(
      snapshot,
      { category: "其他", rightsConfirmed: true },
    );
  });

  it("never touches the public port when private proof fails", async () => {
    const exportPort = {
      export: vi.fn(async () => {
        throw new Error("stale");
      }),
    };
    const maintenancePort = { publishPersonalSnapshot: vi.fn() };
    const service = new PersonalBookPublicationService(
      exportPort,
      maintenancePort,
    );
    await expect(service.publish("book-1")).rejects.toThrow("stale");
    expect(maintenancePort.publishPersonalSnapshot).not.toHaveBeenCalled();
  });
});
