# PHASE-06 生产离线 PWA

- Goal ID：GOAL-READING-WORLD-V1
- 阶段 ID：PHASE-06
- 状态：就绪待执行
- 阶段目标：证明 PWA 在真断网、冷启动、升级、后台恢复与存储异常下仍可靠阅读且不丢数据。
- 稳定输入：PHASE-03 备份/导入、PHASE-04 阅读器、PHASE-05 Shell，生产构建与隔离浏览器配置。
- 依赖：PHASE-05 完成。
- 本阶段改动边界：manifest、Service Worker/Workbox、缓存与更新服务、存储配额诊断、PWA UI 与 E2E。
- 本阶段不做：不开发原生 App，不缓存未获授权全文，不用远程字体或运行时 CDN 作为核心依赖。
- 定向检查：`node scripts/verify-reading-world.mjs --phase 06 --output docs/goals/reading-world-v1/reports/phase-06-offline-pwa.json`，内部运行 SW/manifest 单测和 `e2e/offline-pwa.spec.ts` 的真断网、冷启、升级、配额场景。
- 主线门禁：真断网冷启可读已缓存书；更新不清用户数据；保存/缓存失败不伪成功；核心静态资产无网络依赖。
- 活体验收：生产包安装 PWA，导入并缓存一本书，切断网络后杀进程冷启、阅读、记笔记、恢复，再模拟升级和配额异常。
- 失败处理：旧缓存/新代码不兼容时回退稳定壳并提示；永不以清库作为自动修复。
- 回滚方式：版本化缓存与前一稳定 Service Worker；升级失败恢复旧壳，本地数据独立于静态缓存。
- 人工检查点：安装、更新、离线和存储警告让普通用户知道当前状态与恢复路径。
- 阶段完成条件：`reports/phase-06-offline-pwa.json`、`reviews/phase-06-offline-pwa.md` 与 EVID-08 候选产物可复算且无 NREQ-01/02/05 现象。
- 下一入口：PHASE-07 / TASK-0701 冻结端到端同步威胁模型与协议。

## 工作项
- TASK-0601：审计并统一 PWA 壳、路由、静态/运行时缓存与版本升级契约。
- TASK-0602：实现存储配额、持久化授权、缓存状态和更新恢复的用户可见诊断。
- TASK-0603：建立真断网冷启、后台恢复、升级和配额故障的 Playwright/浏览器回放。
- TASK-0604：独立复核远程依赖、旧缓存污染、数据隔离和证据新鲜度，写入 `reviews/phase-06-offline-pwa.md`。

## 副作用与重放
| 任务 ID | 副作用 | 重放类别 | 核验或补偿 |
|---|---|---|---|
| TASK-0601 | Service Worker 与缓存写入 | verify_before_repeat | 先注销旧 SW/清隔离缓存并记录版本，不触碰用户数据库 |
| TASK-0602 | 浏览器存储授权与 UI 状态 | human_required | 真实权限提示需人工触发；自动测试使用隔离配置 |
| TASK-0603 | PWA 安装、缓存和网络状态 | verify_before_repeat | 停止旧服务，fresh build，使用独立 profile 与固定端口 |
| TASK-0604 | 报告和证据写入 | replay_safe | 对账 build ID、SW hash 与源码提交 |
