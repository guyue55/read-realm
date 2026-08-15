import {
  index,
  integer,
  sqliteTable,
  text,
  uniqueIndex,
} from 'drizzle-orm/sqlite-core';
import type { Book } from '@reader/shared-types';

export const books = sqliteTable('books', {
  id: text('id').primaryKey(),
  title: text('title').notNull(),
  author: text('author'),
  cover: text('cover'),
  description: text('description'),
  sourceType: text('source_type').$type<Book['sourceType']>().notNull(),
  sourceUrl: text('source_url'),
  format: text('format').$type<Book['format']>().notNull(),
  status: text('status').$type<Book['status']>().notNull(),
  chapterCount: integer('chapter_count').notNull(),
  wordCount: integer('word_count'),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
  lastReadAt: text('last_read_at'),
  lastReadProgress: text('last_read_progress'),
  sourceFolderId: text('source_folder_id'), // 🏮 存放所属书箧分类文件夹 ID
});

export const libraryFolders = sqliteTable('library_folders', {
  id: text('id').primaryKey(), // 格式为 {folderId}#{shareToken}，与藏书多端隔离一致
  name: text('name').notNull(),
  parentId: text('parent_id'),
  sourceId: text('source_id'),
  sourceType: text('source_type').notNull(),
  relativePath: text('relative_path'),
  depth: integer('depth').notNull().default(0),
  sortOrder: integer('sort_order').notNull().default(0),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
});

export const chapters = sqliteTable(
  'chapters',
  {
    id: text('id').primaryKey(),
    bookId: text('book_id')
      .notNull()
      .references(() => books.id),
    index: integer('index').notNull(),
    title: text('title').notNull(),
    contentHash: text('content_hash').notNull(), // Pointer to BlobStorage key
    createdAt: text('created_at').notNull(),
  },
  (table) => ({
    bookIndexUnique: uniqueIndex('chapters_book_id_index_uq').on(
      table.bookId,
      table.index,
    ),
    contentHashIndex: index('chapters_content_hash_idx').on(table.contentHash),
  }),
);

export const storageObjects = sqliteTable('storage_objects', {
  hash: text('hash').primaryKey(),
  path: text('path').notNull(),
  size: integer('size').notNull(),
  mimeType: text('mime_type').notNull(),
});

export const personalExportState = sqliteTable('personal_export_state', {
  id: integer('id').primaryKey(),
  scopeSalt: text('scope_salt').notNull(),
});

export const aiViews = sqliteTable(
  'ai_views',
  {
    id: text('id').primaryKey(),
    bookId: text('book_id')
      .notNull()
      .references(() => books.id),
    chapterIndex: integer('chapter_index').notNull(),
    sourceHash: text('source_hash').notNull(),
    summary: text('summary').notNull(),
    model: text('model').notNull(),
    promptVersion: text('prompt_version').notNull(),
    createdAt: text('created_at').notNull(),
  },
  (table) => ({
    bookChapterIndex: index('ai_views_book_chapter_idx').on(
      table.bookId,
      table.chapterIndex,
    ),
  }),
);
