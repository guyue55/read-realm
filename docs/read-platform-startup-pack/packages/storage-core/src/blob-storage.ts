import { writeFile, readFile, mkdir } from 'fs/promises';
import { join, dirname } from 'path';

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
}
