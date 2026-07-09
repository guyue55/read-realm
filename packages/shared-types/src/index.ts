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

export const LibrarySourceTypeSchema = z.enum([
  "manual_upload",
  "browser_directory",
  "local_backend_directory",
  "tauri_directory",
  "opfs_cache",
  "cloud_cache",
  "webdav",
]);

export const LibrarySourceSchema = z.object({
  id: z.string(),
  name: z.string(),
  type: LibrarySourceTypeSchema,
  rootName: z.string(),
  deviceId: z.string().optional(),
  backendBaseUrl: z.string().optional(),
  permissionState: z.enum(["granted", "prompt", "denied", "expired"]).default("prompt"),
  lastScanAt: z.string().optional(),
  scanMode: z.enum(["manual", "on_open", "scheduled"]).default("manual"),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export type LibrarySource = z.infer<typeof LibrarySourceSchema>;

export const LibraryFolderSchema = z.object({
  id: z.string(),
  name: z.string(),
  parentId: z.string().optional(),
  sourceId: z.string().optional(),
  sourceType: z.enum(["virtual", "imported_directory", "local_backend_directory", "cloud_directory"]),
  relativePath: z.string().optional(),
  depth: z.number().default(0),
  sortOrder: z.number().default(0),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export type LibraryFolder = z.infer<typeof LibraryFolderSchema>;

export const IndexedNovelFileSchema = z.object({
  id: z.string(),
  sourceId: z.string(),
  parentFolderId: z.string().optional(),
  name: z.string(),
  relativePath: z.string(),
  kind: z.enum(["file", "directory"]),
  format: z.enum(["txt", "epub", "html", "md", "pdf", "docx", "mobi", "azw3", "unknown"]).optional(),
  size: z.number().optional(),
  lastModified: z.number().optional(),
  quickFingerprint: z.string().optional(),
  contentHash: z.string().optional(),
  status: z.enum(["indexed", "parsed", "cached", "missing", "changed", "permission_lost", "ignored"]),
  bookId: z.string().optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export type IndexedNovelFile = z.infer<typeof IndexedNovelFileSchema>;

export const ContentLocatorSchema = z.object({
  sourceId: z.string(),
  sourceType: LibrarySourceTypeSchema,
  rootName: z.string(),
  relativePath: z.string(),
  size: z.number().optional(),
  lastModified: z.number().optional(),
  quickFingerprint: z.string().optional(),
  contentHash: z.string().optional(),
  deviceId: z.string().optional(),
  backendBaseUrl: z.string().optional(),
});

export type ContentLocator = z.infer<typeof ContentLocatorSchema>;

export const TxtChapterIndexSchema = z.object({
  chapterId: z.string(),
  bookId: z.string(),
  title: z.string(),
  index: z.number(),
  startOffset: z.number(),
  endOffset: z.number(),
  encoding: z.enum(["utf-8", "gb18030", "big5", "unknown"]).default("utf-8"),
  hash: z.string().optional(),
});

export type TxtChapterIndex = z.infer<typeof TxtChapterIndexSchema>;

export const MultiFileBookChapterSchema = z.object({
  fileId: z.string(),
  title: z.string(),
  index: z.number(),
  relativePath: z.string(),
  size: z.number(),
  lastModified: z.number(),
  quickFingerprint: z.string().optional(),
});

export const MultiFileBookShellSchema = z.object({
  id: z.string(),
  title: z.string(),
  sourceType: z.literal("folder_multi_file_book"),
  folderFileId: z.string(),
  chapterFiles: z.array(MultiFileBookChapterSchema),
  parseStatus: z.enum(["toc_ready", "parsed", "failed"]),
  cacheStatus: z.enum(["metadata_only", "chapters_partial", "chapters_full"]),
});

export type MultiFileBookShell = z.infer<typeof MultiFileBookShellSchema>;

export const BookSchema = z.object({
  id: z.string(),
  title: z.string(),
  author: z.string().optional(),
  cover: z.string().optional(),
  description: z.string().optional(),
  sourceType: z.enum([
    "upload",
    "url",
    "search",
    "bookSource",
    "manual",
    "folder_index",
    "folder_multi_file_book",
    "local_backend_directory",
    "cloud_cache"
  ]),
  sourceUrl: z.string().optional(),
  format: z.enum(["txt", "epub", "html", "md", "pdf", "docx", "mobi", "azw3", "unknown"]),
  status: z.enum(["reading", "finished", "dropped", "to_read"]),
  tags: z.array(z.string()),
  chapterCount: z.number(),
  wordCount: z.number().optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
  lastReadAt: z.string().optional(),
  toc: z.array(z.object({ index: z.number(), title: z.string() })).optional(),
  
  // BookShell (藏书外壳) 及多文件小说拓展字段：
  sourceFileId: z.string().optional(),
  sourceFolderId: z.string().optional(),
  parseStatus: z.enum(["not_parsed", "parsing", "toc_ready", "parsed", "failed"]).optional(),
  cacheStatus: z.enum(["metadata_only", "toc_cached", "chapters_partial", "chapters_full", "original_cached"]).optional(),
  sourceAvailability: z.enum([
    "metadata_only",
    "source_available",
    "permission_required",
    "source_missing",
    "source_offline",
    "partial_cached",
    "full_cached",
    "cloud_available"
  ]).optional(),
  contentLocator: ContentLocatorSchema.optional(),
  multiFileBook: MultiFileBookShellSchema.optional(),
});

export type Book = z.infer<typeof BookSchema>;

export const ReadingProgressSchema = z.object({
  bookId: z.string(),
  chapterId: z.string(),
  chapterIndex: z.number(),
  offset: z.number(),
  percentage: z.number(),
  updatedAt: z.string(),
  paragraphIndex: z.number().optional(),
  characterOffset: z.number().optional(),
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
  paragraphIndex: z.number().optional(),
  characterOffset: z.number().optional(),
  note: z.string().optional(), // 🏮 [NEW] 用户手写的心得/批注笔记，同构至书签数据中
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

/**
 * 跨平台标准的异步 HMAC-SHA256 签名生成器 (AISigKey)
 * 100% 兼容现代浏览器环境与 Node.js 16+ 环境，依靠 SubtleCrypto 原生能力提供纳秒级无阻塞加密，
 * 彻底避免多余第三方依赖，将内容、模型与 Prompt 物理绑定。
 */
export async function generateAiSigKeyAsync(
  sourceHash: string,
  model: string,
  promptVersion: string,
  scope: string = "global",
): Promise<string> {
  const payload = `${scope}:${sourceHash}:${model}:${promptVersion}`;
  const encoder = new TextEncoder();
  const dataBytes = encoder.encode(payload);
  const secretKeyBytes = encoder.encode("read-realm-secret-salt-2026");

  // 融合浏览器端 (window) 与服务端 (globalThis) 的 SubtleCrypto 加密上下文
  const cryptoObj = typeof window !== "undefined"
    ? (window.crypto || (window as unknown as { msCrypto?: Crypto }).msCrypto)
    : (typeof globalThis !== "undefined" ? (globalThis as unknown as { crypto?: Crypto }).crypto : null);

  if (!cryptoObj || !cryptoObj.subtle) {
    // 降级兜底：在未支持 Subtle 极度特殊的旧原生套壳中拼接退避
    return `fallback-${scope}-${sourceHash}-${model}-${promptVersion}`;
  }

  try {
    const key = await cryptoObj.subtle.importKey(
      "raw",
      secretKeyBytes,
      { name: "HMAC", hash: { name: "SHA-256" } },
      false,
      ["sign"]
    );

    const signature = await cryptoObj.subtle.sign(
      "HMAC",
      key,
      dataBytes
    );

    const hashArray = Array.from(new Uint8Array(signature));
    return hashArray.map(b => b.toString(16).padStart(2, "0")).join("");
  } catch (err) {
    console.warn("[Crypto] SubtleCrypto HMAC 运算失败，启动降级签名:", err);
    return `fallback-${scope}-${sourceHash}-${model}-${promptVersion}`;
  }
}
