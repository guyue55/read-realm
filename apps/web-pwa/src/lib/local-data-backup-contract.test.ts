import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("browser local data snapshot", () => {
  const source = readFileSync(new URL("./local-data-backup.ts", import.meta.url), "utf8");

  it("reads all backup tables inside one Dexie read transaction", () => {
    expect(source).toMatch(/db\.transaction\(\s*"r"/);
    expect(source).toContain("[db.books, db.chapters, db.progress, db.bookmarks]");
  });
});
