import { z } from "zod";

export const AppErrorCodeSchema = z.enum([
  "FILE_TOO_LARGE",
  "UNSUPPORTED_FORMAT",
  "ENCODING_DETECT_FAILED",
  "CHAPTER_PARSE_FAILED",
  "EPUB_PARSE_FAILED",
  "URL_CORS_BLOCKED",
  "URL_DYNAMIC_RENDER_REQUIRED",
  "SOURCE_RATE_LIMITED",
  "AI_QUOTA_EXCEEDED",
  "SYNC_CONFLICT",
  "STORAGE_QUOTA_EXCEEDED",
  "NETWORK_OFFLINE",
  "TASK_TIMEOUT",
  "TASK_CANCELLED",
]);

export type AppErrorCode = z.infer<typeof AppErrorCodeSchema>;

export const BookSchema = z.object({
  id: z.string(),
  title: z.string(),
  author: z.string().optional(),
  cover: z.string().optional(),
  description: z.string().optional(),
  sourceType: z.enum(["upload", "url", "search", "bookSource", "manual"]),
  sourceUrl: z.string().optional(),
  format: z.enum(["txt", "epub", "html", "md", "pdf", "docx", "mobi", "azw3"]),
  status: z.enum(["reading", "finished", "dropped", "to_read"]),
  tags: z.array(z.string()),
  chapterCount: z.number(),
  wordCount: z.number().optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
  lastReadAt: z.string().optional(),
});

export type Book = z.infer<typeof BookSchema>;

export const ReadingProgressSchema = z.object({
  bookId: z.string(),
  chapterId: z.string(),
  chapterIndex: z.number(),
  offset: z.number(),
  percentage: z.number(),
  updatedAt: z.string(),
});

export type ReadingProgress = z.infer<typeof ReadingProgressSchema>;

export const ReaderSettingsSchema = z.object({
  fontFamily: z.string(),
  fontSize: z.number(),
  lineHeight: z.number(),
  theme: z.enum(["paper", "sepia", "green", "warmGray", "dark"]),
  pageMode: z.enum(["scroll", "pagination"]), // NEW
  uiMode: z.enum(["default", "simple"]).optional().default("default"),
});

export type ReaderSettings = z.infer<typeof ReaderSettingsSchema>;

export const BookmarkSchema = z.object({
  id: z.string(),
  bookId: z.string(),
  chapterIndex: z.number(),
  offset: z.number(),
  contentPreview: z.string().optional(),
  createdAt: z.string(),
});

export type Bookmark = z.infer<typeof BookmarkSchema>;

export const readerTokens = {
  color: {
    paper: "#F8F8F5",
    sepia: "#F4ECD8",
    green: "#DDEBD6",
    warmGray: "#E8E3DA",
    dark: "#1E1E1E",
    black: "#000000",
    textPrimary: "#2F2A24",
    textSecondary: "#6F665B",
    textDark: "#CFCFCF",
    textDarkSecondary: "#8F8F8F",
    accent: "#9A6A3A",
    accentDark: "#D2A66A",
    borderSoft: "rgba(80,65,45,0.12)",
    panelBg: "rgba(255,252,245,0.94)",
    panelDark: "rgba(35,35,35,0.96)",
  },
  radius: {
    card: 16,
    panel: 20,
    sheet: 24,
    button: 999,
    cover: 10,
  },
  typography: {
    mobileFontSize: 18,
    tabletFontSize: 19,
    desktopFontSize: 20,
    lineHeight: 1.65,
    desktopLineHeight: 1.7,
    paragraphSpacing: "0.5em",
    fontSizeRange: {
      mobile: [14, 32],
      desktop: [14, 36],
    },
  },
  layout: {
    mobileMarginX: 20,
    mobileMarginY: 18,
    tabletContentMaxWidth: 760,
    desktopContentMaxWidth: 760,
    desktopCanvasWidth: 1280,
    desktopTocWidth: 240,
    desktopReaderWidth: 700,
    desktopAiWidth: 338,
    wideReaderMaxWidth: 820,
  },
  motion: {
    fast: "120ms",
    normal: "180ms",
    sheet: "240ms",
  },
  zIndex: {
    readerText: 1,
    tapZone: 5,
    topBar: 20,
    bottomBar: 20,
    drawer: 30,
    sheet: 40,
    toast: 50,
  },
} as const;

export type ReaderTokens = typeof readerTokens;

function bytesToUuid(bytes: Uint8Array): string {
  bytes[6] = ((bytes[6] ?? 0) & 0x0f) | 0x40;
  bytes[8] = ((bytes[8] ?? 0) & 0x3f) | 0x80;

  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0"));
  return [
    hex.slice(0, 4).join(""),
    hex.slice(4, 6).join(""),
    hex.slice(6, 8).join(""),
    hex.slice(8, 10).join(""),
    hex.slice(10, 16).join(""),
  ].join("-");
}

export function createId(): string {
  const bytes = new Uint8Array(16);
  if (
    typeof crypto !== "undefined" &&
    typeof crypto.getRandomValues === "function"
  ) {
    crypto.getRandomValues(bytes);
    return bytesToUuid(bytes);
  }

  for (let index = 0; index < bytes.length; index += 1) {
    bytes[index] = Math.floor(Math.random() * 256);
  }
  return bytesToUuid(bytes);
}
