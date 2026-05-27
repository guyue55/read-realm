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
