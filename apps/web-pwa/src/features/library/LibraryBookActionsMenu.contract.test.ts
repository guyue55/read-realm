import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync(
  new URL("./LibraryBookActionsMenu.tsx", import.meta.url),
  "utf8",
);

describe("library book action menu", () => {
  it("is a pure presentational leaf with one touch-safe trigger", () => {
    expect(source).toContain("min-h-11 min-w-11");
    expect(source).toContain('role="menu"');
    expect(source).toContain('role="menuitem"');
    expect(source).toContain('event.key !== "Escape"');
    expect(source).toContain("firstAction?.focus()");
    expect(source).toContain('"ArrowDown"');
    expect(source).toContain('"ArrowUp"');
    expect(source).toContain('"Home"');
    expect(source).toContain('"End"');
    expect(source).toContain("restoreFocusRef.current");
    expect(source).toContain("LibraryActionsMenu");
    expect(source).not.toMatch(
      /Dexie|storage-core|route-store|personal-sync|libraryCommand/u,
    );
    expect(source).not.toMatch(/[🖌️🏮📤📥🔏]/u);
  });
});
