import { Injectable, Inject, Optional } from '@nestjs/common';
import { DRIZZLE } from '../database/database.module';
import { LibSQLDatabase } from 'drizzle-orm/libsql';
import * as schema from '../database/schema';
import { Book, createId } from '@reader/shared-types';
import { eq, like, or, not } from 'drizzle-orm';
import { LocalFileBlobStorage } from '@reader/storage-core/node';
import * as crypto from 'crypto';

@Injectable()
export class BookRepository {
  constructor(
    @Inject(DRIZZLE) private db: LibSQLDatabase<typeof schema>,
    @Optional() private blobStorage?: LocalFileBlobStorage,
  ) {}

  async importBook(
    book: Book,
    chapters: (typeof schema.chapters.$inferInsert & { content?: string })[],
    shareToken: string = 'default',
  ) {
    const isDefault = shareToken === 'default';
    const dbBookId = isDefault ? book.id : `${book.id}#${shareToken}`;

    await this.db.transaction(async (tx) => {
      // Omit tags and toc if they are not in the database schema
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { tags, toc, ...bookData } = book;

      const finalBookData = {
        ...bookData,
        id: dbBookId,
      };

      // 1. Clean delete existing chapters & book under same ID to guarantee idempotency and support overwrite update
      if (isDefault) {
        await tx.delete(schema.chapters).where(
          or(
            eq(schema.chapters.bookId, dbBookId),
            eq(schema.chapters.bookId, `${book.id}#default`),
          ),
        );
        await tx.delete(schema.books).where(
          or(
            eq(schema.books.id, dbBookId),
            eq(schema.books.id, `${book.id}#default`),
          ),
        );
      } else {
        await tx.delete(schema.chapters).where(eq(schema.chapters.bookId, dbBookId));
        await tx.delete(schema.books).where(eq(schema.books.id, dbBookId));
      }

      // 2. Perform insert of clean new books and chapter collection
      await tx.insert(schema.books).values(finalBookData);

      if (chapters.length > 0) {
        const chaptersToInsert = [];
        for (const chapter of chapters) {
          const rawId = chapter.id || createId();
          const cleanId = rawId.split('#')[0];

          let contentHash = chapter.contentHash;
          const content = chapter.content;

          if (!contentHash && content !== undefined) {
            contentHash = crypto.createHash('sha256').update(content).digest('hex');
          } else if (!contentHash) {
            contentHash = createId();
          }

          if (this.blobStorage && content !== undefined) {
            await this.blobStorage.putObject(contentHash, content);
          }

          // eslint-disable-next-line @typescript-eslint/no-unused-vars
          const { content: _, ...chapterDbData } = chapter;

          chaptersToInsert.push({
            ...chapterDbData,
            contentHash,
            bookId: dbBookId,
            id: isDefault ? cleanId : `${cleanId}#${shareToken}`,
            createdAt: chapter.createdAt || new Date().toISOString(),
          });
        }
        await tx.insert(schema.chapters).values(chaptersToInsert);
      }
    });
  }

  async deleteBook(bookId: string, shareToken: string = 'default') {
    const dbBookId = `${bookId}#${shareToken}`;
    const isDefault = shareToken === 'default';

    // 1. Get all chapters to find contentHashes
    let chapters;
    if (isDefault) {
      chapters = await this.db
        .select({ contentHash: schema.chapters.contentHash })
        .from(schema.chapters)
        .where(
          or(
            eq(schema.chapters.bookId, dbBookId),
            eq(schema.chapters.bookId, bookId),
          ),
        );
    } else {
      chapters = await this.db
        .select({ contentHash: schema.chapters.contentHash })
        .from(schema.chapters)
        .where(eq(schema.chapters.bookId, dbBookId));
    }

    const hashes = chapters.map((c) => c.contentHash);

    // 2. Delete from DB in transaction
    await this.db.transaction(async (tx) => {
      if (isDefault) {
        await tx
          .delete(schema.chapters)
          .where(
            or(
              eq(schema.chapters.bookId, dbBookId),
              eq(schema.chapters.bookId, bookId),
            ),
          );
        await tx
          .delete(schema.aiViews)
          .where(
            or(
              eq(schema.aiViews.bookId, dbBookId),
              eq(schema.aiViews.bookId, bookId),
            ),
          );
        await tx
          .delete(schema.books)
          .where(
            or(eq(schema.books.id, dbBookId), eq(schema.books.id, bookId)),
          );
      } else {
        await tx
          .delete(schema.chapters)
          .where(eq(schema.chapters.bookId, dbBookId));
        await tx
          .delete(schema.aiViews)
          .where(eq(schema.aiViews.bookId, dbBookId));
        await tx.delete(schema.books).where(eq(schema.books.id, dbBookId));
      }
    });

    // 3. Cleanup files from disk
    if (this.blobStorage && hashes.length > 0) {
      for (const hash of hashes) {
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

  async getAllBooks(shareToken: string = 'default') {
    const isDefault = shareToken === 'default';

    let dbBooks;
    if (isDefault) {
      dbBooks = await this.db
        .select()
        .from(schema.books)
        .where(
          or(
            like(schema.books.id, '%#default'),
            not(like(schema.books.id, '%#%')),
          ),
        );
    } else {
      dbBooks = await this.db
        .select()
        .from(schema.books)
        .where(like(schema.books.id, `%#${shareToken}`));
    }

    // 剥离后缀
    return dbBooks.map((book) => ({
      ...book,
      id: book.id.split('#')[0],
    }));
  }

  async updateProgress(
    bookId: string,
    lastReadProgress: string,
    lastReadAt: string = new Date().toISOString(),
    shareToken: string = 'default',
  ) {
    const dbBookId = shareToken === 'default' ? bookId : `${bookId}#${shareToken}`;
    await this.db
      .update(schema.books)
      .set({
        lastReadProgress,
        lastReadAt,
        updatedAt: new Date().toISOString(),
      })
      .where(eq(schema.books.id, dbBookId));
  }

  async clearAllBooks(shareToken: string) {
    if (shareToken === 'default' || !shareToken) {
      // 绝对不清理 default 或空 token
      return;
    }
    const dbBooks = await this.db
      .select({ id: schema.books.id })
      .from(schema.books)
      .where(like(schema.books.id, `%#${shareToken}`));

    for (const book of dbBooks) {
      const cleanBookId = book.id.split('#')[0];
      await this.deleteBook(cleanBookId, shareToken);
    }
  }
}

