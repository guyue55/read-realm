import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync(new URL("./ConfirmDialog.tsx", import.meta.url), "utf8");

describe("ConfirmDialog shared contract", () => {
  it("portals the dialog, isolates the document, and keeps async failures visible", () => {
    expect(source).toContain("createPortal(");
    expect(source).toContain("<ReaderDialogSurface");
    expect(source).toContain('role="alert"');
    expect(source).toContain('type="button"');
    expect(source).not.toContain("zoom-in-95");
  });
});
