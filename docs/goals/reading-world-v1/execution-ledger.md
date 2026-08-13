# 阅读世界 v1 执行账本

## 当前指针
- 控制包版本：4
- 当前控制修订：REV-0002
- Goal ID：GOAL-READING-WORLD-V1
- 当前状态：执行中
- 当前阶段 ID：PHASE-04
- 当前入口：PHASE-04 / TASK-0401；抽离阅读会话领域服务，先冻结滚动/分页、字体排版、章节切换、进度恢复和手机手势的状态/位置合同，再以现有阅读器为兼容入口渐进接线。
- 最近有效提交：86815f7
- 最近新鲜证据：docs/goals/reading-world-v1/evidence/artifacts/provider-boundary-final.json，SHA-256 `709f392e28db559e303907413d53f061209362864f505748a228ebdc007943d7`，2026-08-14T00:19:02+08:00
- 当前阻塞：无；PHASE-02/03、GATE-00/01 与 RISK-03 已通过。PHASE-04 只按阅读会话与体验范围执行，不提前扩张公共多用户“藏经阁”、同步、部署或 Goal 完成。
- 停止原因：无；从 PHASE-04 / TASK-0401 继续，EVID-03/04/05/16/17/25、TASK-0301 原生活体、阶段失败归档与历史 ATTEMPT 均不可覆盖。
- 完成判定：未完成

## 状态转换
- RUN-0001：保持铸造中；依据：用户批准 ACT-01，但 2026-08-13 独立就绪审查判定 NOT READY，撤销提前写入的就绪口径。
- RUN-0002：保持铸造中；依据：首次五项缺口整改后，第二次独立复审仍发现三项可执行性缺口，未提前晋级。
- RUN-0003：铸造中 -> 就绪待执行；依据：三项二审缺口整改后，快速独立终审判定 READY；最终状态以随后的 ready 与安全扫描通过为准。
- RUN-0004：就绪待执行 -> 执行中；依据：开始执行 PHASE-01 并形成架构、矩阵、机器基线与审查产物；后续状态仍以最终独立复审为准，GATE-01 明确保留为未过门。
- RUN-0005：保持执行中并撤回 PHASE-01 提前完成口径；依据：最后一次非写入基线重跑新增 attempt-04 后，独立复审发现遗留 attempt-03 的 6 条日志路径仍指向当前 records，5 份 JSON / 30 条记录中有 6 项 SHA 失配；修复并复算前不得进入 PHASE-02。
- RUN-0006：保持执行中；PHASE-01 执行中 -> 完成，PHASE-02 就绪待执行 -> 执行中。依据：attempt-03 遗留路径已修复，5/5 JSON、30/30 records 独立复算匹配，安全预检 22/22 Green，执行期 `--mode resume` exit 0，独立结论 READY；GATE-01 仍未过门。
- RUN-0011：执行中 -> BLOCKED_DESIGN_REVIEW_REQUIRED；依据：REV-0001 下 GATE-01 的 EXP-01/02/03 三次差异化实验均有独立失败证据 EVID-27/28/29，达到 3/3 自动熔断条件；未经用户批准新 REV 不得恢复。
- RUN-0012：BLOCKED_DESIGN_REVIEW_REQUIRED -> 执行中；依据：用户批准 REV-0002 与 ACT-07，触发门 GATE-01，授权证据 DEC-14/EVID-44。旧 TRY-01/02/03 与 EVID-27/28/29 永久保留，先执行 GATE-00，未经资格放行不得执行新产品实验。
- RUN-0019：保持执行中；PHASE-02 执行中 -> 完成，PHASE-03 就绪待执行 -> 执行中。依据：EVID-45、EVID-17、EVID-25、阶段 JSON 与审查均可复算；真实迁移失败说明与重试在 clean@`a249d5139bee1f0382d7b974387a404f0ab07628` 活体通过。Goal 与终局人工体验仍未完成。

## 设计门失败记录
| 尝试 ID | 控制修订 ID | 风险门 ID | 假设 ID | 实验 ID | 差异说明 | 失败证据 ID | 结论 |
|---|---|---|---|---|---|---|---|
| TRY-01 | REV-0001 | GATE-01 | HYP-01 | EXP-01 | ATTEMPT-01：现有导入 UI/阅读器 + 统一进度 + 生产 PWA runner + 最小备份/空库恢复；runner 超时孤儿化并改写受控 SW，补偿完成后转 EXP-02 | EVID-27 | 失败 |
| TRY-02 | REV-0001 | GATE-01 | HYP-01 | EXP-02 | ATTEMPT-02：同一 TXT 改走 Worker 流式导入与新会话适配器；生产浏览器停在解析中并记录打包运行时 bind 异常，受控 SW 改写已补偿，转 EXP-03 | EVID-28 | 失败 |
| TRY-03 | REV-0001 | GATE-01 | HYP-01 | EXP-03 | ATTEMPT-03：固定 EPUB 改走主线程解析与兼容存储读回适配器；纵切完成至隔离恢复后的书架，最终因同名书严格定位器歧义 exit 1，PWA 生成写入已由检查器补偿，触发 3/3 熔断 | EVID-29 | 失败 |
| TRY-04 | REV-0002 | GATE-00 | HYP-04 | EXP-08 | ATTEMPT-01：基线资格设施完成唯一枚举、生产构建、服务健康、端口/进程/public 补偿与 records 复算；只读目标在 React 稳定渲染前计数为 0，归类 VALIDATOR_INDETERMINATE，转 EXP-12 | EVID-51 | 失败 |
| TRY-05 | REV-0002 | GATE-00 | HYP-04 | EXP-12 | ATTEMPT-02：稳定渲染后唯一目标为 1，PWA 生成物隔离到临时目录，显式进程组退出，端口/进程/public/records 全部闭合；通过，并由 clean 证据提交另行生成 EVID-45 FINAL | EVID-52 | 通过 |
| TRY-06 | REV-0002 | GATE-01 | HYP-01 | EXP-09 | ATTEMPT-01：固定 EPUB 经兼容存储导入，按备份中唯一 book ID 定位；完成阅读、1 秒落盘、刷新、真断网、备份与隔离恢复，7/7 records 和全部副作用闭合 | EVID-48 | 通过 |

## 阶段记录

### RUN-0001 · 2026-08-13T01:30:00+08:00 · Long Goal Forge
- 本轮输入：用户愿景、仓库 clean@c900af34、现有 README/规格/旧验收和逐项方向决定。
- 本轮范围：只铸造 v4 控制包，不实现产品功能，不部署、不删除数据。
- 实际改动：创建 goal-master、execution-ledger、9 个阶段计划、证据索引和方向授权证据。
- 失败命令：`create_goal` 因线程已有 Goal 失败，退出由工具返回；不影响现有 Goal。项目内查找协议路径失败后改从 guyue 安装目录读取。
- 修复动作：沿用现有线程 Goal；按技能真实路径读取协议和模板。
- 定向检查：`check_long_goal_pack.py --mode ready` 通过；`run_security_scan.py docs/goals/reading-world-v1` 扫描 13/13 文件并为 Green。
- 主线门禁：本轮不运行产品 build/test；旧报告不继承完成权。
- 活体证据：方向授权摘要 SHA-256 为 `3296525f366ebb43b0df89b2bf0b44de2a48d90bd908bafc5d0bc08f52ca7b4a`；控制包 ready 检查通过；新控制包安全预检 13/13 Green。
- 证据新鲜度：方向授权来自本会话当前决定；产品证据全部视为待重新生成。
- 人工判断：用户逐项批准产品、同步、加密、部署、内容、AI、迁移、功能取舍、数据主权、性能、UI、重构和最终实施授权。
- 提交记录：未提交。
- 残余风险：实际运行基线、数据样本、浏览器覆盖和同步机制仍未审计；全仓安全扫描被既有 `.DS_Store`、`.vscode`、PR 模板本机路径、生成物二进制和环境变量规则命中阻断，PHASE-01 必须分类修复或校正规则后才能进入提交门。
- 状态结论：控制包就绪待执行；只说明治理入口可用，不等于任何产品功能或 Goal 完成。
- 下一入口：PHASE-01 / TASK-0101，先生成当前真实性基线，不跳过风险门。

### RUN-0004 · 2026-08-13T03:16:03+08:00 · PHASE-01 当前真实性审计
- 本轮输入：clean@`c900af34e81d5b09319498f57953bf2c0205c02c`、REV-0001、旧规格/旧验收、现有 Web/PWA、Nest/SQLite/Blob、共享包和隔离 E2E。
- 本轮范围：TASK-0101~0104；只做代码事实审计、隔离验证、最小验证基础设施修复和独立只读复审，不改数据契约、不实现同步、不扩张功能。
- 实际改动：创建非写入 `scripts/verify-reading-world.mjs`；为 Playwright 增加显式系统浏览器通道；为审计 build 增加禁用 PWA 写入的专用开关；落盘架构图、37/37 能力矩阵、当前与四份历史机器记录、复审包和独立 review。
- 失败与因果链：首次 baseline 的 E2E exit 1，根因是缺少 Playwright v1228 浏览器；锁定 Chromium 下载在 40% 后上游超时并手动终止为 exit 130，随后仅切换系统 Chrome 151，同一测试 7/7 通过。第二次 baseline 六条命令 exit 0，但检查器捕获 `next build` 改写受控 `public/sw.js`，总结果 FAIL；补偿恢复 BASE 文件，并用 `READING_WORLD_VERIFY_NO_PWA_WRITE=1` 建立无写入审计构建。临时 `node -e` 覆盖脚本因换行转义失败、一次 Git 反向补丁格式不兼容、一次检查器上下文补丁不匹配，均未产生产品改动并已改用稳定命令。控制包安全扫描曾因 JSON 记录个人绝对路径变 Red，去标识化后恢复 Green。早期 `.logs` 证据目录命中 Git ignore，最终迁移为可跟踪 `.records/*.txt` 并重算全部 SHA。
- 定向检查：最终 `node scripts/verify-reading-world.mjs --phase 01 --output docs/goals/reading-world-v1/reports/phase-01-baseline.json` exit 0；补丁空白、Web lint、API 非写入 lint、174 个单测、工作区 build、Chrome E2E 7/7 全部通过且 `trackedMutationCount=0`。
- 主线门禁：旧 lint/test/E2E 结论只按本轮实际覆盖部分复现；旧“真实离线”和“无发布阻断”不继承。37 个 DEC/REQ/RISK/NREQ 均有当前状态和后续阶段落点。`apps/mobile-capacitor`、`apps/desktop-tauri` 判定为历史静态副本，不计原生 App 交付。
- 活体证据：当前 baseline + 4 份历史 JSON 共 30 个 `.records/*.txt` 均存在、SHA 匹配且未被 Git 忽略；attempt-01/02 保留失败因果链，attempt-03/04 与当前报告保留验证基础设施收敛后的通过谱系；系统 Chrome 151 下小型 TXT 导入、书架、阅读、书签、刷新、分享隔离与五视口共 7/7 通过。
- 证据新鲜度：架构、能力矩阵、baseline、检查器四项 SHA 由独立审查者复算匹配；控制包安全预检 21/21 Green；ready checker exit 0。
- 独立判断：`reviews/phase-01-readiness.md` 最终结论 READY；允许 PHASE-01 收束，但明确不证明 GATE-01、任何终局 REQ/RISK 或 Goal 完成。
- 提交记录：PHASE-01 实现/证据切片提交 `112ed73f1e45a625596f44e4b3d1fb4f1cc5a999`；本记录由后续控制提交固化；未 push。
- 残余风险：Dexie v9 与 SQLite 契约分裂；现备份是可裁剪元数据快照；进度写入集中在巨型 Hook；普通生产 PWA build 仍生成受控 SW；E2EE、Docker compose、压力与跨浏览器未实现或未证明。全仓安全扫描仍被既有系统文件、编辑器配置、生成物、绝对路径和环境变量规则命中，不能宣称全仓安全门通过。
- 状态结论：PHASE-01 完成，Goal 进入执行中；设计门失败表保持空白，因为本轮三次 baseline 是环境/验证基础设施因果链，不是 EXP-01/02/03。
- 下一入口：PHASE-02 / TASK-0201；先冻结最小版本化数据契约，随后只按 EXP-01 完成 GATE-01 纵向薄切片。GATE-01 通过前不得开始 PHASE-03 或批量扩张。

### RUN-0007 · 2026-08-13T04:20:00+08:00 · PHASE-02 / TASK-0201
- 本轮输入：PHASE-01 checkpoint `8d36005`、Dexie v9、shared-types、storage-core、reader-core 和真实 reader-settings 九字段。
- 本轮范围：只冻结 Book/Chapter/Progress/Bookmark/Settings/FileRef 与 v1 信封、codec 和适配器端口；不接恢复 UI、不改 Dexie schema、不运行 EXP-01。
- 实际改动：新增 `LocalDataSnapshotEnvelopeSchema`、`LocalChapter/LocalFileRef` 单一共享类型、完整性校验、稳定 JSON codec、未来版本错误码和数据契约报告；storage-core 改为兼容重导出共享 LocalChapter；补齐 reader-core 九字段默认设置；包测试只扫描 `src`，避免 build 后重复执行 dist 测试。
- TDD 证据：依次观察并修复 v1 schema/API 缺失、章节/进度/书签/文件引用孤儿数据、缺失文件格式、悬空章节锚点、三项阅读设置被静默剥离、codec 缺失和未来版本错误不稳定；每项先 RED 后 GREEN。
- 失败与根因：首次全回归 build 因 reader-core 默认值缺三字段失败；补真实默认值后旧六字段测试变 RED，更新手写九字段期望后通过。build 后 storage-core 测试曾误扫描 dist 旧副本，根因是包测试入口过宽，收紧为 `vitest run src` 后按原 build→test 顺序通过。报告中的尖括号版本示例被控制检查器识别为模板占位，改为具体版本 2 示例。
- 定向检查：Web lint、API 非写入 lint、全工作区 test、`READING_WORLD_VERIFY_NO_PWA_WRITE=1 corepack pnpm build`、`--mode resume`、控制包安全预检 23/23 Green、`git diff --check` 全部 exit 0。
- 提交记录：TASK-0201 本地切片提交 `232fb57e6a3e3c32c6e6ac8fd374a444135f5099`；未 push。
- 状态结论：TASK-0201 完成；只证明最小版本化契约内核与 codec，不证明迁移、完整备份恢复、1 秒落盘或 GATE-01。
- 下一入口：PHASE-02 / TASK-0202；统一进度保存协调器与 `pending/saved/failed` 状态，保证最迟 1 秒发起持久化。

### RUN-0008 · 2026-08-13T05:10:16+08:00 · PHASE-02 / TASK-0202
- 本轮输入：TASK-0201 checkpoint `596d4dd`、Dexie v9、`useReader.ts` 的 5 类分散进度写入、REV-0001 的 1 秒落盘和失败可见承诺。
- 本轮范围：只统一阅读进度保存协调器、Dexie 原子持久化端口、生命周期刷盘和最小失败重试 UI；不改 schema，不连接恢复/同步，不运行 EXP-01。
- 实际改动：新增 `ProgressSaveCoordinator`，默认 250ms 合并窗口、串行写入、最新值保留、幂等指纹、`idle/pending/saved/failed`、失败重试和生命周期 flush；进度与 `lastReadAt` 同一 Dexie 事务；阅读页失败持久告警与 44px 重试入口。
- TDD 证据：依次观察模块缺失、相同值重复写、新即时保存复用旧失败 Promise、被新值替代的旧失败制造虚假告警、flush 不重试失败值、flush 不等待最新排队值的 RED，分别修复后 9 个协调器场景 GREEN。
- 失败与因果链：一次把 storage-core 测试名错路由到 web-pwa，因无匹配测试 exit 1；改跑所属包后通过。最后一个生命周期探针曾因在释放第二个受控 Promise 前等待同一 drain 而超时；更正观测顺序后证明产品实现未挂死。这些是 TDD/命令因果链，不是 GATE-01 设计实验。
- 定向检查：storage-core 3 文件/14 测试通过；工作区共 179 测试通过；Web lint、API 非写入 lint、无 PWA 写入工作区 build、`git diff --check`、`--mode resume` 全部 exit 0。
- 安全边界：控制包 24/24、storage-core 9/9、两个 Web 改动文件各1/1 预检 Green。全仓 `security_scanner.py` exit 1 仍来自 PHASE-01 已登记的 `.DS_Store`、`.vscode`、PR 模板绝对路径、规则误报、历史原生壳生成物和正式二进制资源；不声称全仓安全门通过。
- 提交记录：TASK-0202 本地实现/证据切片 `3df02e098c6e8c07858b2b5cdc912b8a9cb68e4e`；未 push。
- 状态结论：TASK-0202 完成；只证明可控时钟与统一端口合同，不证明真实浏览器 1 秒落盘、强制关闭绝不丢失、GATE-01 或 EVID-17。
- 下一入口：PHASE-02 / TASK-0203；建立迁移前备份、幂等迁移、故障注入回滚和上一稳定版兼容测试。

### RUN-0009 · 2026-08-13T05:29:43+08:00 · PHASE-02 / TASK-0203
- 本轮输入：TASK-0202 checkpoint `01293c0`、Dexie v6–v9 schema 声明、可裁剪的旧元数据备份、TASK-0201 完整快照契约与 REV-0001 的迁移前备份/幂等/回滚/上版兼容承诺。
- 本轮范围：只建立纯端口化可恢复迁移编排内核、v8→v9 数据保持步骤和故障注入测试；不打开或升级真实 IndexedDB，不在数据库连接后伪装“迁移前备份”。
- 实际改动：新增 `LocalDataMigrationStore/Step/Result`、完整路径解析、稳定备份字节回读验证、步骤版本校验、替换后复核、备份未变校验、回滚后再对账与双错误保留；v8→v9 仅改 `source.databaseVersion`。
- TDD 证据：首先观察模块缺失 RED；备份不一致夹具首先因自身破坏引用完整性失败，更正为合法但正文被篡改的快照后验证成功；TypeScript 又捕获测试数组首项可空推断，增加夹具断言后通过。评审新增“写前步骤失败零补偿”探针先 RED，加入替换尝试边界后 GREEN。
- 故障注入：已覆盖备份写失败、备份回读篡改、写前步骤失败、替换后验证失败并成功回滚、回滚自身失败、缺完整路径和已到目标版本幂等。
- 定向检查：storage-core 4 文件/22 测试通过；工作区 187 测试通过；Web lint、API 非写入 lint、无 PWA 写入工作区 build、`git diff --check`、`--mode resume` 全部 exit 0。
- 安全边界：storage-core 11/11 预检 Green；控制包首次因报告中函数形式的数据库连接词面量触发 Yellow，等义改写为“连接初始化”后 25/25 Green。全仓既有 Zero-Leakage 红灯仍按 RUN-0008 保留，不声称全仓通过。
- 提交记录：TASK-0203 本地实现/证据切片 `3ef46eb2f3daef4990a9a52c9b6fbd103399c5f8`；未 push。
- 状态结论：TASK-0203 完成；只证明可连接的迁移安全内核和 v8 完整快照保持，不证明 Dexie 启动迁移已接线、EVID-20/EVID-25、GATE-01 或 PHASE-02 完成。
- 下一入口：PHASE-02 / TASK-0204；先实现 PHASE-02/EXP-01 真实检查器合同，再严格运行完整早期纵向薄切片。

### RUN-0010 · 2026-08-13T06:44:44+08:00 · PHASE-02 / TASK-0204 / EXP-02
- 本轮输入：EXP-01 失败证据 EVID-27、clean@`a52004ca51c534c8a4365079979227460b6d8b43`、固定 short-novel TXT、预登记 EXP-02 的 Worker 流式导入与新会话适配器差异。
- 本轮范围：只实现并执行第二种导入机制，沿用相同导入预览、书架、阅读、1 秒落盘、刷新、真离线、备份与隔离恢复结果判据；不扩张 PHASE-03~06，不覆盖 ATTEMPT-01。
- 实际改动：单本导入统一走 Worker；新增原子流式会话适配器与 5 个单测；新增 EXP-02 浏览器旅程；生产 PWA runner 改为直接管理 Next 子进程；检查器精确放行 EXP-02。
- 候选验证：流式会话 5/5、全工作区 197 tests、Web/API 非写入 lint、类型检查、无 PWA 写入 build 和精确 Playwright 列表均通过；候选提交为 `a52004ca51c534c8a4365079979227460b6d8b43`。
- 正式失败：`node scripts/verify-reading-world.mjs --phase 02 --experiment EXP-02 --output docs/goals/reading-world-v1/evidence/artifacts/gate-01-attempt-02.json` exit 1。前五项检查通过，浏览器纵切片在导入预览前超时；页面停在“引擎解析章节中”，trace 记录 `Cannot read properties of undefined (reading 'bind')` 的生产打包运行时异常。
- 副作用处理：Playwright/Next 均已退出且 3102 无监听；构建改写的受控 `public/sw.js` 已反向应用单一生成差异，补偿后 blob `94df47777cded246a6787c4816daaed6cffdd055` 与候选提交一致。正式报告仍保留 `trackedWorktreeMutated=true`，不洗白实验过程。
- 活体证据：EVID-28 JSON SHA-256 为 `ae4b9f28ce27f774229bc4f8190a77a7ae7ac4a820f555ee539ff11b2752c022`；6/6 日志存在且 SHA 独立复算匹配。
- 状态结论：TRY-02 失败，GATE-01 未通过，失败计数 2/3；尚未熔断，也不得进入 PHASE-03。
- 下一入口：PHASE-02 / TASK-0204 / EXP-03；固定 EPUB 改走兼容存储适配器并复用相同用户结果与失败判据。若 ATTEMPT-03 失败，立即进入 `BLOCKED_DESIGN_REVIEW_REQUIRED` 并请求新 REV。

### RUN-0011 · 2026-08-13T07:03:44+08:00 · PHASE-02 / TASK-0204 / EXP-03 熔断
- 本轮输入：EVID-27/28、clean@`bae4d0fedbe7d61df9badc8248edc3d7f09de65c`、字节 SHA-256 `6e673b1dce98a8236a3668c66bce18cca906f4ed39862b08d296409f8ebc67e9` 的固定两章 EPUB、预登记 EXP-03 兼容存储差异。
- 本轮范围：最后一次 GATE-01 差异实验；固定 EPUB 主线程解析、原子任务生成、写后读回校验与失败删除，再走相同阅读/离线/备份恢复结果链。不修改或重跑 EXP-01/02。
- 候选实现与验证：新增 6 个兼容存储合同测试、EPUB 恶意标记净化回归、固定可复算 fixture 和 EXP-03 旅程；全仓 204 tests、Web/API lint、类型检查、无 PWA 写入 build 均通过。EPUB 测试安全预检的唯一 Yellow 是离线 XML namespace，人工复核无网络副作用。
- 正式失败：ATTEMPT-03 前五项检查全部 exit 0；浏览器纵切完成 EPUB 导入预览、加入书架、阅读、书签、1 秒内进度落盘、刷新、真离线、备份下载和隔离恢复，最终在恢复后书架因“固定 EPUB”同时出现在最近阅读与私人藏书而触发 strict locator 歧义，整项 exit 1。
- 副作用处理：正式报告保留 `trackedMutationObservedBeforeCompensation=true` 和补偿前 `public/sw.js` 变更；检查器恢复后 `trackedWorktreeMutated=false`，当前 blob 与 clean 候选一致，3102 无监听。EVID-29 六份日志 SHA 独立复算 6/6。
- 状态结论：TRY-03 失败；REV-0001 下同一 GATE-01 的三次差异化实验均失败，按总控自动进入 `BLOCKED_DESIGN_REVIEW_REQUIRED`。GATE-01、PHASE-02 与 Goal 均未完成，PHASE-03~06 继续冻结。
- 下一入口：等待用户批准新控制修订。建议新 REV 先增加验证基础设施资格门，区分产品结果失败与检查器不可判定，并只在资格门通过后注册新的差异实验；不得改写 EVID-27/28/29。

### RUN-0012 · 2026-08-13T08:36:02+08:00 · REV-0002 恢复
- 本轮输入：用户原文“批准 REV-0002”、clean@`fbbbf5642ee8e4aa36699d8f466fc630f0f93447`、REV-0001 三份不可变 ATTEMPT 与设计复核建议。
- 本轮范围：只创建 REV-0002 控制修订并恢复控制层执行；不修产品、不重跑 GATE-01、不开始 PHASE-03、不部署或触及真实数据。
- 授权证据：DEC-14 / EVID-44 / ACT-07；批准摘要 SHA-256 `9858a1c86f33c74aa42ce5801060d1dca7b974881c0e140a56e7e9af5de1a7df`。
- 修订设计：追加 GATE-00 验证基础设施资格门和 EXP-08/12/13；只有 EVID-45 FINAL 通过后，才允许按 EXP-09/10/11 重新验证 GATE-01。两道门分别计数，任一门在 REV-0002 下三次差异失败都自动熔断。
- 历史继承：REV-0001 标记 SUPERSEDED，但 TRY-01/02/03、EVID-27/28/29 及失败结论不删除、不改写、不折算为 REV-0002 的失败次数。
- 状态结论：控制层恢复为执行中；GATE-00、GATE-01、PHASE-02 和 Goal 均未完成，PHASE-03~06 继续冻结。
- 下一入口：PHASE-02 / TASK-0205 / EXP-08；先证明检查器可判定、可补偿、无进程或端口遗留且证据可复算。

### RUN-0013 · 2026-08-13T08:58:28+08:00 · PHASE-02 / TASK-0205 / EXP-08
- 本轮输入：clean@`45ffb56cab02b0b2a6fba93a56603bfc1b570a92`、REV-0002、固定空书架只读探针与 GATE-00 基线资格合同。
- 本轮范围：只验证设施生命周期与可判定性，不导入书籍、不写阅读数据、不运行 GATE-01。
- 候选验证：资格纯合同 9/9、精确 Playwright 枚举 1/1、全仓 204 tests、无 PWA 写入 build、Web/API lint 与控制包 resume 检查均通过。
- 正式失败：EVID-51 前两项检查 exit 0；生产构建、服务健康、启动前后端口、进程组、public 字节恢复与 3/3 records SHA 均可靠。空书架页面最终包含唯一目标，但测试在 React 稳定渲染前立即 count 得到 0，外层分类为 `VALIDATOR_INDETERMINATE / TARGET_COUNT_0`，没有误记产品失败。
- 副作用处理：3102 无监听、无 gate-00/Next/Playwright 孤儿进程，`public/sw.js` blob 与 clean 候选一致。安全预检发现报告与两份 records 的命令首行含个人 Node 绝对路径；归档前仅确定性替换为 `$HOME`，重算对应 record SHA 与外层 SHA，不修改退出码、分类、时间或日志正文。EVID-51 最终 JSON SHA-256 `f6ad55052a00fb8d5470858ba8849035defdeb3fa4c79a92758c1cf0120fe8cc`，3/3 records 独立复算匹配。
- 状态结论：TRY-04 失败，GATE-00 计数 1/3；GATE-01 与 PHASE-02 未完成，产品尝试计数不变。
- 下一入口：PHASE-02 / TASK-0205 / EXP-12；增加稳定渲染等待，并把生成物与显式进程生命周期进一步隔离，复用相同资格判据。

### RUN-0014 · 2026-08-13T09:21:29+08:00 · PHASE-02 / TASK-0205 / EXP-12
- 本轮输入：EVID-51、clean@`425efaea499d0c8a059758b676e48941539314ba`、EXP-12 稳定渲染/临时 PWA 目录/显式进程组差异。
- 本轮范围：只复验 GATE-00 资格设施；不运行 GATE-01、不导入书籍、不改产品机制。
- 候选验证：资格合同 12/12、精确枚举 1/1、全仓 204 tests、无 PWA 写入 build、Web/API lint、控制包 resume 与变更文件安全预检通过。候选还证明非法 EXP-08 重放在任何归档副作用前 exit 2，历史哨兵字节不变。
- 正式结果：EVID-52 三项检查全部 exit 0；唯一枚举/目标为 1，生产构建、服务健康、浏览器只读空书架探针通过，启动前后 3102 空闲、孤儿进程 0、受控 public 字节指纹一致，临时 PWA 目录已删除。
- 活体证据：EVID-52 JSON SHA-256 `12b2a107155bf24e57bcef838712529757153309f3b97ac24c9b6fb1167eb5b7`，3/3 records 存在且 SHA 外层独立复算匹配；报告与 records 无个人绝对路径。
- 状态结论：TRY-05 通过；只证明 GATE-00 ATTEMPT，不证明 GATE-01、PHASE-02 或 Goal 完成。
- 下一入口：将通过 ATTEMPT 固化到 clean 提交，再生成 EVID-45 FINAL；FINAL 未闭合前不得进入 EXP-09。

### RUN-0015 · 2026-08-13T09:31:36+08:00 · PHASE-02 / TASK-0205 / GATE-00 FINAL
- 本轮输入：clean@`5ba6284dcc1acf8216db128f39b282669748e5bf`、EVID-52 PASS ATTEMPT、不可覆盖的 FINAL 收束器。
- 本轮范围：只从已固化的资格 ATTEMPT 生成和复算 EVID-45，不运行 GATE-01、不改产品数据或阅读机制。
- 候选验证：FINAL 构造合同 13/13、全仓 204 tests、执行期控制包 resume 检查通过；三个改动文件逐文件安全预检 Green；脏工作树运行按合同拒绝且未生成证据。
- 正式结果：`node scripts/finalize-gate-00.mjs` 从 clean 基线 exit 0；EVID-45 SHA-256 `2fd6b61a1fb58a6a6b12b3533e6db5939badd422463884c43d18036538f841c3`，来源 EVID-52 SHA 精确匹配，implementation/evidence commit 均为当前历史祖先，3/3 records 闭合且无个人绝对路径。
- 状态结论：GATE-00 通过；仅放行 REV-0002 EXP-09/10/11，GATE-01、PHASE-02 与 Goal 均未完成，PHASE-03 继续冻结。
- 下一入口：PHASE-02 / TASK-0206 / EXP-09；先在候选验证中实现固定 EPUB、兼容存储读回与唯一 book ID 定位，再按 EVID-48 固定命令正式运行一次。

### RUN-0016 · 2026-08-13T09:54:24+08:00 · PHASE-02 / TASK-0206 / EXP-09
- 本轮输入：clean@`8a7b5b7c7e053c360b6e2050eda1012402484130`、EVID-45、固定 EPUB、兼容存储与书架现有 `data-book-id`。
- 本轮范围：只执行 REV-0002 首个产品实验；不运行 EXP-10/11、不扩张 PHASE-03、不改远端或真实用户数据。
- 根因预检：候选首次回放在 `navigator.serviceWorker.ready` 超时；trace 证明旧 public SW 请求当前构建 `_buildManifest.js` 返回 404。该候选未写 EVID-48；最小修复是在 runner 生命周期内发布本次隔离构建的 PWA 资产，finally 恢复 public。修复后候选完整通过，未放宽离线断言或延长超时。
- 候选验证：产品/资格合同 19/19、精确 EXP-09 枚举 1、全仓 204 tests、全仓无 PWA 写入 build、Web/API lint、控制包 resume 与六个改动文件逐项安全预检全部通过。
- 正式结果：EVID-48 固定命令 exit 0；固定 EPUB 完成导入预览、书架、阅读、书签、1 秒内第二章进度落盘、刷新续读、Service Worker 控制、真断网续读、最小备份及新浏览器上下文隔离恢复，并按备份书 ID 唯一打开恢复书籍。
- 活体证据：归档前仅删除纵切日志末尾单个空白行并级联重算该 record SHA 与外层 SHA，不改测试正文、退出码、时间或产品结论；EVID-48 最终 SHA-256 `8fbf1201f7dbdecfc29a94e021318cb7606f7240160efe6cc62ede6fab909245`，7/7 records SHA 独立复算匹配，productGate=`PASS`，3102 前后空闲、孤儿进程 0、public 指纹一致、临时目录清理且无个人绝对路径。
- 状态结论：TRY-06 通过；停止后续差异实验。GATE-01 已有 PASS ATTEMPT，但 EVID-17 FINAL 与阶段审查未闭合，PHASE-02 和 Goal 仍未完成。
- 下一入口：先固化 EVID-48 至 clean 证据提交，再生成 EVID-17、`reports/phase-02-local-data.json` 与 `reviews/phase-02-gate-01.md`；全部复算前不进入 PHASE-03。

### RUN-0017 · 2026-08-13T10:04:41+08:00 · PHASE-02 / GATE-01 FINAL
- 本轮输入：clean@`a683b4e77eaf5ab38d166710850544c43cd7ac04`、EVID-45、EVID-48 与不可覆盖的 GATE-01 收束器。
- 本轮范围：只生成 EVID-17、阶段机器汇总和 GATE-01 审查；不执行新产品实验、不开始 PHASE-03。
- 正式结果：EVID-17 SHA-256 `ff273958e72ca28a6e87012a26b448eabe5f59b05efcf4b11df05feb9236a880`；来源 EVID-48 SHA `8fbf1201f7dbdecfc29a94e021318cb7606f7240160efe6cc62ede6fab909245` 与前置 EVID-45 SHA `2fd6b61a1fb58a6a6b12b3533e6db5939badd422463884c43d18036538f841c3` 均精确匹配。
- 人工检查：备份/恢复与保存失败提示有可执行下一步；迁移仅冻结写前失败、已回滚、回滚失败三类说明，真实升级 UI 未接入，终局用户评分未执行。
- 门禁复核：GATE-01 已通过，但 PHASE-03 明确依赖 PHASE-02 完成且 RISK-03 通过；EVID-25 尚未生成。因此阶段汇总记为 `PENDING_RISK_03`，不提前放行。
- 下一入口：PHASE-02 / TASK-0207；以隔离浏览器数据库闭合真实 Dexie 迁移门并生成 EVID-25。

### RUN-0018 · 2026-08-13T10:39:10+08:00 · PHASE-02 / TASK-0207 / RISK-03
- 本轮输入：clean@`d1ccbaf644c2e6df77d6b76f62b090028b81baa3`、v9 真实 IndexedDB fixture、v10 Dexie versionchange、完整公开快照契约。
- 本轮范围：只闭合本地迁移风险门；不运行 GATE-01、新导入扩张、同步或真实用户数据迁移。
- 实现结果：v10 新增 `migrationBackups` 表；versionchange 事务先读取书、章、进度、书签、来源与文件引用，结合设置生成 v9 完整快照，写入并回读验证后才允许升级提交。存在但损坏的设置会稳定中止，不静默替换为默认值。
- 正式结果：EVID-25 固定命令 exit 0；真实 v9→v10 升级保留旧数据并生成完整备份，重开不重复改写；损坏设置触发升级失败后原生数据库版本仍为 v9，旧书与正文可读。
- 活体证据：归档前仅删除 live 日志末尾单个空白行并级联重算 record 与外层 SHA；EVID-25 最终 SHA-256 `724a0308733bd188722dff407bf42d0ae14e4931eeb9cc2364fb89696cee9e91`，6/6 records 匹配，migrationGate=`PASS`，3102 前后空闲、孤儿进程 0、public 指纹一致且无个人绝对路径。
- 状态结论：RISK-03 通过；但 `describeLocalDataMigrationError()` 尚未接应用启动失败界面，人工检查点仍缺真实展示与重试回放，PHASE-02 不提前完成。
- 下一入口：数据库显式启动门 + 用户可见迁移失败说明/重试，隔离浏览器验证后再复审阶段完成。

### RUN-0019 · 2026-08-13T11:03:00+08:00 · PHASE-02 收束 / PHASE-03 启动
- 本轮输入：EVID-45、EVID-17、EVID-25、clean@`a249d5139bee1f0382d7b974387a404f0ab07628` 与 PHASE-02 三份阶段报告。
- 本轮范围：只闭合迁移失败人工检查点并同步阶段状态；不实现 PHASE-03 功能、不部署、不触及真实用户数据。
- 实现结果：`RouteProvider` 在业务视图前等待数据库打开；升级失败显示明确说明与 44px 重试按钮。隔离浏览器点击重试后仍安全失败，数据库保持 v9、旧书与正文可读。
- 验证结果：全仓 208 tests、完整禁用 PWA 写入 build、Web/API lint、启动门静态合同、真实迁移 UI 回放、逐文件安全预检与副作用检查通过；EVID-25 保持 SHA `724a0308733bd188722dff407bf42d0ae14e4931eeb9cc2364fb89696cee9e91`，未重跑或改写。
- 状态结论：PHASE-02 完成；PHASE-03 进入执行中。只证明本地数据骨架、早期纵切与迁移门，不证明 PHASE-03~09、终局人工体验或 Goal 完成。
- 下一入口：PHASE-03 / TASK-0301；先冻结导入任务状态机与容量 fixtures，再实现可重放检查器合同。

### RUN-0020 · 2026-08-13T12:10:00+08:00 · PHASE-03 / TASK-0301 单文件耐久任务子切片
- 本轮输入：PHASE-02 checkpoint `634c85f42434211ceba4a5e3f553dda226fcf52b`、现有 TXT Worker/EPUB 兼容导入、预览落库事务和两条会静默删除空任务的后台 GC。
- 本轮范围：只闭合单文件 TXT/EPUB 的建档、进度、失败、取消、重试、中断恢复与预览落库状态；不扩张备份格式、同步、文件夹/URL 或容量结论。
- 实现结果：新增 `queued/reading/parsing/preview/saving/completed/failed/cancelled` 耐久状态机、逐任务串行控制器和精确读回；TXT/EPUB 复用预留 ID；中断草稿转可见失败；取消/失败草稿保留；GC 只清旧版空壳；书/章节与 `saving/completed` 在同一事务，保存失败保留完整解析草稿。
- TDD 与失败链：状态机、读回、快速 Worker 事件、预留 ID、GC 保留、保存重试和完成轻量化均先观察 RED 后实现 GREEN。两次语法错误与 exact optional 类型错误由定向检查捕获并局部修复；未触发产品风险门实验，也未改写既有 ATTEMPT。
- 验证结果：全工作区 226 tests、Web lint、API 非写入 lint、完整禁用 PWA 写入 build、`git diff --check` 全部通过；真实 Chrome 的 TXT 导入、预览、加入书架、阅读、书签和刷新续读 1/1 通过。
- 安全与控制：执行期 resume 检查通过；控制包 37/37 Green，九个关键实现文件逐项 Green；导入页因既有合法 URL 协议字面量为人工复核 Yellow，无新增外传、密钥或权限扩张。
- 状态结论：PHASE-03 保持执行中；本记录只证明 TASK-0301 的单文件子切片，不证明文件夹/URL、200MB TXT、500MB EPUB、1 万章、EVID-03 或 PHASE-03 完成。
- 下一入口：PHASE-03 / TASK-0301；统一文件夹/合法 URL 任务端口，随后生成容量 fixtures、故障注入和可重放阶段检查器。

### RUN-0021 · 2026-08-13T12:35:00+08:00 · PHASE-03 / TASK-0301 批量与合法 URL 子切片
- 本轮输入：单文件 checkpoint `6e539a2af81cdc42585e3678192a69633d340892`、批量生产主线程/开发 Worker 分裂、URL 旧一次性 `add` 路径和预览页手写事务。
- 本轮范围：统一批量与合法 URL 的耐久任务及书架提交语义；不把文件夹目录索引伪装成全文解析，不生成容量完成结论，不修改既有 GATE-01 证据。
- 实现结果：抽出原子 `commitDurableImportResult` 端口并由预览与批量共用；批量与 URL 均在读取/请求前建档，失败保留；URL 保存合法来源；生产/开发都用 Worker；TXT 与 EPUB Worker 拆分依赖边界。
- 失败与因果链：首次 Chrome 候选中 URL 通过，批量 0/2，两个任务均安全停在 `failed`，trace 定位共享 Worker 将 TXT 与 EPUB/XML 打入同一运行时并触发 `bind` 初始化异常。第二种机制拆为格式专属 Worker 后，开发 Chrome 2/2、生产 Web Chrome 2/2 均通过；首次失败产物保留，未计为 GATE 风险门实验。
- 验证结果：全工作区 231 tests、Web lint、API 非写入 lint、完整禁用 PWA 写入 build、类型检查和 `git diff --check` 通过；开发与生产 Web 的批量两本/合法 URL 回放均通过，完成任务只留零章轻量历史。
- 旁路事实：API `start:prod` 因运行时找不到直接依赖 `express` 退出；生产 Web 回放使用仅服务 `/ai/status` 的本机健康桩且旅程不调用 API。因此本轮不宣称 API 生产启动通过，缺口留待 PHASE-08/09 生产硬化。
- 状态结论：PHASE-03 与 TASK-0301 仍执行中；文件夹任务语义、200MB TXT、500MB EPUB、1 万章、中断/配额活体与阶段检查器尚未闭合。
- 下一入口：PHASE-03 / TASK-0301；定义目录扫描/预览/索引提交任务，再建立内容寻址容量 fixtures 与故障注入合同。

### RUN-0022 · 2026-08-13T13:15:00+08:00 · PHASE-03 / TASK-0301 容量与 Worker 安全子切片
- 本轮输入：批量/URL checkpoint `9b312f2d6df25ce5b8b5120700c77db7d24a6432`、REQ-02 的 200MB TXT / 500MB EPUB / 1 万章门槛、格式专属 Worker 路径。
- 本轮范围：只闭合可重放容量 fixture、主线程响应与 Worker-safe EPUB 净化；不扩张备份/同步/阅读 UI，不修改 EVID-17 或历史 ATTEMPT。
- 候选失败链：TXT 首次因 fixture 末尾截断 UTF-8 字符而只识别 1 章，修复生成器后通过；EPUB 首次因 DOMPurify 在 Worker 初始化访问未定义实例而进入可重试失败，替换为 XML DOM 允许列表净化后通过。两类都是实现候选因果，不计 GATE-01 三次设计实验。
- 活体容量：TXT `209746702` bytes / 10000 章 / SHA `9a3ffff13fd14eefccf8cf1529930651a3a5994f5c5061266353d16480962670`；EPUB `524289552` bytes / 1 章 / SHA `e3643a62a441383bc3fd2052c6c346185c5826a8ba8c91bde36be324655ba461`。系统 Chrome 最终精确枚举 2/2，串行通过 40.3 秒，心跳与 IndexedDB 耐久章数全部匹配。
- 安全边界：EPUB 净化的 script、事件属性、危险 URL、iframe 与 style 否定测试通过；单文件 Worker 崩溃不再退回主线程整本复制/解析，而是保留可重试耐久草稿。fixture 清理只允许对 SHA/size 全部校验且无外来文件的生成器自有目录执行。
- 验证结果：fixture 合同 4/4、工作区 231 tests、Web/API 非写入 lint、无 PWA 写入生产构建、diff 校验与 resume 控制复算全部通过。控制包 38/38 Green；本轮文件的 Yellow 仅来自合法 URL/IndexedDB/API namespace 字面量与恶意输入否定测试，人工复核无凭证、执行下载或新增外传。
- 状态结论：容量子切片通过；PHASE-03 与 TASK-0301 仍执行中，不声称 EVID-03 FINAL、文件夹、故障注入或 Goal 完成。
- 下一入口：PHASE-03 / TASK-0301；先实现目录扫描/预览/索引提交的耐久任务，再闭合配额、权限丢失和 Worker 终止的故障注入与阶段检查器。

### RUN-0023 · 2026-08-13T13:50:00+08:00 · PHASE-03 / TASK-0301 文件夹耐久任务子切片
- 本轮输入：容量 checkpoint `b84ec096c068f78be3f42d488ca57b6e3b766269`、页面内非耐久目录扫描与四表手写事务、File System Access 句柄落库路径。
- 本轮范围：只闭合目录扫描进度、中断/重新授权、显式放弃与原子元数据提交；不改目录懒加载阅读机制，不外推为 OS 权限、故障注入、EVID-03 或 PHASE-03 完成。
- 实现结果：新增 folder 扫描进度与 `restart` 转换；刷新后不伪造预览存活，必须重新授权并在同 task ID 上 attempt+1 重扫；同会话提交失败保留 preview 可直接重试；放弃转 cancelled。预览树先在事务外纯计算为四组写入计划，事务内用固定 bulk 写与 `saving/completed` 原子提交。
- 失败谱系：前两次真实 Chrome 提交因递归 async 闭包跨越 Dexie 生命周期而报 `Transaction committed too early`，产品正确回滚并保留可重试失败；改为纯计算 + bulk 事务。一次 Chrome context 启动超时与一次 native handle 跨进程序列化为 `{}` 均是 VALIDATOR_INDETERMINATE，不计产品失败。本轮不是 GATE-01 新设计实验，不改写其 ATTEMPT 计数。
- 活体结果：系统 Chrome 使用原生 OPFS directory/file handles 与真实 IndexedDB，仅注入选择器返回值；最终 2/2 通过 30.5 秒。首条从 preview 回读 2 文件/2 目录扫描进度，提交后 source handle、逻辑文件夹、2 书壳、2 索引与 completed 任务同时存在；第二条刷新 preview 后以同 task ID / attempt+1 重新授权、重扫和提交。工作区 237 tests（逐包 4+10+17+10+52+43+31+70）、Web/API lint、无 PWA 写入生产构建和 diff 校验均通过。OS 选择器/权限撤销/重新授权仍是人工检查点。
- 控制与安全：resume 复算通过；控制包 Yellow 只因报告中的 IndexedDB `open()` 字面量。本轮六文件四个 Green，导入页的 `https://` 与 E2E 的 `open()` 经人工复核分别是合法 URL 边界与 IndexedDB 探针，无凭证、下载执行或新增外传；3100/4100 补偿后无监听。
- 状态结论：文件夹耐久任务子切片通过；TASK-0301 和 PHASE-03 仍执行中，不生成 FINAL 证据。
- 下一入口：PHASE-03 / TASK-0301；闭合存储配额不足、真实目录权限丢失和 Worker 强制终止的 UI 故障注入，再固化 PHASE-03 检查器。

### RUN-0024 · 2026-08-13T14:20:00+08:00 · PHASE-03 / TASK-0301 故障恢复子切片
- 本轮输入：目录 checkpoint `694f155e078706eea5fbddd45f187dd5d071c5a2`、原生 QuotaExceededError/NotAllowedError 未翻译、单文件 Worker 可重试 UI 和既有原子提交端口。
- 本轮范围：只闭合配额、目录权限和 Worker 强制终止的用户可见恢复；不加生产测试开关，不扩张备份/恢复或改写 GATE-01 证据。
- TDD 与实现：三条错误引导测试先 RED，证明原生异常/内部码直接泄露；按 Error.name 与固定故障码映射为可执行中文建议，预览保存页也复用同一翻译边界。原生边界一次性注入覆盖 IndexedDB books.add 配额、目录 getFile 权限与 Worker error，生产代码无注入开关。
- 失败谱系：首次三类矩阵中配额与权限恢复通过；Worker 故障已安全进入 failed，建议/按钮均出现，但透明 file input 拦截“立即重试”点击并超时。修正控件层级后精确 Worker 用例 1/1 通过 21.0 秒。该失败是交互实现候选，不计 GATE-01 设计实验。
- 活体结果：系统 Chrome 最终精确枚举 3/3 且 `3 passed (25.0s)`。配额失败事务回滚、完整解析草稿保留并重存成功；权限失效任务保留并在同 task ID / attempt+1 重新授权重扫；Worker 终止后真实点击重试并在同 task ID / attempt+1 进入 preview。
- 回归结果：工作区 240 tests（逐包 4+10+17+10+52+43+31+73）、Web/API 非写入 lint、无 PWA 写入生产构建与 diff 校验全部通过。
- 控制与安全：resume 复算通过，3100/4100 无监听；实现/单测 3 Green，导入页 `https://`、E2E IndexedDB `open()` 与引用该二字面量的控制报告为人工复核 Yellow，无凭证、下载执行或新增外传。
- 证据边界：配额与 Worker 为真实页面/原生浏览器边界故障；权限为原生 NotAllowedError 等价注入，不替代真实 OS 选择器撤权人工检查。TASK-0301 与 PHASE-03 仍执行中，不生成 EVID-03 FINAL。
- 下一入口：PHASE-03 / TASK-0301；将容量、耐久目录与三类故障命令固化到 `verify-reading-world.mjs --phase 03`，明确 fixture 生成/验证/清理、端口与进程补偿；再执行真实 OS 目录权限人工检查。

### RUN-0025 · 2026-08-13T15:00:00+08:00 · PHASE-03 检查器正式首跑
- 本轮输入：故障恢复 checkpoint `a32ff596a7a150655183440891313ef084eedf55`、检查器 checkpoint `000adfea7ea74c0316eba729ea187afdf5578fef`、PHASE-03 阶段合同和安全容量 runner。
- 实现与候选：`verify-reading-world.mjs --phase 03` 新增 12 项真实检查；容量 runner 在独立候选中完成预清理、full fixture 生成、2/2 SHA/size 校验、精确 2 条枚举、真实 Chrome 压力回放和 finally 安全清理，最终 `IMPORT_CAPACITY_OBSERVATION.classification=PASS`。
- 正式命令：`node scripts/verify-reading-world.mjs --phase 03 --output docs/goals/reading-world-v1/reports/phase-03-import-portability.json`。结果 11 通过 / 1 失败 / tracked mutation 0，总体 FAIL。导入 fixture/runner 合同、parser、content-utils、240 项工作区测试、Web/API lint、无 PWA 写入生产构建、完整容量、目录 2/2 和故障 3/3 全部通过。
- 唯一失败：`PORTABILITY_CONTRACT` exit 1，精确缺少 `apps/web-pwa/e2e/backup-restore.spec.ts`、`reports/backup-format-v1.md`和 `reviews/phase-03-data-portability.md`。这是 TASK-0302~0304 尚未实现的真实下一入口，不是 TASK-0301 导入回退，不得将 11 项绿灯冒充 PHASE-03 通过。
- 独立复算：报告绑定 clean@`000adfea7ea74c0316eba729ea187afdf5578fef`；12/12 records 存在且 SHA-256 与外层 JSON 匹配；full fixture 已清理，3100/4100 无监听，所有检查 `trackedWorktreeMutated=false`。
- 状态结论：TASK-0301 的自动化/检查器范围闭合，但真实 OS 目录选择、撤权和重新授权仍是人工检查点；TASK-0301、PHASE-03 和 Goal 均不标记完成，不生成 EVID-03 FINAL。
- 下一入口：先完成 TASK-0301 真实 OS 权限人工检查；通过后从 TASK-0302 建立带 manifest、版本、逐项校验和恢复预览的完整备份包。

### RUN-0026 · 2026-08-13T15:05:00+08:00 · TASK-0301 真实 OS 权限检查暂停
- 本轮输入：clean@`5ccf510f58c44904d4b91da9ab8fbf92824aca9e`、computer-use 原生 Mac/Chrome 操作合同、仓库忽略目录 `.tmp/manual-folder-permission` 中两份无敏感测试 TXT。
- 本轮范围：只计划在系统 Chrome 中使用原生目录选择器完成选择 -> 撤权 -> 重新授权，不选择用户真实书库，不用 Playwright/OPFS 等价注入替代人工结论。
- 暂停事实：computer-use 在首次只读 Chrome 状态前返回“Mac is locked and automatic unlock could not unlock it”；尚未点击、选择、授权或改变任何 OS/Chrome 权限，不得记为通过、失败或设计实验。
- 副作用补偿：本地 Web/API 开发服务已停止，3001/4100 无监听；隔离 fixture 保留以便 `verify_before_repeat`，不属于用户真实阅读数据且被 Git 忽略。
- 状态结论：这是 `human_required` 环境暂停，不是 `BLOCKED_DESIGN_REVIEW_REQUIRED`，不增加任何设计门 ATTEMPT 计数；TASK-0301、PHASE-03 和 Goal 仍未完成。
- 恢复入口：用户手动解锁 Mac 后回复“已解锁，继续”；先确认 3001/4100 空闲和 fixture 仍在，重启本地服务，再按 computer-use 合同从 Chrome 只读状态继续。

### RUN-0027 · 2026-08-13T22:34:24+08:00 · TASK-0301 原生目录权限活体通过
- 本轮输入：用户原文“已解锁，继续”、clean@`7994fdf95fbbaf80a629023a21ea87c671884778`、RUN-0026 固定隔离目录与两份 SHA 锁定 TXT。
- 本轮范围：严格重放真实 macOS/Chrome 目录选择、授权、撤权和重新授权；不读取用户真实书库、不以自动化注入替代原生结论、不扩张备份或同步。
- 原生选择与扫描：系统 Chrome 访客会话通过 macOS 原生目录选择器选择隔离目录；Chrome 明确提示站点可查看并复制该目录文件。允许后应用识别 1 个分类与 2 本 TXT，`星海.txt` 88 B、`火星.txt` 97 B，与固定输入一致，并成功入库为“科幻”书箧。
- 真实撤权与恢复：从 Chrome“此页面可查看文件”快捷面板执行“撤消访问权限”；打开《火星》后产品显示“物理起封授权缺失”与 44px“唤醒物理授权”动作，没有伪成功。点击动作并重新允许同一目录后，阅读器自动恢复至第一章“抵达”，正文“风吹过红色平原。”可读。
- 副作用补偿：关闭隔离访客窗口并停止本地 Web/API 服务；3001/4100 无监听，工作树在落盘本记录前保持 clean；两份 fixture SHA 分别仍为 `3eb477ec7a1fa55e2065079e72f32c26066ad7272a4cade69646c1636196661f`、`a7448067d9ac66897f6ab64ba7cf5aa7b821994b003d5cf95b6f12be89cc6d29`。
- 活体记录：[TASK-0301 原生权限记录](reviews/task%2D0301-native-folder-permission.md)；该记录补齐原生权限人工检查，但不覆盖 RUN-0024 的等价注入或 RUN-0025 的机器报告。
- 状态结论：TASK-0301 完成；PHASE-03 与 Goal 仍执行中，EVID-03/04/05/16 均未生成 FINAL，不把导入子域完成外推为阶段完成。
- 下一入口：PHASE-03 / TASK-0302；按 `replay_safe` 建立内容寻址、版本化、带 manifest/逐项校验/公开 schema 的完整备份包与恢复预览流程，契约写入 `reports/backup-format-v1.md`。

### RUN-0028 · 2026-08-13T22:50:00+08:00 · 用户体验与延期部署授权映射
- 新输入：用户指出当前 UI 整体到细节、图标、文案和字体仍不够圆润自然；要求继续关注翻页、字体、章节切换、进度与手机适配；允许按需使用 GSAP；并授权完成后在 `root@tx.guyue.site` 部署一份，但不得影响宝塔管理的既有服务与对外代理。
- 控制判断：视觉与阅读要求分别落在 DEC-12/REQ-13/PHASE-05 和 REQ-01/06/12/PHASE-04/08，强化既有验收而不改变产品方向、机制或阶段依赖，不触发 REV-0003。当前仍按 PHASE-03 / TASK-0302 执行，不提前进行 UI 大改。
- GSAP 边界：已读取用户点名的 `gsap-core` 技能；仅在 PHASE-04/05 对可中断、同步的翻页、章节切换或面板过渡按需使用，并通过 `gsap.matchMedia()` 响应手机/桌面和 reduced-motion。圆角、字体、图标、文案与静态层级用设计系统/CSS解决，不以动画掩盖质感问题。
- 外部授权：新增 ACT-08，协议状态 `APPROVED`，但授权文本将执行前提冻结在 PHASE-09 候选、本地发布门和人工体验通过之后。届时先只读盘点宝塔、端口、站点、反代、证书和磁盘，再使用独立目录/内部端口；任何覆盖/停止既有服务、开放公网端口、改证书或真实数据迁移都超出该授权并必须暂停。
- 当前边界：本轮未连接、探测或修改 VPS；Goal、PHASE-03 与部署均未完成。

### RUN-0029 · 2026-08-13T23:12:00+08:00 · PHASE-03 / TASK-0302 完整包与恢复预览
- 本轮输入：TASK-0301 checkpoint `fee1ea1`、PHASE-02 `LocalDataSnapshotEnvelope` v1、旧空库恢复端口和 REQ-03/DEC-10 的完整包/预览/逐项校验承诺。
- 本轮范围：只建立版本化可携带包、内容完整性清单、旧快照兼容与写入前预览；按阶段边界不提前实现合并恢复、冲突处理或人读导出。
- TDD 与实现：先观察 `portable-backup-package` 模块缺失 RED；随后新增确定性 v1 外层、唯一安全条目路径、UTF-8 byteLength、SHA-256、manifest/entries 集合一致、未来版本稳定拒绝、数值与路径边界。49 项 storage 测试通过；相同快照生成相同字节与内容 ID。
- UI 与兼容：设置页下载内容寻址完整包；选择文件先逐项校验并显示书/章/进度/书签/文件引用影响，明确“当前尚未写入书架”，只有再次确认才恢复到空库并回读对账。上一稳定版单快照 v1 仍可预览/恢复，但显示“不含包级 SHA-256 manifest”警告。
- 活体回放：系统 Chrome 唯一旅程验证篡改包被拒且数据库零写入、有效包预览仍零写入、确认后 1 本书/2 章/1 进度/1 书签逐项恢复。首轮验证器因 Next 路由 announcer 同为 `role=alert` 发生 strict locator 歧义；收紧到精确错误文案后通过。一次后续回放在浏览器 context setup 前 30 秒超时，保持产品断言不变、仅将总时限提高到 90 秒后 `1 passed (24.6s)`。
- 历史回归与副作用：旧 EXP-09 用户结果在生产 runner 中测试索引为 passed，但 runner 自身未退出、3102 与生成 SW 未及时补偿；按候选设施失败处理，终止该次进程组，最终 `public/sw.js` blob 与 HEAD 同为 `94df47777cded246a6787c4816daaed6cffdd055`，不覆盖 EVID-48/EVID-17，也不登记新设计门 ATTEMPT。最终 3100/3102/4100 无监听。
- 门禁：全工作区 245 tests、无 PWA 写入生产构建 13/13 静态页、Web 类型/lint、API 非写入 lint、控制包 resume 与六个关键文件安全预检 Green；格式契约为 `reports/backup-format-v1.md`。
- 安全复核：本轮新增实现/契约与 EVID-54/总控均为 Green；执行账本全文件仍因历史合法 URL 与数据库初始化词面量被启发式规则标红，人工逐项确认无凭证、无外传。任务记录路径最初因普通文件名前缀误命中 Provider Key 正则，改为等价 URL 编码链接后不再含该疑似凭证字面量。
- 提交记录：TASK-0302 产品切片 `70aeeb0`；未 push。
- 状态结论：TASK-0302 完成；只证明完整包、逐项校验、恢复预览与空库副本恢复，不证明 TASK-0303 合并/导出、TASK-0304 Provider、EVID-04 FINAL、PHASE-03 或 Goal 完成。
- 下一入口：PHASE-03 / TASK-0303；先用纯函数生成 merge/copy 恢复计划与冲突清单，再实现隔离事务/回滚和书签笔记 Markdown/JSON 导出。

### RUN-0030 · 2026-08-13T23:46:00+08:00 · PHASE-03 / TASK-0303 合并恢复与人读导出
- 本轮输入：TASK-0302 checkpoint `70aeeb0`、公开本地快照契约、空库恢复端口与 REQ-03/04 的合并、回滚和 Markdown/JSON 承诺。
- TDD 与实现：先观察 merge plan、执行服务和人读导出三个模块缺失 RED；随后实现新增/相同/冲突/进度前进计划，未解决冲突不返回结果；执行前读取完整旧快照，写后完整回读，失败恢复旧快照并再次验证，回滚失败保留双错误。storage-core 最终 63 tests 通过。
- 合并语义：新 ID 直接加入；同 ID 且公开内容相同跳过；书、章、书签、文件引用与设置的真实内容分歧必须逐项选择“保留现有/使用备份”；进度只采用更晚 `updatedAt`。比较先递归键排序并通过公开 schema 归一化，避免字段插入顺序或数据库私有扩展字段制造虚假冲突。
- 活体失败链：首次 Chrome 合并旅程把书、两章、书签误报 4 项冲突，先修稳定指纹；第二次仍误报两章，根因是数据库对象含公开快照外扩展字段，改为双方公开 schema 归一化；第三次产品已正确只剩 1 项书名冲突，但 Next 空路由 announcer 造成 `role=alert` 歧义，收紧到精确错误文案。最终合并/导出单旅程 `1 passed (23.7s)`，完整备份 2/2 `2 passed (29.0s)`。
- 人读导出：笔记页可下载稳定 UTF-8 Markdown/JSON；只含书名、章节、位置、摘录、笔记和时间，Markdown 转义结构字符并逐行引用摘录。活体检查可打开、书名正确，且不含本机路径或 Provider Key 模式。
- 门禁与副作用：全工作区 260 tests、无 PWA 写入生产构建编译与类型阶段、Web/API 非写入 lint、控制包 resume、diff 均通过；11 个关键文件安全预检 Green。3100/4100 无监听，`public/sw.js` blob 与 HEAD 同为 `94df47777cded246a6787c4816daaed6cffdd055`。
- 提交记录：TASK-0303 产品切片 `9c6fd75`；未 push。
- 状态结论：TASK-0303 完成；只证明显式冲突合并、补偿回滚与人读导出，不证明 TASK-0304 Provider、EVID-04/05 FINAL、PHASE-03 或 Goal 完成。
- 下一入口：PHASE-03 / TASK-0304；先审计现有 URL/Provider 入口与持久化状态，再落实合法来源边界、手动刷新、默认关闭的定时检查和阶段复审。

### RUN-0031 · 2026-08-14T00:04:28+08:00 · PHASE-03 / TASK-0304 Provider 边界候选
- 本轮输入：TASK-0303 checkpoint `9c6fd75`、DEC-07/REQ-15、既有浏览器直读后任意错误自动转后端代理的 URL 实现，以及用户“合法来源、稳定但不越界”的既定范围。
- TDD 与实现：先新增 URL 策略测试并观察 3 项缺失 RED；实现仅 HTTP(S)、禁止内嵌账号密码、显式权利确认、默认关闭且仅允许 6/12/24/72/168 小时的检查间隔、到期判定和差异预览。导入任务/书籍公开 schema 持久化授权时间、检查偏好、最近检查与预览，不依赖浏览器私有 localStorage。
- 访问边界：浏览器仅在 `TypeError` 网络/CORS 失败时使用本机 API 读取公开页面；超时、空正文、动态渲染、登录、付费、验证码和反爬均直接停止。API body 再次要求 `rightsConfirmed: true`，拒绝私网/重定向私网/内嵌凭据，并使用诚实的 `ReadRealm` User-Agent，不伪装通用浏览器。
- 刷新语义：书籍详情提供手动检查；可选周期检查默认关闭，仅在用户打开详情且间隔到期时运行。检查只比较远端书名/章节数并写 `sourceCheckPreview`，不覆盖书名、目录或章节正文；旧 URL 书没有权利确认记录时拒绝检查并要求重新导入。
- 活体与失败链：策略单测 7/7、API SSRF/凭据测试 5/5。首个 Playwright 命令误用未安装的 bundled Chromium，3 项均在启动前 `VALIDATOR_INDETERMINATE`；改用既定系统 Chrome channel。反爬用例首次因完成状态只在 processing 时渲染而不可见，修正为稳定 `role=status` 后 1/1 通过。手动检查用例首次从书架标题误入阅读器而找不到详情按钮，改按持久化 book ID 进入详情；最终 URL 全文件 4/4 通过 42.4 秒，其中登录/验证码未调用后端、手动预览后章节计数不变。
- 静态门与安全：Web lint、API 非写入 lint、Web/API 类型检查、diff 均通过；11 个改动实现文件中 7 个 Green，4 个 Yellow 仅命中合法测试 URL、IndexedDB `open()` 和正则 `.exec()`，逐项人工复核无凭证、无下载执行、无新增数据外传。3100/4100 已释放。
- 证据边界：本记录只证明 TASK-0304 产品候选；EVID-03/04/05/16、PHASE-03 与 Goal 尚未完成。下一步先提交该候选，再从 clean checkpoint 生成阶段审查并执行完整 `--phase 03` 复算。

### RUN-0032 · 2026-08-14T00:13:00+08:00 · PHASE-03 完整复算 PASS
- 本轮输入：TASK-0304 产品 checkpoint `58c66d8`、检查器/候选审查 checkpoint `c8abb35`、上一份 11/12 FAIL 阶段报告与 12 条不可覆盖 records。
- 完整命令：`node scripts/verify-reading-world.mjs --phase 03 --output docs/goals/reading-world-v1/reports/phase-03-import-portability.json`；结果 14 通过 / 0 失败 / tracked mutation 0，总体 PASS。
- 活体覆盖：200MB TXT、500MB EPUB、1 万章容量 2/2；目录 2/2；配额/权限/Worker 恢复 3/3；耐久导入与 Provider 4/4；备份/合并/导出 2/2。全工作区 267 tests（逐包 4+10+17+10+52+63+31+80）、生产构建、Web/API 非写入 lint 和契约检查全部通过。
- 独立复算：14/14 records 存在且 SHA-256 与外层 JSON 匹配；`summary.passed=true`、`trackedMutationCount=0`，报告绑定 clean@`c8abb3547eb52afac5037889be68d2bf4a98801a`。容量 full fixture 已清理，3100/4100 无监听。
- 证据规范化：6 份 runner 日志各在测试正文之后带一个额外空白行，触发 `git diff --check`；封证前只删除该末尾空白行，并级联重算对应 6 条 `logSha256` 与外层报告 SHA。未改变命令、stdout/stderr 正文、退出码、时间、tracked mutation 或 PASS 结论；规范化后 14/14 SHA 再次独立匹配，报告 SHA-256 为 `89bc198a5e5d5fa8004c9c45c0edaa43b6ee1e23ff334415f0bbffd75b85e5a7`。
- 历史保留：RUN-0025 的 11/12 FAIL 报告和原 records 已移动到 `reports/history/phase-03-import-portability-attempt-01/`；当前 PASS 不删除、不改写其失败结论。
- 当前边界：阶段机器门已通过，但 EVID-03/04/05/16 尚未从 clean 证据提交生成，因此 PHASE-03 暂不提前标记完成，也不推进 PHASE-04。

### RUN-0033 · 2026-08-14T00:19:02+08:00 · PHASE-03 FINAL / PHASE-04 启动
- 本轮输入：clean 证据提交 `86815f792e904bbc0147a5301445d4b10040b28b`、阶段 PASS 报告 SHA `89bc198a5e5d5fa8004c9c45c0edaa43b6ee1e23ff334415f0bbffd75b85e5a7` 与 clean-only finalizer。
- FINAL 生成：`node scripts/finalize-phase-03.mjs` 在空工作树上 exit 0；分别生成 EVID-03/04/05/16，四份证据各绑定同一阶段报告和 14/14 record 复算，但用独立 `requiredChecks`/`verifiedOutcomes`/边界证明 REQ-02/03/04/15，不以一份宽泛报告冒充四项承诺。
- 哈希：EVID-03 `6baa7d3294bedbf009edea00c8dbe5a866bc31d91b278e1cd72a04dc537f9844`；EVID-04 `bdd87e5b9067a8b0762170ba1d9678e5a4813e3849a0804f94a901bfae421975`；EVID-05 `875cfa4641f7db2ab73be0be9a37fda3be270bdbd12cfa8d6a517f658180b695`；EVID-16 `709f392e28db559e303907413d53f061209362864f505748a228ebdc007943d7`。
- 状态结论：TASK-0304 与 PHASE-03 完成，PHASE-04 进入执行中。这里只证明稳定导入、数据可携带与 Provider 边界，不证明阅读器终局体验、UI 圆润度、书架规模、PWA、同步、VPS 部署或 Goal 完成。
- 新需求登记判断：用户提出公共多用户“藏经阁”；其全民上传、用户主页、公共云内容和治理超出当前“单用户、本地优先、可选私有云同步”控制范围。当前不写实现、不阻塞 PHASE-04，也不混入私有同步数据模型；仅在 PHASE-04 阅读核心稳定后，以独立新修订或新 Goal 决定只读馆藏纵切与后续上传治理。
- 下一入口：PHASE-04 / TASK-0401；先抽离阅读会话状态与位置合同，再处理滚动/分页、字体、章节切换、进度与手机适配。视觉圆润度、图标、文案和字体体系按 PHASE-05 独立收束。
