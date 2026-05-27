# 小说平台技术栈与工程架构文档 v0.1（MVP 本地轻量版）

## 1. 技术路线总原则

项目第一阶段采用：

> **TypeScript 全栈 + Mobile-first Web/PWA + 本地轻量后端 + SQLite + 本地文件存储 + 可替换 Adapter 架构。**

核心目标不是一开始堆满云服务，而是先把阅读核心、导入解析、离线缓存、进度锚点、模块边界、扩展机制打稳。

## 2. MVP 冻结技术栈

### 2.1 前端技术栈

```text
Next.js App Router
React
TypeScript
Tailwind CSS
Radix UI / shadcn/ui
Dexie.js
IndexedDB
OPFS
Cache Storage
Service Worker / Workbox
epub.js
JSZip
Mozilla Readability
PDF.js
DOMPurify
Web Worker
```

前端是第一阅读现场，负责书架、TXT/EPUB 导入解析、阅读器渲染、离线缓存、高频进度保存、阅读设置、书签、同步和 AI 面板展示。

第一版不是“桌面 Web”，而是 **Web/PWA 跨屏 MVP**，必须同时覆盖桌面浏览器、手机浏览器和可安装 PWA。

### 2.2 后端技术栈

```text
NestJS
TypeScript
SQLite
Drizzle ORM
Local File Storage
SQLite FTS5
SQLite Task Queue
Local Worker
Zod
OpenAPI / Swagger
AI Provider Adapter
Playwright，可选兜底
Calibre，可选兜底
```

后端不是一开始做重型云平台，而是本地轻量兜底层：API、SQLite、文件存储、缓存、队列、搜索、AI Provider、URL 解析和格式转换预留。

### 2.3 工程技术栈

```text
pnpm workspace
Turborepo
ESLint
Prettier
Vitest
Playwright
Testing Library
fake-indexeddb
Docker，可选
GitHub Actions
```

## 3. Monorepo 目录结构

```text
novel-reader-platform/
  apps/
    web-pwa/
      src/
        app/
        features/
          library/
          import/
          reader/
          settings/
          search/
          ai/
          sync/
        components/
        styles/
        service-worker/
        workers/

    api/
      src/
        modules/
          auth/
          user/
          library/
          book/
          chapter/
          import/
          parser/
          sync/
          search/
          source-rule/
          storage/
          task/
          ai/
          admin/
        common/
        main.ts

    worker/
      src/
        processors/
          url-parser.processor.ts
          ai.processor.ts
          cleanup.processor.ts
          import.processor.ts
        task-runner.ts

    miniapp-lite/          # 后续
    mobile-capacitor/      # 后续
    desktop-tauri/         # 后续

  packages/
    shared-types/
    reader-core/
    parser-core/
    storage-core/
    sync-core/
    viewport-core/
    gesture-core/
    ui-reader/
    content-utils/
    rules-engine/
    ai-core/
    backend-contracts/
    config/
    eslint-config/
    tsconfig/

  data/
    app.sqlite
    storage/
      original_files/
      chapter_blobs/
      ai_blobs/
      covers/
      exports/
      url_cache/

  infra/
    scripts/
    migrations/

  docs/
    product/
    design/
    architecture/
    engineering/
    testing/
```

## 4. 核心 Package 职责

| Package | 职责 | 禁止 |
|---|---|---|
| `shared-types` | Book、Chapter、Progress、Settings、AIView 等统一类型 | 不放业务实现，不依赖具体技术 |
| `reader-core` | 阅读位置、章节导航、分页/滚动、进度锚点 | 不依赖 React、Dexie、API、SQLite |
| `parser-core` | TXT/EPUB/HTML/URL 解析为统一结构 | 不依赖 UI，不弹 Toast |
| `storage-core` | IndexedDB、OPFS、Cache Storage 抽象 | 不做业务决策 |
| `sync-core` | 增量同步、manifest、冲突处理 | 不处理阅读逻辑 |
| `viewport-core` | mobile/tablet/desktop/wide、安全区、方向 | 不依赖业务模块 |
| `gesture-core` | 点击区、滑动、长按、防误触 | 不直接操作业务存储 |
| `ui-reader` | 阅读器 UI 组件 | 不访问 SQLite / Drizzle / 后端细节 |
| `content-utils` | normalize、clean、hash、quality、diff | 不依赖 UI |
| `rules-engine` | 书源规则、SearchProvider、URL 页面类型识别 | 不内置高风险来源 |
| `ai-core` | AIView、promptVersion、缓存键、Provider 接口 | 不耦合具体模型 SDK |

## 5. 依赖方向

允许：

```text
apps -> packages
ui-reader -> reader-core / shared-types
reader-core -> shared-types
parser-core -> shared-types / content-utils
storage-core -> shared-types
sync-core -> shared-types
rules-engine -> shared-types / content-utils
ai-core -> shared-types
api -> shared-types / backend-contracts
worker -> shared-types / backend-contracts
```

禁止：

```text
reader-core -> React
reader-core -> Dexie
reader-core -> API
reader-core -> SQLite
parser-core -> UI
shared-types -> 任何实现
ui-reader -> SQLite / Drizzle / 后端细节
业务 service -> fs 直接写文件
业务 service -> sqlite 裸查询
```

## 6. 后端模块设计

```text
apps/api/src/modules/
  health/
  book/
  chapter/
  progress/
  settings/
  bookmark/
  import/
  parser/
  url/
  search/
  sync/
  storage/
  task/
  ai/
```

P0 API：

```text
GET  /health
GET  /api/books
POST /api/books
GET  /api/books/:id
DELETE /api/books/:id
GET  /api/chapters
GET  /api/chapters/:id
POST /api/progress
GET  /api/progress
GET  /api/search
POST /api/url/parse
POST /api/url/import
POST /api/ai/summary
GET  /api/tasks
POST /api/tasks
POST /api/tasks/:id/cancel
GET  /api/sync/export
POST /api/sync/import
```

## 7. 数据存储方案

SQLite 表建议：

```text
books
chapters
chapter_blobs
reading_progress
reader_settings
bookmarks
ai_views
storage_objects
cache_entries
task_queue
search_index / FTS virtual tables
```

内容分层：

| 层级 | 数据 | 是否默认保存 |
|---|---|---:|
| L0 元数据 | 书名、作者、封面、目录、章节 hash、字数 | 是 |
| L1 用户资产 | 进度、设置、书签、修正、AI 索引 | 是 |
| L2 内容缓存 | 章节正文、净化正文、URL 抓取结果 | 条件保存 |
| L3 原始大文件 | TXT/EPUB/PDF/DOCX/MOBI/AZW3 原文件 | 默认不保存或用户选择 |

## 8. URL 解析技术方案

解析优先级：

```text
1. 普通 fetch + HTML 解析
2. Mozilla Readability 正文提取兜底
3. 小说结构启发式解析
4. 书源规则 / 站点适配器
5. 轻量 JS 执行方案，可选
6. Playwright 动态渲染，最后兜底
```

Playwright 不应作为 MVP 默认链路，只作为最后兜底，甚至可以先只预留接口。

## 9. PWA 与离线方案

| 能力 | MVP |
|---|---:|
| App Shell 缓存 | P0 |
| 静态资源缓存 | P0 |
| `/packages/*` ESM 模块缓存 | P0 |
| 书籍元数据离线 | P0 |
| 已读章节离线 | P0 |
| 上传文件 OPFS 保存 | P0/P1 |
| 离线打开书架 | P0 |
| 离线继续阅读 | P0 |
| 离线 URL 解析 | 不支持 |
| 离线 AI 生成 | 不支持，无缓存则提示 |

## 10. 开发切片建议

| Slice | 内容 |
|---|---|
| 0 | 工程骨架、shared-types、lint/test/build |
| 1 | 本地书架闭环、IndexedDB、书籍详情 |
| 2 | TXT/EPUB 导入解析、解析预览、手动修正 |
| 3 | 阅读器核心、目录、设置、进度、书签 |
| 4 | 本地 API、SQLite、BlobStorage、sync API |
| 5 | URL / 搜索 / AI / task_queue / worker |
| 6 | PWA / 离线 / 真机验证 |
