import type { ReaderSettings } from "@reader/shared-types";
import { THEMES, type ThemeName } from "@/styles/themes";

const STORAGE_KEY = "reader-settings";

export type ReaderSettingsState = Pick<
  ReaderSettings,
  "fontSize" | "lineHeight" | "theme" | "pageMode" | "uiMode"
>;

export const DEFAULT_READER_SETTINGS: ReaderSettingsState = {
  fontSize: 18,
  lineHeight: 1.7,
  theme: "paper",
  pageMode: "scroll",
  uiMode: "default",
};

export function isThemeName(value: unknown): value is ThemeName {
  return typeof value === "string" && value in THEMES;
}

function normalizeSettings(value: unknown): ReaderSettingsState {
  if (!value || typeof value !== "object") return DEFAULT_READER_SETTINGS;

  const candidate = value as Partial<ReaderSettingsState>;
  return {
    fontSize:
      typeof candidate.fontSize === "number"
        ? Math.min(36, Math.max(14, candidate.fontSize))
        : DEFAULT_READER_SETTINGS.fontSize,
    lineHeight:
      typeof candidate.lineHeight === "number"
        ? candidate.lineHeight
        : DEFAULT_READER_SETTINGS.lineHeight,
    theme: isThemeName(candidate.theme)
      ? candidate.theme
      : DEFAULT_READER_SETTINGS.theme,
    pageMode:
      candidate.pageMode === "pagination"
        ? "pagination"
        : DEFAULT_READER_SETTINGS.pageMode,
    uiMode:
      candidate.uiMode === "simple"
        ? "simple"
        : DEFAULT_READER_SETTINGS.uiMode,
  };
}

export function loadReaderSettings(): ReaderSettingsState {
  if (typeof window === "undefined") return DEFAULT_READER_SETTINGS;

  const raw = window.localStorage.getItem(STORAGE_KEY);
  if (!raw) return DEFAULT_READER_SETTINGS;

  try {
    return normalizeSettings(JSON.parse(raw));
  } catch {
    return DEFAULT_READER_SETTINGS;
  }
}

export function saveReaderSettings(settings: ReaderSettingsState): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(normalizeSettings(settings)));
}
