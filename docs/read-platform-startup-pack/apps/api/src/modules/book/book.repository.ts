import { Injectable, Inject, Optional } from '@nestjs/common';
import * as crypto from 'crypto';
import { DRIZZLE } from '../database/database.module';
import { LibSQLDatabase } from 'drizzle-orm/libsql';
import * as schema from '../database/schema';
import { Book } from '@reader/shared-types';
import { eq } from 'drizzle-orm';
import { LocalFileBlobStorage } from '@reader/storage-core';

@Injectable()
export class BookRepository {
  constructor(
    @Inject(DRIZZLE) private db: LibSQLDatabase<typeof schema>,
    @Optional() private blobStorage?: LocalFileBlobStorage,
  ) {}

  async importBook(
    book: Book,
    chapters: (typeof schema.chapters.$inferInsert)[],
  ) {
    await this.db.transaction(async (tx) => {
      // Omit tags if it's not in the schema
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { tags, ...bookData } = book;

      await tx.insert(schema.books).values(bookData);

      if (chapters.length > 0) {
        const chaptersToInsert = chapters.map((chapter) => ({
          ...chapter,
          bookId: book.id,
          id: chapter.id || crypto.randomUUID(),
          createdAt: chapter.createdAt || new Date().toISOString(),
        }));
        await tx.insert(schema.chapters).values(chaptersToInsert);
      }
    });
  }

  async deleteBook(bookId: string) {
    // 1. Get all chapters to find contentHashes
    const chapters = await this.db
      .select({ contentHash: schema.chapters.contentHash })
      .from(schema.chapters)
      .where(eq(schema.chapters.bookId, bookId));

    const hashes = chapters.map((c) => c.contentHash);

    // 2. Delete from DB in transaction
    await this.db.transaction(async (tx) => {
      await tx
        .delete(schema.chapters)
        .where(eq(schema.chapters.bookId, bookId));
      await tx.delete(schema.books).where(eq(schema.books.id, bookId));
    });

    // 3. Cleanup files from disk
    if (this.blobStorage && hashes.length > 0) {
      for (const hash of hashes) {
        // In a real app with de-duplication, we would check if this hash is still used
        // by other chapters before deleting. For now, we assume simple 1-1 or just delete.
        // Actually, let's check if it's still used to be safe.
        const otherChapters = await this.db
          .select({ id: schema.chapters.id })
          .from(schema.chapters)
          .where(eq(schema.chapters.contentHash, hash))
          .limit(1);

        if (otherChapters.length === 0) {
          await this.blobStorage.deleteObject(hash);
        }
      }
    }
  }
}
