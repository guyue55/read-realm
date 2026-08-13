import { describe, expect, it } from "vitest";

import { shouldSweepLegacyImportTask } from "./import-task-retention";

const now = Date.parse("2026-08-13T12:00:00+08:00");

describe("import task retention", () => {
  it("never silently sweeps a durable failed or interrupted draft", () => {
    for (const state of ["queued", "reading", "parsing", "failed", "cancelled"] as const) {
      expect(shouldSweepLegacyImportTask({
        createdAt: "2026-08-12T12:00:00+08:00",
        chapterCount: 0,
        hasLifecycle: true,
        lifecycleState: state,
      }, now, 2 * 60 * 1000)).toBe(false);
    }
  });

  it("only sweeps an old legacy empty shell", () => {
    expect(shouldSweepLegacyImportTask({
      createdAt: "2026-08-13T11:00:00+08:00",
      chapterCount: 0,
      hasLifecycle: false,
    }, now, 15 * 60 * 1000)).toBe(true);
    expect(shouldSweepLegacyImportTask({
      createdAt: "2026-08-13T11:00:00+08:00",
      chapterCount: 1,
      hasLifecycle: false,
    }, now, 15 * 60 * 1000)).toBe(false);
  });
});
