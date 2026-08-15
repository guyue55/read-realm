import { describe, expect, it, vi } from "vitest";
import type {
  Book,
  LocalChapter,
  PersonalPublicationContentPage,
  PersonalPublicationManifestPage,
} from "@reader/shared-types";
import {
  PersonalBookExportError,
  PersonalBookExportService,
  PersonalPublicationApiClient,
  type PersonalBookExportLocalPort,
  type PersonalPublicationRemotePort,
} from "./personal-book-export";

const hash = async (value: string) => {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(value),
  );
  return Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
};

const localBook = (overrides: Partial<Book> = {}): Book => ({
  id: "book-1",
  title: "云上书",
  author: "作者",
  description: "说明",
  sourceType: "cloud_cache",
  format: "txt",
  status: "reading",
  tags: [],
  chapterCount: 2,
  cacheStatus: "chapters_full",
  sourceAvailability: "full_cached",
  createdAt: "2026-08-15T09:00:00.000Z",
  updatedAt: "2026-08-15T09:00:00.000Z",
  ...overrides,
});

const localChapters: LocalChapter[] = [
  {
    id: "local-0",
    bookId: "book-1",
    index: 0,
    title: "第一章",
    content: "甲卷正文",
  },
  {
    id: "local-1",
    bookId: "book-1",
    index: 1,
    title: "第二章",
    content: "乙卷正文",
  },
];

async function manifestPage(
  includeContent: boolean,
): Promise<PersonalPublicationManifestPage | PersonalPublicationContentPage> {
  const manifests = await Promise.all(
    localChapters.map(async (chapter) => ({
      index: chapter.index,
      title: chapter.title,
      contentHash: await hash(chapter.content),
      byteLength: new TextEncoder().encode(chapter.content).byteLength,
      ...(includeContent ? { content: chapter.content } : {}),
    })),
  );
  return {
    schemaVersion: 1,
    sourceRef: "b".repeat(64),
    snapshotHash: "a".repeat(64),
    book: {
      title: "云上书",
      author: "作者",
      description: "说明",
      format: "txt",
      chapterCount: 2,
    },
    total: 2,
    offset: 0,
    limit: 200,
    items: manifests,
  } as PersonalPublicationManifestPage | PersonalPublicationContentPage;
}

function remote(
  readPage: PersonalPublicationRemotePort["readPublicationPage"],
): PersonalPublicationRemotePort {
  return {
    listBooks: vi.fn(async () => [localBook()]),
    readPublicationPage: vi.fn(readPage),
  };
}

function local(bundle?: { book: Book; chapters: readonly LocalChapter[] }) {
  return {
    readCandidate: vi.fn(async () => bundle),
  } satisfies PersonalBookExportLocalPort;
}

describe("PersonalBookExportService", () => {
  it("uses a full local cache only after every hash matches the verified remote manifest", async () => {
    const target = remote(async ({ includeContent }) =>
      manifestPage(includeContent),
    );
    const localPort = local({ book: localBook(), chapters: localChapters });
    const service = new PersonalBookExportService(target, localPort);

    const snapshot = await service.export("book-1");

    expect(snapshot.chapters.map((chapter) => chapter.content)).toEqual([
      "甲卷正文",
      "乙卷正文",
    ]);
    expect(target.readPublicationPage).not.toHaveBeenCalledWith(
      expect.objectContaining({ includeContent: true }),
    );
    expect(target.readPublicationPage).toHaveBeenCalledTimes(2);
  });

  it("downloads the same remote snapshot when a nominally full local cache differs", async () => {
    const target = remote(async ({ includeContent }) =>
      manifestPage(includeContent),
    );
    const localPort = local({
      book: localBook(),
      chapters: [
        { ...localChapters[0]!, content: "本地旧版" },
        localChapters[1]!,
      ],
    });
    const service = new PersonalBookExportService(target, localPort);

    const snapshot = await service.export("book-1");

    expect(snapshot.chapters[0]?.content).toBe("甲卷正文");
    expect(target.readPublicationPage).toHaveBeenCalledWith(
      expect.objectContaining({
        includeContent: true,
        expectedSnapshotHash: "a".repeat(64),
      }),
    );
  });

  it("refuses a complete local book when the same-token inventory lacks it", async () => {
    const target = remote(async () => manifestPage(false));
    vi.mocked(target.listBooks).mockResolvedValue([]);
    const service = new PersonalBookExportService(
      target,
      local({ book: localBook(), chapters: localChapters }),
    );

    await expect(service.export("book-1")).rejects.toEqual(
      new PersonalBookExportError("remote_book_not_found"),
    );
    expect(target.readPublicationPage).not.toHaveBeenCalled();
  });

  it("rejects a client-side content hash mismatch", async () => {
    const target = remote(async ({ includeContent }) => {
      const page = await manifestPage(includeContent);
      return includeContent
        ? {
            ...page,
            items: page.items.map((item, index) =>
              index === 0 ? { ...item, content: "途中被篡改" } : item,
            ),
          }
        : page;
    });
    const service = new PersonalBookExportService(target, local());
    await expect(service.export("book-1")).rejects.toEqual(
      new PersonalBookExportError("remote_hash_mismatch"),
    );
  });
});

describe("PersonalPublicationApiClient", () => {
  it("snapshots a non-default token and never sends the public maintenance header", async () => {
    const payload = await manifestPage(false);
    const fetchImpl = vi.fn<typeof fetch>(
      async () => new Response(JSON.stringify(payload), { status: 200 }),
    );
    const client = new PersonalPublicationApiClient("  private-a  ", fetchImpl);
    await client.readPublicationPage({
      bookId: "book-1",
      offset: 0,
      limit: 200,
      includeContent: false,
    });

    const [url, init] = fetchImpl.mock.calls[0]!;
    expect(String(url)).toContain("/books/book-1/publication-export");
    expect(String(url)).not.toContain("private-a");
    expect(init?.headers).toEqual({ "x-share-token": "private-a" });
    expect(init?.headers).not.toHaveProperty(
      "x-public-library-maintenance-key",
    );
  });

  it.each(["", "default", "bad key"])(
    "rejects invalid token %p before any network request",
    async (token) => {
      const fetchImpl = vi.fn<typeof fetch>();
      expect(() => new PersonalPublicationApiClient(token, fetchImpl)).toThrow(
        new PersonalBookExportError("private_share_token_required"),
      );
      expect(fetchImpl).not.toHaveBeenCalled();
    },
  );

  it("maps an invalid remote snapshot to a stable validation error", async () => {
    const fetchImpl = vi.fn<typeof fetch>(
      async () => new Response("{}", { status: 422 }),
    );
    const client = new PersonalPublicationApiClient("private-a", fetchImpl);

    await expect(
      client.readPublicationPage({
        bookId: "book-1",
        offset: 0,
        limit: 200,
        includeContent: false,
      }),
    ).rejects.toEqual(new PersonalBookExportError("remote_snapshot_invalid"));
  });

  it("maps the server whole-book limit to the precise size error", async () => {
    const fetchImpl = vi.fn<typeof fetch>(
      async () => new Response("{}", { status: 413 }),
    );
    const client = new PersonalPublicationApiClient("private-a", fetchImpl);

    await expect(
      client.readPublicationPage({
        bookId: "book-1",
        offset: 0,
        limit: 200,
        includeContent: false,
      }),
    ).rejects.toEqual(new PersonalBookExportError("publication_too_large"));
  });
});
