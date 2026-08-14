# PHASE-04 / TASK-0404 独立终审

- 结论：`PASS`
- 控制修订：`REV-0003`
- 实现候选 A：`b740c04f51e5ab61acd63b6558b51a85c0ac0458`
- 证据候选 B：`6ee594249d768ab20231ddf48162cec08b309f9a`，唯一父提交为 A
- 正式报告 SHA-256：`9228322c43482bb73e99796411c25f899a3c6e588203f0d8e9e184105c234653`
- UX 记录 SHA-256：`427313358bc25de881f0b7ac4591769ebce4c49fdf751799fbc2be4cbae337c2`
- 旧 `NOT_READY` review 已由 `9838fda3bb6fbc48c7641010b284ec3f4b6ccec1` 保留，本结论未继承旧候选的通过权。
- 审查方式：只读复算总控、PHASE-04、冻结计划、源码、测试、runner、正式 report/records、UX 和 ATTEMPT 历史；未运行会改写候选报告的 formal verifier。

## Findings

未发现 P0/P1 阻塞项。旧审查的两项 P1 均已由新候选的可复算活体证据关闭：

1. 移动采样不再是桌面 Chrome 窄视口。`playwright.phase-04.config.ts:16-26` 将 desktop 14 项与 `Pixel 5` mobile-touch 1 项分开；`reader-touch.spec.ts:140-254` 显式断言 `isMobile + hasTouch`、`maxTouchPoints > 0`和粗指针，用 CDP `Input.dispatchTouchEvent` 产生页面观测为 `isTrusted` 的 touch，并以页码、章节 IndexedDB、弹层和进度结果断言左滑分页、页末换章、进度拖动和设置抽屉。
2. 后台恢复不再仅是 `pagehide` reload。`run-phase-04-native-background.mjs:102-283` 仅在准备子进程中连接 Playwright；该子进程退出后，父进程使用原始 Browser CDP 最小化/恢复隔离 profile 的 headed Chrome。窗口转移端点由 `Browser.getWindowBounds` 读回确认，页面自行记录 `visible -> hidden -> visible`，hidden 期间字符锚点 320 落盘，恢复后该锚点仍在可见页。

## Reality Matrix

| 声明 | 证据路径 | 独立复算 | 判定 |
|---|---|---|---|
| B 绑定 clean@A | B 父提交 -> report `repository.head` -> verifier clean-worktree 前置 | B 唯一父为 A，report head 等于 A，审查前工作树 clean | 通过 |
| 10 项正式检查可复算 | report `checks[].logPath/logSha256` -> 10 records | SHA-256 10/10 匹配，exit code 全 0，tracked mutation 全 false | 通过 |
| 测试枚举唯一 | Playwright list -> runner 按 project 计数 -> 分类器 | 精确 desktop 14 + mobile-touch 1，总数 15，test ID 唯一 | 通过 |
| 移动触控上下文真实 | Pixel 5 project -> CDP touch -> 页面 `event.isTrusted` -> 业务结果 | `isMobile=true`、`hasTouch=true`、touch points=1、coarse pointer=true；滑页/抽屉/进度/换章均 true | 通过 |
| 语义恢复和 1s 落盘 | desktop E2E -> IndexedDB -> 可见页字符区间 | 正式 243ms；独立重放 250ms；重排、刷新和书签锚点可见 | 通过 |
| 连续滚动 DOM 有界 | 20 章 fixture -> 往返/刷新/目录跳转 | 最大同时 3 章，语义锚点可见 | 通过 |
| 已打开阅读器真断网续读 | browser context 真断网 -> 缓存正文 -> IndexedDB 继续增长 | `navigator.onLine=false`、正文可见、锚点增长 | 通过 |
| headed Chrome 真实后台恢复 | 隔离 profile -> 断开 Playwright -> raw Browser CDP 窗口状态 -> 页内可见性/IDB | 正式 `normal/minimized/normal`、`visible/hidden/visible`、hidden 落盘 true、恢复 657ms；独立重放恢复 666ms | 通过 |
| 动作窗口 Long Task 观测 | `PerformanceObserver` -> semantic-layout sample | 正式与独立重放均 supported=true、max=0 | 通过，不外推 PHASE-08 |
| 五项人工量表 | UX 第 24-34 行 | 舒适、低干扰、状态清晰、恢复可信、单手易用均 4/5 | 通过 |
| 失败与旧结论保留 | attempt-02/03 + commit `9838fda` | attempt-02 仍为 FAIL，旧 PASS 候选与旧 `NOT_READY` review 均可回溯 | 通过 |

## Validation

- 独立逐个复算 10 个 record SHA-256：10/10 PASS。
- `node --test scripts/phase-04-reader-run.test.mjs`：7/7 PASS，包括 viewport-only 移动声明、项目枚举重复和伪后台样本反例。
- `CI=1 PLAYWRIGHT_BROWSER_CHANNEL=chrome node scripts/run-phase-04-reader-experience.mjs`：独立生产态重放 PASS；15/15，7 个场景各唯一样本，端口前后可用，孤儿进程 0。
- 重放后复核：3104 无监听；无 `phase04-native-background-*` 临时 profile；无对应 Chrome、Next 或 runner 进程；工作树仍 clean。
- 未运行 formal verifier：它会归档并改写锁定候选，不符合本轮独立审查权限。

## 诚实边界

- 原生后台样本证明 macOS headed Chrome 的最小化/恢复和真实 Page Visibility，不声称物理锁屏、页面冻结、移动 OS suspend 或真实 Android/iOS 矩阵；后者仍属 PHASE-08。
- 移动触控是 Chromium/Pixel 5 等价模拟中的可信输入纵切，不声称真机手感或多浏览器完成。
- 真断网续读仅证明已打开且正文已缓存的阅读器；PWA 断网冷启/跨路由重入仍属 PHASE-06。
- Long Task 是阅读器局部动作窗口；不等于 LCP/INP/CLS、CPU/网络限制、冷暖 p75 或 PHASE-08 完成。
- 本 `PASS` 只放行 PHASE-04 候选进入其封结流程，不是 EVID-02/07 FINAL，不是 Goal complete，不得外推为终极愿景或时间型结果完成。

## 终审决定

`PASS`。新候选的实现、活体样本、正式 records、人工量表和失败谱系均可复算；旧审查的 touch-capable 移动环境与真实后台恢复两项 P1 已关闭。候选 A/B 或报告哈希后续变化时，本结论不自动继承，需重新独立复算。
