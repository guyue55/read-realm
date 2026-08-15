export const defaultUiTheme = {
  shell: {
    background: "#F6F4EE",
    surface: "#FFFEFA",
    raisedSurface: "#FFFFFF",
    panel: "rgba(255,252,245,0.94)",
    border: "rgba(80,65,45,0.12)",
    softBorder: "rgba(80,65,45,0.08)",
    text: "#262824",
    muted: "#686E68",
    quiet: "#6F746C",
    accent: "#315E4E",
    accentSoft: "#E4EDE7",
    accentWarm: "#9A6A3A",
    danger: "#A04439",
    sidebarWidth: 148,
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
