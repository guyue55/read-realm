# Task 3: Library Polish and Deletion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Enhance the local library view with book listing, sorting, and deletion functionality.

**Architecture:** Use `dexie-react-hooks` for reactive local data fetching and standard React state for sorting options. Deletion will be a two-step process: local Dexie cleanup and backend API call.

**Tech Stack:** React, Dexie, dexie-react-hooks, Next.js.

---

### Task 1: Add Dependencies

**Files:**
- Modify: `apps/web-pwa/package.json`

- [ ] **Step 1: Add `dexie-react-hooks` to dependencies**
- [ ] **Step 2: Run `pnpm install`**

### Task 2: Implement Book List and Sorting in Page

**Files:**
- Modify: `apps/web-pwa/src/app/page.tsx`

- [ ] **Step 1: Add imports for `useLiveQuery` and `useState`**
- [ ] **Step 2: Define sorting state and logic**
- [ ] **Step 3: Fetch books using `useLiveQuery`**
- [ ] **Step 4: Render the list of books with sorting controls**

### Task 3: Implement Book Deletion

**Files:**
- Modify: `apps/web-pwa/src/app/page.tsx`

- [ ] **Step 1: Add `handleDelete` function**
- [ ] **Step 2: Add "Delete" button to book items**
- [ ] **Step 3: Ensure local tables (books, chapters, progress, bookmarks) are cleaned up**
- [ ] **Step 4: Call backend DELETE API**

### Task 4: Verification and Commit

- [ ] **Step 1: Verify book listing works**
- [ ] **Step 2: Verify sorting works**
- [ ] **Step 3: Verify deletion works (local + backend)**
- [ ] **Step 4: Commit all changes**
