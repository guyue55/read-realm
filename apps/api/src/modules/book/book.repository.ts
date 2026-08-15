import { Injectable, Inject } from '@nestjs/common';
import { DRIZZLE } from '../database/database.module';
import { LibSQLDatabase } from 'drizzle-orm/libsql';
import * as schema from '../database/schema';
import { Book, createId } from '@reader/shared-types';
import { and, eq, inArray, like, not, or } from 'drizzle-orm';
import { LocalFileBlobStorage } from '@reader/storage-core/node';
import * as crypto from 'crypto';
import {
  DEFAULT_SHARE_TOKEN,
  isScopedToShare,
  stripScopedId,
  toScopedId,
} from '../../common/request-boundary';

@Injectable()
export class BookRepository {
  constructor(
    @Inject(DRIZZLE) private db: LibSQLDatabase<typeof schema>,
    @Inject(LocalFileBlobStorage)
    private blobStorage: LocalFileBlobStorage,
  ) {}

  async importBook(
    book: Book,
    chapters: Array<{
      id?: string;
      index: number;
      title: string;
      content: string;
      createdAt?: string;
    }>,
    shareToken: string = DEFAULT_SHARE_TOKEN,
    options: { replaceExisting?: boolean } = {},
  ) {
    const isDefault = shareToken === DEFAULT_SHARE_TOKEN;
    const dbBookId = toScopedId(book.id, shareToken);
    const replaceExisting = options.replaceExisting ?? true;

    await this.db.transaction(async (tx) => {
      // Omit tags and toc if they are not in the database schema
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { tags, toc, ...bookData } = book;

      const finalBookData = {
        ...bookData,
        id: dbBookId,
      };

      if (replaceExisting) {
        // 1. Clean delete existing chapters & book under same ID to guarantee idempotency and support overwrite update
        if (isDefault) {
          await tx
            .delete(schema.chapters)
            .where(
              or(
                eq(schema.chapters.bookId, dbBookId),
                eq(schema.chapters.bookId, `${book.id}#default`),
              ),
            );
          await tx
            .delete(schema.books)
            .where(
              or(
                eq(schema.books.id, dbBookId),
                eq(schema.books.id, `${book.id}#default`),
              ),
            );
        } else {
          await tx
            .delete(schema.chapters)
            .where(eq(schema.chapters.bookId, dbBookId));
          await tx.delete(schema.books).where(eq(schema.books.id, dbBookId));
        }

        await tx.insert(schema.books).values(finalBookData);
      } else {
        await tx.insert(schema.books).values(finalBookData).onConflictDoUpdate({
          target: schema.books.id,
          set: finalBookData,
        });
      }

      if (chapters.length > 0) {
        const chaptersToInsert = [];
        const indexes = chapters.map((chapter) => chapter.index);
        await tx
          .delete(schema.chapters)
          .where(
            and(
              eq(schema.chapters.bookId, dbBookId),
              inArray(schema.chapters.index, indexes),
            ),
          );
        for (const chapter of chapters) {
          const rawId = chapter.id || createId();
          const cleanId = rawId.split('#')[0];

          const contentHash = crypto
            .createHash('sha256')
            .update(chapter.content)
            .digest('hex');

          await this.blobStorage.putObject(contentHash, chapter.content);

          chaptersToInsert.push({
            index: chapter.index,
            title: chapter.title,
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
    const dbBookId = toScopedId(bookId, shareToken);
    const isDefault = shareToken === DEFAULT_SHARE_TOKEN;

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
    if (hashes.length > 0) {
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
    const isDefault = shareToken === DEFAULT_SHARE_TOKEN;

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
      const allBooks = await this.db.select().from(schema.books);
      dbBooks = allBooks.filter((book) => isScopedToShare(book.id, shareToken));
    }

    return dbBooks.map((book) => ({
      ...book,
      id: stripScopedId(book.id),
    }));
  }

  async updateProgress(
    bookId: string,
    lastReadProgress: string,
    lastReadAt: string = new Date().toISOString(),
    shareToken: string = DEFAULT_SHARE_TOKEN,
    sourceFolderId?: string | null,
  ) {
    const isDefault = shareToken === DEFAULT_SHARE_TOKEN;
    const dbBookId = toScopedId(bookId, shareToken);
    const patch = {
      lastReadProgress,
      lastReadAt,
      updatedAt: new Date().toISOString(),
      ...(sourceFolderId !== undefined ? { sourceFolderId } : {}),
    };
    // 🏮 默认书架同时兼容历史 `${bookId}#default` 写入，避免老数据丢失进度。
    if (isDefault) {
      await this.db
        .update(schema.books)
        .set(patch)
        .where(
          or(
            eq(schema.books.id, bookId),
            eq(schema.books.id, `${bookId}#default`),
          ),
        );
    } else {
      await this.db
        .update(schema.books)
        .set(patch)
        .where(eq(schema.books.id, dbBookId));
    }
  }

  async clearAllBooks(shareToken: string) {
    if (shareToken === DEFAULT_SHARE_TOKEN || !shareToken) {
      // 绝对不清理 default 或空 token
      return;
    }
    const dbBooks = (
      await this.db.select({ id: schema.books.id }).from(schema.books)
    ).filter((book) => isScopedToShare(book.id, shareToken));

    for (const book of dbBooks) {
      const cleanBookId = stripScopedId(book.id);
      await this.deleteBook(cleanBookId, shareToken);
    }
  }
}
