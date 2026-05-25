import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core';
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
});

export const chapters = sqliteTable('chapters', {
  id: text('id').primaryKey(),
  bookId: text('book_id')
    .notNull()
    .references(() => books.id),
  index: integer('index').notNull(),
  title: text('title').notNull(),
  contentHash: text('content_hash').notNull(), // Pointer to BlobStorage key
  createdAt: text('created_at').notNull(),
});

export const storageObjects = sqliteTable('storage_objects', {
  hash: text('hash').primaryKey(),
  path: text('path').notNull(),
  size: integer('size').notNull(),
  mimeType: text('mime_type').notNull(),
});

export const aiViews = sqliteTable('ai_views', {
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
});
