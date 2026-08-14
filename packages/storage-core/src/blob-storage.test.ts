import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { LocalFileBlobStorage } from "./blob-storage";
import { readdir, rm, mkdtemp } from "fs/promises";
import { join } from "path";
import { existsSync } from "fs";
import { tmpdir } from "os";

describe("LocalFileBlobStorage", () => {
  let testDir: string;

  beforeEach(async () => {
    testDir = await mkdtemp(join(tmpdir(), "blob-storage-test-"));
  });

  afterEach(async () => {
    if (testDir && existsSync(testDir)) {
      await rm(testDir, { recursive: true, force: true });
    }
  });

  it("should store and retrieve data", async () => {
    const storage = new LocalFileBlobStorage(testDir);
    const key = "a".repeat(64);
    const data = "hello world";

    await storage.putObject(key, data);
    const retrieved = await storage.getObject(key);

    expect(retrieved.toString()).toBe(data);
  });

  it("should handle Buffer data", async () => {
    const storage = new LocalFileBlobStorage(testDir);
    const key = "b".repeat(64);
    const data = Buffer.from([1, 2, 3]);

    await storage.putObject(key, data);
    const retrieved = await storage.getObject(key);

    expect(retrieved).toEqual(data);
  });

  it("should reject path traversal keys", async () => {
    const storage = new LocalFileBlobStorage(testDir);

    await expect(storage.putObject("../outside", "bad")).rejects.toThrow(
      "INVALID_BLOB_KEY",
    );
    await expect(storage.getObject("test/file.txt")).rejects.toThrow(
      "INVALID_BLOB_KEY",
    );
  });

  it("publishes one complete object under concurrent put-if-absent writes", async () => {
    const storage = new LocalFileBlobStorage(testDir);
    const key = "c".repeat(64);
    const candidates = [Buffer.alloc(1024 * 64, 7), Buffer.alloc(1024 * 64, 9)];

    await Promise.all(
      Array.from({ length: 8 }, (_, index) =>
        storage.putObject(key, candidates[index % candidates.length]!),
      ),
    );

    const stored = await storage.getObject(key);
    expect(candidates.some((candidate) => candidate.equals(stored))).toBe(true);
    expect(await readdir(testDir)).toEqual([key]);
  });
});
