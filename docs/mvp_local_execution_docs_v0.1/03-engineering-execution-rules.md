# 小说平台 MVP 本地版开发执行文档 v0.1

> 适用范围：Web/PWA 跨屏 MVP，本地轻量版后端。  
> 目标：先把“导入 → 解析 → 阅读 → 离线 → 续读”的核心闭环做稳，再扩展搜索、书源、AI、多端和云端能力。


## 1. 一级工程原则

本项目的工程目标不是“快速堆出页面”，而是建立可长期扩展的阅读平台基础。所有开发必须遵守：

```text
高内聚
低耦合
模块化
稳定健壮
可测试
可替换
可扩展
```

## 2. 模块职责

| 模块 | 负责 | 不负责 |
|---|---|---|
| shared-types | 统一类型、DTO、错误码 | 任何实现逻辑 |
| reader-core | 阅读位置、滚动/分页、目录、进度 | React、Dexie、API |
| parser-core | TXT/EPUB/HTML/URL 解析为统一结构 | Toast、UI、数据库 |
| storage-core | IndexedDB/OPFS/Cache Storage 抽象 | 业务决策 |
| sync-core | 同步协议、冲突、manifest | 阅读渲染 |
| viewport-core | 断点、安全区、设备能力 | 内容数据 |
| gesture-core | 点击区、滑动、长按、防误触 | 章节加载 |
| ui-reader | 阅读 UI 组件 | SQLite、Drizzle、后端细节 |
| content-utils | hash、normalize、clean、quality | 用户/书架业务 |
| rules-engine | SearchProvider、BookSourceRule | 固定来源硬编码 |
| ai-core | AIView、prompt version、cache key | 修改原文 |

## 3. 基础设施抽象

MVP 使用本地轻量实现，但业务层只能依赖接口：

| 抽象 | MVP 实现 | 后续替换 |
|---|---|---|
| BookRepository | SqliteBookRepository | PostgresBookRepository |
| ChapterRepository | SqliteChapterRepository | PostgresChapterRepository |
| BlobStorage | LocalFileBlobStorage | S3/R2/MinIO/OSS |
| CacheStore | Memory + SQLite | Redis |
| TaskQueue | SQLite task_queue | BullMQ |
| SearchIndex | SQLite FTS5 | Meilisearch/OpenSearch |
| AIProvider | OpenAI-compatible adapter | 多模型网关/本地模型 |
| UrlFetchProvider | Local fetch / Playwright | 分布式抓取服务 |

## 4. 状态机规则

导入、URL 解析、任务队列、AI 都必须状态机化。

### ImportStage

```ts
type ImportStage =
  | 'idle'
  | 'selecting'
  | 'readingFile'
  | 'detectingEncoding'
  | 'parsingMetadata'
  | 'detectingChapters'
  | 'cleaningContent'
  | 'buildingIndex'
  | 'preview'
  | 'saved'
  | 'failed'
  | 'cancelled'
```

### TaskStatus

```ts
type TaskStatus =
  | 'pending'
  | 'running'
  | 'succeeded'
  | 'failed'
  | 'cancelled'
  | 'retrying'
```

## 5. 错误处理规则

错误必须分类，不允许统一展示“失败”。

```ts
type AppErrorCode =
  | 'FILE_TOO_LARGE'
  | 'UNSUPPORTED_FORMAT'
  | 'ENCODING_DETECT_FAILED'
  | 'CHAPTER_PARSE_FAILED'
  | 'EPUB_PARSE_FAILED'
  | 'URL_CORS_BLOCKED'
  | 'URL_DYNAMIC_RENDER_REQUIRED'
  | 'SOURCE_RATE_LIMITED'
  | 'AI_QUOTA_EXCEEDED'
  | 'SYNC_CONFLICT'
  | 'STORAGE_QUOTA_EXCEEDED'
  | 'NETWORK_OFFLINE'
  | 'TASK_TIMEOUT'
  | 'TASK_CANCELLED'
```

## 6. 代码组织规则

前端 feature-first：

```text
apps/web-pwa/src/features/
  library/
  import/
  reader/
  settings/
  search/
  ai/
  sync/
```

后端 module-first：

```text
apps/api/src/modules/book/
  book.controller.ts
  book.service.ts
  book.repository.ts
  book.schema.ts
  book.policy.ts
```

## 7. 禁止事项

- 禁止 `reader-core` import React。
- 禁止 `parser-core` 调用 Toast 或 UI 状态。
- 禁止业务层直接写 `fs`。
- 禁止 Controller 直接调用 Drizzle 查询。
- 禁止把分页页码作为真实进度锚点。
- 禁止 AI 结果覆盖原文。
- 禁止把某个搜索源硬编码进主流程。
- 禁止默认同步或保存所有正文。

## 8. 必须事项

- 所有外部输入必须运行时校验。
- 所有长任务必须可取消、可重试、可恢复。
- 所有 Adapter 必须有 mock 或 test implementation。
- 所有核心解析规则必须有 fixtures。
- 所有阅读进度逻辑必须有回归测试。
