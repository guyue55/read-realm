import { describe, expect, it } from "vitest";
import { defaultUiTheme } from "./default-ui-theme";
import { THEMES } from "./themes";

describe("defaultUiTheme", () => {
  it("keeps the prototype UI shell separate from reader page themes", () => {
    expect(defaultUiTheme.shell.background).toBe("#F6F4EE");
    expect(defaultUiTheme.shell.sidebarWidth).toBe(148);
    expect(defaultUiTheme.readerWorkspace.columns).toEqual({
      toc: 240,
      reader: 700,
      ai: 338,
    });

    expect(THEMES.paper).toEqual({ bg: "#F8F8F5", text: "#2F2A24" });
    expect(defaultUiTheme.readerWorkspace.canvas).not.toBe(THEMES.paper.bg);
  });
});
