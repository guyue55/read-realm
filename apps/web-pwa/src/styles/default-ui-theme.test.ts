import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { THEMES } from "./themes";

describe("defaultUiTheme", () => {
  it("keeps the runtime UI shell separate from reader page themes", async () => {
    const source = await readFile(
      new URL("./tokens.css", import.meta.url),
      "utf8",
    );
    expect(source).toContain("--color-background: #f6f4ee");
    expect(source).toContain("--shell-sidebar-width: 148px");
    expect(THEMES.paper).toEqual({ bg: "#F8F8F5", text: "#2F2A24" });
    expect(source).not.toContain(`--color-background: ${THEMES.paper.bg}`);
  });
});
