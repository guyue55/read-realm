import { afterEach, describe, expect, it, vi } from "vitest";
import type { Book } from "@reader/shared-types";
import {
  createLegacyPersonalSyncApiClient,
  LegacyPersonalSyncApiClient,
} from "./legacy-personal-sync-api";

afterEach(() => {
  vi.unstubAllGlobals();
});

function remoteBook(overrides: Partial<Book & { lastReadProgress?: string }> = {}) {
  return {
    id: "book-1",
    title: "旧私有同步样本",
    sourceType: "upload" as const,
    format: "epub" as const,
    status: "reading" as const,
    tags: [],
    chapterCount: 2,
    createdAt: "2026-08-15T00:00:00.000Z",
    updatedAt: "2026-08-15T00:00:00.000Z",
    ...overrides,
  };
}

function json(value: unknown, status = 200) {
  return new Response(JSON.stringify(value), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function client(fetchImpl: typeof fetch) {
  return new LegacyPersonalSyncApiClient({
    fetchImpl,
    resolveUrl: (path) => `https://legacy.invalid${path}`,
    getHeaders: () => ({ "x-share-token": "private-key" }),
    timeoutMs: 100,
  });
}

describe("LegacyPersonalSyncApiClient", () => {
  it("captures one immutable credential for every request in an operation", async () => {
    const seenTokens: Array<string | null> = [];
    const fetchImpl = vi.fn<typeof fetch>(async (_input, init) => {
      seenTokens.push(new Headers(init?.headers).get("x-share-token"));
      return json([remoteBook()]);
    });
    vi.stubGlobal("fetch", fetchImpl);

    const operation = createLegacyPersonalSyncApiClient("private-key-a");
    await operation.listBooks();
    await operation.listBooks();

    expect(seenTokens).toEqual(["private-key-a", "private-key-a"]);
  });

  it("refuses every private write when no share token is bound", async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () => json({ success: true }));
    const withoutCredential = new LegacyPersonalSyncApiClient({
      fetchImpl,
      resolveUrl: (path) => `https://legacy.invalid${path}`,
      getHeaders: () => ({}),
    });

    await expect(withoutCredential.deleteBook("book-1")).rejects.toMatchObject({
      code: "private_share_token_required",
    });
    await expect(withoutCredential.clearBooks()).rejects.toMatchObject({
      code: "private_share_token_required",
    });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("invokes a browser-native fetch with the global receiver", async () => {
    const fetchImpl = vi.fn(function (this: unknown) {
      if (this !== globalThis) throw new TypeError("Illegal invocation");
      return Promise.resolve(json([remoteBook()]));
    }) as unknown as typeof fetch;

    await expect(client(fetchImpl).listBooks()).resolves.toHaveLength(1);
  });

  it("rejects malformed remote books instead of coercing them into the shelf", async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () =>
      json([{ ...remoteBook(), chapterCount: -1 }]),
    );

    await expect(client(fetchImpl).listBooks()).rejects.toMatchObject({
      code: "invalid_remote_books",
    });
  });

  it("rejects a progress snapshot that belongs to another book", async () => {
    const lastReadProgress = JSON.stringify({
      bookId: "another-book",
      chapterId: "chapter-1",
      chapterIndex: 0,
      offset: 0,
      percentage: 10,
      updatedAt: "2026-08-15T00:00:00.000Z",
    });
    const fetchImpl = vi.fn<typeof fetch>(async () =>
      json([remoteBook({ lastReadProgress })]),
    );

    await expect(client(fetchImpl).listBooks()).rejects.toMatchObject({
      code: "invalid_remote_progress",
    });
  });

  it("maps the legacy API's omitted tags field without weakening other validation", async () => {
    const legacyShape = Object.fromEntries(
      Object.entries(remoteBook()).filter(([key]) => key !== "tags"),
    );
    const fetchImpl = vi.fn<typeof fetch>(async () => json([legacyShape]));

    await expect(client(fetchImpl).listBooks()).resolves.toEqual([
      expect.objectContaining({ id: "book-1", tags: [] }),
    ]);
  });

  it("downloads a complete, continuous chapter set across bounded pages", async () => {
    const fetchImpl = vi.fn<typeof fetch>(async (input) => {
      const url = new URL(String(input));
      const offset = Number(url.searchParams.get("offset"));
      if (offset === 0) {
        return json({
          items: [{ id: "chapter-0#private", index: 0, title: "第一章", content: "甲" }],
          total: 2,
          offset: 0,
          limit: 1,
        });
      }
      return json({
        items: [{ id: "chapter-1#private", index: 1, title: "第二章", content: "乙" }],
        total: 2,
        offset: 1,
        limit: 1,
      });
    });

    const chapters = await client(fetchImpl).downloadChapters("book-1", 2, {
      pageSize: 1,
    });

    expect(chapters.map((chapter) => chapter.id)).toEqual(["chapter-0", "chapter-1"]);
    expect(chapters.map((chapter) => chapter.bookId)).toEqual(["book-1", "book-1"]);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it("uploads a complete book in one atomic request and verifies the remote readback", async () => {
    const localChapters = [
      { id: "chapter-0", bookId: "book-1", index: 0, title: "第一章", content: "甲" },
      { id: "chapter-1", bookId: "book-1", index: 1, title: "第二章", content: "乙" },
    ];
    const fetchImpl = vi.fn<typeof fetch>(async (input, init) => {
      const url = new URL(String(input));
      if (url.pathname === "/books/import") return json({ success: true });
      if (url.pathname === "/books") return json([remoteBook()]);
      if (url.pathname.endsWith("/chapters")) {
        return json({ items: localChapters, total: 2, offset: 0, limit: 80 });
      }
      throw new Error(`unexpected request ${url.pathname} ${String(init?.method)}`);
    });

    await expect(
      client(fetchImpl).uploadAndVerifyBook({
        book: remoteBook(),
        chapters: localChapters,
      }),
    ).resolves.toMatchObject({ id: "book-1", chapterCount: 2 });

    const importCalls = fetchImpl.mock.calls.filter(([input]) =>
      String(input).endsWith("/books/import"),
    );
    expect(importCalls).toHaveLength(1);
    expect(JSON.parse(String(importCalls[0]?.[1]?.body))).toMatchObject({
      replaceExisting: true,
      chapters: [{ index: 0 }, { index: 1 }],
    });
  });

  it("refuses to verify an offload candidate whose remote text differs", async () => {
    const localChapters = [
      { id: "chapter-0", bookId: "book-1", index: 0, title: "第一章", content: "本地甲" },
      { id: "chapter-1", bookId: "book-1", index: 1, title: "第二章", content: "本地乙" },
    ];
    const fetchImpl = vi.fn<typeof fetch>(async (input) => {
      const url = new URL(String(input));
      if (url.pathname === "/books") return json([remoteBook()]);
      return json({
        items: [
          { ...localChapters[0], content: "云端内容已变化" },
          localChapters[1],
        ],
        total: 2,
        offset: 0,
        limit: 80,
      });
    });

    await expect(
      client(fetchImpl).verifyRemoteCopy(remoteBook(), localChapters),
    ).rejects.toMatchObject({ code: "remote_verification_failed" });
  });

  it.each([
    {
      name: "duplicate index",
      payload: {
        items: [
          { id: "a", index: 0, title: "A", content: "A" },
          { id: "b", index: 0, title: "B", content: "B" },
        ],
        total: 2,
      },
      code: "invalid_remote_chapters",
    },
    {
      name: "empty content",
      payload: {
        items: [
          { id: "a", index: 0, title: "A", content: "" },
          { id: "b", index: 1, title: "B", content: "B" },
        ],
        total: 2,
      },
      code: "invalid_remote_chapters",
    },
    {
      name: "total mismatch",
      payload: {
        items: [{ id: "a", index: 0, title: "A", content: "A" }],
        total: 1,
      },
      code: "remote_chapter_count_mismatch",
    },
  ])("rejects $name without returning a partial book", async ({ payload, code }) => {
    const fetchImpl = vi.fn<typeof fetch>(async () => json(payload));

    await expect(
      client(fetchImpl).downloadChapters("book-1", 2),
    ).rejects.toMatchObject({ code });
  });

  it("stops when a paged endpoint makes no progress", async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () =>
      json({ items: [], total: 2, offset: 0, limit: 80 }),
    );

    await expect(
      client(fetchImpl).downloadChapters("book-1", 2),
    ).rejects.toMatchObject({ code: "remote_pagination_stalled" });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("classifies HTTP failures instead of returning an empty successful list", async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () => json({ error: "down" }, 503));

    await expect(client(fetchImpl).listBooks()).rejects.toMatchObject({
      code: "remote_unavailable",
      status: 503,
    });
  });
});
