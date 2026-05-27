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
