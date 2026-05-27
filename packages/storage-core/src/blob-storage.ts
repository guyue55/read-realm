import { writeFile, readFile, mkdir, unlink } from "fs/promises";
import { join, dirname } from "path";

export class LocalFileBlobStorage {
  constructor(private baseDir: string) {}

  async putObject(key: string, data: string | Buffer): Promise<void> {
    const fullPath = join(this.baseDir, key);
    await mkdir(dirname(fullPath), { recursive: true });
    await writeFile(fullPath, data);
  }

  async getObject(key: string): Promise<Buffer> {
    const fullPath = join(this.baseDir, key);
    return await readFile(fullPath);
  }

  async deleteObject(key: string): Promise<void> {
    const fullPath = join(this.baseDir, key);
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
