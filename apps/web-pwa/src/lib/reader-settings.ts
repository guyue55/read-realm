import type { ReaderSettings } from "@reader/shared-types";
import { THEMES, type ThemeName } from "@/styles/themes";

const STORAGE_KEY = "reader-settings";

export type ReaderSettingsState = Pick<
  ReaderSettings,
  "fontFamily" | "fontSize" | "lineHeight" | "theme" | "pageMode" | "uiMode"
> & {
  paragraphSpacing: number;
  letterSpacing: number;
  autoFlipAtBottom: boolean;
};

export const DEFAULT_READER_SETTINGS: ReaderSettingsState = {
  fontFamily: "kaiti", // 默认优雅国风楷体
  fontSize: 18,
  lineHeight: 1.7,
  theme: "paper",
  pageMode: "scroll",
  uiMode: "default",
  paragraphSpacing: 16,
  letterSpacing: 0.03,
  // 默认关闭自动切章：防止滚动阅读时意外跳章，
  // 用户可手动在阅读设置中开启。
  autoFlipAtBottom: false,
};

export function isThemeName(value: unknown): value is ThemeName {
  return typeof value === "string" && value in THEMES;
}

function normalizeSettings(value: unknown): ReaderSettingsState {
  if (!value || typeof value !== "object") return DEFAULT_READER_SETTINGS;

  const candidate = value as Partial<ReaderSettingsState>;
  return {
    fontFamily:
      candidate.fontFamily === "songti" || candidate.fontFamily === "heiti"
        ? candidate.fontFamily
        : "kaiti",
    fontSize:
      typeof candidate.fontSize === "number"
        ? Math.min(36, Math.max(14, candidate.fontSize))
        : DEFAULT_READER_SETTINGS.fontSize,
    lineHeight:
      typeof candidate.lineHeight === "number"
        ? Math.min(2.4, Math.max(1.3, candidate.lineHeight))
        : DEFAULT_READER_SETTINGS.lineHeight,
    theme: isThemeName(candidate.theme)
      ? candidate.theme
      : DEFAULT_READER_SETTINGS.theme,
    pageMode:
      candidate.pageMode === "pagination"
        ? "pagination"
        : DEFAULT_READER_SETTINGS.pageMode,
    uiMode:
      candidate.uiMode === "simple" ? "simple" : DEFAULT_READER_SETTINGS.uiMode,
    paragraphSpacing:
      typeof candidate.paragraphSpacing === "number"
        ? Math.min(40, Math.max(0, candidate.paragraphSpacing))
        : DEFAULT_READER_SETTINGS.paragraphSpacing,
    letterSpacing:
      typeof candidate.letterSpacing === "number"
        ? Math.min(0.25, Math.max(-0.05, candidate.letterSpacing))
        : DEFAULT_READER_SETTINGS.letterSpacing,
    autoFlipAtBottom:
      typeof candidate.autoFlipAtBottom === "boolean"
        ? candidate.autoFlipAtBottom
        : DEFAULT_READER_SETTINGS.autoFlipAtBottom,
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
  window.localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify(normalizeSettings(settings)),
  );
}

export function createReaderSettingsWriteQueue(
  persist: (settings: ReaderSettingsState) => void | Promise<void>,
) {
  let tail: Promise<void> = Promise.resolve();
  return (settings: ReaderSettingsState): Promise<void> => {
    const snapshot = normalizeSettings(settings);
    const write = tail.then(() => persist(snapshot));
    tail = write.catch(() => undefined);
    return write;
  };
}

export const queueReaderSettingsSave = createReaderSettingsWriteQueue(
  saveReaderSettings,
);
