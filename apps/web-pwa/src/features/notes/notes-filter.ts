import type { Bookmark } from "@reader/shared-types";

export type NoteWithBook = Bookmark & { bookTitle?: string };

export function filterNotes(
  notes: readonly NoteWithBook[],
  filters: { bookId?: string; query?: string },
): NoteWithBook[] {
  const query = filters.query?.trim().toLocaleLowerCase("zh-CN") ?? "";
  return notes.filter((note) => {
    if (filters.bookId && note.bookId !== filters.bookId) return false;
    if (!query) return true;
    return [note.bookTitle, note.contentPreview, note.note].some((value) =>
      value?.toLocaleLowerCase("zh-CN").includes(query),
    );
  });
}
