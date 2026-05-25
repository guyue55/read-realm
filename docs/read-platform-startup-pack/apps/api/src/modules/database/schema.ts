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
