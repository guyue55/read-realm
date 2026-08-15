import { z } from 'zod';

export const PublicLibraryStartScanSchema = z.object({
  rootId: z.string().regex(/^[a-z0-9][a-z0-9_-]{0,63}$/u),
  rightsConfirmed: z.literal(true),
});

export const PublicLibraryScanIdSchema = z.string().uuid();

export const PublicLibraryScanItemsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(50).default(50),
});
