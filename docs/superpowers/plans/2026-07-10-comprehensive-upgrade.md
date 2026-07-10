# 墨问全面升级实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在保留本地优先与中文阅读气质的前提下，完成真实数据、统一 UI、核心旅程、数据完整性、性能和自动验证升级。

**Architecture:** 保留现有 Monorepo、共享核心包、NestJS / SQLite 和 Hash 离线路由；通过统一 Shell、领域服务、按视图懒加载和可测试迁移降低耦合。前端状态只表达后端权限与分享作用域，不承担安全控制。

**Tech Stack:** Next.js 15、React 18、TypeScript、Tailwind CSS、Dexie / IndexedDB、NestJS 11、SQLite / Drizzle、Vitest、Jest、Playwright、PWA / Workbox。

## Global Constraints

- 中文优先，技术错误必须转成用户可执行的中文说明。
- 采用强国风沉浸叙事；诗意术语集中在单一产品词典，白话含义用于辅助说明、Tooltip 与可访问名称。
- 危险操作、权限、错误、隐私和恢复路径必须使用明确中文，不得只用诗意隐喻。
- 后端控制权限、分享作用域和数据范围；前端只控制显隐、禁用和引导。
- 不新增 Redux、Zustand、微前端、图表或动画运行时。
- 唯一允许新增的生产依赖是 `lucide-react`；新增依赖后必须执行生产依赖审计。
- 不删除用户现有书籍、笔记、进度或历史预置书。
- 新环境不再自动写入预置书，示例书改为用户主动添加。
- 动效只使用 `transform` / `opacity`，并支持 `prefers-reduced-motion`。
- 每个任务完成后运行定向测试并使用 `type(scope): 中文描述` 提交。
- 最终必须通过 `lint`、全部单元测试、生产构建、E2E、`pnpm audit --prod` 与 `git diff --check`。

---

### Task 1: 接通前端测试与诚实质量入口

**Files:**
- Modify: `apps/web-pwa/package.json`
- Create: `apps/web-pwa/vitest.config.ts`
- Create: `apps/web-pwa/src/lib/navigation-state.ts`
- Create: `apps/web-pwa/src/lib/navigation-state.test.ts`
- Modify: `apps/web-pwa/src/lib/route-store.ts`
- Delete: `scripts/audit-pwa.js`

**Interfaces:**
- Produces: `parseAppLocation(raw: string): RouteState`
- Produces: `serializeAppLocation(state: RouteState): string`
- Produces: `pnpm --filter web-pwa test`

- [ ] **Step 1: 写导航状态失败测试**

```ts
import { describe, expect, it } from "vitest";
import { parseAppLocation, serializeAppLocation } from "./navigation-state";

describe("navigation-state", () => {
  it("往返保留阅读章节与面板", () => {
    const state = parseAppLocation("#/reader/book%201?chapter=3&panel=toc");
    expect(state).toMatchObject({
      currentView: "reader",
      activeBookId: "book 1",
      activeChapterIndex: 3,
      activePanel: "toc",
    });
    expect(serializeAppLocation(state)).toBe(
      "/reader/book%201?chapter=3&panel=toc",
    );
  });

  it("拒绝非法视图与负章节", () => {
    expect(parseAppLocation("#/unknown").currentView).toBe("library");
    expect(
      parseAppLocation("#/reader/book?chapter=-1").activeChapterIndex,
    ).toBeNull();
  });
});
```

- [ ] **Step 2: 运行测试确认当前失败**

Run: `corepack pnpm --filter web-pwa test`

Expected: FAIL，原因是 `test` 脚本或 `navigation-state` 尚不存在。

- [ ] **Step 3: 增加 Vitest 配置和最小导航实现**

```ts
// apps/web-pwa/vitest.config.ts
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
  test: { environment: "node" },
});
```

`navigation-state.ts` 负责 URI 编解码、非负章节校验和允许面板白名单；`route-store.ts` 只保留发布订阅与浏览器 History 操作，并复用该模块。

- [ ] **Step 4: 移除假审计脚本并接通脚本**

`apps/web-pwa/package.json` 增加：

```json
{
  "scripts": {
    "test": "vitest run",
    "lint": "eslint src --ext .js,.ts,.tsx --max-warnings=0"
  }
}
```

删除未被包脚本引用、写死本机绝对路径并输出结论式文案的 `scripts/audit-pwa.js`。

- [ ] **Step 5: 验证并提交**

Run: `corepack pnpm --filter web-pwa test`

Run: `corepack pnpm --filter web-pwa lint`

Expected: 全部 PASS，无 `next lint` 弃用警告。

Commit: `test(web): 接通前端测试与诚实验证入口`

---

### Task 2: 修复 SQLite 历史重复章节与启动约束

**Files:**
- Create: `apps/api/src/modules/database/database-bootstrap.ts`
- Create: `apps/api/src/modules/database/database-bootstrap.spec.ts`
- Modify: `apps/api/src/modules/database/database.module.ts`

**Interfaces:**
- Produces: `ensureChapterIntegrity(client: Client): Promise<ChapterIntegrityResult>`
- Produces: `prepareDatabase(client: Client): Promise<DatabasePreparationResult>`
- Produces: `{ deduplicatedChapters: number; uniqueIndexReady: true }`

- [ ] **Step 1: 写真实临时数据库失败测试**

```ts
it('保留最新章节并建立唯一索引', async () => {
  const client = createClient({ url: 'file::memory:' });
  await client.execute('CREATE TABLE books (id TEXT PRIMARY KEY, chapter_count INTEGER NOT NULL)');
  await client.execute('CREATE TABLE chapters (id TEXT PRIMARY KEY, book_id TEXT NOT NULL, "index" INTEGER NOT NULL, title TEXT NOT NULL, content_hash TEXT NOT NULL, created_at TEXT NOT NULL)');
  await client.execute("INSERT INTO books VALUES ('book-1', 3)");
  await client.execute("INSERT INTO chapters VALUES ('old', 'book-1', 0, '旧章', 'a', '2026-01-01T00:00:00.000Z')");
  await client.execute("INSERT INTO chapters VALUES ('new', 'book-1', 0, '新章', 'b', '2026-01-02T00:00:00.000Z')");

  const result = await ensureChapterIntegrity(client);
  const rows = await client.execute('SELECT id FROM chapters');
  const indexes = await client.execute("PRAGMA index_list('chapters')");

  expect(result.deduplicatedChapters).toBe(1);
  expect(rows.rows).toEqual([{ id: 'new' }]);
  expect(indexes.rows.some((row) => row.name === 'chapters_book_id_index_uq')).toBe(true);
});
```

- [ ] **Step 2: 运行定向测试确认失败**

Run: `CI=true corepack pnpm --filter api test -- database-bootstrap.spec.ts`

Expected: FAIL，`ensureChapterIntegrity` 尚不存在。

- [ ] **Step 3: 实现事务迁移**

迁移执行以下 SQL，任何一步失败都向上抛错：

```sql
BEGIN IMMEDIATE;
DELETE FROM chapters
WHERE id IN (
  SELECT id FROM (
    SELECT id,
      ROW_NUMBER() OVER (
        PARTITION BY book_id, "index"
        ORDER BY created_at DESC, id DESC
      ) AS duplicate_rank
    FROM chapters
  ) WHERE duplicate_rank > 1
);
UPDATE books
SET chapter_count = (
  SELECT COUNT(*) FROM chapters WHERE chapters.book_id = books.id
);
CREATE UNIQUE INDEX IF NOT EXISTS chapters_book_id_index_uq
ON chapters(book_id, "index");
COMMIT;
```

发生异常时执行 `ROLLBACK` 并阻止 NestJS 启动。

- [ ] **Step 4: 让 DatabaseModule 复用准备函数**

`database.module.ts` 只负责创建 Client、调用 `prepareDatabase`、打印结构化结果并返回 Drizzle 实例，不再内嵌迁移细节。

- [ ] **Step 5: 验证并提交**

Run: `CI=true corepack pnpm --filter api test -- database-bootstrap.spec.ts`

Run: `CI=true corepack pnpm --filter api test`

Commit: `fix(database): 修复重复章节并恢复唯一约束`

---

### Task 3: 统一 Design Tokens、字体、基础控件与 Shell

**Files:**
- Modify: `apps/web-pwa/package.json`
- Create: `apps/web-pwa/src/styles/ui-tokens.ts`
- Create: `apps/web-pwa/src/styles/ui-tokens.test.ts`
- Create: `apps/web-pwa/src/styles/tokens.css`
- Create: `apps/web-pwa/src/lib/product-language.ts`
- Create: `apps/web-pwa/src/lib/product-language.test.ts`
- Modify: `apps/web-pwa/src/app/globals.css`
- Modify: `apps/web-pwa/src/app/layout.tsx`
- Create: `apps/web-pwa/src/components/ui/IconButton.tsx`
- Create: `apps/web-pwa/src/components/ui/SegmentedControl.tsx`
- Create: `apps/web-pwa/src/components/ui/StatusNotice.tsx`
- Create: `apps/web-pwa/src/components/app-shell/nav-items.ts`
- Modify: `apps/web-pwa/src/components/AppShell.tsx`
- Modify: `apps/web-pwa/src/components/PageLayout.tsx`
- Delete: `apps/web-pwa/src/components/Sidebar.tsx`

**Interfaces:**
- Produces: `UI_TOKENS`
- Produces: `PRODUCT_LANGUAGE`
- Produces: `APP_NAV_ITEMS`
- Produces: `IconButton`, `SegmentedControl`, `StatusNotice`
- Produces: 单一 `AppShell`

- [ ] **Step 1: 写 Token 与导航失败测试**

```ts
it("颜色角色完整且主色不超过五类", () => {
  expect(Object.keys(UI_TOKENS.color)).toEqual([
    "background",
    "surface",
    "text",
    "muted",
    "primary",
    "info",
    "danger",
  ]);
  expect(UI_TOKENS.radius.card).toBe(8);
});

it("主导航包含五个真实页面", () => {
  expect(APP_NAV_ITEMS.map((item) => item.href)).toEqual([
    "/library",
    "/search",
    "/import",
    "/notes",
    "/settings",
  ]);
});

it("诗意操作同时提供白话含义", () => {
  expect(PRODUCT_LANGUAGE.actions.importBook).toEqual({
    label: "纳书入阁",
    plain: "导入书籍",
  });
  expect(PRODUCT_LANGUAGE.actions.deleteBook.label).toBe("删除书籍");
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `corepack pnpm --filter web-pwa test -- ui-tokens.test.ts`

Expected: FAIL，模块尚不存在。

- [ ] **Step 3: 实现基础设计系统**

`tokens.css` 定义暖白、炭黑、松柏绿、天青、朱砂、4/8px 间距、最大 8px 卡片圆角、焦点环和层级。`product-language.ts` 统一维护纳书入阁/导入书籍、继续展卷/继续阅读、落墨/写笔记、寻书/搜索书籍、笺注/笔记与书签、云阁同步/同步数据；删除、权限、错误和恢复操作的 `label` 直接使用明确白话。`globals.css` 删除三个远程字体入口和全局 `user-select: none`，使用：

```css
body {
  color: var(--color-text);
  background: var(--color-background);
  font-family: var(--font-ui);
  user-select: text;
}

button,
nav,
[data-drag-handle] {
  user-select: none;
}

@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    scroll-behavior: auto !important;
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
  }
}
```

- [ ] **Step 4: 统一 Shell 与图标**

添加 `lucide-react`，导航使用 `Library`, `Search`, `Import`, `NotebookPen`, `Settings`，可见标签从 `PRODUCT_LANGUAGE` 读取诗意名称，`aria-label` 与 Tooltip 使用 `plain`。`PageLayout` 成为 `AppShell` 的薄适配器；移除重复 `Sidebar`。删除侧栏硬编码用户、连续天数、阅读分钟和藏书数量。

- [ ] **Step 5: 验证并提交**

Run: `corepack pnpm --filter web-pwa test`

Run: `corepack pnpm --filter web-pwa lint`

Commit: `refactor(ui): 统一设计令牌与应用外壳`

---

### Task 4: 让根视图按需加载并降低首屏开销

**Files:**
- Modify: `apps/web-pwa/src/app/page.tsx`
- Create: `apps/web-pwa/src/components/ViewLoading.tsx`
- Create: `apps/web-pwa/src/app/route-loading.test.ts`
- Modify: `apps/web-pwa/src/components/RouteProvider.tsx`
- Modify: `apps/web-pwa/next.config.mjs`

**Interfaces:**
- Produces: 每个业务视图的 `next/dynamic` 加载边界
- Produces: `ViewLoading({ label }: { label: string })`

- [ ] **Step 1: 写静态边界测试**

```ts
it("根页面不静态导入业务页面", async () => {
  const source = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");
  expect(source).not.toMatch(/import LibraryPage from/);
  expect(source).toContain("dynamic(");
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `corepack pnpm --filter web-pwa test -- route-loading.test.ts`

Expected: FAIL，根页面仍同步导入全部视图。

- [ ] **Step 3: 使用 dynamic 拆分视图**

```tsx
const LibraryPage = dynamic(() => import("./library/page"), {
  loading: () => <ViewLoading label="正在打开书架" />,
  ssr: false,
});
```

其余阅读、详情、搜索、笔记、设置、导入与预览使用相同模式。移除 500ms 模糊/缩放卸载等待，改用不阻塞交互的淡入，并在减少动效模式下直接切换。

- [ ] **Step 4: 清理调试暴露**

删除生产运行时的 `window.db` 暴露和 URL `poison-test` 崩溃插桩；E2E 通过测试专用页面或 React 测试边界验证错误状态。

- [ ] **Step 5: 生产构建检查并提交**

Run: `CI=true corepack pnpm --filter web-pwa build`

Expected: 根路由可构建，业务视图形成独立静态块，Service Worker 预缓存这些块。

Commit: `perf(web): 拆分业务视图并减轻首屏负载`

---

### Task 5: 重构真实书架与同步入口

**Files:**
- Create: `apps/web-pwa/src/features/library/library-state.ts`
- Create: `apps/web-pwa/src/features/library/library-state.test.ts`
- Create: `apps/web-pwa/src/features/library/sync-tasks.ts`
- Create: `apps/web-pwa/src/features/library/sync-tasks.test.ts`
- Create: `apps/web-pwa/src/features/library/components/ContinueReading.tsx`
- Create: `apps/web-pwa/src/features/library/components/LibraryToolbar.tsx`
- Create: `apps/web-pwa/src/features/library/components/LibraryBookList.tsx`
- Create: `apps/web-pwa/src/features/library/components/SyncStatus.tsx`
- Modify: `apps/web-pwa/src/app/library/LibraryDefault.tsx`
- Delete: `apps/web-pwa/src/app/library/LibrarySimple.tsx`
- Modify: `apps/web-pwa/src/app/library/page.tsx`

**Interfaces:**
- Produces: `selectContinueBook(books, progressByBookId): Book | null`
- Produces: `getLibraryEmptyState(books): "empty" | "ready"`
- Produces: `readSyncTasks(storage): ActiveSyncTasks`
- Produces: `LibraryBookList` 的统一 cover / compact / list 模式

- [ ] **Step 1: 写真实状态失败测试**

```ts
it("无阅读记录时不伪造继续阅读", () => {
  expect(selectContinueBook([book], new Map())).toBeNull();
});

it("选择最后真实阅读的书", () => {
  expect(selectContinueBook([older, latest], progress)).toEqual(latest);
});

it("损坏同步标记会自愈为空对象", () => {
  const storage = createMemoryStorage("{");
  expect(readSyncTasks(storage)).toEqual({});
  expect(storage.getItem(ACTIVE_SYNC_TASKS_KEY)).toBeNull();
});
```

测试文件内使用以下内存 Storage，避免访问真实 LocalStorage：

```ts
function createMemoryStorage(initial?: string): Storage {
  const data = new Map<string, string>();
  if (initial !== undefined) data.set(ACTIVE_SYNC_TASKS_KEY, initial);
  return {
    get length() { return data.size; },
    clear: () => data.clear(),
    getItem: (key) => data.get(key) ?? null,
    key: (index) => [...data.keys()][index] ?? null,
    removeItem: (key) => { data.delete(key); },
    setItem: (key, value) => { data.set(key, value); },
  };
}
```

- [ ] **Step 2: 运行测试确认失败**

Run: `corepack pnpm --filter web-pwa test -- library-state.test.ts sync-tasks.test.ts`

- [ ] **Step 3: 抽取纯状态与同步标记**

移动现有视图模式、相对时间、进度、同步任务解析和分页上传函数到 `features/library/`。所有 LocalStorage 访问注入 `Storage`，测试不依赖浏览器全局。

- [ ] **Step 4: 重组书架页面**

书架 JSX 固定为标题、真实继续阅读、工具条、书籍列表和条件同步状态。删除修行卡、硬编码统计、自动 `PRESET_BOOKLISTS` 初始化和默认云同步大卡片。空状态提供：

```tsx
<EmptyState
  title="书架还是空的"
  description="导入 TXT 或 EPUB，阅读进度会保存在这台设备。"
  primaryAction={{
    label: PRODUCT_LANGUAGE.actions.importBook.label,
    accessibleLabel: PRODUCT_LANGUAGE.actions.importBook.plain,
    onClick: openImport,
  }}
  secondaryAction={{ label: "添加示例书", onClick: addSampleBook }}
/>
```

保留 `PRESET_BOOKLISTS` 作为用户主动选择的示例来源，不删除既有数据库记录。

- [ ] **Step 5: 合并双 UI 模式**

删除 `LibrarySimple` 页面级分叉；`uiMode` 仅映射到书架密度，不再维护第二套业务逻辑。

- [ ] **Step 6: 验证并提交**

Run: `corepack pnpm --filter web-pwa test`

Run: `corepack pnpm --filter web-pwa lint`

Commit: `refactor(library): 重建真实书架与同步入口`

---

### Task 6: 收敛导入状态机与可恢复体验

**Files:**
- Create: `apps/web-pwa/src/features/import/import-state.ts`
- Create: `apps/web-pwa/src/features/import/import-state.test.ts`
- Create: `apps/web-pwa/src/features/import/useImportController.ts`
- Create: `apps/web-pwa/src/features/import/components/ImportMethodTabs.tsx`
- Create: `apps/web-pwa/src/features/import/components/ImportTaskStatus.tsx`
- Modify: `apps/web-pwa/src/app/import/page.tsx`
- Modify: `apps/web-pwa/src/app/import/preview/[taskId]/PreviewClient.tsx`

**Interfaces:**
- Produces: `ImportPhase = "idle" | "reading" | "parsing" | "preview" | "saving" | "failed"`
- Produces: `toImportFailure(error): { title: string; detail: string; canRetry: boolean }`
- Produces: `useImportController()`

- [ ] **Step 1: 写状态迁移失败测试**

```ts
it("解析失败保留任务并允许重试", () => {
  const next = importReducer(parsingTask, {
    type: "failed",
    error: new Error("编码无法识别"),
  });
  expect(next.phase).toBe("failed");
  expect(next.canRetry).toBe(true);
  expect(next.taskId).toBe(parsingTask.taskId);
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `corepack pnpm --filter web-pwa test -- import-state.test.ts`

- [ ] **Step 3: 实现 reducer 与 Controller**

`useImportController` 管理 Worker 生命周期、任务持久化、取消和恢复；页面只负责渲染。Worker 事件统一映射到 `ImportPhase`，卸载时终止 Worker。

- [ ] **Step 4: 简化导入页面**

默认展示文件导入；URL 和文件夹放在分段控制中。每个方法有唯一主按钮、真实进度、错误说明和重试。预览页保留编辑能力，并为保存按钮增加提交中禁用与重复提交保护。

- [ ] **Step 5: 验证并提交**

Run: `corepack pnpm --filter web-pwa test`

Run: `corepack pnpm --filter parser-core test`

Commit: `refactor(import): 统一导入状态与失败恢复`

---

### Task 7: 拆分阅读会话职责并统一桌面/移动实现

**Files:**
- Create: `apps/web-pwa/src/features/reader/reader-position.ts`
- Create: `apps/web-pwa/src/features/reader/reader-position.test.ts`
- Create: `apps/web-pwa/src/features/reader/reader-source.ts`
- Create: `apps/web-pwa/src/features/reader/reader-ai.ts`
- Create: `apps/web-pwa/src/features/reader/useReaderSession.ts`
- Modify: `apps/web-pwa/src/hooks/useReader.ts`
- Modify: `apps/web-pwa/src/app/reader/[bookId]/ReaderDefault.tsx`
- Delete: `apps/web-pwa/src/app/reader/[bookId]/ReaderSimple.tsx`
- Modify: `apps/web-pwa/src/app/reader/[bookId]/ReaderClient.tsx`
- Modify: `apps/web-pwa/src/components/reader/AIReaderPanel.tsx`
- Modify: `apps/web-pwa/src/components/reader/SettingsSheet.tsx`

**Interfaces:**
- Produces: `ReaderAnchor`, `captureReaderAnchor`, `restoreReaderAnchor`
- Produces: `ReaderSourceRepository`
- Produces: `ReaderAIClient`
- Produces: 单一 `useReaderSession(bookId)`

- [ ] **Step 1: 写位置与来源边界失败测试**

```ts
it("旋转或重排后按段落锚点恢复", () => {
  const anchor = captureReaderAnchor({
    chapterIndex: 4,
    paragraphIndex: 12,
    characterOffset: 8,
    percentage: 42.5,
  });
  expect(restoreReaderAnchor(anchor, layout)).toEqual({
    chapterIndex: 4,
    paragraphIndex: 12,
    characterOffset: 8,
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `corepack pnpm --filter web-pwa test -- reader-position.test.ts`

- [ ] **Step 3: 提取高风险职责**

`reader-position.ts` 只做纯计算；`reader-source.ts` 封装 IndexedDB、File System Access 与 API 回退；`reader-ai.ts` 封装请求头、缓存键和错误分类。`useReader.ts` 只编排领域模块，随后重命名为 `useReaderSession` 并保留一个过渡导出，避免一次性破坏调用方。

- [ ] **Step 4: 合并双阅读器**

删除 `ReaderSimple` 页面级分叉；同一 `ReaderDefault` 根据视口选择单栏、抽屉或三栏。设置和主题模型保持单一来源。

- [ ] **Step 5: 修复面板与动效边界**

AI 输出使用 React state 渲染，不直接修改 `textContent`。抽屉与 Sheet 支持 Esc、关闭后焦点恢复、44px 触控目标和减少动效。移除常驻 `will-change`、模糊转场和无意义旋转。

- [ ] **Step 6: 验证并提交**

Run: `corepack pnpm --filter web-pwa test`

Run: `corepack pnpm --filter @reader/reader-core test`

Run: `corepack pnpm --filter @reader/gesture-core test`

Commit: `refactor(reader): 统一阅读会话与跨端交互`

---

### Task 8: 增加 AI 快捷意图并隔离缓存

**Files:**
- Modify: `packages/shared-types/src/index.ts`
- Modify: `packages/shared-types/src/index.test.ts`
- Modify: `packages/ai-core/src/provider.ts`
- Modify: `packages/ai-core/src/provider.test.ts`
- Modify: `apps/api/src/common/request-boundary.ts`
- Modify: `apps/api/src/common/request-boundary.spec.ts`
- Modify: `apps/api/src/modules/ai/ai.controller.ts`
- Modify: `apps/api/src/modules/ai/ai.service.ts`
- Modify: `apps/web-pwa/src/features/reader/reader-ai.ts`
- Modify: `apps/web-pwa/src/components/reader/AIReaderPanel.tsx`

**Interfaces:**
- Produces: `AI_READING_INTENTS = ["summary", "characters", "clues", "terms"]`
- Produces: `OpenAIProvider.analyze(text, intent, model)`
- Produces: `POST /ai/analyze`

- [ ] **Step 1: 写意图与缓存失败测试**

```ts
it("不同阅读意图不会共用缓存", async () => {
  const summary = await generateAiSigKeyAsync("hash", "model", "reader-ai-v3:summary", "book");
  const terms = await generateAiSigKeyAsync("hash", "model", "reader-ai-v3:terms", "book");
  expect(summary).not.toBe(terms);
});

it("拒绝未知意图", () => {
  expect(() => parseAIReadingIntent("rewrite")).toThrow("AI 阅读意图不支持");
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `CI=true corepack pnpm --filter @reader/shared-types test`

Run: `CI=true corepack pnpm --filter api test -- request-boundary.spec.ts`

- [ ] **Step 3: 实现中文提示字典**

```ts
const INTENT_SYSTEM_PROMPTS: Record<AIReadingIntent, string> = {
  summary: "概括本章人物、事件、转折和结尾悬念，不添加原文没有的事实。",
  characters: "列出本章出现的主要人物、关系和行为依据；信息不足时明确说明。",
  clues: "提取本章关键线索、伏笔与可能影响，区分原文明示和合理推断。",
  terms: "解释本章可能影响理解的术语、设定和专有名词，使用简洁中文。",
};
```

所有请求仍由后端读取分享作用域内章节，不允许前端提交任意服务器文件路径。

- [ ] **Step 4: 更新 AI 面板**

面板使用四个分段意图按钮和一个自由提问输入框；加载、缓存命中、无配置、网络失败和模型错误有独立中文状态。图标使用 Lucide，不使用 Emoji 作为唯一含义。

- [ ] **Step 5: 验证并提交**

Run: `CI=true corepack pnpm --filter @reader/ai-core test`

Run: `CI=true corepack pnpm --filter api test`

Run: `corepack pnpm --filter web-pwa test`

Commit: `feat(ai): 增加阅读意图并隔离派生缓存`

---

### Task 9: 真实化搜索、笔记、详情与设置页面

**Files:**
- Modify: `apps/web-pwa/src/app/search/page.tsx`
- Modify: `apps/web-pwa/src/app/notes/page.tsx`
- Modify: `apps/web-pwa/src/app/settings/page.tsx`
- Modify: `apps/web-pwa/src/app/book/[bookId]/BookDetailClient.tsx`
- Create: `apps/web-pwa/src/features/notes/notes-filter.ts`
- Create: `apps/web-pwa/src/features/notes/notes-filter.test.ts`
- Create: `apps/web-pwa/src/features/search/search-results.ts`
- Create: `apps/web-pwa/src/features/search/search-results.test.ts`
- Modify: `apps/web-pwa/src/lib/i18n.ts`
- Modify: `apps/web-pwa/src/components/BookCard.tsx`
- Modify: `apps/web-pwa/src/components/EmptyState.tsx`

**Interfaces:**
- Produces: 搜索的本地/远端来源状态
- Produces: 笔记按书和关键词筛选
- Produces: 设置分组与危险操作区

- [ ] **Step 1: 写纯筛选失败测试**

```ts
it("笔记筛选同时服从书籍和关键词", () => {
  expect(filterNotes(notes, { bookId: "book-1", query: "山谷" })).toEqual([
    notes[1],
  ]);
});

it("远端失败不清空本地搜索结果", () => {
  expect(mergeSearchResults(local, { status: "failed", items: [] })).toEqual({
    local,
    remote: [],
    remoteStatus: "failed",
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `corepack pnpm --filter web-pwa test -- notes-filter.test.ts search-results.test.ts`

- [ ] **Step 3: 重组页面信息层级**

删除笔记页勋章、修行和硬编码成就；搜索页区分本地与远端；书籍详情显示来源、缓存、章节和继续阅读；设置按阅读、AI、存储同步、界面、数据管理分组。

- [ ] **Step 4: 统一控件与文案**

按钮、空状态、确认框、分段控制和状态提示复用 Task 3 组件。所有错误码通过 `i18n.ts` 映射为中文下一步。

- [ ] **Step 5: 验证并提交**

Run: `corepack pnpm --filter web-pwa test`

Run: `corepack pnpm --filter web-pwa lint`

Commit: `refactor(pages): 统一辅助页面与真实状态`

---

### Task 10: 接通不跳过的核心 E2E 与 CI

**Files:**
- Modify: `.gitignore`
- Modify: `apps/web-pwa/package.json`
- Create: `apps/web-pwa/playwright.config.ts`
- Create: `apps/web-pwa/e2e/fixtures/short-novel.txt`
- Replace: `apps/web-pwa/e2e/reader.spec.ts`
- Create: `apps/web-pwa/e2e/share-scope.spec.ts`
- Modify: `.github/workflows/ci.yml`

**Interfaces:**
- Produces: `pnpm --filter web-pwa test:e2e`
- Produces: 临时 API 数据目录与 Web 端口配置

- [ ] **Step 1: 写真实导入到续读 E2E**

```ts
test("首次导入、阅读设置、书签与续读", async ({ page }) => {
  await page.goto("/#/library");
  await expect(page.getByText("书架还是空的")).toBeVisible();
  await page.getByRole("button", { name: "导入一本书" }).click();
  await page.getByLabel("选择 TXT 或 EPUB 文件").setInputFiles(
    "e2e/fixtures/short-novel.txt",
  );
  await expect(page.getByRole("heading", { name: "解析预览" })).toBeVisible();
  await page.getByRole("button", { name: "加入书架" }).click();
  await page.getByRole("button", { name: "开始阅读" }).click();
  await expect(page.locator(".reader-content")).toContainText("第一章");
  await page.getByRole("button", { name: "设置" }).click();
  await page.getByLabel("字号").fill("20");
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "添加书签" }).click();
  await page.reload();
  await expect(page.locator(".reader-content")).toBeVisible();
});
```

测试不得因空书架调用 `test.skip`。

- [ ] **Step 2: 配置隔离服务**

Playwright `webServer` 使用 `3100/4100`，API 环境指向 `.tmp/e2e/reader.sqlite` 和 `.tmp/e2e/blobs`；`.tmp/` 加入 `.gitignore`。测试前由 Node setup 删除且只删除该临时目录。

`apps/web-pwa/package.json` 增加开发依赖 `@playwright/test`，并增加：

```json
{
  "scripts": {
    "test:e2e": "playwright test"
  }
}
```

- [ ] **Step 3: 增加分享作用域 API E2E**

使用两个随机分享口令分别导入书籍，断言 A 的 `/books`、章节、搜索和 AI 请求不能返回 B 的数据。

- [ ] **Step 4: 接入 CI**

CI 在单元测试和构建后安装 Chromium，运行 E2E，再运行：

```bash
corepack pnpm audit --prod
git diff --check
```

- [ ] **Step 5: 本地验证并提交**

Run: `corepack pnpm --filter web-pwa test:e2e`

Commit: `test(e2e): 覆盖导入阅读与分享隔离`

---

### Task 11: 全量边界、性能与活体视觉验收

**Files:**
- Create: `docs/verification/2026-07-10-comprehensive-upgrade.md`
- Modify: `docs/superpowers/plans/2026-07-10-comprehensive-upgrade.md`
- Generated: `apps/web-pwa/public/sw.js`

**Interfaces:**
- Produces: 最新验证报告、桌面/移动截图路径、性能与残余风险记录

- [ ] **Step 1: 运行全部自动门禁**

Run: `CI=true corepack pnpm lint`

Run: `CI=true corepack pnpm test`

Run: `CI=true corepack pnpm build`

Run: `corepack pnpm --filter web-pwa test:e2e`

Run: `corepack pnpm audit --prod`

Run: `git diff --check`

Expected: 全部退出码为 0，生产依赖审计无已知漏洞。

- [ ] **Step 2: 检查依赖与包体**

记录 Next.js 构建输出中每个路由的 First Load JS。`/` 目标不超过 250 kB；若超出，使用构建清单定位具体块，继续拆分后重跑，不直接豁免。

- [ ] **Step 3: 活体桌面与移动检查**

在 340x740、390x844、768x1024、1440x900、1920x1080 视口执行主链路，采集：

```text
页面截图
console.error / pageerror
失败请求
documentElement.scrollWidth > innerWidth
固定导航遮挡
焦点可见性
减少动效状态
```

- [ ] **Step 4: PWA 离线检查**

用生产构建注册 Service Worker，在线打开并缓存示例书，切换离线后重新加载 `/`，断言书架、已缓存章节、阅读设置和进度可用。

- [ ] **Step 5: 独立现实审查**

逐条把设计规格的承诺映射到 UI -> Hook/Service -> IndexedDB/API -> SQLite/Blob -> 测试证据。权限必须追踪到后端分享作用域；截图不能替代数据来源证据。

- [ ] **Step 6: 写报告并提交**

报告只写真实命令、结果、证据时间和残余风险，不使用“100% 完美”等结论词。

Commit: `docs(verification): 记录全面升级活体验证`
