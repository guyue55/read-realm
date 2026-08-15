import { parseTxtBook } from '@reader/parser-core/txt-parser';
import {
  normalizePublicLibraryDirectFilename,
  normalizePublicLibraryRelativePath,
  PUBLIC_LIBRARY_FILE_MAX_BYTES,
  publicLibraryCollectionPath,
  type PublicLibraryBookDto,
} from './public-library.contract';
import type {
  CanonicalPublicBookCandidate,
  PublicLibrarySourceKind,
} from './public-library.repository';

export class PublicLibraryFileCandidateError extends Error {
  constructor(readonly code: string) {
    super(code);
    this.name = 'PublicLibraryFileCandidateError';
  }
}

export function buildPublicLibraryFileCandidate(input: {
  kind: PublicLibrarySourceKind;
  scope: string;
  relativePath: string;
  bytes: Buffer;
  category: PublicLibraryBookDto['category'];
  title?: string;
  author?: string;
  description?: string;
  publicationFence?: { scanId: string; leaseOwner: string };
}): CanonicalPublicBookCandidate {
  const relativePath = normalizePublicLibraryRelativePath(
    input.relativePath,
    input.kind === 'maintenance_scan' ? 32 : 12,
  );
  const filename = relativePath?.split('/').at(-1);
  if (
    !relativePath ||
    !filename ||
    normalizePublicLibraryDirectFilename(filename) !== filename ||
    !input.scope ||
    !Buffer.isBuffer(input.bytes) ||
    input.bytes.length === 0 ||
    input.bytes.length > PUBLIC_LIBRARY_FILE_MAX_BYTES
  ) {
    throw new PublicLibraryFileCandidateError('PUBLIC_LIBRARY_FILE_INVALID');
  }
  let parsed: ReturnType<typeof parseTxtBook>;
  try {
    parsed = parseTxtBook(filename, Uint8Array.from(input.bytes).buffer);
  } catch {
    throw new PublicLibraryFileCandidateError('PUBLIC_LIBRARY_FILE_UNREADABLE');
  }
  if (
    parsed.chapters.length === 0 ||
    parsed.chapters.some((chapter) => !chapter.content)
  ) {
    throw new PublicLibraryFileCandidateError(
      'PUBLIC_LIBRARY_FILE_EMPTY_CHAPTER',
    );
  }
  const title = input.title ?? parsed.title.trim();
  if (!title) {
    throw new PublicLibraryFileCandidateError('PUBLIC_LIBRARY_TITLE_EMPTY');
  }
  return {
    title,
    author: input.author,
    description: input.description,
    category: input.category,
    collectionPath: publicLibraryCollectionPath(relativePath),
    source: {
      kind: input.kind,
      scope: input.scope,
      relativePath,
      bytes: Buffer.from(input.bytes),
    },
    chapters: parsed.chapters,
    publicationFence: input.publicationFence,
    wordCount: parsed.chapters.reduce(
      (total, chapter) => total + [...chapter.content].length,
      0,
    ),
  };
}
