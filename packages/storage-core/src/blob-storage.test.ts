import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { LocalFileBlobStorage } from "./blob-storage";
import { rm, mkdtemp } from "fs/promises";
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
    const key = "test/file.txt";
    const data = "hello world";

    await storage.putObject(key, data);
    const retrieved = await storage.getObject(key);

    expect(retrieved.toString()).toBe(data);
  });

  it("should handle Buffer data", async () => {
    const storage = new LocalFileBlobStorage(testDir);
    const key = "test/binary.bin";
    const data = Buffer.from([1, 2, 3]);

    await storage.putObject(key, data);
    const retrieved = await storage.getObject(key);

    expect(retrieved).toEqual(data);
  });
});
