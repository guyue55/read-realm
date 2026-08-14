import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync(new URL("./RouteProvider.tsx", import.meta.url), "utf8");

describe("metadata recovery truth contract", () => {
  it("distinguishes partial recovery and never claims perfect restoration", () => {
    expect(source).toContain('restoreResult.status === "partial"');
    expect(source).toContain('restoreResult.status === "recovery_gap"');
    expect(source).toContain("restoreResult.restoredBookCount");
    expect(source).toContain("restoreResult.expectedBookCount");
    expect(source).not.toContain("已完美还原书架镜像");
  });

  it("shows an assertive user-visible notice for incomplete recovery", () => {
    expect(source).toContain('role="alert"');
    expect(source).toContain('aria-live="assertive"');
  });
});
