# PHASE-01 当前真实性审计

- Goal ID：GOAL-READING-WORLD-V1
- 阶段 ID：PHASE-01
- 状态：完成
- 阶段目标：建立当前源码、数据、测试、运行与 UI 的可复算基线，形成承诺缺口和复用清单。
- 稳定输入：clean@c900af34e81d5b09319498f57953bf2c0205c02c、REV-0001、旧规格和旧验收报告。
- 依赖：ACT-01 已批准；控制包 ready。
- 本阶段改动边界：只读审计、隔离测试/运行、reports/reviews/evidence 产物；只允许修复阻止基线运行的最小问题。
- 本阶段不做：不批量重构、不改变数据契约、不实现同步、不美化非核心页面。
- 定向检查：`node scripts/verify-reading-world.mjs --phase 01 --output docs/goals/reading-world-v1/reports/phase-01-baseline.json`；该检查器须顺序运行 `git diff --check`、Web lint、API 非写入 lint、`corepack pnpm test`、`corepack pnpm build`、`corepack pnpm --filter web-pwa test:e2e` 并记录每步退出码。
- 主线门禁：旧报告中的每项声明标为已证实、冲突、过期或缺失；每个 REQ/NREQ/RISK 有当前落点。
- 活体验收：从干净浏览器导入固定 TXT，进入书架与阅读器，刷新、断网、恢复并记录控制台、请求、数据和截图。
- 失败处理：先证实根因；阻断基线的最小修复最多 3 轮，仍失败则账本记录阻塞，不扩大范围。
- 回滚方式：审计产物可删除；最小代码修复独立提交或用反向补丁恢复，不触碰真实用户数据。
- 人工检查点：核对审计覆盖项目所有者真实常用路径，确认旧报告没有被误当终局证据。
- 阶段完成条件：`reports/phase-01-architecture.md`、`reports/phase-01-capability-matrix.md`、`reports/phase-01-baseline.json`、`reviews/phase-01-readiness.md` 均落盘并独立复核；各阶段持续运行 NREQ-01 范围门，现存 `apps/mobile-capacitor`、`apps/desktop-tauri` 生成物须标为历史非目标、隔离或移除候选，不能被误认成本 Goal 原生 App 交付。
- 下一入口：PHASE-02 / TASK-0201 冻结本地数据契约并建立 GATE-01 样本。

## 工作项
- TASK-0101：绘制页面、领域 Hook/服务、核心包、浏览器存储、API、SQLite/Blob 与测试的当前调用和事实源图，产物写入 `reports/phase-01-architecture.md`。
- TASK-0102：在隔离目录运行静态、测试、构建、E2E 和当前真实主旅程，机器结果写入 `reports/phase-01-baseline.json`，失败原样保留。
- TASK-0103：创建 `scripts/verify-reading-world.mjs` 非写入阶段检查器；逐项审查旧报告，矩阵写入 `reports/phase-01-capability-matrix.md`，含 NREQ-01 与历史原生壳生成物处置。
- TASK-0104：由独立审查视角复核基线报告与证据新鲜度，写入 `reviews/phase-01-readiness.md` 后更新账本和状态。

## 副作用与重放
| 任务 ID | 副作用 | 重放类别 | 核验或补偿 |
|---|---|---|---|
| TASK-0101 | 只读与报告写入 | replay_safe | 重跑前记录 BASE，输出覆盖同一报告时保留差异 |
| TASK-0102 | 本地构建、临时数据库、浏览器数据 | verify_before_repeat | 先停止旧服务并清理隔离目录，禁止指向真实用户数据 |
| TASK-0103 | 报告和矩阵写入 | replay_safe | 对账源码提交与报告时间，过期则重算 |
| TASK-0104 | 审查与账本写入 | verify_before_repeat | 先确认报告 SHA 与 BASE..HEAD 未变化 |
