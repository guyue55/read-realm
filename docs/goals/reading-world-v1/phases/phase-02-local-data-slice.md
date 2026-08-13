# PHASE-02 本地数据安全纵向切片

- Goal ID：GOAL-READING-WORLD-V1
- 阶段 ID：PHASE-02
- 状态：执行中
- 阶段目标：建立本地数据权威契约、1 秒进度落盘、迁移前备份与失败回滚，放行 GATE-01 的数据骨架。
- 稳定输入：PHASE-01 当前事实源图、固定 TXT/EPUB、隔离 IndexedDB/OPFS/SQLite 样本、REV-0002、不可变 EVID-27/28/29。
- 依赖：PHASE-01 完成。
- 本阶段改动边界：shared-types、storage-core、阅读进度服务、数据库迁移与备份适配器、定向测试和最小 UI 状态。
- 本阶段不做：不做完整导出 UI、不做云同步、不重排书架和阅读器外观。
- 定向检查：REV-0001 的 EXP-01/02/03 与 EVID-27/28/29 只复算、不重跑。REV-0002 先以 `node scripts/verify-reading-world.mjs --phase 02 --qualification EXP-08 --output docs/goals/reading-world-v1/evidence/artifacts/gate-00-attempt-01.json` 执行 GATE-00；仅失败后按 EXP-12、EXP-13 生成 EVID-52/53。首个资格 ATTEMPT 通过后生成 EVID-45 FINAL，才允许按 EXP-09→10→11 执行 GATE-01 并生成 EVID-48/49/50。所有浏览器命令须精确 grep 单一实验并记录进程、端口、补偿前后状态与日志 SHA。
- 主线门禁：任何存储变更先生成可验证备份；失败不覆盖旧数据；保存失败必须显式可见。
- 活体验收：真实 TXT 从导入到阅读进度落盘，强制刷新/关闭后恢复；隔离迁移故障自动回滚并能打开旧数据。
- 失败处理：保留全部 ATTEMPT；GATE-00 与 GATE-01 在 REV-0002 内分别最多 3 个差异化实验，任一门第三次失败进入 BLOCKED_DESIGN_REVIEW_REQUIRED。资格门失败不计为产品门失败，产品门失败也不能倒改资格证据。
- 回滚方式：版本化 schema、迁移事务、旧数据只读副本与备份恢复；代码按独立切片反向提交。
- 人工检查点：确认备份、迁移失败和保存失败文案让非技术用户知道下一步。
- 阶段完成条件：`reports/phase-02-data-contract.md`、`reports/phase-02-local-data.json`、EVID-45、REV-0002 首个实际产品 ATTEMPT 与 `reviews/phase-02-gate-01.md` 可复算；只有 GATE-00 与 GATE-01 都通过并生成 EVID-17 后才放行 PHASE-03。
- 下一入口：PHASE-02 / TASK-0205；先实现和验证 GATE-00 检查器资格合同，不改产品机制、不重跑 GATE-01。资格门通过后才进入 TASK-0206 / EXP-09。

## 工作项
- TASK-0201：冻结 Book/Chapter/Progress/Bookmark/Settings/FileRef 与版本元数据的单一契约和适配器边界，写入 `reports/phase-02-data-contract.md`。
- TASK-0202：把阅读进度写入统一服务，实现操作后 1 秒内可靠落盘、幂等保存和失败状态。
- TASK-0203：建立迁移前备份、幂等迁移、故障注入回滚和上一稳定版兼容测试。
- TASK-0204：严格按 EXP-01→02→03 条件运行早期完整薄切片；每次写独立 ATTEMPT，审查写入 `reviews/phase-02-gate-01.md`，通过时生成 EVID-17 和阶段 JSON。
- TASK-0205：按 EXP-08→12→13 建立 GATE-00 验证基础设施资格门，验证唯一目标、进程与端口收束、PWA 补偿和证据可复算；不得修改产品机制。
- TASK-0206：仅在 EVID-45 通过后按 EXP-09→10→11 执行 REV-0002 的 GATE-01；不得覆盖或重新解释 REV-0001 ATTEMPT。

## 副作用与重放
| 任务 ID | 副作用 | 重放类别 | 核验或补偿 |
|---|---|---|---|
| TASK-0201 | 契约与源码写入 | replay_safe | 先运行复用扫描与契约测试，保持旧适配器兼容 |
| TASK-0202 | 本地数据写入 | verify_before_repeat | 仅用隔离数据库；重跑前核对进度版本和幂等键 |
| TASK-0203 | schema/迁移与备份写入 | compensate | 每次先备份并验证；失败恢复旧副本后才允许重试 |
| TASK-0204 | 隔离数据和证据写入 | verify_before_repeat | 先确认实验 ID、BASE 和上次 ATTEMPT，避免覆盖失败历史 |
| TASK-0205 | 进程、端口、生成目录和资格证据写入 | compensate | 运行前备份 public 并确认 3102 空闲；运行后强制核对端口、进程、Git blob、日志和 SHA |
| TASK-0206 | 隔离浏览器数据和新产品 ATTEMPT | verify_before_repeat | 先确认 EVID-45 FINAL、clean BASE 和 REV-0002 实验 ID；不得覆盖 EVID-27/28/29 |
