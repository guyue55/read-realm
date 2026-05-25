# PWA Foundation Setup Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Set up basic PWA manifest and service worker configuration for the `web-pwa` application.

**Architecture:** Use `next-pwa` to automatically generate service workers and handle PWA lifecycle. Add a web app manifest in the `public` directory.

**Tech Stack:** Next.js, next-pwa, Web App Manifest.

---

### Task 1: Initialize Public Directory and Icons

**Files:**
- Create: `apps/web-pwa/public/icons/.gitkeep`

- [ ] **Step 1: Create public and icons directories**
Run: `mkdir -p apps/web-pwa/public/icons`

- [ ] **Step 2: Create a .gitkeep in icons to ensure it exists**
Run: `touch apps/web-pwa/public/icons/.gitkeep`

- [ ] **Step 3: Commit**
Run: `git add apps/web-pwa/public/icons/.gitkeep && git commit -m "chore: create public/icons directory"`

### Task 2: Create Web App Manifest

**Files:**
- Create: `apps/web-pwa/public/manifest.json`

- [ ] **Step 1: Create manifest.json with requested content**
Write to `apps/web-pwa/public/manifest.json`:
```json
{
  "name": "我的阅读世界",
  "short_name": "阅读世界",
  "description": "个人小说聚合阅读平台",
  "start_url": "/",
  "display": "standalone",
  "background_color": "#F8F8F5",
  "theme_color": "#F8F8F5",
  "icons": [
    {
      "src": "/icons/icon-192x192.png",
      "sizes": "192x192",
      "type": "image/png"
    },
    {
      "src": "/icons/icon-512x512.png",
      "sizes": "512x512",
      "type": "image/png"
    }
  ]
}
```

- [ ] **Step 2: Commit**
Run: `git add apps/web-pwa/public/manifest.json && git commit -m "feat: add PWA manifest.json"`

### Task 3: Install and Configure next-pwa

**Files:**
- Modify: `apps/web-pwa/package.json`
- Modify: `apps/web-pwa/next.config.mjs`

- [ ] **Step 1: Install next-pwa**
Run: `cd apps/web-pwa && pnpm add next-pwa`

- [ ] **Step 2: Update next.config.mjs**
Update `apps/web-pwa/next.config.mjs` to use `next-pwa`. Since it's `.mjs`, we'll use ESM import.

```javascript
import withPWAInit from 'next-pwa';

const withPWA = withPWAInit({
  dest: 'public',
  disable: process.env.NODE_ENV === 'development',
  register: true,
  skipWaiting: true,
});

/** @type {import('next').NextConfig} */
const nextConfig = {
  // your existing config
};

export default withPWA(nextConfig);
```

- [ ] **Step 3: Verify build**
Run: `cd apps/web-pwa && pnpm build`
Expected: Build succeeds and `sw.js` (and other worker files) are generated in `public`.

- [ ] **Step 4: Commit**
Run: `git add apps/web-pwa/package.json apps/web-pwa/next.config.mjs pnpm-lock.yaml && git commit -m "feat: configure next-pwa in next.config.mjs"`

### Task 4: Link Manifest in Layout (Implicitly required for PWA to work)

**Files:**
- Modify: `apps/web-pwa/src/app/layout.tsx` (Assuming it exists and is the main layout)

- [ ] **Step 1: Locate layout.tsx**
Run: `ls apps/web-pwa/src/app/layout.tsx`

- [ ] **Step 2: Add manifest link to Metadata**
Next.js 13/14 uses Metadata API.
```typescript
export const metadata: Metadata = {
  title: "我的阅读世界",
  description: "个人小说聚合阅读平台",
  manifest: "/manifest.json",
  themeColor: "#F8F8F5",
  viewport: "width=device-width, initial-scale=1, maximum-scale=1",
};
```

- [ ] **Step 3: Commit**
Run: `git add apps/web-pwa/src/app/layout.tsx && git commit -m "feat: link manifest in layout metadata"`
