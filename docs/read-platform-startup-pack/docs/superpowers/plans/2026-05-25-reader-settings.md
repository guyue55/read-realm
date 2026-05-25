# Reader Settings Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add reader settings (font family, font size, line height, theme) to the `ReaderEngine` and provide methods to manage them.

**Architecture:** Update `ReaderEngine` to hold a `settings` property with default values. Add `getSettings` and `updateSettings` methods.

**Tech Stack:** TypeScript, Vitest

---

### Task 1: Add Reader Settings to ReaderEngine

**Files:**
- Create: `packages/reader-core/src/engine.test.ts`
- Modify: `packages/reader-core/src/engine.ts`

- [ ] **Step 1: Write the failing test**

```typescript
import { describe, it, expect, vi } from 'vitest';
import { ReaderEngine, type ChapterRepository, type ProgressRepository } from './engine';

describe('ReaderEngine Settings', () => {
  const mockChapterRepo: ChapterRepository = {
    getChapter: vi.fn(),
    getChapterCount: vi.fn(),
  };
  const mockProgressRepo: ProgressRepository = {
    getProgress: vi.fn(),
    saveProgress: vi.fn(),
  };

  it('should have default settings', () => {
    const engine = new ReaderEngine('book-1', mockChapterRepo, mockProgressRepo);
    const settings = engine.getSettings();
    expect(settings).toEqual({
      fontFamily: 'sans-serif',
      fontSize: 18,
      lineHeight: 1.7,
      theme: 'paper'
    });
  });

  it('should update settings', () => {
    const engine = new ReaderEngine('book-1', mockChapterRepo, mockProgressRepo);
    engine.updateSettings({ fontSize: 20, theme: 'dark' });
    const settings = engine.getSettings();
    expect(settings.fontSize).toBe(20);
    expect(settings.theme).toBe('dark');
    expect(settings.fontFamily).toBe('sans-serif'); // unchanged
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test packages/reader-core/src/engine.test.ts` (or `npx vitest packages/reader-core/src/engine.test.ts`)
Expected: FAIL (getSettings and updateSettings are not defined)

- [ ] **Step 3: Update ReaderEngine implementation**

```typescript
import type { ReadingProgress, ReaderSettings } from '@reader/shared-types';

// ... (existing interfaces) ...

export class ReaderEngine {
  // ... (existing properties) ...
  private settings: ReaderSettings = {
    fontFamily: 'sans-serif',
    fontSize: 18,
    lineHeight: 1.7,
    theme: 'paper'
  };

  constructor(
    bookId: string,
    private chapterRepo: ChapterRepository,
    private progressRepo: ProgressRepository
  ) {
    this.bookId = bookId;
  }

  getSettings(): ReaderSettings {
    return this.settings;
  }

  updateSettings(newSettings: Partial<ReaderSettings>): void {
    this.settings = { ...this.settings, ...newSettings };
  }

  // ... (existing methods) ...
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test packages/reader-core/src/engine.test.ts`
Expected: PASS

- [ ] **Step 5: Build reader core**

Run: `cd packages/reader-core && pnpm build`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add packages/reader-core/src/engine.ts packages/reader-core/src/engine.test.ts
git commit -m "feat: add settings support to reader-core engine"
```
