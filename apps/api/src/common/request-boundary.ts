import { BadRequestException } from '@nestjs/common';
import { z, type ZodSchema } from 'zod';
import {
  BookSchema,
  LibraryFolderSchema,
  ReadingProgressSchema,
} from '@reader/shared-types';

export const DEFAULT_SHARE_TOKEN = 'default';
const SHARE_TOKEN_PATTERN = /^[\p{L}\p{N}_-]{1,64}$/u;
const RAW_ID_PATTERN = /^[^#\s]{1,160}$/;
const CONTENT_HASH_PATTERN = /^[a-f0-9]{64}$/i;

export function normalizeShareToken(value: unknown): string {
  if (value === undefined || value === null) return DEFAULT_SHARE_TOKEN;
  if (typeof value !== 'string') {
    throw new BadRequestException('分享口令格式不正确');
  }

  const token = value.trim();
  if (!token || token === DEFAULT_SHARE_TOKEN) return DEFAULT_SHARE_TOKEN;
  if (!SHARE_TOKEN_PATTERN.test(token)) {
    throw new BadRequestException(
      '分享口令仅支持中文、英文、数字、下划线和短横线，最长 64 位',
    );
  }
  return token;
}

export function toScopedId(id: string, shareToken: string): string {
  return shareToken === DEFAULT_SHARE_TOKEN ? id : `${id}#${shareToken}`;
}

export function stripScopedId(id: string): string {
  return id.split('#')[0] ?? id;
}

export function isScopedToShare(id: string, shareToken: string): boolean {
  if (shareToken === DEFAULT_SHARE_TOKEN) {
    return id.endsWith(`#${DEFAULT_SHARE_TOKEN}`) || !id.includes('#');
  }
  return id.endsWith(`#${shareToken}`);
}

export function assertContentHash(hash: string): string {
  if (!CONTENT_HASH_PATTERN.test(hash)) {
    throw new BadRequestException('章节内容索引格式不正确');
  }
  return hash.toLowerCase();
}

export function parseBody<T>(schema: ZodSchema<T>, value: unknown): T {
  const parsed = schema.safeParse(value);
  if (parsed.success) return parsed.data;

  const message =
    parsed.error.issues[0]?.message || '请求参数不完整或格式不正确';
  throw new BadRequestException(message);
}

const RawIdSchema = z
  .string()
  .trim()
  .regex(RAW_ID_PATTERN, 'ID 不能为空，且不能包含空白或 #');

export const ApiBookSchema = BookSchema.extend({
  id: RawIdSchema,
  title: z.string().trim().min(1, '书名不能为空').max(240, '书名过长'),
  chapterCount: z.number().int().nonnegative(),
  wordCount: z.number().int().nonnegative().optional(),
});

export const ImportChapterSchema = z.object({
  id: RawIdSchema.optional(),
  index: z.number().int().nonnegative('章节序号必须为非负整数'),
  title: z.string().trim().min(1, '章节标题不能为空').max(300, '章节标题过长'),
  content: z.string(),
  createdAt: z.string().optional(),
});

export const ImportBookBodySchema = z.object({
  metadata: ApiBookSchema,
  chapters: z.array(ImportChapterSchema).max(20000, '章节数量过多'),
  replaceExisting: z.boolean().optional().default(true),
});

export const UpdateProgressBodySchema = z.object({
  lastReadProgress: z
    .string()
    .max(12000, '阅读进度数据过大')
    .refine((value) => {
      try {
        ReadingProgressSchema.parse(JSON.parse(value));
        return true;
      } catch {
        return false;
      }
    }, '阅读进度格式不正确'),
  lastReadAt: z.string().optional(),
  sourceFolderId: RawIdSchema.nullable().optional(),
});

export const SyncFoldersBodySchema = z.object({
  folders: z
    .array(
      LibraryFolderSchema.extend({
        id: RawIdSchema,
        parentId: RawIdSchema.optional(),
      }),
    )
    .max(5000, '文件夹数量过多'),
});

export type ImportBookBody = z.infer<typeof ImportBookBodySchema>;
