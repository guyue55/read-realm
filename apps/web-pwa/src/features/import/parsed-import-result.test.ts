import { describe, expect, it } from "vitest";
import { createImportTaskDraft } from "@reader/storage-core";

import { buildParsedImportResult } from "./parsed-import-result";

describe("parsed import result", () => {
  it("preserves a URL draft identity and source boundary", () => {
    const draft = createImportTaskDraft({
      id: "url-task",
      filename: "example.com",
      format: "html",
      sourceKind: "url",
      url: "https://example.com/novel",
      now: "2026-08-13T12:25:00+08:00",
    });
    const result = buildParsedImportResult({
      draft,
      parsedBook: {
        title: "合法来源小说",
        chapters: [{ index: 0, title: "第一章", content: "正文。" }],
      },
      createId: () => "chapter-1",
      now: () => "2026-08-13T12:26:00+08:00",
    });

    expect(result.bookMetadata).toMatchObject({
      id: "url-task:book",
      sourceType: "url",
      sourceUrl: "https://example.com/novel",
      format: "html",
      chapterCount: 1,
    });
    expect(result.chapters[0]).toMatchObject({
      id: "chapter-1",
      bookId: "url-task:book",
      index: 0,
    });
  });

  it("rejects an empty parse result", () => {
    const draft = createImportTaskDraft({
      id: "task",
      filename: "empty.txt",
      format: "txt",
      sourceKind: "file",
      now: "2026-08-13T12:25:00+08:00",
    });
    expect(() => buildParsedImportResult({
      draft,
      parsedBook: { title: "empty", chapters: [] },
      createId: () => "unused",
    })).toThrow("PARSED_IMPORT_EMPTY_BOOK");
  });
});
