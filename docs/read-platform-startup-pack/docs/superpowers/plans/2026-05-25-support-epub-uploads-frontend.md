# Support EPUB Uploads in Frontend Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Enable EPUB file support on the local shelf page by integrating the `parseEpubBook` function.

**Architecture:** Update the existing file upload handler to detect file type by extension and use the appropriate parser (TXT or EPUB).

**Tech Stack:** React, TypeScript, `@reader/parser-core`, `@reader/storage-core`.

---

### Task 1: Update Imports and Handle File Upload

**Files:**
- Modify: `apps/web-pwa/src/app/page.tsx`

- [ ] **Step 1: Update imports to include `parseEpubBook`**

```typescript
import { parseTxtBook, parseEpubBook } from '@reader/parser-core';
```

- [ ] **Step 2: Update `handleFileUpload` logic**

```typescript
      setStatus('Parsing file...');
      let parsedBook;
      if (file.name.toLowerCase().endsWith('.epub')) {
        parsedBook = await parseEpubBook(file.name, buffer);
      } else {
        parsedBook = parseTxtBook(file.name, buffer);
      }
```

- [ ] **Step 3: Update `format` in book metadata**

```typescript
      // Save book metadata to Dexie
      const bookId = crypto.randomUUID();
      const format = file.name.toLowerCase().endsWith('.epub') ? 'epub' : 'txt';
      await db.books.add({
        id: bookId,
        title: parsedBook.title,
        sourceType: 'upload',
        format,
        status: 'to_read',
        tags: [],
        chapterCount: parsedBook.chapters.length,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
```

- [ ] **Step 4: Update input `accept` attribute**

```tsx
<input 
  type="file" 
  accept=".txt,.epub" 
  onChange={handleFileUpload}
  className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-[#E8E3DA] file:text-[#2D2A26] hover:file:bg-[#DDEBD6]"
/>
```

- [ ] **Step 5: Verify changes by building the project**

Run: `cd apps/web-pwa && pnpm build`
Expected: Build successful without type errors.

- [ ] **Step 6: Commit changes**

```bash
git add apps/web-pwa/src/app/page.tsx
git commit -m "feat: support epub uploads on local shelf"
```
