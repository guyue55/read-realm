import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("public library browser boundary", () => {
  const client = readFileSync(
    new URL("./public-library-client.ts", import.meta.url),
    "utf8",
  );
  const join = readFileSync(
    new URL("./public-library-join.ts", import.meta.url),
    "utf8",
  );
  const source = `${client}\n${join}`;

  it("does not reuse personal sync APIs, credentials, or task storage", () => {
    expect(source).not.toContain("LegacyPersonalSyncApiClient");
    expect(source).not.toContain("PersonalSyncService");
    expect(source).not.toContain("getShareHeaders");
    expect(source).not.toContain("x-share-token");
    expect(source).not.toContain("reader-active-sync-tasks");
    expect(source).not.toMatch(/apiUrl\([`'"]\/books/u);
  });
});
