import {
  BookSchema,
  LibraryFolderSchema,
  LocalChapterSchema,
  ReadingProgressSchema,
  type Book,
  type LibraryFolder,
  type LocalChapter,
  type ReadingProgress,
} from "@reader/shared-types";
import { apiUrl } from "@/lib/api";

export type LegacyPersonalSyncErrorCode =
  | "invalid_remote_books"
  | "invalid_remote_folders"
  | "invalid_remote_progress"
  | "invalid_remote_chapters"
  | "remote_chapter_count_mismatch"
  | "remote_pagination_stalled"
  | "remote_verification_failed"
  | "invalid_local_upload"
  | "private_share_token_required"
  | "remote_unavailable"
  | "remote_timeout";

export class LegacyPersonalSyncError extends Error {
  constructor(
    public readonly code: LegacyPersonalSyncErrorCode,
    message: string,
    public readonly status?: number,
  ) {
    super(message);
    this.name = "LegacyPersonalSyncError";
  }
}

export type LegacyRemoteBook = Book & { lastReadProgress?: string };

export function readLegacyRemoteProgress(
  book: LegacyRemoteBook,
): ReadingProgress | undefined {
  if (!book.lastReadProgress) return undefined;
  try {
    const progress = ReadingProgressSchema.parse(JSON.parse(book.lastReadProgress));
    if (progress.bookId !== book.id) throw new Error("bookId mismatch");
    return progress;
  } catch {
    throw new LegacyPersonalSyncError(
      "invalid_remote_progress",
      `云端书籍 ${book.id} 的进度快照无效`,
    );
  }
}

interface LegacyPersonalSyncApiClientOptions {
  fetchImpl?: typeof fetch;
  resolveUrl: (path: string) => string;
  getHeaders: () => HeadersInit;
  timeoutMs?: number;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function withoutNullFields(value: Record<string, unknown>) {
  return Object.fromEntries(
    Object.entries(value).filter(([, field]) => field !== null),
  );
}

function parseRemoteProgress(bookId: string, value: unknown): string | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  if (typeof value !== "string") {
    throw new LegacyPersonalSyncError(
      "invalid_remote_progress",
      `云端书籍 ${bookId} 的进度快照不是字符串`,
    );
  }
  try {
    const parsed = ReadingProgressSchema.parse(JSON.parse(value));
    if (parsed.bookId !== bookId) throw new Error("bookId mismatch");
    return JSON.stringify(parsed);
  } catch {
    throw new LegacyPersonalSyncError(
      "invalid_remote_progress",
      `云端书籍 ${bookId} 的进度快照无效`,
    );
  }
}

function parseRemoteBook(value: unknown): LegacyRemoteBook {
  if (!isRecord(value)) {
    throw new LegacyPersonalSyncError("invalid_remote_books", "云端书目不是对象");
  }
  const normalized = withoutNullFields(value);
  const parsed = BookSchema.safeParse({
    ...normalized,
    tags: Array.isArray(normalized.tags) ? normalized.tags : [],
  });
  if (
    !parsed.success ||
    !Number.isInteger(parsed.data.chapterCount) ||
    parsed.data.chapterCount < 0 ||
    !parsed.data.id.trim() ||
    !parsed.data.title.trim()
  ) {
    throw new LegacyPersonalSyncError("invalid_remote_books", "云端书目字段无效");
  }
  const lastReadProgress = parseRemoteProgress(
    parsed.data.id,
    value.lastReadProgress,
  );
  return lastReadProgress
    ? { ...parsed.data, lastReadProgress }
    : parsed.data;
}

function parseRemoteFolder(value: unknown): LibraryFolder {
  if (!isRecord(value)) {
    throw new LegacyPersonalSyncError("invalid_remote_folders", "云端书箧不是对象");
  }
  const parsed = LibraryFolderSchema.safeParse(withoutNullFields(value));
  if (!parsed.success || !parsed.data.id.trim() || !parsed.data.name.trim()) {
    throw new LegacyPersonalSyncError("invalid_remote_folders", "云端书箧字段无效");
  }
  return parsed.data;
}

function parseRemoteChapter(bookId: string, value: unknown): LocalChapter {
  if (!isRecord(value)) {
    throw new LegacyPersonalSyncError("invalid_remote_chapters", "云端章节不是对象");
  }
  const rawId = typeof value.id === "string" ? value.id.split("#")[0] : undefined;
  const index = value.index ?? value.chapterIndex;
  const title = value.title ?? value.name;
  const content = value.content ?? value.body ?? value.text;
  const parsed = LocalChapterSchema.safeParse({
    id: rawId || `${bookId}-${String(index)}`,
    bookId,
    index,
    title,
    content,
  });
  if (
    !parsed.success ||
    !parsed.data.id.trim() ||
    !parsed.data.title.trim() ||
    parsed.data.content.length === 0
  ) {
    throw new LegacyPersonalSyncError("invalid_remote_chapters", "云端章节字段无效");
  }
  return parsed.data;
}

export class LegacyPersonalSyncApiClient {
  private readonly fetchImpl: typeof fetch;
  private readonly timeoutMs: number;

  constructor(private readonly options: LegacyPersonalSyncApiClientOptions) {
    this.fetchImpl = (options.fetchImpl ?? globalThis.fetch).bind(globalThis);
    this.timeoutMs = options.timeoutMs ?? 10_000;
  }

  private assertPrivateWriteCredential(): void {
    const token = new Headers(this.options.getHeaders()).get("x-share-token")?.trim();
    if (!token) {
      throw new LegacyPersonalSyncError(
        "private_share_token_required",
        "旧个人同步写入必须显式绑定私有分享密钥",
      );
    }
  }

  private async request(path: string, init: RequestInit = {}): Promise<unknown> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const response = await this.fetchImpl(this.options.resolveUrl(path), {
        ...init,
        headers: { ...this.options.getHeaders(), ...init.headers },
        signal: controller.signal,
      });
      if (!response.ok) {
        throw new LegacyPersonalSyncError(
          "remote_unavailable",
          `旧个人同步接口返回 HTTP ${response.status}`,
          response.status,
        );
      }
      try {
        return await response.json();
      } catch {
        throw new LegacyPersonalSyncError(
          "remote_unavailable",
          "旧个人同步接口返回了非 JSON 响应",
          response.status,
        );
      }
    } catch (error) {
      if (error instanceof LegacyPersonalSyncError) throw error;
      if (controller.signal.aborted) {
        throw new LegacyPersonalSyncError("remote_timeout", "旧个人同步请求超时");
      }
      throw new LegacyPersonalSyncError("remote_unavailable", "旧个人同步服务不可用");
    } finally {
      clearTimeout(timeout);
    }
  }

  async listBooks(): Promise<LegacyRemoteBook[]> {
    const payload = await this.request("/books");
    if (!Array.isArray(payload) || payload.length > 5_000) {
      throw new LegacyPersonalSyncError("invalid_remote_books", "云端书目列表无效");
    }
    return payload.map(parseRemoteBook);
  }

  async listFolders(): Promise<LibraryFolder[]> {
    const payload = await this.request("/folders");
    if (!Array.isArray(payload) || payload.length > 5_000) {
      throw new LegacyPersonalSyncError("invalid_remote_folders", "云端书箧列表无效");
    }
    return payload.map(parseRemoteFolder);
  }

  async syncFolders(folders: readonly LibraryFolder[]): Promise<void> {
    this.assertPrivateWriteCredential();
    const parsed = folders.map((folder) => {
      const result = LibraryFolderSchema.safeParse(folder);
      if (!result.success) {
        throw new LegacyPersonalSyncError(
          "invalid_remote_folders",
          "待同步书箧字段无效",
        );
      }
      return result.data;
    });
    await this.request("/folders", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ folders: parsed }),
    });
  }

  async updateProgress(
    bookId: string,
    progress: ReadingProgress,
    options: { lastReadAt?: string; sourceFolderId?: string | null } = {},
  ): Promise<void> {
    this.assertPrivateWriteCredential();
    const parsed = ReadingProgressSchema.safeParse(progress);
    if (!parsed.success || parsed.data.bookId !== bookId) {
      throw new LegacyPersonalSyncError(
        "invalid_remote_progress",
        "待同步阅读进度与目标书籍不匹配",
      );
    }
    await this.request(`/books/${encodeURIComponent(bookId)}/progress`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        lastReadProgress: JSON.stringify(parsed.data),
        lastReadAt: options.lastReadAt ?? parsed.data.updatedAt,
        sourceFolderId: options.sourceFolderId ?? null,
      }),
    });
  }

  async deleteBook(bookId: string): Promise<void> {
    this.assertPrivateWriteCredential();
    await this.request(`/books/${encodeURIComponent(bookId)}`, {
      method: "DELETE",
    });
  }

  async clearBooks(): Promise<void> {
    this.assertPrivateWriteCredential();
    await this.request("/books", { method: "DELETE" });
  }

  async uploadAndVerifyBook({
    book,
    chapters,
    progress,
    onUploaded,
  }: {
    book: Book;
    chapters: readonly LocalChapter[];
    progress?: ReadingProgress;
    onUploaded?: (uploaded: number, total: number) => void;
  }): Promise<LegacyRemoteBook> {
    this.assertPrivateWriteCredential();
    const parsedBook = BookSchema.safeParse(book);
    const orderedChapters = [...chapters].sort((left, right) => left.index - right.index);
    const normalizedProgress = progress
      ? ReadingProgressSchema.safeParse(progress)
      : undefined;
    if (
      !parsedBook.success ||
      parsedBook.data.chapterCount <= 0 ||
      orderedChapters.length !== parsedBook.data.chapterCount ||
      orderedChapters.some((chapter, index) => {
        const parsed = LocalChapterSchema.safeParse(chapter);
        return (
          !parsed.success ||
          parsed.data.bookId !== parsedBook.data.id ||
          parsed.data.index !== index ||
          parsed.data.content.length === 0
        );
      })
    ) {
      throw new LegacyPersonalSyncError(
        "invalid_local_upload",
        "本地书籍尚未形成可验证的完整正文",
      );
    }
    if (progress) {
      if (
        !normalizedProgress?.success ||
        normalizedProgress.data.bookId !== parsedBook.data.id ||
        orderedChapters[normalizedProgress.data.chapterIndex]?.id !==
          normalizedProgress.data.chapterId
      ) {
        throw new LegacyPersonalSyncError(
          "invalid_local_upload",
          "本地阅读进度与待上传正文不匹配",
        );
      }
    }

    await this.request("/books/import", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        metadata: parsedBook.data,
        chapters: orderedChapters.map(({ id, index, title, content }) => ({
          id,
          index,
          title,
          content,
        })),
        replaceExisting: true,
      }),
    });
    onUploaded?.(orderedChapters.length, orderedChapters.length);

    await this.verifyRemoteCopy(parsedBook.data, orderedChapters);
    if (normalizedProgress?.success) {
      await this.updateProgress(book.id, normalizedProgress.data, {
        lastReadAt: book.lastReadAt ?? normalizedProgress.data.updatedAt,
        sourceFolderId: book.sourceFolderId ?? null,
      });
    }

    const verifiedBook = (await this.listBooks()).find(
      (candidate) => candidate.id === book.id,
    );
    if (
      !verifiedBook ||
      verifiedBook.chapterCount !== book.chapterCount ||
      (normalizedProgress?.success &&
        JSON.stringify(readLegacyRemoteProgress(verifiedBook)) !==
          JSON.stringify(normalizedProgress.data))
    ) {
      throw new LegacyPersonalSyncError(
        "remote_verification_failed",
        "云端写入后读回校验失败",
      );
    }
    return verifiedBook;
  }

  async verifyRemoteCopy(
    book: Pick<Book, "id" | "chapterCount">,
    localChapters: readonly LocalChapter[],
  ): Promise<void> {
    if (
      book.chapterCount <= 0 ||
      localChapters.length !== book.chapterCount
    ) {
      throw new LegacyPersonalSyncError(
        "invalid_local_upload",
        "本地正文不完整，不能验证云端副本",
      );
    }
    const remoteBook = (await this.listBooks()).find(
      (candidate) => candidate.id === book.id,
    );
    if (!remoteBook || remoteBook.chapterCount !== book.chapterCount) {
      throw new LegacyPersonalSyncError(
        "remote_verification_failed",
        "云端书目与本地正文数量不一致",
      );
    }
    const remoteChapters = await this.downloadChapters(book.id, book.chapterCount);
    const orderedLocal = [...localChapters].sort(
      (left, right) => left.index - right.index,
    );
    const matches = remoteChapters.every((remote, index) => {
      const local = orderedLocal[index];
      return (
        local?.bookId === book.id &&
        local.index === remote.index &&
        local.title === remote.title &&
        local.content === remote.content
      );
    });
    if (!matches) {
      throw new LegacyPersonalSyncError(
        "remote_verification_failed",
        "云端正文与本地正文不一致",
      );
    }
  }

  async downloadChapters(
    bookId: string,
    expectedChapterCount: number,
    options: { pageSize?: number; onPage?: (loaded: number, total: number) => void } = {},
  ): Promise<LocalChapter[]> {
    if (!Number.isInteger(expectedChapterCount) || expectedChapterCount < 0) {
      throw new LegacyPersonalSyncError(
        "remote_chapter_count_mismatch",
        "云端书目章节数无效",
      );
    }
    if (expectedChapterCount === 0) return [];

    const pageSize = Math.min(200, Math.max(1, Math.floor(options.pageSize ?? 80)));
    const chapters: LocalChapter[] = [];
    let offset = 0;
    let declaredTotal: number | undefined;
    const maximumRequests = Math.ceil(expectedChapterCount / pageSize) + 1;

    for (let requestIndex = 0; requestIndex < maximumRequests; requestIndex += 1) {
      const payload = await this.request(
        `/books/${encodeURIComponent(bookId)}/chapters?offset=${offset}&limit=${pageSize}`,
      );
      const isLegacyArray = Array.isArray(payload);
      const items = isLegacyArray
        ? payload
        : isRecord(payload) && Array.isArray(payload.items)
          ? payload.items
          : null;
      const total = isLegacyArray
        ? payload.length
        : isRecord(payload)
          ? payload.total
          : undefined;
      if (
        items === null ||
        !Number.isInteger(total) ||
        Number(total) < 0 ||
        Number(total) > 20_000
      ) {
        throw new LegacyPersonalSyncError("invalid_remote_chapters", "云端章节分页响应无效");
      }
      if (Number(total) !== expectedChapterCount) {
        throw new LegacyPersonalSyncError(
          "remote_chapter_count_mismatch",
          `云端声明 ${String(total)} 章，书目声明 ${expectedChapterCount} 章`,
        );
      }
      if (declaredTotal !== undefined && declaredTotal !== Number(total)) {
        throw new LegacyPersonalSyncError("invalid_remote_chapters", "云端章节总数在分页中发生变化");
      }
      declaredTotal = Number(total);
      if (items.length === 0 && chapters.length < declaredTotal) {
        throw new LegacyPersonalSyncError("remote_pagination_stalled", "云端章节分页未继续前进");
      }
      for (const item of items) chapters.push(parseRemoteChapter(bookId, item));
      if (chapters.length > declaredTotal) {
        throw new LegacyPersonalSyncError("invalid_remote_chapters", "云端章节数超过声明总数");
      }
      options.onPage?.(chapters.length, declaredTotal);
      if (chapters.length === declaredTotal) break;
      if (isLegacyArray) {
        throw new LegacyPersonalSyncError("remote_pagination_stalled", "旧章节接口未返回完整正文");
      }
      offset = chapters.length;
    }

    if (chapters.length !== expectedChapterCount) {
      throw new LegacyPersonalSyncError("remote_pagination_stalled", "云端章节分页未完成");
    }
    const seenIds = new Set<string>();
    const seenIndexes = new Set<number>();
    for (const [position, chapter] of chapters.entries()) {
      if (
        chapter.index !== position ||
        seenIds.has(chapter.id) ||
        seenIndexes.has(chapter.index)
      ) {
        throw new LegacyPersonalSyncError("invalid_remote_chapters", "云端章节序号断裂或重复");
      }
      seenIds.add(chapter.id);
      seenIndexes.add(chapter.index);
    }
    return chapters;
  }
}

export function createLegacyPersonalSyncApiClient(
  shareToken: string,
): LegacyPersonalSyncApiClient {
  const credentialSnapshot = shareToken.trim();
  const headers: Record<string, string> = credentialSnapshot
    ? { "x-share-token": credentialSnapshot }
    : {};
  return new LegacyPersonalSyncApiClient({
    resolveUrl: apiUrl,
    getHeaders: () => headers,
  });
}
