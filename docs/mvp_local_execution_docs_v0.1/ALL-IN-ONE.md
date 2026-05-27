---

<!-- README.md -->

# MVP 本地版开发执行文档包 v0.1

本包用于正式开发前冻结 MVP 本地版的基准线、开发计划、Backlog 实施计划、工程规则、验收标准和风险决策记录。

## 文档清单

| 文件 | 用途 |
|---|---|
| `00-mvp-local-baseline.md` | MVP 本地版产品、技术、架构、范围基准线 |
| `01-development-plan.md` | 阶段计划、里程碑、交付节奏 |
| `02-backlog-implementation-plan.md` | Epic / Story / Task 实施拆分 |
| `backlog.csv` | 可导入项目管理工具的 Backlog 表 |
| `03-engineering-execution-rules.md` | 模块边界、依赖规则、代码治理 |
| `04-acceptance-and-test-plan.md` | 验收、测试、Fixtures、质量门禁 |
| `05-risk-and-decision-log.md` | 风险台账与关键决策记录 |
| `06-definition-of-ready-done.md` | DoR / DoD 标准 |
| `07-delivery-roadmap.md` | Alpha / Beta / MVP / P1 路线图 |

## 核心结论

MVP 本地版采用：

```text
前端：Next.js + React + TypeScript + PWA + IndexedDB / OPFS
后端：NestJS + TypeScript + SQLite + Drizzle + 本地文件存储
队列：SQLite task_queue + Local Worker
搜索：SQLite FTS5
架构：Repository / BlobStorage / CacheStore / TaskQueue / SearchIndex / AIProvider Adapter
```

第一阶段不追求功能堆满，而是把阅读核心、解析核心、数据模型、存储边界、任务状态机、错误处理、测试样本和扩展接口做稳。


---

<!-- 00-mvp-local-baseline.md -->

# 小说平台 MVP 本地版开发执行文档 v0.1

> 适用范围：Web/PWA 跨屏 MVP，本地轻量版后端。  
> 目标：先把“导入 → 解析 → 阅读 → 离线 → 续读”的核心闭环做稳，再扩展搜索、书源、AI、多端和云端能力。


## 1. 项目基准线

### 1.1 产品定位

项目定位为 **个人小说聚合阅读平台**，不是普通电子书阅读器，也不是内容商城。MVP 本地版聚焦：

- 本地 TXT / EPUB 导入。
- 自动目录与章节解析。
- 解析预览与手动修正。
- 舒适沉浸阅读。
- 阅读进度自动保存与恢复。
- IndexedDB / OPFS 离线缓存。
- URL 粘贴解析前端尝试、后端兜底。
- 当前章 AI 摘要作为衍生视图。

### 1.2 MVP 北极星

> 用户能否在 Web/PWA 中顺畅完成：**导入一本小说 → 自动解析章节 → 舒服阅读 → 下次准确续读**。

### 1.3 第一版成功标准

| 维度 | 成功标准 |
|---|---|
| 导入 | TXT / EPUB 可导入，失败可解释 |
| 解析 | 常见章节结构可识别，异常可预览与修正 |
| 阅读 | 手机与桌面默认排版舒适，阅读页低干扰 |
| 续读 | 刷新或重新打开后能恢复到接近原位置 |
| 离线 | 已缓存书籍与章节断网可读 |
| 工程 | 核心包边界清晰，后续可替换存储/队列/搜索实现 |

## 2. MVP 范围

### 2.1 P0 必做

| 模块 | P0 范围 |
|---|---|
| 书架 | 书籍列表、继续阅读、导入入口、最近阅读、来源标签、进度显示 |
| 导入 | TXT / EPUB 上传；URL 粘贴入口 |
| TXT 解析 | 编码识别、章节候选行评分、目录识别、正文切分、解析预览、手动修正 |
| EPUB 解析 | JSZip 解包、OPF/nav/NCX/spine 解析、章节 HTML 清理、统一 Chapter 模型 |
| 阅读器 | 滚动、分页、字号、行高、边距、主题、夜间、目录、进度、书签 |
| 离线 | Dexie / IndexedDB 保存元数据、章节、设置、进度；OPFS 保存原文件 |
| 后端本地版 | NestJS + SQLite + 本地文件存储 + SQLite task_queue + SQLite FTS5 |
| URL 解析 | 前端 Readability / 规则尝试，后端 fetch 代理兜底 |
| AI | 当前章摘要，AIView 缓存，不覆盖原文 |
| 测试 | TXT/EPUB fixtures、阅读进度、离线、解析失败状态 |

### 2.2 P1 延后

- 高亮、复杂批注、笔记导出。
- 书内全文搜索。
- 章节质量深度检测：缺章、重复章、断章、广告章、乱码。
- 前情提要、人物关系、术语设定。
- 账号登录与跨设备同步。
- 书源规则 v1。

### 2.3 暂不做

| 暂不做 | 原因 |
|---|---|
| 小程序、移动 App、Tauri 桌面端 | 先验证 Web/PWA 核心 |
| 完整书源市场 | 合规与维护风险高 |
| 多来源自动换源 | 先保证单来源解析稳定 |
| PDF 小说化 | PDF 固定版式可后续做，MVP 不强转小说 |
| DOCX/MOBI/AZW3 | 预留转换接口，暂不进入主链路 |
| 复杂云同步 | 本地轻量版先做协议与接口预留 |
| 默认云端保存全文 | 存储压力与隐私边界不合适 |

## 3. 技术基准线

### 3.1 前端

```text
Next.js App Router
React
TypeScript
Tailwind CSS
Radix UI / shadcn/ui
Dexie.js / IndexedDB
OPFS
Cache Storage
Service Worker / Workbox
epub.js / JSZip
Mozilla Readability
PDF.js，固定版式预留
Web Worker
```

### 3.2 后端 MVP 本地轻量版

```text
NestJS
TypeScript
SQLite
Drizzle ORM
Local File Storage
SQLite FTS5
SQLite task_queue
Local Worker
Zod
OpenAPI / Swagger
Playwright，可选
Calibre，可选
AIProvider Adapter
```

### 3.3 共享核心包

```text
shared-types
reader-core
parser-core
storage-core
sync-core
viewport-core
gesture-core
ui-reader
content-utils
rules-engine
ai-core
backend-contracts
```

## 4. 工程基准线

### 4.1 依赖方向

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

### 4.2 禁止依赖

```text
reader-core -> React / Dexie / API
parser-core -> UI
shared-types -> 任何实现
ui-reader -> SQLite / Drizzle / 后端细节
业务 service -> fs 直接写文件
业务 service -> sqlite 裸查询
```

## 5. 数据基准线

SQLite 第一版保留这些核心表：

```text
users, devices, sessions
book_instances, canonical_books, chapters, chapter_sources, chapter_quality
reading_progress, reader_settings, bookmarks, annotations
storage_objects, chapter_blobs, original_files
import_tasks, parse_tasks, sync_events, sync_cursors
ai_views, ai_tasks
search_providers, book_source_rules
cache_entries, task_queue
```

核心原则：

- BookInstance 与 CanonicalBook 分离。
- Chapter metadata 与 ChapterBlob 分离。
- 正文不直接进关系表，按 contentHash 指向本地 Blob。
- 原文件、章节正文、AI 长文本分目录存储。
- AI 结果按 `sourceHash + promptVersion + model` 去重。
- URL 缓存带 TTL。

## 6. UI 基准线

阅读 UI 必须保持：

```text
低存在感
低干扰
低疲劳
高可控
强恢复
```

移动端阅读点击区：

```text
左 25%：上一页 / 上一屏
中 50%：呼出菜单
右 25%：下一页 / 下一屏
```

底部菜单固定顺序：

```text
目录 / 进度 / 设置 / 夜间 / 书签 / 更多
```

桌面阅读正文不可铺满宽屏，单栏正文宽度控制在 680–820px，三栏工作区采用稳定固定比例。


---

<!-- 01-development-plan.md -->

# 小说平台 MVP 本地版开发执行文档 v0.1

> 适用范围：Web/PWA 跨屏 MVP，本地轻量版后端。  
> 目标：先把“导入 → 解析 → 阅读 → 离线 → 续读”的核心闭环做稳，再扩展搜索、书源、AI、多端和云端能力。


## 1. 开发阶段总览

| 阶段 | 周期建议 | 目标 | 可验收产物 |
|---|---:|---|---|
| Sprint 0 | 3–5 天 | 工程骨架与规则落地 | Monorepo、基础配置、SQLite 初始化、文档冻结 |
| Sprint 1 | 1 周 | shared-types + 前端本地书架 | 类型模型、Dexie schema、书架页、继续阅读卡 |
| Sprint 2 | 1–2 周 | TXT 导入解析闭环 | TXT 导入、编码识别、切章、解析预览 |
| Sprint 3 | 1 周 | 阅读器滚动模式 | ReaderEngine、目录、设置、进度保存 |
| Sprint 4 | 1 周 | EPUB 导入解析 | JSZip、OPF/nav/NCX、章节提取、统一模型 |
| Sprint 5 | 1 周 | 移动 Web/PWA 体验 | 点击区、底部菜单、设置 Sheet、Safe Area、PWA |
| Sprint 6 | 1 周 | 分页、书签、离线增强 | 分页模式、书签、OPFS、离线提示 |
| Sprint 7 | 1 周 | 本地后端与持久层 | NestJS、SQLite、Drizzle、Repository、Local FS |
| Sprint 8 | 1 周 | URL 解析兜底与任务队列 | URL fetch、Readability、task_queue、失败解释 |
| Sprint 9 | 1 周 | AI 当前章摘要与收口 | AIProvider、AIView、缓存、验收测试、发布候选 |

## 2. 里程碑

### M0：项目骨架完成

进入条件：MVP 范围和技术方案已冻结。  
完成标准：

- `pnpm dev` 可启动 Web 与 API。
- `pnpm test` 可运行基础测试。
- `data/app.sqlite` 可初始化。
- 依赖边界规则初步生效。
- README 和开发脚本齐全。

### M1：本地导入阅读闭环 Alpha

完成标准：

- 用户可上传 UTF-8 TXT。
- 系统可自动识别章节。
- 可进入阅读页滚动阅读。
- 可保存并恢复阅读进度。
- 可在书架看到导入书籍。

### M2：解析质量 Beta

完成标准：

- 支持 GBK / GB18030 / Big5 基础识别。
- 支持目录识别与跳过。
- 支持解析预览和章节标题修正。
- 支持 EPUB 元数据、目录、章节解析。
- 解析失败有明确原因。

### M3：Web/PWA 阅读体验 Beta

完成标准：

- 手机浏览器阅读可用。
- 桌面浏览器阅读可用。
- 支持滚动与分页。
- 设置面板可即时预览字号/行高/主题。
- 已缓存章节断网可读。

### M4：MVP 本地版发布候选

完成标准：

- NestJS + SQLite 本地后端可用。
- LocalFileBlobStorage、SqliteTaskQueue、SqliteFtsSearchIndex 可用。
- URL 解析兜底可用。
- 当前章 AI 摘要可用。
- 核心 E2E 通过。
- 文档、验收、风险记录同步更新。

## 3. 关键路径

```text
shared-types
  -> parser-core TXT
  -> import preview
  -> reader-core scroll
  -> progress persistence
  -> EPUB parser
  -> mobile reading interactions
  -> PWA offline
  -> backend SQLite persistence
  -> URL fallback
  -> AI summary
```

## 4. 并行策略

| 方向 | 可并行项 |
|---|---|
| 前端 | 书架、导入页、阅读器 UI、设置面板、目录抽屉 |
| 核心包 | shared-types、content-utils、parser-core、reader-core |
| 后端 | SQLite schema、Repository 接口、BlobStorage、TaskQueue |
| 测试 | fixtures、parser 单测、E2E 脚本、移动端验收 |
| 设计 | 阅读页状态、导入预览、异常状态、移动端安全区 |

## 5. 迭代规则

- 每个 Sprint 必须有可运行版本。
- 每个 Story 必须有 DoR / DoD。
- 新需求进入 Backlog，不直接插入当前 Sprint。
- 与阅读核心、数据模型、存储边界相关的变更必须写 ADR。
- 每个 Sprint 结束必须更新风险台账与验收结果。


---

<!-- 02-backlog-implementation-plan.md -->

# 小说平台 MVP 本地版开发执行文档 v0.1

> 适用范围：Web/PWA 跨屏 MVP，本地轻量版后端。  
> 目标：先把“导入 → 解析 → 阅读 → 离线 → 续读”的核心闭环做稳，再扩展搜索、书源、AI、多端和云端能力。


## 1. Backlog 层级

```text
Epic
  -> Story
      -> Task
          -> Acceptance Criteria
```

优先级定义：

| 优先级 | 含义 |
|---|---|
| P0 | MVP 必须完成，否则不能发布 |
| P1 | MVP 后首批增强，可进入 Beta 后补 |
| P2 | 长期能力，暂不进入开发主线 |

## 2. Epic 规划

| Epic | 名称 | 目标 |
|---|---|---|
| E00 | 工程骨架 | Monorepo、基础工具链、本地环境 |
| E01 | 共享类型与数据模型 | Book/Chapter/Progress/Settings 等稳定模型 |
| E02 | 前端本地书架 | 书架、继续阅读、本地持久化 |
| E03 | TXT 导入解析 | 上传、编码、章节识别、解析预览 |
| E04 | EPUB 导入解析 | OPF/nav/NCX/spine、章节 HTML |
| E05 | 阅读器核心 | 滚动、分页、目录、进度锚点 |
| E06 | 阅读 UI 与移动适配 | 点击区、底部菜单、设置 Sheet、Safe Area |
| E07 | PWA 与离线 | Service Worker、Cache Storage、OPFS |
| E08 | 本地后端 | NestJS、SQLite、Drizzle、Repository |
| E09 | 本地存储与任务 | Local FS、CacheStore、TaskQueue、FTS5 |
| E10 | URL 阅读兜底 | 前端尝试、后端代理、质量评分 |
| E11 | AI 当前章摘要 | AIProvider、AIView、缓存 |
| E12 | 测试验收与发布 | Fixtures、E2E、性能、发布候选 |

## 3. Epic 详情

### E00 工程骨架

**目标**：建立可持续开发的工程基础。

Story：

- E00-S01 初始化 pnpm workspace + Turborepo。
- E00-S02 创建 apps/web-pwa、apps/api、apps/worker。
- E00-S03 创建 packages 目录与基础 tsconfig。
- E00-S04 配置 ESLint、Prettier、Vitest、Playwright。
- E00-S05 准备 data/storage 目录与 SQLite 初始化脚本。

验收：

- `pnpm dev` 可启动。
- `pnpm lint`、`pnpm test` 可运行。
- 目录结构符合架构文档。

### E01 共享类型与数据模型

Story：

- E01-S01 定义 Book、Chapter、ChapterMeta。
- E01-S02 定义 ReadingProgress、ReadingLocation、ReaderSettings。
- E01-S03 定义 ImportTask、ImportStage、ImportEvent。
- E01-S04 定义 AIView、Bookmark、ChapterQuality。
- E01-S05 定义错误码 AppErrorCode。

验收：

- 类型不依赖任何实现。
- 所有 app 和 package 均从 shared-types 引用。

### E03 TXT 导入解析

Story：

- E03-S01 文件读取与分片。
- E03-S02 编码识别与解码。
- E03-S03 章节候选行评分。
- E03-S04 目录识别与跳过。
- E03-S05 正文切章与质量评分。
- E03-S06 解析预览与手动修正。
- E03-S07 Web Worker 防阻塞。

验收：

- UTF-8、GBK、GB18030、Big5 样例可解析。
- 无章节样例可作为纯文本阅读。
- 章节异常有提示。

### E05 阅读器核心

Story：

- E05-S01 ReaderEngine 接口。
- E05-S02 ChapterRepository / ProgressRepository 抽象。
- E05-S03 滚动阅读。
- E05-S04 进度锚点保存。
- E05-S05 位置恢复。
- E05-S06 目录跳转与回退。
- E05-S07 分页模式。

验收：

- 不依赖 React、Dexie、API。
- 刷新后恢复到上次章节和接近位置。
- 改字号后不使用页码作为真实锚点。

### E08 本地后端

Story：

- E08-S01 NestJS 模块骨架。
- E08-S02 SQLite + Drizzle 初始化。
- E08-S03 Repository 接口与 SQLite 实现。
- E08-S04 API DTO + Zod 校验。
- E08-S05 OpenAPI 文档。

验收：

- 业务 service 不直接裸查 SQLite。
- 数据表支持书架、章节、进度、设置、任务。

## 4. Backlog CSV 字段说明

`backlog.csv` 字段：

```text
ID,Epic,Story,Task,Priority,Sprint,Estimate,Dependencies,AcceptanceCriteria,Status
```

状态：

```text
Ready / In Progress / Blocked / Done / Deferred
```


---

<!-- 03-engineering-execution-rules.md -->

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


---

<!-- 04-acceptance-and-test-plan.md -->

# 小说平台 MVP 本地版开发执行文档 v0.1

> 适用范围：Web/PWA 跨屏 MVP，本地轻量版后端。  
> 目标：先把“导入 → 解析 → 阅读 → 离线 → 续读”的核心闭环做稳，再扩展搜索、书源、AI、多端和云端能力。


## 1. 测试策略

| 层级 | 工具 | 覆盖 |
|---|---|---|
| 单元测试 | Vitest | parser-core、reader-core、content-utils、sync-core |
| 组件测试 | Testing Library | 书架、导入、目录、设置面板 |
| E2E | Playwright | 上传、解析、阅读、离线、进度恢复 |
| API 测试 | Supertest | NestJS API |
| SQLite 测试 | 临时 SQLite | migration、repository、task_queue |
| IndexedDB 测试 | fake-indexeddb | storage-core、Dexie schema migration |
| Worker 测试 | Vitest | parser worker、task processor |
| 性能测试 | benchmark | 大 TXT、章节切分、分页计算 |

## 2. Fixtures 清单

### TXT

```text
fixtures/books/txt/
  utf8-normal.txt
  gbk-normal.txt
  gb18030-normal.txt
  big5-normal.txt
  no-chapter.txt
  bad-chapter-title.txt
  duplicated-chapters.txt
  missing-chapter.txt
  ad-polluted.txt
  huge-book.txt
  table-of-contents-front.txt
```

### EPUB

```text
fixtures/books/epub/
  nav-normal.epub
  ncx-only.epub
  no-cover.epub
  malformed-nav.epub
  image-heavy.epub
  css-complex.epub
```

### HTML / URL

```text
fixtures/html/
  detail-page.html
  toc-page.html
  chapter-page.html
  paginated-chapter.html
  ad-polluted.html
  dynamic-placeholder.html
  wrong-encoding.html
```

## 3. MVP 功能验收

### 3.1 导入解析

| 项 | 验收标准 |
|---|---|
| UTF-8 TXT | 成功导入并识别章节 |
| GBK TXT | 编码可识别或提供手动选择 |
| GB18030 / Big5 | 基础可识别或可解释失败 |
| 无章节 TXT | 可作为纯文本书籍导入 |
| 目录页 | 能识别并跳过前置目录 |
| 重复章节 | 有重复提示 |
| 广告水印 | 有清理或异常提示 |
| 超大文件 | 解析不阻塞主线程 |
| EPUB | 能读取元数据、目录和章节 |
| 解析失败 | 显示具体错误和下一步操作 |

### 3.2 阅读器

| 项 | 验收标准 |
|---|---|
| 默认排版 | 手机与桌面打开即舒适 |
| 字号/行高 | 调整即时生效 |
| 主题/夜间 | 切换不刺眼、不闪屏 |
| 滚动模式 | 阅读流畅，进度保存 |
| 分页模式 | 可翻页，进度不依赖页码 |
| 目录 | 打开自动定位当前章 |
| 书签 | 可添加、取消、恢复 |
| 刷新恢复 | 重新打开回到上次章节和接近位置 |
| 离线 | 已缓存章节断网可读 |

### 3.3 移动 Web/PWA

| 项 | 验收标准 |
|---|---|
| 点击区 | 左/中/右行为稳定 |
| 底部菜单 | 不遮挡 Home Indicator |
| 设置 Sheet | 半屏弹出，第一屏有字号/行高/主题 |
| Safe Area | 刘海屏和底部安全区适配 |
| 软键盘 | 搜索/输入不破坏阅读布局 |
| PWA | 可安装，离线可打开 App Shell |

### 3.4 后端本地版

| 项 | 验收标准 |
|---|---|
| SQLite | migration 可重复执行 |
| Repository | 业务层不直接裸查 SQLite |
| LocalFileBlobStorage | 可写入/读取章节和原文件 |
| TaskQueue | 可入队、加锁、重试、失败记录 |
| FTS5 | 可搜索书名、作者、章节标题 |
| URL 代理 | CORS 场景可兜底，失败可解释 |
| AI 摘要 | 生成 AIView，不覆盖原文，重复请求可缓存 |

## 4. E2E 核心用例

1. 上传 UTF-8 TXT → 解析 → 预览 → 加入书架 → 阅读 → 刷新恢复。
2. 上传 GBK TXT → 编码识别 → 成功切章。
3. 上传 EPUB → 目录正确 → 阅读第一章。
4. 手机尺寸阅读 → 点击右侧翻页 → 中央呼出菜单 → 打开设置。
5. 修改字号 → 关闭设置 → 阅读位置尽量保持。
6. 断网 → 已缓存章节可读 → 未缓存章节有提示。
7. 粘贴 URL → 前端失败 → 后端兜底 → 解析结果预览。
8. 当前章 AI 摘要 → 重复点击复用缓存。

## 5. 发布门禁

MVP 发布候选必须满足：

```text
[ ] P0 Story 全部 Done
[ ] 核心 E2E 全部通过
[ ] 解析 fixtures 通过率达到发布标准
[ ] 阅读进度恢复通过移动端和桌面端测试
[ ] 离线测试通过
[ ] 错误状态均有可理解提示
[ ] 无严重布局错乱
[ ] 核心包依赖边界检查通过
[ ] 风险台账已更新
```


---

<!-- 05-risk-and-decision-log.md -->

# 小说平台 MVP 本地版开发执行文档 v0.1

> 适用范围：Web/PWA 跨屏 MVP，本地轻量版后端。  
> 目标：先把“导入 → 解析 → 阅读 → 离线 → 续读”的核心闭环做稳，再扩展搜索、书源、AI、多端和云端能力。


## 1. 风险台账

| ID | 风险 | 等级 | 影响 | 应对 | 状态 |
|---|---|---:|---|---|---|
| R01 | TXT 章节识别不稳定 | 高 | 导入体验差 | 候选行评分、fixtures、手动修正 | Open |
| R02 | 编码识别失败 | 高 | 乱码、解析失败 | 自动识别 + 手动编码选择 | Open |
| R03 | 阅读进度漂移 | 高 | 用户失去信任 | 不存页码，存章节/offset/anchor/percentage | Open |
| R04 | 移动 Web 操作不自然 | 高 | MVP 体验失败 | Mobile-first、点击区、底部菜单、Safe Area | Open |
| R05 | 桌面宽屏正文过长 | 中 | 长时间阅读疲劳 | max-width、稳定三栏布局 | Open |
| R06 | URL 解析失败率高 | 高 | 链接阅读不可用 | 前端尝试 + 后端代理 + 失败解释 | Open |
| R07 | CORS/反爬阻塞 | 中高 | URL 兜底受限 | 限流、Playwright 可选、用户提示 | Open |
| R08 | SQLite 任务锁异常 | 中 | 任务重复/丢失 | locked_by/locked_until/幂等 ID | Open |
| R09 | 本地存储膨胀 | 中 | 用户磁盘占用高 | TTL、清理、refCount、缓存管理 | Open |
| R10 | AI 成本不可控 | 中 | 调用成本增加 | 用户触发、缓存、限流、可关闭 | Open |
| R11 | 合规边界不清 | 高 | 内容风险 | 不内置高风险源、用户主动导入、缓存可清理 | Open |
| R12 | 架构耦合失控 | 高 | 后续难扩展 | 依赖边界、Adapter、ADR、lint | Open |
| R13 | 测试样本不足 | 高 | 回归频繁 | fixtures 库、E2E、解析单测 | Open |

## 2. 决策记录

### D01：首发 Web/PWA 跨屏 MVP

- 决策：第一阶段覆盖桌面浏览器、手机浏览器、可安装 PWA。
- 原因：手机浏览器是 MVP 主范围，不应等到 App 阶段补齐阅读体验。
- 后果：前端必须 mobile-first，触控、Safe Area、离线从第一版进入 P0。

### D02：MVP 后端采用本地轻量版

- 决策：SQLite + 本地文件存储 + SQLite task_queue + SQLite FTS5。
- 原因：降低开发和部署复杂度，更适合本地版/第一版。
- 后果：所有基础设施必须抽象，后续可替换为 PostgreSQL / Redis / BullMQ / S3。

### D03：核心阅读能力沉淀为 package

- 决策：reader-core、parser-core、storage-core、sync-core 等独立包。
- 原因：后续小程序、移动 App、桌面端需要复用核心能力。
- 后果：严格限制依赖方向，禁止 reader-core 依赖 UI 或存储实现。

### D04：TXT/EPUB 前端优先解析

- 决策：上传文件优先在浏览器本地解析。
- 原因：隐私更好、响应更快、降低后端压力。
- 后果：需要 Web Worker、IndexedDB/OPFS、解析进度与失败恢复。

### D05：页码不作为真实进度

- 决策：保存 chapterId、offset、anchor、percentage。
- 原因：字号、行高、边距、屏幕尺寸会导致页码变化。
- 后果：分页页码仅作为展示层。

### D06：AI 作为衍生视图

- 决策：AI 摘要、前情、人物关系全部存为 AIView。
- 原因：不得覆盖原文，便于缓存、版本化、删除。
- 后果：AIView 带 sourceHash、promptVersion、model、contentHash。

### D07：搜索/书源 Provider 化

- 决策：搜索引擎、书源规则、免费接口都通过 SearchProvider 接入。
- 原因：避免硬编码来源，降低维护和合规风险。
- 后果：默认不内置高风险来源，后续支持用户导入规则。


---

<!-- 06-definition-of-ready-done.md -->

# 小说平台 MVP 本地版开发执行文档 v0.1

> 适用范围：Web/PWA 跨屏 MVP，本地轻量版后端。  
> 目标：先把“导入 → 解析 → 阅读 → 离线 → 续读”的核心闭环做稳，再扩展搜索、书源、AI、多端和云端能力。


## 1. Definition of Ready

Story 进入开发前必须满足：

```text
[ ] 目标明确，属于已冻结范围或已进入 Backlog
[ ] 有用户场景或技术场景说明
[ ] 有输入/输出定义
[ ] 有验收标准
[ ] 依赖已明确
[ ] 涉及数据模型时已更新 shared-types 或 schema 草案
[ ] 涉及 UI 时已有线框、状态或组件说明
[ ] 涉及解析时已有 fixture 或待补 fixture
[ ] 涉及架构边界时已确认依赖方向
```

## 2. Definition of Done

Story 完成必须满足：

```text
[ ] 功能可运行
[ ] 验收标准全部通过
[ ] 错误状态已处理
[ ] 单元测试或组件测试已补充
[ ] 涉及核心流程时已补 E2E 或手工验收记录
[ ] 依赖边界未破坏
[ ] 文档或注释已更新
[ ] 无明显性能退化
[ ] 无严重 UI 错乱
[ ] 相关风险已更新状态
```

## 3. P0 Story 额外 Done 标准

```text
[ ] 具备至少一个正向用例和一个失败用例
[ ] 失败原因对用户可解释
[ ] 不阻塞主线程或有明确进度提示
[ ] 数据可恢复或可重试
[ ] 移动端与桌面端均检查
```

## 4. 发布 Done 标准

```text
[ ] 所有 P0 Story Done
[ ] 核心 E2E 通过
[ ] fixtures 解析结果达到发布标准
[ ] 文档包更新
[ ] 风险台账更新
[ ] 版本号与变更记录完成
[ ] 可从空数据目录启动
[ ] 可清理缓存和本地存储
```


---

<!-- 07-delivery-roadmap.md -->

# 小说平台 MVP 本地版开发执行文档 v0.1

> 适用范围：Web/PWA 跨屏 MVP，本地轻量版后端。  
> 目标：先把“导入 → 解析 → 阅读 → 离线 → 续读”的核心闭环做稳，再扩展搜索、书源、AI、多端和云端能力。


## 1. 发布路线

| 版本 | 定位 | 核心范围 |
|---|---|---|
| Alpha 0.1 | 本地导入阅读闭环 | TXT 导入、切章、书架、滚动阅读、进度 |
| Alpha 0.2 | 解析能力增强 | 编码识别、目录跳过、解析预览、手动修正 |
| Beta 0.3 | EPUB 与阅读体验 | EPUB、设置、目录、夜间、移动阅读 |
| Beta 0.4 | PWA 与离线 | OPFS、Service Worker、离线提示、分页、书签 |
| RC 0.5 | 本地后端 | SQLite、Local FS、TaskQueue、FTS5 |
| MVP 1.0 | 可发布本地版 | URL 兜底、AI 摘要、验收测试、文档齐全 |

## 2. MVP 后路线

### P1：阅读增强

- 高亮、笔记、导出。
- 书内全文搜索。
- 章节质量检测。
- 前情提要、人物关系、术语表。
- 账号与轻同步。

### P2：聚合能力

- 书源规则 v1。
- 免费搜索发现。
- 单章补源与换源。
- 批量缓存与更新检测。

### P3：多端扩展

- 小程序轻端：书架、继续阅读、轻阅读、同步入口。
- Capacitor 移动 App：文件关联、系统 TTS、音量键翻页、屏幕常亮。
- Tauri 桌面端：本地书库扫描、批量导入、三栏阅读、格式转换辅助。

## 3. 里程碑验收会议建议

每个里程碑至少检查：

```text
1. 功能是否达到当前版本目标
2. 是否破坏架构边界
3. 是否有新增高风险
4. 是否需要更新 Backlog 优先级
5. 是否有用户体验问题需要前置修复
```
