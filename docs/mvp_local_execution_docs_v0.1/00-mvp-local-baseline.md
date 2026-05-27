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
