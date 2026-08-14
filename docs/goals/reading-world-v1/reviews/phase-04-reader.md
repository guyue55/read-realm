# PHASE-04 / TASK-0404 独立就绪审查

- 审查结论：`NOT_READY`
- 控制修订：`REV-0003`
- 实现候选 A：`fb4adefaf7e182540d10799aa11ee5bae0337625`
- 证据候选 B：`b06b0be1c1a9c25073f1080f14e4e193537294d2`，唯一父提交为 A
- 报告 SHA-256：`f6be24f0edd6605dc825aeeae18250047fb80bdf6ac61f5ab92cab66ecb19803`
- 人工记录 SHA-256：`14d48154495584e31d036f99d06cd801e933b14a93f3565534e29f992f1cb8c9`
- 失败 ATTEMPT-02 报告 SHA-256：`f299759d47099772d8ff2627fc6eac5bcb04fc699092dab18ea3ef4dcb047dd1`
- 审查范围：只读核对总控、PHASE-04 计划、源码、测试、runner、checker、候选报告、records、UX 记录和历史 ATTEMPT；未运行会改写候选报告的 formal verifier。

## Findings

### [P1] 后台恢复仍是本阶段未通过的显式验收项

`goal-master.md:152,182` 和 `phases/phase-04-reader-experience.md:6,13` 都把手机/桌面后台恢复放在 PHASE-04，但 `reports/phase-04-reader-ux.md:36` 明确记录当前没有物理锁屏或 `document.hidden` 证据，只证明了 `pagehide` 刷盘。活体测试 `apps/web-pwa/e2e/reader-experience.spec.ts:463-505` 执行的是点击翻页、100ms 后 reload，再将 browser context 设为真断网；这能证明 `pagehide` 与已打开阅读器续读，不能替代后台/锁屏状态迁移。将该项留到 PHASE-08 是对既有阶段所有权的实质变更，当前没有新控制修订批准。

影响：候选不能据此放行 REQ-06 的“后台恢复体验”，也不能将 PHASE-04 状态改为完成。

最小收敛：在真实手机或能产生真实 `visibilitychange -> hidden -> visible` 的物理浏览器环境中，记录进入后台前的章节/段落/字符锚点，返回后核对 IndexedDB 持久值与可见语义位置；或由用户批准新 REV 明确重分阶段所有权。

### [P1] “手机翻页/触控友好”仅在桌面 Chrome 的窄视口中验证，未满足冻结的移动采样合同

`docs/superpowers/plans/2026-08-14-phase-04-reader-verification.md:16` 明确要求移动采样同时使用 `isMobile` 和 `hasTouch`，不只依赖视口尺寸。但 `apps/web-pwa/playwright.phase-04.config.ts:16-19` 的唯一项目继承 `devices["Desktop Chrome"]`，`apps/web-pwa/e2e/reader-experience.spec.ts:3` 只把 viewport 改为 390×844。候选 record 中 14 项全部属于同一 `chromium-chrome` 项目，没有 touch-capable context；所谓 touch-safe 主要是几何尺寸与鼠标/pointer 事件断言，不证明真实触控分流、手势冲突和移动浏览器输入语义。

影响：14/14 的结果真实证明了窄视口布局与 44px 目标，但不足以放行 PHASE-04 的“手机触控友好”承诺。

最小收敛：将移动用例放入显式 `isMobile: true` + `hasTouch: true` 的 Chromium 项目，保留独立桌面项目，并至少用一条真实 touch 输入重放分页/抽屉/进度拖动与翻章边界；同步更新 runner 的精确枚举合同并从新 clean@A 生成报告。

## Reality Matrix

| 声明 | 证据路径 | 复算 | 判定 |
|---|---|---|---|
| 候选 B 绑定 clean@A | B 父提交 -> report `repository.head` -> checker clean-worktree 前置 | B 唯一父为 `fb4adef...`；report 第 14 行一致；当前工作树开始与重放后均 clean | 真实 |
| 10 项检查和 records 可复算 | report `checks[].logPath/logSha256` -> 10 个 record | 逐个 SHA-256 10/10 匹配，exit code 全 0，tracked mutation 全 false | 真实 |
| 14 项生产态阅读回归 | runner 精确枚举 -> Next production server -> Playwright record | 候选 record 14/14 PASS；独立重放再次 14/14 PASS | 真实，但只在当前 Desktop Chrome context |
| 语义重排与分页恢复 | `reader-experience.spec.ts:188-296,298-461` -> IndexedDB 锚点 -> 可见页包含字符区间 | 候选 1275ms/252ms；独立重放 1211ms/281ms；锚点可见 | 真实 |
| 书签持久与跳转 | `reader-experience.spec.ts:507-579` -> bookmarks store -> 离章/reload -> 目录书签跳转 | 章/段/字符与可见页区间一致 | 真实 |
| 连续滚动有界 DOM | `reader-experience.spec.ts:581-728` -> 20 章 fixture -> 往返/刷新/目录跳转 | 最大同时 3 章，返回锚点可见 | 真实 |
| `pagehide` + 已打开阅读器真断网续读 | `reader-experience.spec.ts:463-505` -> 250ms 协调器 -> 100ms reload -> context offline | `navigator.onLine=false`，正文可见，锚点继续增长 | 真实，边界诚实 |
| 物理后台/锁屏恢复 | phase/master 承诺 -> UX 边界 | UX 明确未证明 | 未证明，P1 |
| 移动触控环境 | 冻结计划 -> Playwright config/spec | Desktop Chrome + 窄 viewport，无 `isMobile/hasTouch` | 未证明，P1 |
| 阅读器动作窗口无 `>=50ms` Long Task | 页面 `PerformanceObserver` -> semantic-layout sample | 候选与独立重放均 supported=true、max=0 | 真实；不外推 Web Vitals/p75 |
| 五项人工量表 | UX 记录第 22-32 行 | 舒适、低干扰、状态清晰、恢复可信、单手易用均 4/5 | 记录完整，但不能覆盖上述两项环境缺口 |
| 失败 ATTEMPT 保留 | current report `archivedPreviousReport` -> attempt-02 | attempt-02 保留 `TEST_EXIT_1` + `LIFECYCLE_OFFLINE_COUNT_0`，`summary.passed=false` | 真实 |

## Validation

- `git status --short`：审查开始为 clean；运行重放后仍 clean；本文写入后只应出现本 review 文件。
- `git rev-parse HEAD` 与 `git show -s --format='%H %P' HEAD`：确认 B 为当前 HEAD 且父提交精确等于 A。
- 独立 Node SHA-256 复算：report 的 10 个 `logSha256` 全部与当前 records 一致。
- `node --test scripts/phase-04-reader-run.test.mjs`：4/4 PASS。
- `CI=1 PLAYWRIGHT_BROWSER_CHANNEL=chrome node scripts/run-phase-04-reader-experience.mjs`：14/14 PASS；分类 PASS；服务健康；前后端口释放；孤儿进程 0；五个样本数据为 1211ms、281ms、真断网/锚点 true、书签 true、DOM 3。
- 未运行 `verify-reading-world.mjs --phase 04`，因为它会归档并改写已锁定候选证据，违反本审查只读边界。

## Residual boundaries

- 已打开阅读器的真断网续读通过，不等于 PWA 断网冷启或跨路由重入；后者继续属于 PHASE-06。
- 当前 Long Task 样本是局部动作窗口观测，不等于 LCP/INP/CLS、CPU/网络限制、冷暖 p75 或跨浏览器/真机结论；这些继续属于 PHASE-08。
- runner 对 Long Task 只校验观测结构有效，未设“明显卡死”硬阈值；当前两次活体采样均为 0，因此不单独构成本候选的 P1，但后续应防止极端样本仍被分类 PASS。

## Readiness decision

`NOT_READY`。A/B 证据链、当前 14 项回归、五个机器样本、报告哈希和历史 ATTEMPT 保留都是真实可复算的；但物理后台恢复与 touch-capable 移动环境两项 P1 与本阶段明文验收相冲突。在新 clean@A 修复并重生成候选 B 前，不得生成 EVID-02/07，不得将 PHASE-04 改为完成，不得进入 PHASE-05。候选输入哈希变化后，本审查结论不自动继承，必须对新 A/B 重新独立复算。
