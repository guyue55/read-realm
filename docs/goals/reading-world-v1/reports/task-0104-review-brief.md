# TASK-0104 独立只读复审包

- Goal：GOAL-READING-WORLD-V1
- 控制修订：REV-0001
- 任务：独立复核 PHASE-01 的事实覆盖、证据新鲜度、范围门和阶段放行结论。
- BASE：`c900af34e81d5b09319498f57953bf2c0205c02c`
- 审查输入：
  - `docs/goals/reading-world-v1/goal-master.md`
  - `docs/goals/reading-world-v1/phases/phase-01-truth-audit.md`
  - `docs/goals/reading-world-v1/reports/phase-01-architecture.md`，SHA-256 `05443b375fe182a79d6d5175338cc65011ee8049b793a40adb466be82bc2813c`
  - `docs/goals/reading-world-v1/reports/phase-01-capability-matrix.md`，SHA-256 `b52afb14b277bfcfced26f1221aa9e32672c46259848e3ec7750885876f5020a`
  - `docs/goals/reading-world-v1/reports/phase-01-baseline.json`，SHA-256 `1ea3a8b4e9e14dfa0527641e6ecb115e0abfb1995d957c8434b97e45f2253a17`
  - `scripts/verify-reading-world.mjs`，SHA-256 `e24bf54c2f1a484a01772d4ebd8ccc924ddec20cc0dd5a8422997329dbf8577b`
- 可改范围：只允许创建或更新 `docs/goals/reading-world-v1/reviews/phase-01-readiness.md`。
- 明确不做：不改源码、检查器、报告、总控、阶段计划、证据索引或执行账本；不安装依赖；不清理/覆盖隔离数据；不提交 Git。
- 必须抽查：报告中的架构事实是否由源码支持；全部 DEC/REQ/RISK/NREQ 是否有落点；旧报告是否被误继承；原生壳是否被误算；最终 baseline 的六项退出码、工作树变更检测、历史失败归档是否真实；PHASE-01 是否可在不声称 GATE-01 通过的前提下完成。总控处于 `执行中` 时，结构复核必须使用 `check_long_goal_pack.py --mode resume`；`--mode ready` 只用于历史铸造交接，不得作为执行期状态门。
- 输出：在指定 review 文件中给出 `READY`、`READY_WITH_CONCERNS` 或 `NOT_READY`，列出阻塞项、重要问题、抽查命令与退出码、输入 SHA 对账和下一入口建议。
- 收束：最多一个审查批次；若输入 SHA 已变化，返回 `NEEDS_CONTEXT`，不要基于旧输入出结论。
