import {
  BookSchema,
  PersonalPublicationContentPageSchema,
  PersonalPublicationManifestPageSchema,
  VerifiedPersonalPublicationSnapshotSchema,
  type Book,
  type LocalChapter,
  type PersonalPublicationContentPage,
  type PersonalPublicationManifestPage,
  type PersonalPublicationSnapshotDescriptor,
  type VerifiedPersonalPublicationSnapshot,
} from "@reader/shared-types";
import { apiUrl, normalizeShareToken } from "@/lib/api";

const PUBLICATION_PAGE_SIZE = 200;
const MAX_PUBLICATION_BYTES = 20 * 1024 * 1024;

type ChapterManifest =
  PersonalPublicationSnapshotDescriptor["chapters"][number];

export type PersonalBookExportErrorCode =
  | "private_share_token_required"
  | "remote_book_not_found"
  | "remote_snapshot_invalid"
  | "remote_snapshot_changed"
  | "remote_hash_mismatch"
  | "remote_unavailable"
  | "publication_too_large";

export class PersonalBookExportError extends Error {
  constructor(readonly code: PersonalBookExportErrorCode) {
    super(code);
    this.name = "PersonalBookExportError";
  }
}

export interface ReadPersonalPublicationPageInput {
  bookId: string;
  offset: number;
  limit: number;
  includeContent: boolean;
  expectedSnapshotHash?: string;
}

export interface PersonalPublicationRemotePort {
  listBooks(): Promise<Book[]>;
  readPublicationPage(
    input: ReadPersonalPublicationPageInput,
  ): Promise<PersonalPublicationManifestPage | PersonalPublicationContentPage>;
}

export interface PersonalBookExportLocalPort {
  readCandidate(
    bookId: string,
  ): Promise<{ book: Book; chapters: readonly LocalChapter[] } | undefined>;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseInventoryBook(value: unknown): Book {
  if (!isRecord(value))
    throw new PersonalBookExportError("remote_snapshot_invalid");
  const withoutNull = Object.fromEntries(
    Object.entries(value).filter(([, field]) => field !== null),
  );
  const parsed = BookSchema.safeParse({
    ...withoutNull,
    tags: Array.isArray(withoutNull.tags) ? withoutNull.tags : [],
  });
  if (!parsed.success) {
    throw new PersonalBookExportError("remote_snapshot_invalid");
  }
  return parsed.data;
}

export class PersonalPublicationApiClient implements PersonalPublicationRemotePort {
  private readonly token: string;

  constructor(
    shareToken: string,
    private readonly fetchImpl: typeof fetch = globalThis.fetch.bind(
      globalThis,
    ),
  ) {
    this.token = normalizeShareToken(shareToken);
    if (!this.token) {
      throw new PersonalBookExportError("private_share_token_required");
    }
  }

  private async request(path: string, headers: Record<string, string> = {}) {
    let response: Response;
    try {
      response = await this.fetchImpl(apiUrl(path), {
        headers: { "x-share-token": this.token, ...headers },
      });
    } catch {
      throw new PersonalBookExportError("remote_unavailable");
    }
    if (response.status === 404) {
      throw new PersonalBookExportError("remote_book_not_found");
    }
    if (response.status === 409) {
      throw new PersonalBookExportError("remote_snapshot_changed");
    }
    if (response.status === 413) {
      throw new PersonalBookExportError("publication_too_large");
    }
    if (response.status === 422) {
      throw new PersonalBookExportError("remote_snapshot_invalid");
    }
    if (!response.ok) {
      throw new PersonalBookExportError("remote_unavailable");
    }
    try {
      return (await response.json()) as unknown;
    } catch {
      throw new PersonalBookExportError("remote_snapshot_invalid");
    }
  }

  async listBooks(): Promise<Book[]> {
    const payload = await this.request("/books");
    if (!Array.isArray(payload) || payload.length > 5000) {
      throw new PersonalBookExportError("remote_snapshot_invalid");
    }
    return payload.map(parseInventoryBook);
  }

  async readPublicationPage(input: ReadPersonalPublicationPageInput) {
    const query = new URLSearchParams({
      offset: String(input.offset),
      limit: String(input.limit),
      includeContent: String(input.includeContent),
    });
    const payload = await this.request(
      `/books/${encodeURIComponent(input.bookId)}/publication-export?${query}`,
      input.expectedSnapshotHash
        ? { "if-match": input.expectedSnapshotHash }
        : {},
    );
    const parsed = input.includeContent
      ? PersonalPublicationContentPageSchema.safeParse(payload)
      : PersonalPublicationManifestPageSchema.safeParse(payload);
    if (!parsed.success) {
      throw new PersonalBookExportError("remote_snapshot_invalid");
    }
    return parsed.data;
  }
}

import { safeSha256 } from "@/lib/safe-crypto";

interface PublicationPass {
  snapshotHash: string;
  sourceRef: string;
  book: PersonalPublicationManifestPage["book"];
  manifest: ChapterManifest[];
  byteLengths: number[];
  contents?: string[];
}

function sameBook(
  left: PersonalPublicationManifestPage["book"],
  right: PersonalPublicationManifestPage["book"],
) {
  return (
    left.title === right.title &&
    left.author === right.author &&
    left.description === right.description &&
    left.format === right.format &&
    left.chapterCount === right.chapterCount
  );
}

function sameManifest(
  left: readonly ChapterManifest[],
  right: readonly ChapterManifest[],
) {
  return (
    left.length === right.length &&
    left.every((chapter, index) => {
      const candidate = right[index];
      return (
        candidate?.index === chapter.index &&
        candidate.title === chapter.title &&
        candidate.contentHash === chapter.contentHash
      );
    })
  );
}

export class PersonalBookExportService {
  constructor(
    private readonly remote: PersonalPublicationRemotePort,
    private readonly local: PersonalBookExportLocalPort,
  ) {}

  private async readPass(
    bookId: string,
    includeContent: boolean,
    expectedSnapshotHash?: string,
  ): Promise<PublicationPass> {
    const manifest: ChapterManifest[] = [];
    const byteLengths: number[] = [];
    const contents: string[] = [];
    let firstPage: PersonalPublicationManifestPage | undefined;
    let offset = 0;

    while (true) {
      const page = await this.remote.readPublicationPage({
        bookId,
        offset,
        limit: PUBLICATION_PAGE_SIZE,
        includeContent,
        expectedSnapshotHash: expectedSnapshotHash ?? firstPage?.snapshotHash,
      });
      if (
        page.offset !== offset ||
        page.total !== page.book.chapterCount ||
        page.items.length === 0 ||
        (firstPage &&
          (page.snapshotHash !== firstPage.snapshotHash ||
            page.sourceRef !== firstPage.sourceRef ||
            !sameBook(page.book, firstPage.book)))
      ) {
        throw new PersonalBookExportError("remote_snapshot_invalid");
      }
      firstPage ??= page;
      for (const item of page.items) {
        if (item.index !== manifest.length) {
          throw new PersonalBookExportError("remote_snapshot_invalid");
        }
        manifest.push({
          index: item.index,
          title: item.title,
          contentHash: item.contentHash,
        });
        byteLengths.push(item.byteLength);
        if (includeContent) {
          if (!("content" in item)) {
            throw new PersonalBookExportError("remote_snapshot_invalid");
          }
          if ((await safeSha256(item.content)) !== item.contentHash) {
            throw new PersonalBookExportError("remote_hash_mismatch");
          }
          contents.push(item.content);
        }
      }
      if (manifest.length > page.total) {
        throw new PersonalBookExportError("remote_snapshot_invalid");
      }
      if (manifest.length === page.total) break;
      offset = manifest.length;
    }

    if (!firstPage || manifest.length !== firstPage.total) {
      throw new PersonalBookExportError("remote_snapshot_invalid");
    }
    return {
      snapshotHash: firstPage.snapshotHash,
      sourceRef: firstPage.sourceRef,
      book: firstPage.book,
      manifest,
      byteLengths,
      ...(includeContent ? { contents } : {}),
    };
  }

  private async readMatchingLocal(
    bookId: string,
    remote: PublicationPass,
  ): Promise<string[] | undefined> {
    const candidate = await this.local.readCandidate(bookId);
    if (
      !candidate ||
      candidate.book.cacheStatus !== "chapters_full" ||
      candidate.book.sourceAvailability !== "full_cached" ||
      candidate.book.title !== remote.book.title ||
      candidate.book.author !== remote.book.author ||
      candidate.book.description !== remote.book.description ||
      candidate.book.format !== "txt" ||
      candidate.chapters.length !== remote.manifest.length
    ) {
      return undefined;
    }
    const contents: string[] = [];
    for (const [index, chapter] of candidate.chapters.entries()) {
      const expected = remote.manifest[index];
      if (
        chapter.bookId !== bookId ||
        chapter.index !== index ||
        chapter.title !== expected?.title ||
        (await safeSha256(chapter.content)) !== expected.contentHash
      ) {
        return undefined;
      }
      contents.push(chapter.content);
    }
    return contents;
  }

  async export(bookId: string): Promise<VerifiedPersonalPublicationSnapshot> {
    const inventory = await this.remote.listBooks();
    const remoteBook = inventory.find((book) => book.id === bookId);
    if (!remoteBook) {
      throw new PersonalBookExportError("remote_book_not_found");
    }
    const manifest = await this.readPass(bookId, false);
    if (
      remoteBook.title !== manifest.book.title ||
      remoteBook.author !== manifest.book.author ||
      remoteBook.description !== manifest.book.description ||
      remoteBook.format !== manifest.book.format ||
      remoteBook.chapterCount !== manifest.book.chapterCount
    ) {
      throw new PersonalBookExportError("remote_snapshot_invalid");
    }
    if (
      manifest.byteLengths.reduce((total, size) => total + size, 0) >
      MAX_PUBLICATION_BYTES
    ) {
      throw new PersonalBookExportError("publication_too_large");
    }

    let contents = await this.readMatchingLocal(bookId, manifest);
    if (!contents) {
      const remoteContents = await this.readPass(
        bookId,
        true,
        manifest.snapshotHash,
      );
      if (!sameManifest(remoteContents.manifest, manifest.manifest)) {
        throw new PersonalBookExportError("remote_snapshot_changed");
      }
      contents = remoteContents.contents;
    }
    if (!contents || contents.length !== manifest.manifest.length) {
      throw new PersonalBookExportError("remote_snapshot_invalid");
    }

    const finalManifest = await this.readPass(
      bookId,
      false,
      manifest.snapshotHash,
    );
    if (
      finalManifest.sourceRef !== manifest.sourceRef ||
      !sameBook(finalManifest.book, manifest.book) ||
      !sameManifest(finalManifest.manifest, manifest.manifest)
    ) {
      throw new PersonalBookExportError("remote_snapshot_changed");
    }

    const parsed = VerifiedPersonalPublicationSnapshotSchema.parse({
      schemaVersion: 1,
      snapshotHash: manifest.snapshotHash,
      sourceRef: manifest.sourceRef,
      book: manifest.book,
      chapters: manifest.manifest.map((chapter, index) => ({
        ...chapter,
        content: contents[index],
      })),
    });
    Object.freeze(parsed.book);
    parsed.chapters.forEach(Object.freeze);
    Object.freeze(parsed.chapters);
    return Object.freeze(parsed);
  }
}
