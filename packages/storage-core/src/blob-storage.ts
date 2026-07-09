import { writeFile, readFile, mkdir, unlink } from "fs/promises";
import { dirname, resolve } from "path";

const SAFE_BLOB_KEY_PATTERN = /^[a-f0-9]{64}$/i;

export class LocalFileBlobStorage {
  private readonly rootDir: string;

  constructor(baseDir: string) {
    this.rootDir = resolve(baseDir);
  }

  private getSafePath(key: string): string {
    if (!SAFE_BLOB_KEY_PATTERN.test(key)) {
      throw new Error("INVALID_BLOB_KEY");
    }
    const fullPath = resolve(this.rootDir, key.toLowerCase());
    if (fullPath !== this.rootDir && !fullPath.startsWith(`${this.rootDir}/`)) {
      throw new Error("INVALID_BLOB_PATH");
    }
    return fullPath;
  }

  async putObject(key: string, data: string | Buffer): Promise<void> {
    const fullPath = this.getSafePath(key);
    await mkdir(dirname(fullPath), { recursive: true });
    await writeFile(fullPath, data);
  }

  async getObject(key: string): Promise<Buffer> {
    const fullPath = this.getSafePath(key);
    return await readFile(fullPath);
  }

  async deleteObject(key: string): Promise<void> {
    const fullPath = this.getSafePath(key);
    try {
      await unlink(fullPath);
    } catch (error) {
      // Ignore if file doesn't exist
      if ((error as any).code !== "ENOENT") {
        throw error;
      }
    }
  }
}
