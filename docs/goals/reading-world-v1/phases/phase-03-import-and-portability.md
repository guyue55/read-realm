# PHASE-03 导入解析与数据可携带性

- Goal ID：GOAL-READING-WORLD-V1
- 阶段 ID：PHASE-03
- 状态：执行中
- 阶段目标：让大文件导入、解析预览、任务恢复、完整备份恢复和人读导出成为稳定正式能力。
- 稳定输入：PHASE-02 数据契约与迁移门、合法 TXT/EPUB/文件夹/URL fixtures、容量压力样本。
- 依赖：PHASE-02 完成且 RISK-03 通过。
- 本阶段改动边界：parser/content-utils、导入领域服务与 Worker、备份/恢复服务、导入与数据管理 UI、Provider 边界测试。
- 本阶段不做：不内置第三方盗版书源、不绕过访问限制、不做多来源自动换源、不做 PDF/MOBI/AZW3 主链路。
- 定向检查：`node scripts/verify-reading-world.mjs --phase 03 --output docs/goals/reading-world-v1/reports/phase-03-import-portability.json`，内部运行 parser/content-utils 测试、容量/目录/故障注入、`e2e/durable-import.spec.ts`、`e2e/backup-restore.spec.ts`、备份 schema 校验和固定哈希/计数对账。
- 主线门禁：解析不阻塞主线程；失败保留原文件和草稿；恢复前预览影响，恢复后逐项校验且不污染原库。
- 活体验收：真实大文件导入并中断恢复；完整包导出后在隔离环境执行合并和副本恢复；打开 Markdown/JSON 导出人工检查。
- 失败处理：容量不足、权限丢失、解析异常、URL 拒绝和恢复冲突均提供可执行下一步；数据不一致立即回滚。
- 回滚方式：导入任务草稿和原文件不删除；备份格式版本化；恢复在事务/临时库验证后切换。
- 人工检查点：导入预览、错误、恢复影响和导出内容清楚且不使用模糊隐喻。
- 阶段完成条件：`reports/phase-03-import-portability.json`、`reports/backup-format-v1.md`、`reviews/phase-03-data-portability.md` 和 EVID-03/04/05/16 候选产物均可复算；这里扩展 GATE-01 覆盖但不改写 PHASE-02 的放行历史。
- 下一入口：PHASE-04 / TASK-0401 抽离阅读会话领域服务。

## 工作项
- TASK-0301：统一 TXT/EPUB/文件夹/合法 URL 导入状态机、Worker 流式处理、取消/重试与草稿恢复。
- TASK-0302：建立带 manifest、版本、校验清单和公开 schema 的完整备份包及预览恢复流程，契约写入 `reports/backup-format-v1.md`。
- TASK-0303：实现合并/副本恢复、逐项校验、书签笔记 Markdown/JSON 导出和失败回滚。
- TASK-0304：落实 Provider 合规边界、手动刷新和可关闭定时检查，完成容量与活体回放，审查写入 `reviews/phase-03-data-portability.md`。

## 副作用与重放
| 任务 ID | 副作用 | 重放类别 | 核验或补偿 |
|---|---|---|---|
| TASK-0301 | 临时文件、浏览器数据和导入任务 | verify_before_repeat | 重跑前核对任务状态并清理隔离临时目录，不删除原输入 |
| TASK-0302 | 备份文件生成 | replay_safe | 使用内容寻址文件名或新目录，校验 manifest 后替换候选 |
| TASK-0303 | 恢复写入 | compensate | 只向隔离临时库恢复，校验通过后原子切换；失败删除临时库 |
| TASK-0304 | 可选网络读取和定时状态 | human_required | 外部 URL 测试需合法固定来源；不得绕过限制，定时器先显式启用 |
