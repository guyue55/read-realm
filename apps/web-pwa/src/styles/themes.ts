export interface ThemeColors {
  bg: string;
  text: string;
}

export const THEMES = {
  paper: { bg: "#F4EFE6", text: "#2C2621" },
  sepia: { bg: "#F3E6C9", text: "#3A2D22" },
  green: { bg: "#DFEAD6", text: "#223223" },
  warmGray: { bg: "#E7E1D3", text: "#2C2621" },
  dark: { bg: "#151516", text: "#A3A3AC" },
} satisfies Record<string, ThemeColors>;

export type ThemeName = keyof typeof THEMES;
