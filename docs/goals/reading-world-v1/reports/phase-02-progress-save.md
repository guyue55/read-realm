# PHASE-02 / TASK-0202 阅读进度保存报告

- Goal ID：GOAL-READING-WORLD-V1
- 控制修订：REV-0001
- 任务：TASK-0202
- 结论：统一保存协调器与阅读器接入已实现；本报告不代表 GATE-01 或 EVID-17 通过。

## 基线问题

TASK-0202 前，`useReader.ts` 有 5 类直接进度写入：滚动防抖、Hook 卸载、`pagehide/beforeunload`、`ReaderEngine` 适配器、章节/书签/回滚定位。其中滚动路径等待 1000ms 后才开始异步写入；退出路径在确认成功前清空待保存值；`progress` 和 `books.lastReadAt` 分开写入，存在半成功状态。

## 实现合同

- 新增无 React/Dexie 依赖的 `ProgressSaveCoordinator`，默认 250ms 合并窗口，在 1 秒截止前发起持久化。
- 同一阅读器实例只串行一个写入；并发更新保留最新值，且每个即时保存调用等待自己对应的写入结果。
- 已确认的完全相同值不重复写入；但失败值保留为可重试值。
- 状态为 `idle | pending | saved | failed`。只有事务完成才发布 `saved`；失败时保留原值和错误。
- 阅读器持久化端口在同一 Dexie 事务中写入 `progress` 与 `books.lastReadAt`；书籍不存在时事务失败，不报成功。
- 滚动、引擎适配器、跳章、进度定位、书签定位和回滚全部走统一入口。
- `visibilitychange(hidden)`、`pagehide`、`beforeunload` 和 Hook 退出会立即 `flush`；若之前失败，`flush` 会再试一次。
- `pending/saved` 用辅助技术实时状态表达，不干扰正文；`failed` 显示持久非阻塞告警和 44px 最小高度重试按钮。

## TDD 与失败记录

1. 首次定向测试因 `progress-save-coordinator` 模块不存在而 RED；实现后基本 5 场景 GREEN。
2. 幂等合同先证明相同值被写入 2 次，加入已确认指纹后 GREEN。
3. 并发失败测试暴露新 `saveNow` 复用旧失败 Promise，改为等待新值自身 drain 后 GREEN。
4. 旧值失败被新值取代仍短暂发布 `failed`，以及生命周期 `flush` 不重试失败值，两项均先 RED 后 GREEN。
5. 一次把 storage-core 测试名错路由到 web-pwa，Vitest 以“No test files found”退出 1；改跑真实所属包后通过。该项是验证命令路由错误，不是 GATE-01 设计实验。

## 新鲜验证

- `corepack pnpm test`：exit 0，179 个工作区测试通过。
- `corepack pnpm --filter @reader/storage-core test`：exit 0，3 个文件、14 个测试通过；其中协调器 9 个行为场景。
- `corepack pnpm --filter web-pwa lint`：exit 0，零 warning。
- `corepack pnpm --filter api exec eslint "{src,apps,libs,test}/**/*.ts"`：exit 0，非写入。
- `READING_WORLD_VERIFY_NO_PWA_WRITE=1 corepack pnpm build`：exit 0，工作区构建通过，PWA 审计开关禁止 Service Worker 生成写入。
- `git diff --check`：exit 0。
- 定向搜索：`useReader.ts` 仅保留统一 Dexie 事务端口内的一处 `db.progress.put`，不再有分散正常阅读直写。
- `check_long_goal_pack.py --mode resume`：exit 0。控制包启发式安全预检 24/24 Green；storage-core 9/9、`useReader.ts` 1/1、`ReaderDefault.tsx` 1/1 的逐目标预检均为 Green。
- 提交前全仓 `security_scanner.py`：exit 1，仍命中 PHASE-01 已登记的 7 个 `.DS_Store`、已跟踪 `.vscode`、PR 模板个人绝对路径、环境变量规则误报、历史原生壳生成物和字体/图标二进制。本任务未新增这些命中；按 PHASE-01 已冻结的边界，不声称全仓安全门通过，仅在改动文件逐项 Green、全量测试/构建通过和精确暂存清单下执行 ACT-05 本地切片提交。

## 剩余边界

- 本任务以可控时钟证明“1 秒内发起持久化”与事务成功状态；真实浏览器中的 1 秒落盘、刷新恢复、真断网、备份和隔离恢复必须在 TASK-0204 / EXP-01 同一纵向旅程中重新取证。
- 浏览器对即将关闭页面的异步 IndexedDB 完成不提供绝对保证；250ms 常态窗口和 `visibilitychange/pagehide` 提前刷盘用于缩小风险，不写成“强制关闭绝不丢失”。
- 未修改 schema、未连接恢复 UI、未运行 EXP-01，也未生成 EVID-27 或 EVID-17。

## 下一入口

PHASE-02 / TASK-0203：建立迁移前备份、幂等迁移、故障注入回滚和上一稳定版兼容测试。
