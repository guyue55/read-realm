export const defaultUiTheme = {
  shell: {
    background: "#F8F6F0",
    surface: "#FFFDF8",
    raisedSurface: "#FFFFFF",
    panel: "rgba(255,252,245,0.94)",
    border: "rgba(80,65,45,0.12)",
    softBorder: "rgba(80,65,45,0.08)",
    text: "#2F2A24",
    muted: "#6F665B",
    quiet: "#9C9388",
    accent: "#5F7D52",
    accentSoft: "#EEF2E9",
    accentWarm: "#9A6A3A",
    danger: "#B86B5C",
    sidebarWidth: 128,
    contentMaxWidth: 1240,
  },
  readerWorkspace: {
    canvas: "#FFFCF5",
    rail: "#F8F6F0",
    columns: {
      toc: 240,
      reader: 700,
      ai: 338,
    },
  },
} as const;
