export interface ThemeColors {
  bg: string;
  text: string;
}

export const THEMES = {
  paper: { bg: '#F8F8F5', text: '#2F2A24' },
  sepia: { bg: '#F4ECD8', text: '#3A2D22' },
  green: { bg: '#DDEBD6', text: '#263527' },
  warmGray: { bg: '#E8E3DA', text: '#2F2A24' },
  dark: { bg: '#1E1E1E', text: '#CFCFCF' },
} satisfies Record<string, ThemeColors>;

export type ThemeName = keyof typeof THEMES;
