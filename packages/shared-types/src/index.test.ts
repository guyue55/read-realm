import { afterEach, describe, it, expect, vi } from "vitest";
import {
  AppErrorCodeSchema,
  BookSchema,
  PersonalPublicationSnapshotDescriptorSchema,
  PUBLIC_LIBRARY_CATEGORIES,
  PUBLIC_LIBRARY_TAGS,
  PUBLIC_LIBRARY_TAXONOMY_VERSION,
  PublicLibraryTagIdsSchema,
  ReadingProgressSchema,
  ReaderSettingsSchema,
  BookmarkSchema,
  createId,
  generateAiSigKeyAsync,
  parseAIReadingIntent,
  serializePersonalPublicationSnapshotDescriptor,
} from "./index";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("Shared Types", () => {
  it("freezes the public-library taxonomy IDs and rejects duplicate or excess tags", () => {
    expect(PUBLIC_LIBRARY_TAXONOMY_VERSION).toBe("public-library-taxonomy-v1");
    expect(PUBLIC_LIBRARY_CATEGORIES.map((item) => item.id)).toEqual([
      "literature",
      "classics",
      "thought",
      "technology",
      "other",
    ]);
    expect(PUBLIC_LIBRARY_TAGS).toHaveLength(12);
    expect(PublicLibraryTagIdsSchema.safeParse(["jing", "jing"]).success).toBe(
      false,
    );
    expect(
      PublicLibraryTagIdsSchema.safeParse([
        "jing",
        "history",
        "masters",
        "collections",
        "poetry",
        "fiction",
      ]).success,
    ).toBe(false);
  });

  it("serializes a personal publication descriptor without private identity", () => {
    const descriptor = PersonalPublicationSnapshotDescriptorSchema.parse({
      schemaVersion: 1,
      sourceRef: "b".repeat(64),
      book: {
        title: " 云上书 ",
        author: "作者",
        format: "txt",
        chapterCount: 1,
      },
      chapters: [{ index: 0, title: " 第一章 ", contentHash: "a".repeat(64) }],
    });

    const serialized =
      serializePersonalPublicationSnapshotDescriptor(descriptor);
    expect(serialized).toBe(
      JSON.stringify({
        schemaVersion: 1,
        sourceRef: "b".repeat(64),
        book: {
          title: "云上书",
          author: "作者",
          description: null,
          format: "txt",
          chapterCount: 1,
        },
        chapters: [{ index: 0, title: "第一章", contentHash: "a".repeat(64) }],
      }),
    );
    expect(serialized).not.toContain("share-token");
    expect(serialized).not.toContain("book-id");
  });

  it("should validate AppErrorCode", () => {
    expect(AppErrorCodeSchema.parse("FILE_TOO_LARGE")).toBe("FILE_TOO_LARGE");
    expect(() => AppErrorCodeSchema.parse("INVALID_ERROR")).toThrow();
  });

  it("should validate a valid Book", () => {
    const book = {
      id: "book-1",
      title: "Test Book",
      sourceType: "upload",
      format: "txt",
      status: "reading",
      tags: [],
      chapterCount: 10,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    expect(BookSchema.parse(book).id).toBe("book-1");
  });
});

describe("createId", () => {
  it("does not rely on crypto.randomUUID when generating ids", () => {
    let counter = 0;
    vi.stubGlobal("crypto", {
      randomUUID: () => {
        throw new TypeError("crypto.randomUUID is not a function");
      },
      getRandomValues: (bytes: Uint8Array) => {
        for (let index = 0; index < bytes.length; index += 1) {
          bytes[index] = counter;
          counter = (counter + 1) % 256;
        }
        return bytes;
      },
    });

    expect(createId()).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    );
  });

  it("generates a uuid when crypto.randomUUID is unavailable", () => {
    let counter = 0;
    vi.stubGlobal("crypto", {
      getRandomValues: (bytes: Uint8Array) => {
        for (let index = 0; index < bytes.length; index += 1) {
          bytes[index] = counter;
          counter = (counter + 1) % 256;
        }
        return bytes;
      },
    });

    expect(createId()).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    );
  });
});

describe("generateAiSigKeyAsync", () => {
  it("isolates identical chapter content by scope", async () => {
    const firstBookKey = await generateAiSigKeyAsync(
      "hash-1",
      "gpt-3.5-turbo",
      "2.0",
      "book-1",
    );
    const secondBookKey = await generateAiSigKeyAsync(
      "hash-1",
      "gpt-3.5-turbo",
      "2.0",
      "book-2",
    );

    expect(firstBookKey).not.toBe(secondBookKey);
  });

  it("isolates different reading intents", async () => {
    const summary = await generateAiSigKeyAsync(
      "hash",
      "model",
      "reader-ai-v3:summary",
      "book",
    );
    const terms = await generateAiSigKeyAsync(
      "hash",
      "model",
      "reader-ai-v3:terms",
      "book",
    );
    expect(summary).not.toBe(terms);
  });
});

describe("parseAIReadingIntent", () => {
  it("rejects unknown intents", () => {
    expect(() => parseAIReadingIntent("rewrite")).toThrow("AI 阅读意图不支持");
  });
});

describe("Shared Types Extensions", () => {
  it("should validate ReadingProgress", () => {
    const progress = {
      bookId: "book-1",
      chapterId: "chap-1",
      chapterIndex: 0,
      offset: 150,
      percentage: 0.25,
      updatedAt: new Date().toISOString(),
    };
    expect(ReadingProgressSchema.parse(progress).chapterIndex).toBe(0);
  });

  it("should validate ReaderSettings", () => {
    const settings = {
      fontFamily: "sans-serif",
      fontSize: 18,
      lineHeight: 1.6,
      theme: "paper",
      pageMode: "pagination",
    };
    expect(ReaderSettingsSchema.parse(settings).theme).toBe("paper");
    expect(ReaderSettingsSchema.parse(settings).pageMode).toBe("pagination");
  });

  it("should validate Bookmark", () => {
    const bookmark = {
      id: "bookmark-1",
      bookId: "book-1",
      chapterIndex: 1,
      offset: 100,
      contentPreview: "Some content...",
      createdAt: new Date().toISOString(),
    };
    expect(BookmarkSchema.parse(bookmark).id).toBe("bookmark-1");
  });
});
