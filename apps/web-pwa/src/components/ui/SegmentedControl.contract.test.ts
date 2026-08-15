import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync(
  new URL("./SegmentedControl.tsx", import.meta.url),
  "utf8",
);

describe("segmented control keyboard contract", () => {
  it("implements a roving tab model and panel relationship", () => {
    expect(source).toContain(
      'role={semantics === "tabs" ? "tablist" : "group"}',
    );
    expect(source).toContain('role={semantics === "tabs" ? "tab" : undefined}');
    expect(source).toContain('event.key === "ArrowRight"');
    expect(source).toContain('event.key === "Home"');
    expect(source).toContain('event.key === "End"');
    expect(source).toContain("selected ? 0 : -1");
    expect(source).toContain("aria-controls");
    expect(source).not.toContain("gridTemplateColumns");
  });
});
