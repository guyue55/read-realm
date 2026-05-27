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
