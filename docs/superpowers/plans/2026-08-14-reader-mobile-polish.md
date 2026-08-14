# Reader Mobile Experience Polish Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the existing reader reliably unobstructed, keyboard-safe, touch-friendly, and visually coherent on mobile and desktop without changing reading data or the established paper-inspired visual direction.

**Architecture:** Keep `activePanel` as the only panel state and add one reader-scoped dialog surface that owns focus entry, Tab containment, Escape, hidden-state semantics, and focus return. Centralize mobile toolbar geometry and reader motion in CSS variables/classes, then consume those values from scroll and pagination layouts. Reuse the installed `lucide-react` icon set and existing reader components; do not add GSAP or another UI dependency.

**Tech Stack:** Next.js 15, React 18, TypeScript, Tailwind CSS, Lucide React, Vitest, Playwright.

## Global Constraints

- Preserve REV-0003 and `PHASE-04 / TASK-0403`; do not alter reading persistence, settings schema, sync, public library, or routing semantics.
- Mobile touch targets are at least 44×44px and adjacent primary targets have at least 8px spacing.
- Structural icons use the existing `lucide-react` dependency at 18–20px with a consistent outline weight; no emoji or font glyphs as reader controls.
- Reader panel motion uses only transform/opacity: enter 180–220ms, exit 140–180ms, and becomes effectively immediate under `prefers-reduced-motion: reduce`.
- Do not add GSAP. Do not animate width, height, top, left, or other layout properties.
- Keep existing paper/dark themes, user-selected reading fonts, and `activePanel` as the single panel state source.
- Do not run `next build` concurrently with Playwright because both mutate `.next`; restore generated `apps/web-pwa/public/sw.js` from HEAD after every build.
- E2E uses system Chrome: `PLAYWRIGHT_BROWSER_CHANNEL=chrome`.

---

## File Map

- Create `apps/web-pwa/src/components/reader/ReaderDialogSurface.tsx`: reader-only modal semantics and focus lifecycle.
- Modify `apps/web-pwa/src/app/reader/[bookId]/ReaderDefault.tsx`: dialog surfaces, background inert state, mobile canvas geometry, progress controls, fallback focus.
- Modify `apps/web-pwa/src/components/reader/ReaderTopBar.tsx`: hidden-state semantics, Lucide controls, consistent focus styles.
- Modify `apps/web-pwa/src/components/reader/ReaderBottomBar.tsx`: hidden-state semantics, Lucide action model, touch-safe controls.
- Modify `apps/web-pwa/src/components/reader/SettingsSheet.tsx`: touch-safe segmented controls, theme swatches, switch and close control.
- Modify `apps/web-pwa/src/components/reader/TocDrawer.tsx`: dialog title/close affordance and touch-safe tabs/rows.
- Modify `apps/web-pwa/src/components/reader/PaginatedReader.tsx`: consume explicit top/bottom reserved space.
- Modify `apps/web-pwa/src/app/globals.css`: reader geometry, focus, panel motion, range hit area, reduced-motion rules.
- Modify `apps/web-pwa/e2e/reader-experience.spec.ts`: shared fixed reader fixture plus mobile/keyboard/layout regression journeys.
- Modify `docs/goals/reading-world-v1/execution-ledger.md`: checkpoint only after product commit and independent review.

---

### Task 1: Shared Reader Dialog Focus Contract

**Files:**
- Create: `apps/web-pwa/src/components/reader/ReaderDialogSurface.tsx`
- Modify: `apps/web-pwa/src/app/reader/[bookId]/ReaderDefault.tsx`
- Modify: `apps/web-pwa/src/components/reader/SettingsSheet.tsx`
- Modify: `apps/web-pwa/src/components/reader/TocDrawer.tsx`
- Test: `apps/web-pwa/e2e/reader-experience.spec.ts`

**Interfaces:**
- Produces: `ReaderDialogSurface({ open, label, onClose, fallbackFocus, children, ...divProps })`.
- `fallbackFocus` has type `() => HTMLElement | null`; it is used only when the original trigger is unavailable.
- The component owns `role="dialog"`, `aria-modal`, `aria-hidden`, `inert`, `tabIndex=-1`, focus entry, Tab/Shift+Tab wrapping, Escape, and focus return.
- Consumes: existing `activePanel`, `setActivePanel`, and `contentRef.current`; it does not create panel state.

- [ ] **Step 1: Add failing keyboard/dialog assertions**

Extend the fixed reader fixture in `reader-experience.spec.ts`, open the settings button by keyboard, and assert the user contract:

```ts
const settingsTrigger = page.locator('button[aria-label="阅读设置"]:visible');
await settingsTrigger.focus();
await page.keyboard.press("Enter");

const dialog = page.getByRole("dialog", { name: "阅读设置" });
await expect(dialog).toBeVisible();
await expect.poll(() => dialog.evaluate((node) => node.contains(document.activeElement))).toBe(true);

await page.keyboard.press("Shift+Tab");
await expect.poll(() => dialog.evaluate((node) => node.contains(document.activeElement))).toBe(true);
await page.keyboard.press("Escape");
await expect(dialog).toBeHidden();
await expect(settingsTrigger).toBeFocused();
```

Also hide the menu and assert `page.keyboard.press("Tab")` never focuses a descendant of `[data-reader-toolbar]` while it has `aria-hidden="true"`.

- [ ] **Step 2: Run the focused E2E and verify RED**

Run:

```bash
PLAYWRIGHT_BROWSER_CHANNEL=chrome corepack pnpm --filter web-pwa exec playwright test e2e/reader-experience.spec.ts --grep "reader dialogs contain and restore focus" --timeout 60000
```

Expected: FAIL because the panel has no dialog role/focus lifecycle or because a hidden toolbar remains tabbable. Classify server-start failures as validator failures; do not count them as product RED.

- [ ] **Step 3: Implement `ReaderDialogSurface`**

Create a focused component with this public shape and focus algorithm:

```tsx
export interface ReaderDialogSurfaceProps
  extends React.HTMLAttributes<HTMLDivElement> {
  open: boolean;
  label: string;
  onClose: () => void;
  fallbackFocus: () => HTMLElement | null;
}

const FOCUSABLE = [
  "button:not([disabled])",
  "a[href]",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  '[tabindex]:not([tabindex="-1"])',
].join(",");
```

On `open=true`, capture `document.activeElement`, focus the first visible focusable descendant or the surface, and attach one `keydown` listener to the surface. Escape calls `onClose`; Tab wraps first/last. Cleanup returns focus in a `requestAnimationFrame` to the captured trigger if connected, otherwise to `fallbackFocus()`. Keep `onClose` and `fallbackFocus` in refs so inline callback identity cannot repeatedly restart the effect.

Render semantics exactly:

```tsx
<div
  {...props}
  ref={surfaceRef}
  role={open ? "dialog" : undefined}
  aria-label={open ? label : undefined}
  aria-modal={open || undefined}
  aria-hidden={!open}
  inert={!open ? true : undefined}
  tabIndex={open ? -1 : undefined}
>
  {children}
</div>
```

- [ ] **Step 4: Wire mobile and desktop panels without double activation**

Replace the settings, progress, TOC, and AI wrapper `<div>` elements in `ReaderDefault.tsx` with `ReaderDialogSurface`. Gate `open` with the active breakpoint:

```tsx
open={activePanel === "settings" && isDesktopViewport === false}
fallbackFocus={() => contentRef.current}
onClose={() => setActivePanel(null)}
label="阅读设置"
```

The desktop settings dialog uses `isDesktopViewport === true`. Add `tabIndex={-1}` to the active reader canvas and set `inert={Boolean(activePanel) ? true : undefined}` only on the background canvas, never on an ancestor containing a dialog.

Pass an accessible close label and Lucide `X` to `SettingsSheet`/`TocDrawer`; do not put focus logic inside those presentational components.

- [ ] **Step 5: Run focus E2E and static checks**

Run:

```bash
PLAYWRIGHT_BROWSER_CHANNEL=chrome corepack pnpm --filter web-pwa exec playwright test e2e/reader-experience.spec.ts --grep "reader dialogs contain and restore focus" --timeout 60000
corepack pnpm --filter web-pwa lint
corepack pnpm --filter web-pwa exec tsc --noEmit
```

Expected: dialog journey PASS; lint/type exit 0; 3100/4100 released after Playwright.

- [ ] **Step 6: Commit the dialog contract**

```bash
git add apps/web-pwa/src/components/reader/ReaderDialogSurface.tsx apps/web-pwa/src/app/reader/'[bookId]'/ReaderDefault.tsx apps/web-pwa/src/components/reader/SettingsSheet.tsx apps/web-pwa/src/components/reader/TocDrawer.tsx apps/web-pwa/e2e/reader-experience.spec.ts
git commit -m "fix(reader): contain panel focus"
```

---

### Task 2: One Mobile Toolbar Geometry Contract

**Files:**
- Modify: `apps/web-pwa/src/app/globals.css`
- Modify: `apps/web-pwa/src/app/reader/[bookId]/ReaderDefault.tsx`
- Modify: `apps/web-pwa/src/components/reader/PaginatedReader.tsx`
- Test: `apps/web-pwa/e2e/reader-experience.spec.ts`

**Interfaces:**
- Produces CSS variables `--reader-mobile-menu-top-space` and `--reader-mobile-menu-bottom-space` on the mobile reader root.
- `PaginatedReader` gains numeric props `reservedTop?: number` and `reservedBottom?: number`, defaulting to the current no-menu reading padding.
- The scroll canvas consumes CSS variables; pagination receives measured pixel values from `ReaderDefault` based on `showMenu`.

- [ ] **Step 1: Add failing obstruction assertions for scroll and pagination**

For 390×844 and 375×812, show the menu and compare visible content bounds with toolbar bounds:

```ts
const topBar = page.locator('[data-reader-toolbar="top"]');
const bottomBar = page.locator('[data-reader-toolbar="bottom"]');
const readableRegion = page.locator('[data-page-index]:visible .reader-content').first();
const pageIndicator = page.locator('[data-page-indicator]:visible');
const [topBox, bottomBox, readableBox, padding] = await Promise.all([
  topBar.boundingBox(),
  bottomBar.boundingBox(),
  readableRegion.boundingBox(),
  readableRegion.evaluate((node) => {
    const style = getComputedStyle(node);
    return {
      top: Number.parseFloat(style.paddingTop),
      bottom: Number.parseFloat(style.paddingBottom),
    };
  }),
]);
expect(readableBox!.y + padding.top).toBeGreaterThanOrEqual(topBox!.y + topBox!.height);
expect(readableBox!.y + readableBox!.height - padding.bottom).toBeLessThanOrEqual(bottomBox!.y);
expect((await pageIndicator.boundingBox())!.y).toBeLessThan(bottomBox!.y);
```

For scroll mode, scroll the last rendered chapter to its end and assert its final paragraph bottom can be positioned above `bottomBar.boundingBox().y`.

- [ ] **Step 2: Run geometry cases and verify RED**

Run:

```bash
PLAYWRIGHT_BROWSER_CHANNEL=chrome corepack pnpm --filter web-pwa exec playwright test e2e/reader-experience.spec.ts --grep "mobile toolbars never cover reader content" --timeout 60000
```

Expected: FAIL on at least one bottom bound with current fixed 48/120 pagination reserves or scroll padding.

- [ ] **Step 3: Add reader-scoped geometry variables and classes**

Add to `globals.css`:

```css
.reader-mobile-root {
  --reader-mobile-menu-top-space: calc(68px + env(safe-area-inset-top));
  --reader-mobile-menu-bottom-space: calc(160px + env(safe-area-inset-bottom));
}

.reader-mobile-canvas[data-menu-visible="true"] {
  padding-top: var(--reader-mobile-menu-top-space);
  padding-bottom: var(--reader-mobile-menu-bottom-space);
  scroll-padding-top: var(--reader-mobile-menu-top-space);
  scroll-padding-bottom: var(--reader-mobile-menu-bottom-space);
}
```

Apply `reader-mobile-root` to the mobile root and `reader-mobile-canvas` plus `data-menu-visible={showMenu}` to the mobile canvas. Remove the redundant `pt-12`/menu-specific bottom workaround from chapter containers while retaining ordinary chapter breathing room.

- [ ] **Step 4: Make pagination measurement use explicit reserves**

Extend `PaginatedReaderProps`:

```ts
reservedTop?: number;
reservedBottom?: number;
```

Use `reservedTop`/`reservedBottom` in `PaginationStyle` and page container padding instead of hardcoded `48`/`120`. Add `data-page-indicator` and position the page indicator at `Math.max(16, reservedBottom - 32)` pixels from the bottom. From `ReaderDefault`, pass `showMenu ? 68 : 32` and `showMenu ? 160 : 48`; safe-area remains on the outer fixed toolbars and CSS scroll canvas. Ensure these props participate in memo dependencies so menu visibility repaginates around the existing semantic anchor.

- [ ] **Step 5: Verify both modes, viewport changes, and anchor stability**

Run:

```bash
PLAYWRIGHT_BROWSER_CHANNEL=chrome corepack pnpm --filter web-pwa exec playwright test e2e/reader-experience.spec.ts --grep "mobile toolbars never cover reader content|mobile pagination advances" --timeout 60000
corepack pnpm --filter @reader/reader-core test
```

Expected: both E2E journeys PASS; semantic character remains stable after menu show/hide and 390→1024→390; reader-core 48 tests PASS.

- [ ] **Step 6: Commit the geometry contract**

```bash
git add apps/web-pwa/src/app/globals.css apps/web-pwa/src/app/reader/'[bookId]'/ReaderDefault.tsx apps/web-pwa/src/components/reader/PaginatedReader.tsx apps/web-pwa/e2e/reader-experience.spec.ts
git commit -m "fix(reader): reserve mobile toolbar space"
```

---

### Task 3: Touch-Safe, Coherent Reader Controls

**Files:**
- Modify: `apps/web-pwa/src/components/reader/ReaderTopBar.tsx`
- Modify: `apps/web-pwa/src/components/reader/ReaderBottomBar.tsx`
- Modify: `apps/web-pwa/src/components/reader/SettingsSheet.tsx`
- Modify: `apps/web-pwa/src/components/reader/TocDrawer.tsx`
- Modify: `apps/web-pwa/src/app/reader/[bookId]/ReaderDefault.tsx`
- Modify: `apps/web-pwa/src/app/globals.css`
- Test: `apps/web-pwa/e2e/reader-experience.spec.ts`

**Interfaces:**
- All reader structural controls render Lucide components with `aria-hidden="true"`; accessible names stay on buttons.
- Toolbars add `data-reader-toolbar="top|bottom"`, `aria-hidden={!isVisible}`, and `inert={!isVisible || backgroundDisabled}`.
- Top/Bottom bar props gain `backgroundDisabled?: boolean`; no new persisted setting is introduced.

- [ ] **Step 1: Add failing touch-size and icon assertions**

Open settings, progress, and TOC on a 390px viewport. For every visible control marked with `data-reader-control`, assert:

```ts
const boxes = await page.locator('[data-reader-control]:visible').evaluateAll((nodes) =>
  nodes.map((node) => {
    const box = node.getBoundingClientRect();
    return { label: node.getAttribute("aria-label") ?? node.textContent, width: box.width, height: box.height };
  }),
);
expect(boxes.every((box) => box.width >= 44 && box.height >= 44)).toBe(true);
```

Assert toolbar structural control text does not contain `✨|⚙|☾|⏮|⏭|◷|☰`, and each icon-only button has a non-empty accessible name.

- [ ] **Step 2: Run the polish contract and verify RED**

Run:

```bash
PLAYWRIGHT_BROWSER_CHANNEL=chrome corepack pnpm --filter web-pwa exec playwright test e2e/reader-experience.spec.ts --grep "reader controls are touch safe and use coherent icons" --timeout 60000
```

Expected: FAIL for current 24–36px controls and font glyphs.

- [ ] **Step 3: Replace toolbar glyphs with Lucide**

Use these mappings from `lucide-react`:

```ts
ArrowLeft, Settings2, List, Bookmark, Gauge, Sparkles,
Moon, Sun, ChevronLeft, ChevronRight, ChevronsLeft,
ChevronsRight, X, RotateCcw
```

In `ReaderBottomBar`, replace the `glyph: string` model with `icon: LucideIcon`, render `<Icon aria-hidden="true" size={19} strokeWidth={1.8} />`, and keep Chinese labels. In `ReaderTopBar` and the progress sheet, use the same sizes/stroke. `Moon`/`Sun` follows `isDark`; the visual icon must not change accessible action text.

- [ ] **Step 4: Expand hit areas without inflating glyphs**

- Settings segmented buttons and A−/A+ controls: `min-h-11`.
- Settings/Toc/progress close controls: `h-11 w-11` with `aria-label`.
- Theme choices: outer `h-11 w-11`, inner visual swatch `h-8 w-8`.
- Progress page/chapter controls: `h-11 w-11`; grid columns become five 44px targets plus flexible range.
- Switch: outer button `min-h-11 min-w-11`, inner visual track remains 24×44px.
- Range inputs: apply `.reader-range` with a 44px interactive block and a visually thin track.
- Add `ui-focus-ring` or reader equivalent to every interactive control; do not leave `focus:outline-none` without a replacement.

- [ ] **Step 5: Unify reader-only motion and surface tokens**

Add reader-scoped classes:

```css
.reader-panel-motion {
  transition: transform 200ms cubic-bezier(0.22, 1, 0.36, 1),
    opacity 180ms ease-out;
}

.reader-control-press {
  transition: color 160ms ease, background-color 160ms ease, opacity 160ms ease;
}

.reader-control-press:active { opacity: 0.72; }
```

Replace reader panel/menu `physics-spring`, hover overshoot, and `active:scale-90` with these classes. Keep outer panel radius 22–24px and segmented control radius 10–12px; remove nested decorative borders that do not express hierarchy.

- [ ] **Step 6: Verify touch, keyboard, theme, and reduced motion**

Run:

```bash
PLAYWRIGHT_BROWSER_CHANNEL=chrome corepack pnpm --filter web-pwa exec playwright test e2e/reader-experience.spec.ts --grep "reader controls are touch safe|reader dialogs contain" --timeout 60000
corepack pnpm --filter web-pwa lint
corepack pnpm --filter web-pwa exec tsc --noEmit
```

Expected: touch boxes all ≥44px, no banned toolbar glyphs, focus journey PASS, lint/type exit 0.

- [ ] **Step 7: Commit the control system**

```bash
git add apps/web-pwa/src/components/reader/ReaderTopBar.tsx apps/web-pwa/src/components/reader/ReaderBottomBar.tsx apps/web-pwa/src/components/reader/SettingsSheet.tsx apps/web-pwa/src/components/reader/TocDrawer.tsx apps/web-pwa/src/app/reader/'[bookId]'/ReaderDefault.tsx apps/web-pwa/src/app/globals.css apps/web-pwa/e2e/reader-experience.spec.ts
git commit -m "feat(reader): unify mobile controls"
```

---

### Task 4: Cross-Viewport and Reduced-Motion Regression

**Files:**
- Modify: `apps/web-pwa/e2e/reader-experience.spec.ts`
- Modify only if a failure proves it necessary: files owned by Tasks 1–3

**Interfaces:**
- Produces one fixed fixture helper used by pagination, continuous scroll, focus, geometry, and touch journeys.
- Adds no production API.

- [ ] **Step 1: Extract deterministic reader fixture setup**

Inside the E2E file, extract a helper with explicit inputs:

```ts
async function seedReaderBook(
  page: Page,
  options: {
    bookId: string;
    pageMode: "scroll" | "pagination";
    chapterCount: number;
    contentFor: (index: number) => string;
  },
): Promise<void>
```

It must clear `books`, `chapters`, `progress`, and `bookmarks`, set all reader settings explicitly, insert deterministic timestamps, and close IndexedDB. Do not make tests depend on execution order.

- [ ] **Step 2: Add viewport/reduced-motion coverage**

Run the same user results at:

```ts
const viewports = [
  { width: 375, height: 812 },
  { width: 390, height: 844 },
  { width: 844, height: 390 },
  { width: 1024, height: 900 },
];
```

At each viewport assert no horizontal page overflow, the active panel fits inside the viewport, and the active content remains visible. For reduced motion:

```ts
await page.emulateMedia({ reducedMotion: "reduce" });
await page.getByRole("button", { name: "阅读设置" }).click();
await expect(page.getByRole("dialog", { name: "阅读设置" })).toBeVisible();
await page.keyboard.press("Escape");
await expect(page.getByRole("dialog", { name: "阅读设置" })).toBeHidden();
```

No assertion may wait on `transitionend`.

- [ ] **Step 3: Run the complete reader experience file alone**

First ensure 3100/4100 are free, then run Playwright without a concurrent build:

```bash
PLAYWRIGHT_BROWSER_CHANNEL=chrome corepack pnpm --filter web-pwa exec playwright test e2e/reader-experience.spec.ts --timeout 60000
```

Expected: pagination, continuous scroll, focus, geometry, touch, viewport, and reduced-motion journeys all PASS; test runner exits and releases ports.

- [ ] **Step 4: Run all non-mutating static/unit gates**

Run in parallel because these commands do not share `.next`:

```bash
corepack pnpm --filter @reader/reader-core test
corepack pnpm --filter web-pwa test
corepack pnpm --filter web-pwa lint
corepack pnpm --filter web-pwa exec tsc --noEmit
git diff --check
GUYUE_ROOT=/Users/guyue/GitProject/guyue-skill python3 /Users/guyue/GitProject/guyue-skill/scripts/check_long_goal_pack.py --repo-root . --mode resume docs/goals/reading-world-v1/goal-master.md
```

Expected: all exit 0. The exact test count is recorded from output; do not hardcode a prior count.

- [ ] **Step 5: Run production build alone and compensate generated SW**

Run:

```bash
corepack pnpm --filter web-pwa build
```

Expected: 13 static/SSG routes and exit 0. Restore `apps/web-pwa/public/sw.js` to its pre-build HEAD bytes using `apply_patch`, then require:

```bash
git diff --exit-code -- apps/web-pwa/public/sw.js
```

- [ ] **Step 6: Commit E2E consolidation or amend only test-only changes**

If Step 1–2 changed only the E2E file after the Task 3 product commit:

```bash
git add apps/web-pwa/e2e/reader-experience.spec.ts
git commit -m "test(reader): cover mobile interaction polish"
```

Do not amend earlier commits after review has started.

---

### Task 5: Independent Review and Goal Ledger Checkpoint

**Files:**
- Modify: `docs/goals/reading-world-v1/execution-ledger.md`
- Review: all files changed since `9feec18`

**Interfaces:**
- Consumes: clean product commit(s), exact command outputs, viewport evidence, and independent P0/P1 review.
- Produces: one `RUN-0038` ledger checkpoint; no FINAL evidence and no phase-complete claim.

- [ ] **Step 1: Request independent read-only review**

Ask a reviewer to inspect the clean product candidate for:

- dialog focus entry/trap/Escape/return and hidden toolbar Tab behavior;
- 375/390/landscape/desktop content obstruction;
- ≥44px touch targets and gesture conflicts;
- Lucide/icon/focus/motion consistency;
- pagination semantic anchor and continuous scroll window regressions.

The reviewer must return `READY` with no P0/P1 before checkpointing. Verify every finding against code/runtime before changing implementation.

- [ ] **Step 2: Re-run focused checks after any review fix**

For every accepted review fix, first add/reproduce a failing test, implement the smallest correction, and rerun the complete reader E2E plus relevant lint/type/unit checks. Keep ordinary review iterations out of GATE ATTEMPT counts.

- [ ] **Step 3: Commit the clean product candidate**

If review fixes exist:

```bash
git add apps/web-pwa/src/components/reader/ReaderDialogSurface.tsx apps/web-pwa/src/components/reader/ReaderTopBar.tsx apps/web-pwa/src/components/reader/ReaderBottomBar.tsx apps/web-pwa/src/components/reader/SettingsSheet.tsx apps/web-pwa/src/components/reader/TocDrawer.tsx apps/web-pwa/src/components/reader/PaginatedReader.tsx apps/web-pwa/src/app/reader/'[bookId]'/ReaderDefault.tsx apps/web-pwa/src/app/globals.css apps/web-pwa/e2e/reader-experience.spec.ts
git commit -m "fix(reader): close mobile polish review"
```

Require `git status --short` empty before writing the ledger.

- [ ] **Step 4: Append RUN-0038 with exact evidence**

Record in `execution-ledger.md`:

- approved design/spec commit `9feec18`;
- product commit IDs and exact changed boundaries;
- RED→GREEN journeys for focus, obstruction, touch/icon, viewport and reduced-motion;
- exact test/build/lint/type/control outcomes;
- validator failures separately from product failures;
- independent review result;
- no GSAP, push, deployment, real user data write, risk-gate ATTEMPT, FINAL evidence, phase or Goal completion.

Set `TASK-0403` complete only if all acceptance results pass. Keep `PHASE-04` executing and set the next entrance to `TASK-0404` for phase-wide recovery/performance sampling and the four manual 4/5 ratings.

- [ ] **Step 5: Validate and commit the ledger**

Run:

```bash
git diff --check
GUYUE_ROOT=/Users/guyue/GitProject/guyue-skill python3 /Users/guyue/GitProject/guyue-skill/scripts/check_long_goal_pack.py --repo-root . --mode resume docs/goals/reading-world-v1/goal-master.md
git add docs/goals/reading-world-v1/execution-ledger.md
git commit -m "docs(goal): record reader mobile polish checkpoint"
```

Expected: resume check and commit exit 0; working tree clean; Goal remains active/incomplete.

---

## Plan Self-Review

- Spec coverage: layout reserves → Task 2; dialog/focus → Task 1; touch/gesture and visible alternatives → Task 3; icons/type/motion → Task 3; viewport/reduced-motion and regression → Task 4; review/ledger boundary → Task 5.
- Dependency boundary: no new runtime or dev dependency; uses installed Lucide, React, CSS, Playwright and existing control scripts.
- Type consistency: `ReaderDialogSurfaceProps`, `reservedTop`, `reservedBottom`, `backgroundDisabled`, CSS variable names and data attributes are introduced once and consumed with the same names.
- Scope: no book data migration, global redesign, new gesture, GSAP, public library, sync, PWA expansion, or deployment.
- Completion boundary: TASK-0403 may close after review; TASK-0404, PHASE-04, FINAL evidence, long-term comfort and Goal remain explicitly unclaimed.
