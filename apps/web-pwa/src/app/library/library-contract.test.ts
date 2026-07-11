import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync(new URL("./LibraryDefault.tsx", import.meta.url), "utf8");

describe("library truth contract", () => {
  it("uses real progress and never silently seeds the library", () => {
    expect(source).toContain("selectContinueBook");
    expect(source).not.toContain('books?.[0]');
    expect(source).not.toContain("library-auto-initialized");
  });

  it("does not claim an unverified cloud difference", () => {
    expect(source).not.toContain("发现本地与云端存在数据微澜");
    expect(source).toContain("currentShareToken || isSyncing");
  });
});
