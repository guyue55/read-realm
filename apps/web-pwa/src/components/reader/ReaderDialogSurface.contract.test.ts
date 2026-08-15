import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync(
  new URL("./ReaderDialogSurface.tsx", import.meta.url),
  "utf8",
);

describe("ReaderDialogSurface closed-state contract", () => {
  it("removes a closed surface from the rendered tree", () => {
    expect(source).toContain("if (!open) return null;");
  });

  it("keeps the open dialog accessibility contract", () => {
    expect(source).toContain('role="dialog"');
    expect(source).toContain("aria-modal");
    expect(source).toContain("aria-label={label}");
  });
});
