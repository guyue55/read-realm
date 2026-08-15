import { describe, expect, it, vi } from "vitest";
import {
  PUBLIC_LIBRARY_BROWSER_BATCH_MAX_BYTES,
  PUBLIC_LIBRARY_BROWSER_CONCURRENCY,
  PublicLibraryBatchLimitError,
  preparePublicLibraryImportTasks,
  runPublicLibraryImportQueue,
} from "./public-library-import-queue";
import { PublicLibraryMaintenanceError } from "./public-library-maintenance-client";

function file(name: string, size: number): File {
  return { name, size } as File;
}

describe("public library browser import queue", () => {
  it("keeps invalid files as honest per-item failures", () => {
    const tasks = preparePublicLibraryImportTasks([
      file("one.txt", 10),
      file("bad.epub", 10),
      file("huge.txt", 20 * 1024 * 1024 + 1),
    ]);
    expect(tasks.map(({ status, reason }) => ({ status, reason }))).toEqual([
      { status: "queued", reason: undefined },
      { status: "failed", reason: "仅支持 TXT 文件" },
      { status: "failed", reason: "单个文件超过 20 MiB" },
    ]);
  });

  it("rejects a selection beyond the file or byte hard limits", () => {
    expect(() =>
      preparePublicLibraryImportTasks(
        Array.from({ length: 201 }, (_, index) => file(`${index}.txt`, 1)),
      ),
    ).toThrowError(new PublicLibraryBatchLimitError("too_many_files"));
    expect(() =>
      preparePublicLibraryImportTasks([
        file("a.txt", PUBLIC_LIBRARY_BROWSER_BATCH_MAX_BYTES),
        file("b.txt", 1),
      ]),
    ).toThrowError(new PublicLibraryBatchLimitError("batch_too_large"));
  });

  it("runs at concurrency two and reports created, unchanged, duplicate, and failed", async () => {
    let active = 0;
    let peak = 0;
    const releases: Array<() => void> = [];
    const upload = vi.fn(async (candidate: File) => {
      active += 1;
      peak = Math.max(peak, active);
      await new Promise<void>((resolve) => releases.push(resolve));
      active -= 1;
      if (candidate.name === "duplicate.txt") {
        throw new PublicLibraryMaintenanceError(
          "duplicate_metadata_conflict",
          "public-existing",
        );
      }
      if (candidate.name === "failed.txt") throw new Error("offline");
      return {
        outcome:
          candidate.name === "unchanged.txt"
            ? ("unchanged" as const)
            : ("created" as const),
        book: { id: candidate.name },
      } as never;
    });
    const tasks = preparePublicLibraryImportTasks(
      ["created.txt", "unchanged.txt", "duplicate.txt", "failed.txt"].map(
        (name) => file(name, 10),
      ),
    );
    const resultPromise = runPublicLibraryImportQueue(tasks, upload);
    await vi.waitFor(() => expect(releases).toHaveLength(2));
    releases.splice(0, 2).forEach((release) => release());
    await vi.waitFor(() => expect(releases).toHaveLength(2));
    releases.splice(0, 2).forEach((release) => release());
    const result = await resultPromise;

    expect(peak).toBe(PUBLIC_LIBRARY_BROWSER_CONCURRENCY);
    expect(result.map((task) => task.status)).toEqual([
      "created",
      "unchanged",
      "duplicate",
      "failed",
    ]);
    expect(result.at(-1)).toMatchObject({ retryable: true });
  });
});
