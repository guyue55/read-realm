# PHASE-02 本地数据安全纵向切片

- Goal ID：GOAL-READING-WORLD-V1
- 阶段 ID：PHASE-02
- 状态：BLOCKED_DESIGN_REVIEW_REQUIRED
- 阶段目标：建立本地数据权威契约、1 秒进度落盘、迁移前备份与失败回滚，放行 GATE-01 的数据骨架。
- 稳定输入：PHASE-01 当前事实源图、固定真实 TXT、隔离 IndexedDB/OPFS/SQLite 样本、REV-0001。
- 依赖：PHASE-01 完成。
- 本阶段改动边界：shared-types、storage-core、阅读进度服务、数据库迁移与备份适配器、定向测试和最小 UI 状态。
- 本阶段不做：不做完整导出 UI、不做云同步、不重排书架和阅读器外观。
- 定向检查：先运行 `node scripts/verify-reading-world.mjs --phase 02 --output docs/goals/reading-world-v1/reports/phase-02-local-data.json`；风险门按顺序运行同一检查器的 `--experiment EXP-01`、仅失败后 `--experiment EXP-02`、仅再次失败后 `--experiment EXP-03`，各自输出 EVID-27/28/29 指定路径；检查器内部使用 `corepack pnpm --filter web-pwa exec playwright test e2e/gate-01.spec.ts --grep EXP-0X` 并运行 storage/reader/API 迁移定向测试。
- 主线门禁：任何存储变更先生成可验证备份；失败不覆盖旧数据；保存失败必须显式可见。
- 活体验收：真实 TXT 从导入到阅读进度落盘，强制刷新/关闭后恢复；隔离迁移故障自动回滚并能打开旧数据。
- 失败处理：保留 ATTEMPT；同一 GATE-01 最多 3 个差异化实验，第三次失败进入 BLOCKED_DESIGN_REVIEW_REQUIRED。
- 回滚方式：版本化 schema、迁移事务、旧数据只读副本与备份恢复；代码按独立切片反向提交。
- 人工检查点：确认备份、迁移失败和保存失败文案让非技术用户知道下一步。
- 阶段完成条件：`reports/phase-02-data-contract.md`、`reports/phase-02-local-data.json`、首个实际执行的 `evidence/artifacts/gate-01-attempt-0X.json` 与 `reviews/phase-02-gate-01.md` 可复算；GATE-01 通过后 EVID-17 才放行 PHASE-03，失败则按 EXP-01→02→03 顺序且第三次自动熔断。
- 下一入口：暂停实现并请求用户批准新控制修订；只有新 REV 明确 GATE-01 的验证基础设施资格门、后续实验与历史 ATTEMPT 继承规则后才能恢复 PHASE-02，PHASE-03 仍不得开始。

## 工作项
- TASK-0201：冻结 Book/Chapter/Progress/Bookmark/Settings/FileRef 与版本元数据的单一契约和适配器边界，写入 `reports/phase-02-data-contract.md`。
- TASK-0202：把阅读进度写入统一服务，实现操作后 1 秒内可靠落盘、幂等保存和失败状态。
- TASK-0203：建立迁移前备份、幂等迁移、故障注入回滚和上一稳定版兼容测试。
- TASK-0204：严格按 EXP-01→02→03 条件运行早期完整薄切片；每次写独立 ATTEMPT，审查写入 `reviews/phase-02-gate-01.md`，通过时生成 EVID-17 和阶段 JSON。

## 副作用与重放
| 任务 ID | 副作用 | 重放类别 | 核验或补偿 |
|---|---|---|---|
| TASK-0201 | 契约与源码写入 | replay_safe | 先运行复用扫描与契约测试，保持旧适配器兼容 |
| TASK-0202 | 本地数据写入 | verify_before_repeat | 仅用隔离数据库；重跑前核对进度版本和幂等键 |
| TASK-0203 | schema/迁移与备份写入 | compensate | 每次先备份并验证；失败恢复旧副本后才允许重试 |
| TASK-0204 | 隔离数据和证据写入 | verify_before_repeat | 先确认实验 ID、BASE 和上次 ATTEMPT，避免覆盖失败历史 |
