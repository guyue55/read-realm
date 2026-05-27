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
