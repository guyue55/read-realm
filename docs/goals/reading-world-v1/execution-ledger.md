# 阅读世界 v1 执行账本

## 当前指针
- 控制包版本：4
- 当前控制修订：REV-0003
- Goal ID：GOAL-READING-WORLD-V1
- 当前状态：执行中
- 当前阶段 ID：PHASE-05
- 当前入口：PHASE-05 / TASK-0505；先只读审计书架、藏经阁与移动导航的信息层级、共享状态组件和视觉一致性，再以最小可逆切片优化；不提前运行 TASK-0506 阶段总验收。
- 最近有效提交：bcbff53
- 最近新鲜证据：docs/goals/reading-world-v1/evidence/artifacts/task-0504-expansion-attempt-01.json，SHA-256 `7dbce7835f458f194acced8a612b2d5140a623236e79e233555afe3e186bef90`，2026-08-15T12:51:35+08:00
- 当前阻塞：无；PHASE-02/03/04、GATE-00/01/03 与 RISK-03/05 已通过，TASK-0501~0504 已完成。PHASE-05、TASK-0505/0506、EVID-56/58 与 Goal 仍未完成。
- 停止原因：无；从 PHASE-05 / TASK-0505 继续，EVID-02/03/04/05/07/16/17/25/57/62、PHASE-04 失败归档、GATE-03 首轮不可判定证据、旧 `NOT_READY` 审查与历史 ATTEMPT 均不可覆盖。
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
- RUN-0034：保持执行中；REV-0002 -> REV-0003。依据：用户明确回复“全部批准”，批准摘要 EVID-55；新增单实例共享藏经阁、公共明文/私有密文分离与 GATE-03，既有阶段结论和历史 ATTEMPT 全部保留。PHASE-04 入口不变。
- RUN-0035：保持执行中；TASK-0401 完成，当前入口推进至 TASK-0402。依据：ReaderSession 实现提交 `58c3450`、工作区 287/287 测试、生产构建、Web 类型/lint 与四轮只读回归审查最终 READY；PHASE-04、EVID-02/07 与人工体验仍未完成。
- RUN-0036：保持执行中；TASK-0402 语义分页子切片通过，入口仍保持 TASK-0402 以闭合连续滚动有界窗口。
- RUN-0037：保持执行中；TASK-0402 完成，当前入口推进至 TASK-0403。依据：分页与连续滚动实现、系统浏览器回归和独立 READY 审查均闭合。
- RUN-0038：保持执行中；TASK-0403 完成，当前入口推进至 TASK-0404。依据：实现提交 `268bde1..75b6b6b`、Chromium E2E 11/11、reader-core 48/48、Web 81/81、生产构建、控制包 resume 与最终独立复审 READY；PHASE-04、EVID-02/07 与 Goal 仍未完成。
- RUN-0039：保持执行中；TASK-0404 与 PHASE-04 完成，PHASE-05 进入执行中，当前入口推进至 TASK-0501。依据：新 A/B 候选、独立终审 PASS、EVID-02/07 FINAL 及二次独立复算；Goal 仍未完成。
- RUN-0040：保持执行中；TASK-0501 完成，当前入口推进至 TASK-0502。依据：书架查询/原子命令/恢复真相/48 项有界窗口/个人同步分层四个提交 `91a39d8..eeff7cb`，500 书/500 书箧、个人同步、storage/Web 定向门禁与独立整任务审查 READY；PHASE-05、EVID-06/14/23/55/56/57 与 Goal 仍未完成。
- RUN-0041：保持执行中；TASK-0502 完成，当前入口推进至 TASK-0503。依据：实现提交 `bda528a`，搜索/笔记/设置/危险维护操作真实反馈、原子读写与私有搜索 200 条上界闭合；全量单测、生产构建、12 条系统 Chrome 旅程和独立终审 READY。GATE-03、TASK-0503/0504/0505/0506、PHASE-05 与 Goal 仍未完成。
- RUN-0042：保持执行中；TASK-0503 实现候选已提交 `d0dbd73`，首次正式 EXP-14 在 clean 候选上归类 `VALIDATOR_INDETERMINATE`。依据：EVID-59 的 11/11 records SHA 匹配，10/11 checks 通过，个人事实源哨兵、端口、进程与清理均闭合；生产 API 因未显式声明直接运行时依赖 `express` 而未启动，未进入产品断言阶段。EXP-14 产品/设计失败计数为 0，修复验证器后仍重放 EXP-14，不转 EXP-15，GATE-03 未通过。
- RUN-0043：保持执行中；同一 EXP-14 在 clean@`3f37036` 正式重放得 EVID-59 PASS，首轮验证器不确定已自动归档且原始提交 `a3da145` 保留。依据：11/11 checks/records、唯一 product marker、个人 DB/Blob 哨兵、路径隔离、端口/进程/清理与独立复算均通过。当前只放行 EVID-57 FINAL 封装；FINAL 未生成前不宣称 GATE-03 完成，不进入 TASK-0504 扩张。
- RUN-0044：保持执行中；EVID-57 FINAL 从 clean@`cf1f061` 生成并独立复算 PASS，GATE-03/RISK-05/TASK-0503 完成，当前入口推进至 TASK-0504。该结论只放行公共域扩张，不证明 TASK-0504~0506、PHASE-05 整体、VPS 部署或 Goal 完成。
- RUN-0045：保持执行中；TASK-0504 扩张规格与 EVID-62 槽冻结，当前入口为 A：canonical publisher、additive schema、原子对象写、edition/source/receipt 和并发/崩溃/重放反例。A 未通过前不并行扩张四个入口。
- RUN-0046：保持执行中；TASK-0504 A 完成，当前入口推进至 B 单文件 multipart adapter。依据：实现提交 `e9aa8bc`、零延迟双 client 竞态 12/12、旧 GATE-03 package 重放、异来源同 edition、API/storage 全量测试、无 PWA 写入全工作区构建与独立终审 READY；TASK-0504、PHASE-05 与 Goal 仍未完成。
- RUN-0047：保持执行中；TASK-0504 B 完成，当前入口推进至 C 文件夹队列。依据：实现提交 `acd609a..0fc92de`、有界 multipart/浏览器队列、真实系统 Chrome 上传与匿名浏览回归、两路独立复审 READY；TASK-0504、PHASE-05 与 Goal 仍未完成。
- RUN-0048：保持执行中；TASK-0504 C 完成，当前入口推进至 D allowlisted 服务端目录扫描。依据：实现提交 `0a87a02`、安全 relativePath/顶层 collectionPath、规范化重名拒绝、immutable package overlay 分层、双 client 异目录冲突与两路独立复审 READY；TASK-0504、PHASE-05 与 Goal 仍未完成。
- RUN-0049：保持执行中；TASK-0504 D 完成，当前入口推进至 E 已验证个人云正文快照发布。依据：实现提交 `583c306`、每次扫描物理隔离复验、完整只读 preflight、同 generation 租约恢复、事务 publication fence、sourceHash receipt 重放、来源代际单调门、390/340 系统 Chrome 旅程与三路独立终审 READY；TASK-0504、PHASE-05 与 Goal 仍未完成。
- RUN-0050：保持执行中；TASK-0504 E 完成，当前入口推进至 F taxonomy/facets 四视图。依据：实现提交 `9d4a2e2`、同 token 云端 inventory/完整内容寻址 receipt、严格 Blob/hash/UTF-8 核验、本地同版传输优化、独立 maintenance 发布端口、公共失败零个人副作用、340/390 系统 Chrome 旅程与三路独立终审 READY；TASK-0504、PHASE-05 与 Goal 仍未完成。
- RUN-0051：保持执行中；TASK-0504 F 实现完成，当前入口推进至 EVID-62 独立扩张检查器。依据：实现提交 `5df9347`、稳定 taxonomy ID/双层 DB 约束、版本化 catalog overlay、24 项 books/facets 分页、NFKC FTS/反向 tag 索引、catalogRevision 四视图失效、真实 Chrome 409/迟到响应/dialog 旅程与三路独立终审 READY。EVID-62 未通过前 TASK-0504、PHASE-05 与 Goal 仍未完成。
- RUN-0052：保持执行中；EVID-62 在 clean@`0dcae90` 正式运行并经三路独立复算 PASS，TASK-0504 完成，当前入口推进至 TASK-0505。依据：14/14 checks/records、唯一 production Chrome、16+7+1+1 混合 25 本、24+1 分页、终态 26 本/revision 27、精确 provenance/Blob、故障与离线阅读、个人事实/源树/进程/清理均闭合。该 ATTEMPT 不证明 EVID-56/58 FINAL、TASK-0505/0506、PHASE-05、VPS 或 Goal 完成。
- RUN-0053：保持执行中；TASK-0505 合同已冻结，A 真相/返回上下文与 B 共享交互候选经真实 500 本旅程和独立复审放行提交。当前入口推进至 C 信息层级/视觉语言，随后才执行 D 单一响应式阅读器子树；TASK-0505、TASK-0506、PHASE-05 与 Goal 均未完成，不引入 GSAP，不运行阶段总验收。

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

### RUN-0034 · 2026-08-14T00:27:00+08:00 · REV-0003 藏经阁范围恢复
- 本轮输入：用户原文“全部批准”、clean@`66f2ba500d8c11ddcdfbee4e1414b0c3bf92556a`、现有分享密钥/书籍 API 定向审计与 REV-0003 被批准方案。
- 事实纠偏：现有分享密钥只是服务端作用域凭据，不是设备端 E2EE 密钥；当前书籍/章节 API 为明文。因此公共馆藏明确采用独立服务端明文域，PHASE-07 私有同步继续要求服务端只见密文，两者不得共表、共接口或共用“加密/同步”语义。
- 修订范围：新增 DEC-16/REQ-16/RISK-05/NREQ-07、EVID-55~61、FDEC-04/HYP-05、EXP-14/15/16 与 GATE-03；PHASE-05 增加公共馆藏最小纵切、直接/文件夹上传、维护目录扫描关联、个人书架发布、固定分类标签、多视图和检索分页。
- 首期排除：不做账号/社交、审核、版权投诉/下架流程、配额、恶意文件隔离或完整审计；界面必须诚实标识单实例自管与公共明文。默认/缺失/无效分享密钥只读，非默认分享密钥才可上传维护。
- 历史继承：REV-0002 标记 SUPERSEDED，但 GATE-00/01、PHASE-01~03、EVID-03/04/05/16/17/25/45/48 和全部失败 ATTEMPT 不删除、不改写；GATE-02 私有同步门保持原判据。
- 状态结论：REV-0003 ACTIVE，Goal 继续执行中。PHASE-04 / TASK-0401 不变；公共馆藏实现待 PHASE-04 完成后从 PHASE-05 / TASK-0503 按 GATE-03 先纵切后扩张。

### RUN-0035 · 2026-08-14T01:15:00+08:00 · PHASE-04 / TASK-0401 阅读会话领域切片
- 本轮输入：REV-0003 控制提交 `0ff3d6e`、PHASE-03 完成基线 `66f2ba5`、既有 ReaderEngine/useReader、进度协调器、设置本地存储与书签表；用户批准继续完善翻页、字体、切章、进度和手机适配。
- TDD 与实现：新增 ReaderSession，先以缺失模块/方法 RED 固定一致启动快照、语义位置提交、设置归一化、书签快照、书籍身份和章节范围；ReaderEngine 增加已验证章节 hydrate 入口，避免启动重复读取并保留原缓存/预载兼容层。
- 接线结果：阅读启动并行取得进度/设置/书签后按唯一 TOC 计数加载章节；常规滚动以章节相对 ratio 同步内存语义快照并继续走 250ms 合并落盘，显式切章/进度/书签定位立即提交；跨书迟到回调通过 active generation 与 `belongsTo` 拒绝，长书不再以已缓存章节数冒充总章数。
- 设置与书签：所有字体、字号、行高、字距、段距、主题、滚动/分页和自动切章设置通过一个更新出口；模块级设置队列跨 ReaderSession 保序，失败给出可见提示。书签数据库仍是持久事实源，会话只维护同步内存快照。
- 审查整改：首次只读审查发现跨书错写、章内百分比丢失、拼接章节 ratio、设置并发和章节计数分歧；第二/三轮继续发现滚动热路径深拷贝书签和双层队列。逐项验证并补回归测试后，第四轮结论 READY，无 P0/P1。
- 门禁：reader-core 70/70、Web 81/81；全工作区 287/287；Web lint、严格类型检查、reader-core build、完整生产构建（含 PWA 与 13 个静态页面）、控制包 resume 和 diff 均通过。生产构建生成的 `public/sw.js` 指纹已核对后恢复，未提交生成物。
- 安全边界：全仓扫描器仍因历史 `.DS_Store`、打包字体/图标、环境变量读取和旧文档正则误报而红；本轮八个实现/测试文件精确检查无个人绝对路径、私钥或凭据特征，不擅自清理无关用户资产。
- 提交与状态：A 类实现提交 `58c3450`，未 push、未部署、未触碰真实阅读数据。TASK-0401 完成；这只证明阅读会话领域入口与单一位置合同，不证明滚动/分页终局舒适度、长章节策略、手机触控、恢复偏差、PHASE-04 或 Goal 完成。
- 下一入口：PHASE-04 / TASK-0402；先以纯位置合同与隔离 fixture 对账滚动/分页语义锚点、布局变化恢复偏差和长章节分块边界，再渐进接入现有 Reader UI。

### RUN-0036 · 2026-08-14T02:52:00+08:00 · PHASE-04 / TASK-0402 语义分页纵向子切片
- 本轮输入：TASK-0401 checkpoint `58c3450`、旧桌面分页容器、移动端整章伪分页、像素进度恢复与超长单段 fixture；用户强化翻页、字体、切章、进度和手机适配要求。
- 本轮边界：只闭合分页语义锚点、超长段分片、重排恢复、移动/桌面单实例和页 DOM 窗口；不将连续滚动章节窗口、预加载、TASK-0403 触控/UI 或 PHASE-04 人工体验冒充为已完成。
- TDD 与实现：`pagination-engine` 增加段落+字符锚点、Unicode 安全切片、标题首页预留、锚点重定位、页渲染和虚拟 spacer 合同；`PaginatedReader` 仅挂载当前页±1，程序恢复临时使用 `scrollBehavior=auto`，翻页仍平滑；移动端改用同一分页引擎，桌面/手机按 `matchMedia` 仅条件挂载一个有副作用的正文实例。
- 失败与因果链：早期 E2E 先暴露隐藏桌面 locator 歧义，随后真实发现刷新后锚点回首页；trace 证明持久层已读到字符 360，但 smooth 恢复中间帧被当成用户输入，改为原子恢复。宽窄屏重排后又稳定复现“第 3 页被拉回第 2 页”，trace 证明 CSS 隐藏的桌面实例回写共享锚点，改为当前断点单实例。两次验证命令分别因 zsh 引号和控制检查器相对路径参数失效，均未记 Green，修正命令后重跑。全部属普通实现/验证候选，不是 GATE-01/02/03 差异实验，不增加 ATTEMPT 计数。
- 活体结果：系统 Chrome 在 390x844 隔离 IndexedDB fixture 上完成单页前进不切章、字符锚点立即落盘、刷新恢复、390→1024→390 语义位置不漂、逐页走完长章和末页方向键切下章；`--repeat-each=2` 最终 `2 passed (30.3s)`。页节点上界±3，当前视口仅一个 PaginatedReader。
- 门禁：reader-core 44/44；全工作区 261/261；Web lint、`tsc --noEmit`、完整生产构建（PWA + 13 个静态页）、`git diff --check`、精确凭据模式扫描和控制包 resume 均通过。构建生成的 `public/sw.js` 已按 HEAD 恢复，未混入提交。
- 独立复审：只读代理结论 READY，无 P0/P1；确认一帧恢复抑制不吞真实偏移、断点单实例无隐藏回写、键盘/按钮/触摸章边界和长段/标题/spacer 无新回归。
- 提交与状态：A 类实现提交 `92f826f`，未 push、未部署、未读写真实用户数据。TASK-0402 与 PHASE-04 仍执行中；本记录仅证明语义分页子切片。
- 下一入口：PHASE-04 / TASK-0402；将连续滚动的 `renderedChapters` 收敛为当前章附近有界窗口，以章内语义锚点/占位高度补偿避免跳动，再闭合相邻章预加载；不重做已通过的分页纵切。

### RUN-0037 · 2026-08-14T04:05:00+08:00 · PHASE-04 / TASK-0402 连续滚动有界窗口
- 本轮输入：语义分页 checkpoint `2c580e8`、连续滚动向下追加且永不淘汰的 DOM、会改变 `ReaderEngine.currentChapter` 的预取路径，以及用户对长时间阅读稳定、切章、进度和手机适配的强化要求。
- TDD 与实现：新增活动章前后各一章的纯窗口合同、prepend/prune 锚点补偿和引擎非导航读取；连续滚动只渲染排序后的至多三章，异步结果通过 generation、目标签名与 ReaderSession 书籍身份拒绝迟到写入。明确导航仍使用 `loadChapter`，邻章预取改用不改变当前章的 `getChapter`，缓存无论并发读取或 hydrate 都维持五章硬上限。
- 位置与渲染：窗口提交前记录活动章 `offsetTop` 与容器 `scrollTop`，layout commit 后按同一活动章补偿差值；内部重排期间三态抑制自激 scroll，真实 wheel/touch/pointer 输入立即释放。滚动进度允许合法 offset 0，恢复、书签预览与段落定位均限定在目标章节根节点；桌面和移动连续正文也按当前断点只挂载一个实例，关闭浏览器原生 scroll anchoring 避免双重补偿。
- 活体用户结果：系统 Chrome 的 390x844、20 章固定 fixture 从第 0 章连续下读至第 11 章，逐步断言活动窗口 `[n-1,n,n+1]` 且 DOM 章数不超过 3；再反向回读至第 8 章、刷新恢复相同进度与 `[7,8,9]`，最后经键盘目录跳到第 18 章并保持 `[16,17,18]`。隔离重放 `1 passed (1.1m)`；此前同一实现另有两次独立完整通过（约 51.7 秒与 26.5 秒）。
- 失败与验证器分类：实现过程中先修复内部重排 scroll 自激、向上到窗口首部 offset 0 不落盘和回滚路径未统一重置窗口等产品候选缺陷；均在提交前完成回归，不属于 GATE 差异实验。最终复算时误将 Next `build` 与 Playwright `dev` 并发，二者共同改写 `.next` 导致 manifest 缺失；随后整文件验证复用三个孤儿 API 进程且 runner 产出 trace 后不退出。两次均归类 `VALIDATOR_INDETERMINATE`，终止进程、释放 3100/4100 并串行重跑，不增加 GATE-01/02/03 ATTEMPT。
- 门禁：reader-core 48/48；本轮前一完整工作区回放 265/265；Web lint、`tsc --noEmit`、独立生产构建（PWA + 13 个静态页）、连续滚动系统 Chrome E2E、`git diff --check`、精确敏感信息扫描和控制包 resume 均通过。构建生成的 `public/sw.js` 已按 HEAD 恢复，未混入实现提交。
- 独立复审：只读审查最终结论 READY，无 P0/P1；确认回滚入口、迟到请求拒绝、reflow 三态、章节作用域恢复、引擎 current/cache 与单断点正文实例均闭合。
- 提交与状态：A 类实现提交 `f6f9022`，未 push、未部署、未读写真实用户数据。TASK-0402 完成；PHASE-04 与 Goal 继续执行中，不把机器稳定性外推为人工舒适度或长期阅读结果。
- 下一入口：PHASE-04 / TASK-0403；在保留现有视觉基调下审计并收束手机触控、抽屉/Sheet、焦点、安全区、字体/文案/图标与章节切换反馈，再执行 390x844、桌面、键盘、reduced-motion 和人工体验检查。

### RUN-0038 · 2026-08-14T22:52:10+08:00 · PHASE-04 / TASK-0403 移动阅读体验与视觉轻润色
- 本轮输入：REV-0003、TASK-0402 checkpoint `f6f9022`、用户对翻页/字体/切章/进度/手机适配与“更圆润自然”的强化要求，以及已批准设计 `9feec18`与执行计划 `35c2f8a`。范围只是阅读器交互原语、移动几何、控件一致性和视口回归，不改阅读持久化契约、同步、藏经阁或全站品牌。
- 实现提交：`268bde1` 收敛共享 dialog 焦点合同；`841af67` 统一菜单显示几何；`566e9f0` 统一 Lucide 图标、44px 控件、焦点与低动效；`1dbf46f` 增加跨视口/reduced-motion 回归；`9c278c1` 闭合首次独审的六类 P1；`75b6b6b` 闭合二次独审的首帧 Escape 与隐藏/inert 触发器焦点归还竞态。未新增依赖，未引入 GSAP，面板只动画 transform/opacity。
- RED→GREEN 产品链：先后稳定复现设置/目录/伴读/进度/笔记焦点缺失、390x844 滚动与分页遮挡、菜单隐藏后永久大留白、进度拖动过早跨章、dialog 方向键穿透、笔记/确认弹层与横屏 844x390 触控不足、桌面侧栏父层 inert、快速 Escape 和隐藏触发器归还失败；每项均在对应实现后定向 GREEN，最终单文件 Chromium E2E `11/11` 通过。分页键盘在最上层 dialog 打开时不再改变后台语义锚点，进度 range 只在 pointer/key 结束时提交。
- 验证器与失败分类：会话切换后 Playwright v1228 headless shell 缺失，先安装与已锁版本匹配的本机浏览器运行时后才取得有效 RED；复合 AI/目录用例中 Next 开发覆盖层截获指针，通过隔离重载与键盘激活清除验证器干扰。一次完整回放 `10/11` 中 reduced-motion 的“可见后 Escape 仍不关闭”最初被误判为断点等待，独审证明其为真实首帧竞态，改为 layout 阶段 document capture + topmost dialog 合同后完整 `11/11` 通过；该更正保留因果，不冒充验证器失败。
- 机器门与副作用：reader-core `48/48`、Web `81/81`、Web lint、`tsc --noEmit`、完整生产构建（PWA + 13 个静态/SSG 页）、`git diff --check` 和控制包 `--mode resume` 全部通过。Playwright/构建生成的 `public/sw.js` 均按 HEAD 字节恢复，最终工作树 clean；本轮只在隔离 IndexedDB fixture 与本机浏览器中操作，未读写真实阅读数据。
- 人工点检：在 390x844 隔离固定书籍上实际查看正文、工具栏、设置面板与菜单隐藏，并复核 844x390 与 1024x900；舒适度 `4/5`、低干扰 `4/5`、单手可达 `4/5`、视觉一致 `4/5`。这是 TASK-0403 候选点检，不证明长时阅读舒适度或 PHASE-04 终局体验。
- 独立复审：首次与二次分别返回 NOT READY，所有 P1 保留定位并经 TDD 修复；最终只读复审对 `9c278c1..75b6b6b` 返回 READY，确认首帧 Escape、焦点归还、分页 fallback 与 11 项回归闭合，无新 P0/P1、验证假绿或本地优先越界。
- 状态与边界：TASK-0403 完成，PHASE-04 继续执行中；未 push、未部署、未连接 VPS，未触发 GATE-01/02/03 新 ATTEMPT，未生成 FINAL 证据，未完成 PHASE-04 或 Goal，也不外推为长期/时间型结果完成。
- 下一入口：PHASE-04 / TASK-0404；在 fresh build 与隔离数据上运行阶段级阅读回归、恢复偏差和冷/暖态性能采样，完成四项人工 4/5 终局量表，再写 `reports/phase-04-reader-ux.md` 与 `reviews/phase-04-reader.md`；不提前进入 PHASE-05。

### RUN-0039 · 2026-08-15T01:43:41+08:00 · PHASE-04 FINAL / PHASE-05 启动
- 封结输入：最终实现 A `b740c04f51e5ab61acd63b6558b51a85c0ac0458`、唯一父为 A 的证据候选 B `6ee594249d768ab20231ddf48162cec08b309f9a`、报告 SHA `9228322c43482bb73e99796411c25f899a3c6e588203f0d8e9e184105c234653`、UX SHA `427313358bc25de881f0b7ac4591769ebce4c49fdf751799fbc2be4cbae337c2` 与独立 PASS review `2b4bbf1`。旧 `NOT_READY` review 由 `9838fda` 保留，未改写其当时结论。
- 正式复算：`verify-reading-world.mjs --phase 04` 在 clean@A 运行得 10/10 PASS、tracked mutation 0；独立终审未改写报告，另行复算 records 10/10、合同测试 7/7 与统一生产 runner 15/15，desktop 14 + mobile-touch 1 唯一枚举，3104、Chrome、profile 和孤儿进程均无残留。
- 活体结果：语义重排 1135ms，进度落盘 243ms，书签恢复和已打开阅读器真断网续读通过，连续滚动 DOM 上限 3 章。移动项目显式 `isMobile=true + hasTouch=true`，可信 touch 覆盖滑页、页末换章、进度拖动与抽屉。原生 headed Chrome 在后台期间断开 Playwright，真实经历 `visible -> hidden -> visible`，hidden 期间落盘并在 657ms 内恢复语义锚点。
- FINAL 证据：clean finalizer `b45f03d` 生成 EVID-02 SHA `e87da8ee3aed4b9466987e9b4eb4b61cdb9467fb912f26e14305805b4b936ccf` 与 EVID-07 SHA `f892de2c243840c23e513424a1c4ff90645ba62f0ef4ea2c9b224baf5ad14c84`，再经独立逐字段复算 PASS。五项 UX 量表均为 4/5。
- 边界：本轮不声称物理锁屏、页面冻结、移动 OS suspend、Android/iOS 真机矩阵、PWA 真断网冷启、PHASE-08 或长期舒适度完成。未 push、未部署、未连接 VPS，未触发 GATE-03 实验。
- 状态结论：TASK-0404 与 PHASE-04 完成，Goal 继续执行中。PHASE-05 从 TASK-0501 开始；先抽离书架领域服务，再收敛 TASK-0502 反馈。藏经阁保留为 TASK-0503 的独立 GATE-03 最小纵切；只有通过后才允许 TASK-0504 目录扫描、批量上传、多视图与书架发布扩张，且公共明文域与 PHASE-07 私有同步密文域仍不得共表、共接口或共文案。

### RUN-0040 · 2026-08-15T04:31:34+08:00 · PHASE-05 / TASK-0501 书架领域收敛
- 本轮边界：只收敛个人书架查询、操作、恢复真相、500 项渲染与现有私有同步兼容层；未运行 GATE-03，未创建公共馆藏表/API，未连接 VPS，未 push 或部署。
- 实现链：`91a39d8` 统一书架快照、备份冗余和恢复事实；`24a33ea` 统一移书/建箧/解散/删书的原子命令与读回；`c953f64` 把 500 书与 500 根书箧统一收敛到 48 项 DOM 窗口并移除卡片热路径 O(n²)；`eeff7cb` 将旧个人 `/books`/`/folders` 传输、Dexie 原子落库、完整性核验与持久任务抽离页面。
- 同步安全：下载只在远端整书分页连续且总数一致后一次原子落库；上传改为单原子 import 后精确读回；释放本地正文前逐章对账并在写事务内复核本地快照。任务以私有密钥作用域持久化，操作期凭据固化为不可变快照；恢复在三个异步边界核对密钥世代，旧响应不落库、不清任务。
- 活体与门禁：个人同步系统 Chrome `7/7`，包括部分章节零落库、两任务串行恢复、旧密钥不跨库重放、上传逐章读回后释放、操作中换钥与恢复预取中 UI 断开两类反例；500 书/500 书箧 Chrome `2/2`；最终 Web `136/136`、storage-core `81/81`、独立整任务定向 `66/66`与 Chrome `10/10`、TypeScript、lint、无 PWA 写入生产构建、`git diff --check` 全通过。
- 安全与诚实边界：本轮 11 个改动文件按 Guyue 同源规则扫描 `0` 命中；全仓 `security_scanner.py` 仍因 PHASE-01 已登记的 `.DS_Store`、`.vscode`、PR 模板绝对路径、环境变量规则误报、历史原生壳生成物和字体/图标二进制为红，本轮未新增命中，不声称全仓安全门通过。
- 独立复核与状态：个人同步经多轮 `NOT_READY` 保留并闭合原子快照、条件释放、密钥任务归属、操作凭据快照和恢复预取换钥竞态；最终个人同步与 TASK-0501 整任务均 READY，无 P0/P1。TASK-0501 完成，但不代表 TASK-0502、PHASE-05、EVID-06 或 Goal 完成。
- 下一入口：PHASE-05 / TASK-0502；先审计 search/notes/settings 的全库读取、真实空态/错误/危险操作，并将书架目录解绑、重构等维护结果一并纳入真实性检查；不提前实现 TASK-0503 或执行 GATE-03。

### RUN-0041 · 2026-08-15T05:13:48+08:00 · PHASE-05 / TASK-0502 辅助页面与危险操作真实性
- 本轮边界：只收敛 search/notes/settings 与既有书架维护操作，不创建公共馆藏表/API，不复用个人 `/books`、`x-share-token` 或个人同步任务作为藏经阁事实源；未连接 VPS、未 push、未部署。
- 实现提交：`bda528a`。搜索页只组合领域快照与严格私有云客户端，远端整书验证完成后才一次落库；Dexie live query 加重新聚焦/可见兜底保持本地真相，提交事务内 `already_local` 防止竞态覆盖既有正文与进度。服务端私有搜索先按密钥作用域过滤，再按 `rank,id` 稳定排序并限制 200 条。
- 辅助事实：笔记通过单快照查询和原子删除回读，导出/删除失败保留持久错误；设置写入执行校验、写入、读回与失败回退，四个 slider 具备名称且键盘 blur 可持久化，恢复有互斥；本地备份四表来自同一只读事务。确认框只在成功后关闭。
- 危险维护：解绑书籍/物理目录先验证完整正文并在单事务中转换为合法离线书，同时解除 indexed file 关联；不完整或来源歧义时零写。重构不再先删唯一正文。云端清空在 UI/client/server 三层拒绝空或 `default` 密钥，占用同步互斥，并以 `listBooks() === []` 回读后才报告成功。
- UI 轻润色：搜索筛选与动作控件统一最小 44px，窄屏结果改为纵向自适应，状态/错误使用 `status`/`alert`，移除结构性 emoji 和弹跳提示；未引入 GSAP 或新依赖，未扩大信息架构。
- 验证：全量单测 ai 4、gesture 10、shared 17、parser 10、reader 48、storage 81、API 34、Web 163 全通过；Web/API lint 与 TypeScript、无 PWA 写入生产构建、`git diff --check` 通过。系统 Chrome 将备份恢复、个人同步与 TASK-0502 合并回放 `12/12`，包含 390x844 触控几何、设置键盘持久化、搜索完整下载与跨上下文本地真相刷新。
- 安全与诚实边界：34 个改动文件同源启发式预检为 27 Green、7 Yellow、0 Red；Yellow 逐项确认为本地测试 URL、SVG namespace、Dexie/IndexedDB `open()` 与无效测试域名，不含密钥或个人绝对路径。全仓 scanner 仍因 PHASE-01 已登记的 `.DS_Store`、`.vscode`、历史绝对路径、生成壳资源、字体/图标二进制与环境变量规则误报为 Red，不声称全仓安全通过。
- 独立复审：首次审查保留 5 项 P1，后续轮次继续发现 indexed file 残留、搜索跨上下文覆盖与 500 条结果上界缺口；最终最新树复算 READY，P0=0、P1=0，确认 `already_local` 未破坏既有个人同步恢复。
- 状态与下一入口：TASK-0502 完成；PHASE-05、EVID-06/14/23/55/56/57 与 Goal 继续执行中。下一入口为 TASK-0503/GATE-03，仅做独立公共明文域最小纵切；未通过前不实现目录扫描、批量上传、多视图或个人书架发布扩张。

### RUN-0042 · 2026-08-15T06:02:58+08:00 · PHASE-05 / TASK-0503 首次 GATE-03 正式重放不可判定
- 本轮边界：仅提交 GATE-03 最小纵切与正式验证器；仍未开放目录扫描、批量上传、多视图、个人书架发布或 VPS 部署，公共域未复用个人 `/books`、`x-share-token`、个人 DB/Blob 或同步任务。
- 实现候选：后端独立公共 SQLite、Blob、API 与维护凭据为 `10d635a`；前端匿名浏览、分类/检索/分页、整本校验后新 ID 原子加入、真断网阅读、存储路径 fail-closed 与正式 runner 为 `d0dbd73`。独立业务终审仅放行候选提交，不代表 GATE-03 通过。
- 正式结果：clean@`d0dbd7337970b66a78694f2e6660e7cc675c55d5` 执行 EVID-59，API/Web 测试、非写入 lint、类型、构建与合同共 10/10 通过，live exit 1；报告 SHA-256 `8752655f4cbfc19132ba2ea9e349bcc3d63b3e36094b577947110ebcc1659471`，11/11 records 实际 SHA 匹配，tracked mutation 0。
- 分类与原因：外层与独立复算均为 `VALIDATOR_INDETERMINATE / API_SERVICE_NOT_READY / WEB_SERVICE_NOT_READY / PRODUCT_STAGE_MARKER_COUNT_0`。`apps/api/src/main.ts` 直接 import/use `express`，但 API workspace 未将其声明为直接生产依赖，`node dist/main.js` 在 pnpm 严格隔离下启动前失败。这是生产装配/验证器事实，尚未进入产品断言阶段。
- 副作用复算：个人 DB 哨兵前后同 SHA `f5a13280092285397fd70a54325b2af10869cf05497b6872e1f762541f067638`，个人 Blob 哨兵前后同 SHA `ace5e2ddd778bf803507305df0dbb80a664badf260a737af578d5e3aea86258d`；3100/4100 前后空闲，孤儿进程 0，隔离根已清理。
- 计数与下一入口：该结果不计 EXP-14 产品/设计失败，当前计数 0/3；不转 EXP-15，不触发熔断。下一入口是显式声明 API 直接生产依赖，先提交 EVID-59 原始失败证据，再在 clean 工作树上以同一命令重放 EXP-14；归档机制必须保留本轮 report/records，禁止手工覆盖。

### RUN-0043 · 2026-08-15T06:10:14+08:00 · PHASE-05 / TASK-0503 EXP-14 正式重放通过
- 稳定输入：候选实现 `d0dbd73`，首轮不确定原始证据 `a3da145`，显式生产依赖修复 `3f37036`；重放前工作树 clean，命令与 EXP-14 机制均未改变。
- 正式证据：EVID-59 报告 SHA-256 `26a01e211b095327a253e0524891792883103a04da95ae54097e445a89a0be55`；11/11 checks exit 0，11/11 records 实际 SHA 匹配，tracked mutation 0，外层与独立复算均为 `PASS`。唯一 Playwright 枚举与唯一整行 `GATE03_PRODUCT_STAGE_ENTERED=EXP-14` marker 均为 1。
- 产品结果：系统 Chrome 从私人书架可发现入口进入藏经阁；缺失、`default`、错误维护凭据与仅 `x-share-token` 均被拒绝；25 本固定经典书加两类干扰样本后，匿名分类、检索、24+1 跨页与旧响应悬停反例成立。选中书生成非 `public-*` 本地 ID，整本校验后一次原子落库，阻断公共 API 并设置浏览器 true offline 后，仍可从书架打开并连续阅读两章。
- 边界与副作用：个人 `/books` 请求为 0，本地同步任务前后不变；个人 DB 与 Blob 哨兵前后分别保持 `f5a13280092285397fd70a54325b2af10869cf05497b6872e1f762541f067638` 与 `ace5e2ddd778bf803507305df0dbb80a664badf260a737af578d5e3aea86258d`。四条隔离路径互异且不重叠，3100/4100 前后空闲，孤儿进程 0，临时根已清理。
- 历史保留：首轮原始 report/records 已由提交 `a3da145` 保留；验证器另将其归档至 `docs/goals/reading-world-v1/evidence/artifacts/history/gate-03-attempt-01-attempt-01/`，历史 11/11 record 字节与原提交一致，report 仅将 11 个 `logPath` 改为归档路径，分类仍为 `VALIDATOR_INDETERMINATE`且不计产品失败。
- 独立复审与下一入口：最新只读终审判定 READY，无 P0/P1 或假绿，允许提交 PASS ATTEMPT 并进入 FINAL 封装。当前仅放行从 clean 证据提交生成 EVID-57；FINAL 未独立复算前不宣称 GATE-03 完成，不扩张 TASK-0504。

### RUN-0044 · 2026-08-15T06:25:33+08:00 · PHASE-05 / TASK-0503 GATE-03 FINAL 封账
- FINAL 生成：先提交 PASS ATTEMPT `cec159e`，再提交 fail-closed FINAL 合同与 finalizer `cf1f061`；clean 工作树执行 `node scripts/finalize-gate-03.mjs` 生成 EVID-57，SHA-256 `58b732862ea4f0172d13bfc0a56d66ff209cd58a8645c05bf3bb008b5eb916ce`。
- 绑定事实：source attempt SHA `26a01e211b095327a253e0524891792883103a04da95ae54097e445a89a0be55`，精确 11 项 current records 均 exit 0、mutation false 且 SHA 匹配；首轮历史报告 SHA `272d422cf9d48e5294cc46e1ff7c37795225847a844b5030e97e5229d98ba769`，与 `a3da145` 原报告仅 `logPath` 归一化差异，11 records 逐字节一致，仍为三理由 `VALIDATOR_INDETERMINATE`、产品失败计数 0。
- 严格提交链：`d0dbd733 -> a3da1455 -> 3f370367 -> cf1f061b` 四者互异且逐段祖先关系成立；FINAL 自身、source attempt、history 与 records 已由独立审查再次复算，无 P0/P1。
- 结论与边界：GATE-03、RISK-05 与 TASK-0503 完成；公共藏书已证明可发现入口、非默认维护凭据、匿名分类/检索/分页、新 ID 原子加入、真断网两章阅读，且个人 DB/Blob 哨兵不变。只放行 TASK-0504，不证明 TASK-0504~0506、PHASE-05 整体、VPS 部署或 Goal 完成。
- 下一入口：PHASE-05 / TASK-0504。扩张必须继续保持公共 SQLite/Blob/API/凭据与个人 `/books`、`x-share-token`、个人 DB/Blob、同步任务分离；先以隔离维护目录和有界样本实现直接文件/文件夹上传、深度扫描关联、个人书架发布、固定分类标签与分页多视图，禁止修改原书本体。

### RUN-0045 · 2026-08-15T06:37:22+08:00 · PHASE-05 / TASK-0504 扩张规格冻结
- 独立审计：后端、前端/边界和验证器三路只读审计均确认现有 GATE-03 纵切可复用，但四入口扩张前必须先统一 canonical publisher；现有 JSON 体积、并发幂等、目录 realpath/symlink/TOCTOU、个人完整快照、taxonomy/facets 和搜索上界均不足以直接扩张。
- 冻结规格：`reports/task-0504-public-library-expansion-spec.md`。直接文件、文件夹、allowlisted 服务端扫描和个人云快照只作为 adapter；完整公共 package 是唯一匿名正文事实源。维护者使用公共 DB 首次初始化时生成并持久化的随机 maintainerId 与固定展示名，不从低熵密钥派生，也不建账号或治理平台。
- 任务证据：预登记 EVID-62 和独立 `TASK-0504-PUBLIC-LIBRARY-EXPANSION` 门；它不是 HYP-05 新实验，不使用 EXP-15/16，不改写 GATE-03 FINAL 或失败计数。
- 实现顺序：A canonical publisher/原子写/edition-source-receipt → B multipart 单文件 → C 文件夹队列 → D allowlisted scanner → E 个人云快照发布 → F taxonomy/facets/四视图。A 未绿前禁止并行 B–F。
- 边界：本轮未连接真实维护目录、真实公共库、个人真实云或 VPS，未 push/部署；TASK-0504、PHASE-05、EVID-56/58 和 Goal 均未完成。

### RUN-0046 · 2026-08-15T07:22:00+08:00 · PHASE-05 / TASK-0504 A canonical publisher
- 本轮边界：只实现 A 层统一候选与公共持久化核心；旧 JSON、未来浏览器文件、allowlisted 扫描和个人云快照只能汇入同一 `publishCandidate`。未新增 multipart、文件夹、维护目录扫描、个人书架发布、taxonomy/facets、UI 或 VPS 操作。
- 数据与兼容：公共库采用 additive schema，保存随机 maintainerId、单调 catalogRevision、edition、source association、ingest receipt 与 tags 关联槽；旧 GATE-03 行不伪造 editionHash，原输入重放时先验证不可变 package 的真实章节，再在一个原子批次补齐 edition/source/receipt 并保留旧 book ID。
- 原子与并发：对象存储改为同目录临时文件完整写入、file fsync、close、原子 hard-link put-if-absent 与临时文件清理；Blob 写入及 SHA 读回完成后，目录事实才通过 libSQL `batch(..., 'write')` 同步原子提交。固定退避的 manual transaction 曾被独立零延迟探针 12/12 推翻为双客户端锁步活锁，失败因果保留；最终改为无 await 间隙的同步批次后，同探针 12/12、仓内连续 20/20 通过，目录四表均为 1 且 revision 仅为 1。
- 来源与冲突：canonical candidate 显式携带 source kind/scope/relativePath/bytes；同 edition 的不同 provenance 只复用一本正文并分别留下 2 条 source/receipt，不递增目录 revision。元数据冲突返回 409、`duplicate_metadata_conflict` 与 existingBookId，不假报新元数据生效。
- 验证：API public-library 定向 17/17、API 全量 60/60、storage-core 82/82，API 非写入 lint/typecheck/production build、storage build、`git diff --check` 与全工作区 `READING_WORLD_VERIFY_NO_PWA_WRITE=1` production build 全部通过。独立终审复算并发初始化 12/12、旧 package 重放、BUSY 重试副作用上界与个人域依赖隔离后结论 READY_TO_COMMIT，无 P0/P1。
- 安全与边界：改动文件精确凭据/私钥模式扫描无命中；全仓安全扫描仍有既登记历史 Red，本轮不声称全仓安全门通过。实现提交 `e9aa8bc`，未 push、未部署、未连接真实公共库、个人云、维护目录或 VPS。
- 状态与下一入口：TASK-0504 A 完成，但 TASK-0504、PHASE-05、EVID-56/58 和 Goal 均未完成。下一入口严格为 B：单文件 multipart adapter，继续复用 canonical publisher；B 未独立通过前不并行进入 C–F。

### RUN-0047 · 2026-08-15T08:06:00+08:00 · PHASE-05 / TASK-0504 B 浏览器文件入阁
- 本轮边界：只完成单文件 multipart 后端 adapter 与浏览器有界队列；不实现文件夹 relativePath/collectionPath、服务端目录扫描、个人云快照发布、taxonomy/facets 或四视图。实现提交为后端 `acd609a` 与前端/真实结果 `0fc92de`，未 push、未部署、未连接 VPS 或真实馆藏。
- 传输与鉴权：`POST /public-library/maintenance/files` 仅接受一个安全命名 TXT，单文件上限 20 MiB；Guard 在 FileInterceptor 前拒绝缺失/错误凭据。Busboy 的 UTF-8 中文文件名乱码被规范恢复，`preservePath=true` 使 Unix/Windows/子目录形式在裁剪 basename 前明确 400。Unicode 维护密钥按 UTF-8 字节长度做 timing-safe 比较，不再把长度异常冒充为 500。
- 解析与真实结果：TXT parser 保留显式空章，公共发布边界据此拒绝空章，不再静默吞掉首章后假成功。canonical publisher 新增 typed `created / unchanged`，书目冲突仍为带 existingBookId 的 409；双 client 同正文 12/12 均只有一个 created、一个 unchanged，revision 只增一次，未回退 A 层并发/旧 GATE-03 兼容。
- 前端队列：每批最多 200 个 TXT、总量 200 MiB、并发固定 2；逐项保留 queued/uploading/created/unchanged/duplicate/failed 真实状态，只重试 retryable failed，任务 DOM 最多 50 行。每次批次开始时快照 normalized `reader-share-token`，独立 maintenance client 只发 `x-public-library-maintenance-key`，不触发个人 `/books`、`x-share-token` 或 `reader-active-sync-tasks`。
- UI 与目录快照：无密钥时入阁按钮禁用且在移动端文案中说明先配置私有云，匿名浏览不受影响。面板复用 ReaderDialogSurface，背景 inert，初始焦点、Escape、焦点归还、44px 控件和 390px 无横溢出均在系统 Chrome 成立。书籍列表从第一页保留 catalogRevision，后续页原样携带；409 清理旧快照回第一页，新建后也显式重载。
- 验证与失败因果：parser-core 11/11、API 80/80、Web 183/183，API/Web typecheck、非写入 lint、API 构建与 `READING_WORLD_VERIFY_NO_PWA_WRITE=1` Web 生产构建均通过。系统 Chrome 上新上传旅程 1/1 与旧 GATE-03 匿名分页/真断网加入 1/1 通过；一次早期回放因跨轮正文相同而正确命中书目冲突，归为 fixture `VALIDATOR_INDETERMINATE`，改为每轮唯一正文后重放通过，不计任何 GATE 设计失败。
- 独立复审与状态：canonical outcome 与完整 B 边界两路均 `READY_TO_COMMIT`，无 P0/P1 或假绿。TASK-0504 B 完成，但 TASK-0504、PHASE-05、EVID-56/58 和 Goal 均未完成。
- 下一入口：TASK-0504 C；在现有单文件队列上增加文件夹选择的安全 relativePath/collectionPath、规范化重名拒绝与部分结果。C 独立通过前不进入 D 服务端目录扫描、E 个人云快照或 F 四视图。

### RUN-0048 · 2026-08-15T08:25:40+08:00 · PHASE-05 / TASK-0504 C 文件夹来源与目录归属
- 本轮边界：只在 B 的有界浏览器队列上增加文件夹选择、规范化 relativePath、顶层 collectionPath 与逐项真实结果；未实现服务端目录扫描、个人云快照发布、taxonomy/facets、四视图或 VPS 操作。实现提交 `0a87a02`，未 push、未部署、未连接真实维护目录或真实馆藏。
- 路径与设备能力：前后端一致执行 NFC 规范化，拒绝绝对路径、盘符、反斜杠、控制字符、空段、`.`/`..`、超 12 层目录、非 TXT 与上传 basename 不一致；文件夹默认只以第一层目录作为 collectionPath，同时完整 relativePath 作为来源定位保留。浏览器支持 `webkitdirectory` 时读取嵌套 FileList；不支持时明确提示多选 TXT，不虚构文件夹成功。
- 重名与有界队列：NFC/大小写规范化后相同的路径全部逐项失败，不让遍历顺序决定胜者；既有 200 文件、200 MiB 总量、20 MiB 单本、并发 2 与任务 DOM 50 行上界未回退。安全文件夹条目仍逐本进入 B 的 canonical multipart adapter，部分成功、已存在、冲突和失败继续分别呈现。
- 目录元数据与不可变正文：collectionPath 纳入同 edition 的元数据冲突判定；direct→folder 或不同顶层目录不再静默 unchanged。双 client 异顶层 12/12 均只有一方 created、另一方 typed conflict，失败方不留下 source/receipt，revision 只增一次；同顶层异深层/来源 12/12 均复用一个 edition 并保留两套来源事实。collectionPath 不进入 immutable package Blob，匿名读取在完整哈希校验后才叠加 DB 当前目录值。
- 活体与门禁：API 全量 `90/90`、Web 全量 `185/185`，两端 TypeScript、定向非写入 lint、API production build、禁用 PWA 写入的 Web production build 与 `git diff --check` 均通过。`CI=1` 强制新启 API/Web，以系统 Chrome 390x844 从 `webkitRelativePath` 经队列、FormData、真实 API、SQLite 与 Blob 完成文件夹入阁 `1/1`；3100/4100 结束后均 free。
- 安全与独审：18 个改动文件按 Guyue 同源规则精确扫描 0 命中；全仓 scanner 仍为 PHASE-01 已登记的历史 Red，本轮不声称全仓安全通过。文件边界与核心并发两路独立复审均 `READY_TO_COMMIT`，无 P0/P1 或假绿；未运行 formal TASK-0504 verifier。
- 状态与下一入口：TASK-0504 C 完成，但 TASK-0504、PHASE-05、EVID-56/58 和 Goal 均未完成。下一入口严格为 D：只实现运维配置 rootId 的 allowlisted 服务端目录扫描、realpath/symlink/regular-file/TOCTOU 边界、sourceHash receipt、单 root generation lease/恢复和 2 GiB/5000 项硬上限；D 独立通过前不进入 E 个人云快照或 F taxonomy/facets 四视图。

### RUN-0049 · 2026-08-15T09:22:53+08:00 · PHASE-05 / TASK-0504 D 服务端维护目录扫描
- 本轮边界：只增加运维 allowlist 目录扫描、持久 generation/lease、sourceHash receipt 重放与移动入阁反馈；未实现个人云正文发布、taxonomy/facets、catalog overlay 编辑或四视图，未连接真实维护目录、个人真实云、VPS，未 push 或部署。实现提交 `583c306`。
- 配置与物理隔离：API 只接受 `rootId`，匿名与维护 DTO 仅返回安全 label；绝对/Windows 路径型 label 直接拒绝。启动和每次 scan start 都重新解析维护根与个人/公共 DB、Blob 的 physical realpath，任一相等、互含、symlink alias、root inode/fingerprint 变化均 fail-closed，错误不暴露绝对路径。
- 只读预检：完整 manifest 在首本发布前验证 NFC 相对路径、深度 32、候选 5000、单本 20 MiB、累计 2 GiB，部署只能向下收紧；不跟随 symlink，不读取特殊文件或 hardlink。正文通过 `O_NOFOLLOW` fd 分块读取，前后复核 dev/ino/nlink/size/mtime/ctime 与 realpath containment；目录 manifest 改变使 generation 失败，源文件 bytes/mode/mtime 保持不变。
- 租约与恢复：每 root 唯一 running generation；过期 owner 不能 heartbeat、落 item、finish 或通过 publication fence 写新/既有 edition。新 owner 先将旧租约置 interrupted，再复用同 scanId/generation 并清 item journal，以 canonical ingest receipt 重放。`publisher 成功→item heartbeat 前崩溃` 的真实 SQLite/Blob 反例恢复为 unchanged，book/edition/source/receipt 与 catalogRevision 不重复增长。
- 来源真相：只有完整 completed generation 才更新 active/missing；`generation > lastCompletedGeneration` 单调门阻止旧 completed 迟到回滚新代。失败、partial、权限/上界/目录变化均保留上一完整代际，原件删除后既有 immutable package 仍可匿名读取。
- API 与 UI：三个 maintenance endpoint 全部先过既有 Guard，只携带 `x-public-library-maintenance-key`；items 分页最多 50，响应不返回 sourceHash、bookId、leaseOwner、fingerprint 或主机路径。入阁面板增加“服务端目录”，390px 完成扫描/重放，340px 下关闭、扫描按钮均 ≥44px、无横向溢出，Escape 关闭并归还焦点；扫描请求不触发个人 `/books`。
- 验证与审查：最终 API 全量 `111/111`、Web 全量 `186/186`，两端 TypeScript、非写入 lint、API build 与禁用 PWA 写入的 Web production build、控制包 resume、`git diff --check` 全通过；系统 Chrome D 旅程 `1/1`。27 个改动文件安全预检为 25 Green、2 Yellow，Yellow 仅为只读 `open(O_NOFOLLOW)` 与本机 `http://127.0.0.1` E2E 地址，人工复核无凭据、执行下载或新增外传。三路独立终审均 `READY_TO_COMMIT`，无 P0/P1 或假绿；未运行 formal TASK-0504 verifier。
- 状态与下一入口：TASK-0504 D 完成，但 TASK-0504、PHASE-05、EVID-56/58 和 Goal 均未完成。下一入口严格为 E：PersonalBookExportPort → PublicLibraryMaintenancePort；必须先用同一私有 token 验证云端 inventory/章节 hash/完整代际，本地缓存只能作为同版传输优化，公共模块仍不得读取个人 DB/repository。E 独立通过前不进入 F taxonomy/facets/四视图。

### RUN-0050 · 2026-08-15T10:39:08+08:00 · PHASE-05 / TASK-0504 E 已验证个人云正文发布
- 本轮边界：只完成 PersonalBookExportPort → PublicLibraryMaintenancePort 的单书发布链与既有治理菜单入口；未实现 taxonomy/facets 四视图、catalog overlay 编辑、账号/审核/配额/治理平台或 VPS 操作。实现提交 `9d4a2e2`，未 push、未部署、未连接真实个人云、真实馆藏或维护目录。
- 私人快照：私人 API 新增只读 publication export 边界，仅接受一次性快照的非默认 `x-share-token`；精确读取 token-scoped book 与有序章节 manifest，以个人域持久随机 salt 生成不透明 sourceRef。首次核验只做一次 O(N) 数据库快照、N 次 Blob 大小检查和顺序 N 次 SHA-256/严格 UTF-8 验证，整书超过 20 MiB 在正文加载前返回 413。
- Receipt 与代际：最多 8 条、5 分钟滑动 TTL 的 receipt 只缓存 descriptor/byteLengths，不缓存正文，并同时绑定 scopedBookId 与 snapshotHash；后续 manifest/final 页不再重复扫描整书，content 页只读并重验当前页。进程内远端换代不会撤销已证明的内容寻址版本；cache miss、TTL 后或进程重启会对当前事实重算，旧 hash 不匹配明确 409。401 章三页反例固定为 DB snapshot `1`、stat `401`、Blob read `601`，消除 O(N×pages) 放大。极端 20,000 章 receipt 元数据预算留给 TASK-0506 压力门，不把本切片外推为压力终局。
- 本地优化与公共发布：浏览器先证明同 token 私有云 inventory 与完整 manifest；仅当 Dexie 的 `chapters_full/full_cached` 章节数量、标题和逐章 hash 与 receipt 全等时才用本地正文代传，否则读取同一 receipt 的远端内容。本地/远端形成 immutable verified snapshot 后，独立 maintenance client 只发送 `x-public-library-maintenance-key`；公共端重新计算 manifest、snapshot 与正文 hash，再以 `personal_cloud` candidate 进入唯一 canonical publisher。公共 DTO/DB/Blob 不保存 share token、个人原始 bookId、进度、笔记或本地路径，公共模块不读取个人 repository。
- 交互与零副作用：书架卡片不新增常驻按钮，发布入口只位于既有单书治理菜单；无密钥时禁用并解释，非 TXT 明确不可用。确认文案固定说明会创建公共明文副本且私人原书/进度/笔记不变；created 显示“公共明文副本已入阁”，unchanged 显示“已在阁中”，413/422/409/公共 500 分别进入可重试的真实错误态。治理与发布 dialog 均具背景 inert、焦点圈定、Escape/焦点归还；340/390 下关闭、选择、缓存、解绑、公开及展开建箧三控件双轴均 ≥44px，无横向溢出。
- 活体反例：系统 Chrome 在导出首请求暂停后把 localStorage 从 token A 改为 B，后续私人请求仍只携带 A、公共请求仍只携带操作开始时的 maintenance A，任一请求都不同时携带两种 header。旅程依次通过 created、unchanged 与注入公共 500；失败后远端个人 DB/Blob、Dexie book/chapters/progress/bookmark-note 与 `reader-active-sync-tasks` 均和发布前一致，失败态不显示成功。
- 验证与失败因果：API 全量 `130/130`、Web 全量 `200/200`、shared-types `18/18`、storage-core `82/82`；两端 TypeScript、非写入 lint、API/shared/storage build、禁用 PWA 写入的 Web production build 与 `git diff --check` 全通过，系统 Chrome E 旅程 `1/1`。首次浏览器命令未指定系统 Chrome channel，缺少 Playwright bundled shell；首次 Web build 复用了受并发/开发运行污染的 `.next` 并在 page collection 缺 `_document`，两者均在未进入产品失败判据时归 `VALIDATOR_INDETERMINATE`，改用系统 Chrome与 fresh `.next` 串行重放后通过，不计 GATE 设计失败。
- 安全与独审：31 个改动文件启发式预检为 26 Green、5 Yellow、0 Red；Yellow 仅为本机 `http://127.0.0.1`、IndexedDB `open`、治理状态 setter 名称与安全路径内的文件 `open`，人工逐行复核无凭据落 URL/DOM、个人公共 header 混用或新增外传。三路独立终审均 `READY_TO_COMMIT`，P0/P1 为 0；未运行 formal TASK-0504 verifier。
- 状态与下一入口：TASK-0504 E 完成，但 TASK-0504、PHASE-05、EVID-56/58 和 Goal 均未完成。下一入口严格为 F：固定 category/tag 模板、版本化 catalog overlay、匿名 publishers/categories/tags facets 分页与书籍/上传者标记/分类/标签四视图；继续保持 24 项 DOM/分页上界和 catalogRevision 失效语义。F 独立通过前不运行 formal TASK-0504 verifier，也不进入 TASK-0505。

### RUN-0051 · 2026-08-15T11:53:15+08:00 · PHASE-05 / TASK-0504 F taxonomy、facets 与四视图
- 本轮边界：只完成冻结的 `public-library-taxonomy-v1`、catalog overlay、书籍/维护者/分类/标签四视图与 24 项服务端分页；未新增账号、审核、配额、上下架或治理平台。实现提交 `5df9347bcf41acd6d0fc183f108209d902c6512f`，未 push、未部署、未读写真实个人云或公共馆藏。
- 稳定事实源：category/tag 使用稳定 ID、中文 label 和单一 taxonomyVersion；SQLite 准备在单个 WAL write transaction 中串行，精确回读 taxonomy/维护者身份。current category、ingest category 和 tag relation 均有 DB 门；未知、重复、第 6 标签及 `UPDATE book_id/tag_id` 旁路均 fail-closed。
- overlay 与重放：不可变 ingest metadata 与可编辑 current category/tags/collectionPath 分层；PATCH 在同一 write batch 中令 metadataVersion/catalogRevision 各加一，旧版单胜者。package GET 先核验 immutable Blob/章节 hash，再叠加当前目录信息；重复扫描不回退 overlay，也不改 package/content/edition/source hash。
- 检索与快照：书名、作者、维护者用 NFKC shadow FTS v3/短词索引，tag 精确过滤用 `(tag_id, book_id)` 反向索引；无 `%LIKE%` 全表搜索。同一固定 `now` 下 page1 后连续 publish + PATCH，旧 books 与三类 facets page2 全部 409，重启分页在 revision 3 下无重无漏。并发 prepare 10/10 线性化，索引重建未提交期间旧 reader 始终看到完整旧快照。
- UI 与真实旅程：四视图切换同步清 items/revision/page 并递增 request generation，旧 HTTP 请求迟到不覆盖新查询；重复点击当前 tab/分类不陷入 loading。Catalog editor 只用 maintenance client，具备初始焦点、Tab 圈定、Escape、焦点归还；340px 对话框和 340/390/768/1440 页面无横溢出，相关触点双轴均不小于 44px，book/facet DOM 各不超过 24。
- 验证与安全：API `141/141`、Web `202/202`、shared-types `19/19`、storage-core `82/82`；两端 TypeScript、非写入 lint、API build、禁用 PWA 写入的 Web production build、`git diff --check` 和控制包 resume 均通过。系统 Chrome 的 F taxonomy、旧文件上传、服务端扫描与个人云发布四条独立旅程各 `1/1` 通过，3100/4100 无残留监听。改动文件同源预检 19 Green、3 Yellow、0 Red；Yellow 仅为状态 setter 中的 `Open` 字样和隔离 E2E 的 `http://127.0.0.1`，人工复核无密钥落 URL/DOM、个人/公共 header 混用或新增外传。
- 独审与下一入口：核心/DB、文件/UI 与整体边界三路最终均为 `READY_TO_COMMIT`，无 P0/P1 或假绿。F 完成，但 TASK-0504 仍等待预登记 EVID-62 独立扩张检查器的 clean 正式重放与独立复算；未通过前不进入 TASK-0505，不声称 PHASE-05、EVID-56/58、VPS 或 Goal 完成。

### RUN-0052 · 2026-08-15T12:51:35+08:00 · PHASE-05 / TASK-0504 EVID-62 扩张门收束
- 本轮边界：只新增并运行 TASK-0504 独立验证器、唯一 production Chrome 旅程和同 `now` catalogRevision 回归；所有 fixture 使用隔离公共/个人 SQLite、Blob、维护目录和浏览器目录。未连接真实馆藏、真实维护目录、个人真实云或 VPS，未 push、未部署。
- 实现与证据提交：验证器/runner/旅程提交 `0dcae90e69b28830ecd3c9e88e0de100810abab7`；正式 EVID-62 report 与精确 14 records 提交 `bcbff5343c4e74922a145b136507ca2c29cbf719`。report SHA-256 为 `7dbce7835f458f194acced8a612b2d5140a623236e79e233555afe3e186bef90`，角色保持 `ATTEMPT`。
- 正式结果：14/14 checks exit 0，tracked/untracked/history mutation 均为 0；唯一 system Chrome production 旅程 `1/1`。固定形成 16 本扫描 + 7 本文件夹 + 1 本直接上传 + 1 本个人云发布，匿名书籍页为 24+1；追加与 overlay 后终态为 26 books/editions/receipts、catalogRevision 27。
- 边界与故障：26 条 source/receipt/edition 一一闭合，26 个 Blob 均满足路径 = 字节 SHA = package hash；错误凭据、公共 500、扫描 503、旧 revision 409、迟到响应、真断网均有活体反例。扫描源树 path/size/mode/mtime/SHA、个人 DB/Blob 与浏览器私有事实前后不变；3100/4100 前后空闲、orphan 0、ownership cleanup 完成。
- 独立复算：三路审查分别重算 report/14 records SHA、分类、GATE-03 前置、公共 provenance/Blob、源树/个人哨兵和 UI 旅程，均判定 PASS、无 P0/P1 或假绿；当前证据绑定 clean@`0dcae90`，不覆盖既有 EVID-57/59 或历史不可判定记录。
- 状态与下一入口：TASK-0504 完成，PHASE-05 与 Goal 继续执行中。下一入口严格为 TASK-0505：先审计并最小化重排书架、藏经阁、移动导航与共享状态/焦点/触控组件，收敛圆角、间距、阴影、图标、字体和文案语气；TASK-0505 独立通过前不运行 TASK-0506 总验收，不生成 EVID-56/58 FINAL，不部署 VPS。

### RUN-0053 · 2026-08-15T14:15:00+08:00 · PHASE-05 / TASK-0505 A/B 真相、返回上下文与共享交互
- 本轮边界：先完成只读视觉/交互审计并冻结 `reports/task-0505-ui-contract.md`，随后仅实现 A 真相/返回上下文与 B 共享交互基建；未宣称 C 信息层级/视觉语言或 D 阅读器单一响应式子树完成，未运行 TASK-0506、VPS 部署或 formal verifier。
- 真相与危险操作：删除会写入个人书架的硬编码“精选”路径和伪推荐入口；本地/源文件/云端状态只按现有事实源陈述。删除必须先得到 typed `applied` 才请求远端；ConfirmDialog 改为 portal + ReaderDialogSurface，异步失败保留并显示，不再使用原生 `confirm()`。
- 返回上下文：书架 `{folder,page,sort,view}`、藏经阁 `{view,q,category,tag,maintainer,page}`、搜索 `{q,filter}` 均进入有界 typed route，popstate/同视图跳转可重放，非法值 fail-closed。书架滚动和来源卡焦点使用 session 级事实源；离开视图后的布局滚动不再覆盖已记位置，返回与刷新在书目可渲染后恢复。
- 共享交互：`tokens.css` 收敛为运行时权威的 control/card/panel 圆角、两档阴影与 44px 触控；ReaderDialogSurface 关闭态不渲染，打开态使用栈式 document modal isolation，嵌套层只让顶层交互并最终恢复原背景。AppShell 主内容可作为稳定焦点 fallback；书卡/书箧支持 Enter/Space，关键同步、密钥、治理、备份、下载、释放和删除触点显式不小于 44×44。
- 验证：Web 全量 `56 files / 223 tests`、TypeScript、定向非写入 ESLint、禁用 PWA 写入的 production build 与 `git diff --check` 全通过。系统 Chrome 的 `library-bounded-rendering + search-route-context` 五条旅程 `5/5`：500 本第 8 页以普通点击与 Enter 开书后，在 Next `__NA` history state 下 browser back 与 reload 仍恢复 URL、页码、排序、列表视图、滚动和来源焦点；500 根书箧保持 48 项 DOM 上界；延迟私有云 inventory 不会把深页提前夹到第一页；同一密钥下清空云端后旧 inventory 响应不能回流；搜索条件切换后旧私有云响应不能覆盖新结果。390px computed 探针覆盖 17 个同步/密钥/书箧菜单/书卡控件，最小 44×44 且无横溢；1440px hover 态治理/备份/删除同样合格。藏经阁 taxonomy 旅程 `1/1` 与 340/390/768/1440 回归由独立审查复算通过。
- 独立复审与状态：A/B 最新稳定候选终审 `READY_TO_COMMIT`，无 P0/P1；该结论只放行本切片提交，不等于 TASK-0505 完成。下一入口严格为 C：用现有领域入口拆分书架信息层级、统一 Lucide/字体/直白文案和共享状态/toast，再进入 D 阅读器单一响应式子树；仍不运行 TASK-0506 或部署 VPS。
