# PHASE-04 沉浸阅读与准确恢复

- Goal ID：GOAL-READING-WORLD-V1
- 阶段 ID：PHASE-04
- 状态：执行中
- 阶段目标：交付低干扰、触控友好、滚动/分页一致、刷新/后台/断网后准确恢复的阅读体验。
- 稳定输入：PHASE-02 进度服务、PHASE-03 稳定章节与备份、reader-core/gesture-core 当前实现。
- 依赖：PHASE-03 完成。
- 本阶段改动边界：reader-core、gesture-core、阅读会话服务、Reader UI、设置模型、书签和阅读 E2E。
- 本阶段不做：不重做品牌、不新增推荐/广告/常驻复杂工具栏、不把 AI 接入核心渲染。
- 定向检查：`node scripts/verify-reading-world.mjs --phase 04 --output docs/goals/reading-world-v1/reports/phase-04-reader.json`，内部运行 reader/gesture 测试、位置服务测试、`e2e/reader-experience.spec.ts` 与恢复偏差采样。
- 主线门禁：进度 1 秒内落盘；布局变化后恢复接近原语义位置；手机触控目标至少 44px；无 UI 操作时正文沉浸。
- 活体验收：手机和桌面连续阅读、切页/滚动切换、锁屏/后台/刷新/断网、字号主题变化和书签恢复。
- 失败处理：恢复偏差、手势冲突、正文抖动或主线程卡顿先记录可复现样本；不可修复边界才申请局部重写。
- 回滚方式：保留旧 Reader 适配器直到新会话服务通过同一契约；切换有特性开关且不复制数据。
- 人工检查点：舒适、低干扰、恢复可信、单手易用四项各至少 4/5。
- 阶段完成条件：`reports/phase-04-reader.json`、`reports/phase-04-reader-ux.md`、`reviews/phase-04-reader.md` 与 EVID-02/07 候选产物可复算；GATE-01 的扩展覆盖通过但不替代终局 FINAL。
- 下一入口：PHASE-05 / TASK-0501 统一书架与辅助页面领域入口。

## 工作项
- TASK-0401：从 useReader 抽离阅读会话、章节加载、进度、设置和书签服务，保持单一数据契约。
- TASK-0402：统一滚动/分页、语义锚点恢复、预加载和长章节虚拟化/分块策略。
- TASK-0403：优化手机触控、抽屉/Sheet、焦点与安全区，保留现有视觉基调。
- 动效实现约束：简单圆角、排版、图标和静态状态优先设计 tokens/CSS；只有翻页、章节切换、目录/设置面板需要可中断或同步过渡时才使用 GSAP。使用时以 transform/autoAlpha 为主，通过 `gsap.matchMedia()` 区分手机/桌面并尊重 `prefers-reduced-motion`，不得用布局属性动画制造卡顿。
- TASK-0404：完成阅读回归、恢复偏差/性能采样与人工体验量表，写入 `reports/phase-04-reader-ux.md` 和 `reviews/phase-04-reader.md`。

## 副作用与重放
| 任务 ID | 副作用 | 重放类别 | 核验或补偿 |
|---|---|---|---|
| TASK-0401 | 源码和本地进度写入 | verify_before_repeat | 使用隔离数据并对账旧/新服务输出，禁止双写漂移 |
| TASK-0402 | 缓存和进度锚点更新 | compensate | 保存旧锚点副本，恢复失败回到兼容算法 |
| TASK-0403 | UI 状态写入 | replay_safe | 运行视口、焦点和手势回归，保留设置默认值兼容 |
| TASK-0404 | 浏览器数据与证据写入 | verify_before_repeat | fresh build、清理旧服务和旧截图，证据绑定当前 BASE |
