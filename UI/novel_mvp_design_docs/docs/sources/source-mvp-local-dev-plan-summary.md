已基于现有设计、PRD、技术方案和项目启动包，整理成一套 **MVP 本地版开发执行文档 v0.1**。

依据的核心基线是：启动包已确认项目方向为“个人小说聚合阅读平台、Web/PWA 跨屏 MVP、MVP 本地轻量版后端、前端优先解析 + 后端兜底、模块化/高内聚低耦合、SQLite + 本地文件存储可替换架构”；开发前准备也要求先冻结 MVP 范围、文档体系、数据模型、状态机、UI 规范、fixtures、工程骨架和验收标准；技术方案则明确本地轻量版采用 Web/PWA + NestJS + SQLite + 本地文件存储 + SQLite task queue + SQLite FTS5，并通过 Adapter 保持后续可替换。

## 已输出文档

压缩包内包含：

1. `00-mvp-local-baseline.md`：MVP 本地版基准线  
2. `01-development-plan.md`：开发计划与里程碑  
3. `02-backlog-implementation-plan.md`：Backlog 实施计划  
4. `backlog.csv`：可导入项目管理工具的任务表  
5. `03-engineering-execution-rules.md`：工程执行规则  
6. `04-acceptance-and-test-plan.md`：验收与测试计划  
7. `05-risk-and-decision-log.md`：风险与决策记录  
8. `06-definition-of-ready-done.md`：DoR / DoD 规范  
9. `README.md`：文档包说明  

## 下载

- [下载完整文档包 ZIP](sandbox:/mnt/data/novel_mvp_local_execution_docs_v0.1.zip)
- [查看合并版 Markdown](sandbox:/mnt/data/novel_mvp_local_execution_docs_v0.1.md)
- [查看生成清单 JSON](sandbox:/mnt/data/novel_mvp_local_execution_docs_manifest.json)
