# PHASE-09 生产级候选与终局封账

- Goal ID：GOAL-READING-WORLD-V1
- 阶段 ID：PHASE-09
- 状态：就绪待执行
- 阶段目标：冻结完整实现，按 A（实现）-> B（FINAL 证据）-> C（总控与账本）形成可独立复算的 Goal complete 候选。
- 稳定输入：PHASE-01 至 08 全部完成、GATE-01/GATE-02 通过、无阻断残余风险、人工体验通过。
- 依赖：PHASE-08 完成。
- 本阶段改动边界：收敛实现、终局报告/证据/reviews、总控与账本；严格遵守 A/B/C 路径白名单。
- 本阶段不做：不新增功能、不部署、不推送镜像、不删除用户数据、不修改完成定义或压低门禁。
- 定向检查：`node scripts/verify-reading-world.mjs --phase 09 --output docs/goals/reading-world-v1/reports/final-verification.json`，再运行 `python3 "${GUYUE_ROOT:?请设置 GUYUE_ROOT}/scripts/check_long_goal_pack.py" --repo-root . --mode complete docs/goals/reading-world-v1/goal-master.md`；`GUYUE_ROOT` 必须指向通过 doctor 的 guyue 安装目录，证据 SHA-256、完整 A/B object ID 与承诺双向对账。
- 主线门禁：所有阶段完成；每项承诺有 clean@A 的新鲜 FINAL；B 只含 evidence/reports/reviews；C 只含总控和账本。
- 活体验收：从 clean@A fresh build 和隔离数据完整重放两个风险门、正式核心旅程、浏览器矩阵和 Docker 备份恢复。
- 失败处理：任何失败退回对应阶段，不创建伪 B/C；B 后证据若变化则整段封账失效并重新从新 A 开始。
- 回滚方式：A/B/C 直接父子链可审计；不得 reset 或改写用户历史，失败以新提交修复并重建候选。
- 人工检查点：用户最终体验验收；任何公开发布、远端推送、部署或真实数据破坏另取 ACT 授权。
- 阶段完成条件：`reports/final-verification.json`、`reviews/final-independent-review.md`、全部 EVID FINAL 与 A/B/C 封账完成；`check_long_goal_pack.py --mode complete`、安全扫描和人工体验通过，工作树 clean。
- 下一入口：无；仅在完成检查全部通过后调用 Goal complete。

## 工作项
- TASK-0901：冻结实现与阶段状态，运行实现门禁并创建只含实现及完成阶段文件的提交 A。
- TASK-0902：从 clean@A 重建、回放、生成并复算全部 FINAL 证据，创建只含 evidence/reports/reviews 的提交 B。
- TASK-0903：只更新总控和账本记录完整 A/B object ID、状态完成和 derived@master+ledger，创建提交 C。
- TASK-0904：运行 complete 检查器、安全扫描、历史不变性审计和人工最终验收，再决定 Goal complete。

## 副作用与重放
| 任务 ID | 副作用 | 重放类别 | 核验或补偿 |
|---|---|---|---|
| TASK-0901 | Git 实现提交 | verify_before_repeat | 先核对工作树、阶段状态和暂存范围；不得混入证据或无关改动 |
| TASK-0902 | 证据生成与 Git 证据提交 | verify_before_repeat | 必须 clean@A；若任何源码变化则废弃候选并回到新 A |
| TASK-0903 | Git 封账提交 | verify_before_repeat | B 必须直接父接 A，C 只改 master/ledger，记录完整 object ID |
| TASK-0904 | 最终状态与 Goal 完成 | human_required | 仅 complete 检查与人工验收均通过后执行；公开发布仍不在授权内 |
