# 阅读世界 v1 总控

## 控制信息
- 控制包版本：4
- 当前控制修订：REV-0002
- Goal ID：GOAL-READING-WORLD-V1
- 状态：执行中
- 唯一总控：本文件
- 执行账本：docs/goals/reading-world-v1/execution-ledger.md
- 阶段计划目录：docs/goals/reading-world-v1/phases
- 活体证据索引：docs/goals/reading-world-v1/evidence/index.md
- 基线提交或版本：c900af34e81d5b09319498f57953bf2c0205c02c
- 最后审查时间：2026-08-13T08:36:02+08:00

## 状态机
- 正向：铸造中 -> 就绪待执行 -> 执行中 -> 终局候选 -> 完成
- 恢复：执行中 -> 阻塞 -> 执行中
- 设计复核：执行中 -> BLOCKED_DESIGN_REVIEW_REQUIRED；只有用户批准新修订后，BLOCKED_DESIGN_REVIEW_REQUIRED -> 执行中。
- 规则：状态变化必须写入账本；停止原因只说明本轮为何停止，完成判定只有全部完成定义满足时才能写“通过”。

## 控制权与三层时间尺度
- 权威顺序：用户当前明确决定 > 仓库规则 > 本总控 > 验收与数据契约 > 阶段计划 > 执行账本；代码和真实运行产物是实现事实源，聊天记录不是事实源。
- 当前控制基线：实现提交 fbbbf5642ee8e4aa36699d8f466fc630f0f93447；REV-0001 方向摘要 SHA-256 3296525f366ebb43b0df89b2bf0b44de2a48d90bd908bafc5d0bc08f52ca7b4a；REV-0002 用户批准摘要 SHA-256 9858a1c86f33c74aa42ce5801060d1dca7b974881c0e140a56e7e9af5de1a7df。
- 替代或继承：REV-0002 直接继承 REV-0001 的范围、完成定义、实现与失败证据，只替代 GATE-01 的恢复执行控制；EVID-27/28/29 和三次失败结论永久保留。历史规格和 2026-07-11 验收报告仍仅作调查线索。
- 历史完成权：撤销旧计划、旧绿灯和旧“全面升级完成”对本 Goal 的完成权；只有从当前实现重新生成的新鲜证据可放行承诺。
- 控制完整性边界：检查器通过只证明控制结构完整，不证明产品完成。
- 终极愿景：形成一个长期可信、轻量、安静、由用户拥有数据的个人阅读世界，可随真实使用持续演进。
- 本 Goal 交付：在现有 Monorepo 内交付生产级候选的单用户、本地优先 Web/PWA 阅读系统，完整覆盖正式核心旅程、数据可携带性、端到端加密自托管同步和跨环境验收。
- 时间型结果：数周至数月真实阅读后的长期舒适度、长期同步可靠性、NAS/VPS 运维稳定性与用户习惯留存；本 Goal 不提前宣称这些结果完成。
- 活跃控制文档上限：12
- 控制包推翻条件：若真实回放证明 REV-0001 无法在不丢数据、不破坏离线核心或不引入不可接受复杂度下实现，立即暂停受影响范围并请求用户批准新控制修订，禁止静默降标。

## 控制修订记录
| 修订 ID | 前序修订 | 控制基线 | 批准动作 ID | 触发风险门 | 状态 | 变更原因 |
|---|---|---|---|---|---|---|
| REV-0001 | 无（首次建立） | c900af34e81d5b09319498f57953bf2c0205c02c + 方向摘要 3296525f | 无（首次建立） | 无（首次建立） | SUPERSEDED | 用户逐项关闭范围、数据、同步、体验、验收和授权边界后首次建立；GATE-01 三次差异实验失败后被 REV-0002 替代 |
| REV-0002 | REV-0001 | fbbbf5642ee8e4aa36699d8f466fc630f0f93447 + 批准摘要 9858a1c86f33c74a | ACT-07 | GATE-01 | ACTIVE | 用户批准设计复核恢复：先证明验证基础设施资格，再注册产品复验；旧 ATTEMPT 不删除、不改写、不转为通过 |

## 活跃控制文档清单
| 文档角色 | 仓库相对路径 |
|---|---|
| MASTER | docs/goals/reading-world-v1/goal-master.md |
| LEDGER | docs/goals/reading-world-v1/execution-ledger.md |
| PHASE | docs/goals/reading-world-v1/phases/phase-01-truth-audit.md |
| PHASE | docs/goals/reading-world-v1/phases/phase-02-local-data-slice.md |
| PHASE | docs/goals/reading-world-v1/phases/phase-03-import-and-portability.md |
| PHASE | docs/goals/reading-world-v1/phases/phase-04-reader-experience.md |
| PHASE | docs/goals/reading-world-v1/phases/phase-05-library-notes-ui.md |
| PHASE | docs/goals/reading-world-v1/phases/phase-06-offline-pwa.md |
| PHASE | docs/goals/reading-world-v1/phases/phase-07-encrypted-sync.md |
| PHASE | docs/goals/reading-world-v1/phases/phase-08-cross-environment-hardening.md |
| PHASE | docs/goals/reading-world-v1/phases/phase-09-release-candidate.md |
| EVIDENCE_INDEX | docs/goals/reading-world-v1/evidence/index.md |

## 认知与实验台账
| 认知 ID | 类型 | 命题 | 当前证据 | 证伪或通过标准 | 关联项 | 失败或删除路径 |
|---|---|---|---|---|---|---|
| FACT-01 | VERIFIED_FACT | 当前项目是 Next.js/React Web PWA + NestJS/SQLite 的 Monorepo，并有共享核心包 | README.md、package.json、apps 与 packages 源码 | 当前入口或实际构建证明技术基线已变更 | FDEC-01 | 重开架构与交付形态决定 |
| FACT-02 | VERIFIED_FACT | 旧报告声称 lint、test、build、E2E 和离线通过，但未覆盖本 Goal 新承诺 | docs/verification/2026-07-11-comprehensive-upgrade.md | 新鲜回放证明它覆盖全部新承诺 | HYP-01 | 逐项复用仍新鲜证据，否则全部重跑 |
| FACT-03 | VERIFIED_FACT | 当前缺少完整可携带备份、端到端加密同步及对应恢复体验 | 定向源码与文档检索 | 现有真实入口和回放证明能力已完整存在 | HYP-02 | 更新基线，优先修复而非新建 |
| FDEC-01 | FROZEN_DECISION | 单用户、本地优先、Web/PWA、可选自托管私有云，不建设内容平台或原生 App | direction-approval-v1.md | 只有用户批准的新 REV 可改变 | FACT-01 | 暂停受影响范围并追加控制修订 |
| FDEC-02 | FROZEN_DECISION | 默认轻量同步，全文逐书显式端到端加密上传，密钥只在设备端 | direction-approval-v1.md | 只有新风险证据与用户新 REV 可改变 | FACT-03 | 停止同步扩张并保留本地功能 |
| FDEC-03 | FROZEN_DECISION | REV-0002 保留 REV-0001 三次失败，先过验证基础设施资格门，再执行新的产品纵切实验 | rev-0002-approval.md、EVID-27/28/29 | 只有用户批准的新 REV 可改变；资格门不得替代产品门 | FACT-04 | 暂停 PHASE-02 并追加控制修订 |
| FACT-04 | VERIFIED_FACT | REV-0001 的三次失败混合了验证器不可判定和产品机制失败，无法作为同一种因果继续重试 | EVID-27/28/29 的命令、trace、进程与补偿记录 | 独立复算证明三次均由相同产品缺陷直接导致且验证器完全可靠 | HYP-04 | 删除资格门并由新 REV 重建 GATE-01 实验设计 |
| HYP-01 | HYPOTHESIS | 现有核心架构可通过演进式提取与修复达到目标，不需全仓重写 | 已有共享包、领域目录、可运行主旅程和 REV-0001 历史 ATTEMPT | REV-0002 下 EXP-09/10/11 任一通过 GATE-01；三次均失败则再次熔断 | EXP-09、EXP-10、EXP-11 | 每次记录新的独立 ATTEMPT；不得把 REV-0001 失败改成通过或当作 REV-0002 计数 |
| EXP-01 | EXPERIMENT | 基线机制：一份 UTF-8 小型 TXT 走现有导入 UI、现有阅读器、统一进度服务、真断网和最小备份恢复 | clean 基线、固定 short-novel fixture、隔离浏览器 | 完整结果通过 GATE-01；失败写 EVID-27 | HYP-01 | 失败后保留现有模块，转 EXP-02 验证流式导入差异 |
| EXP-02 | EXPERIMENT | 机制差异：同一固定小说改走 Worker 流式导入和新会话适配器，再走相同用户结果与故障判据 | EXP-01 ATTEMPT、同内容不同导入机制 | 完整结果通过 GATE-01；失败写 EVID-28 | HYP-01 | 失败后不扩大，转 EXP-03 验证存储适配差异 |
| EXP-03 | EXPERIMENT | 存储差异：固定 EPUB 走兼容存储适配器、刷新/断网和备份副本恢复 | 前两次 ATTEMPT、固定 EPUB fixture | 完整结果通过 GATE-01；失败写 EVID-29；第三次失败即熔断 | HYP-01 | 写入 BLOCKED_DESIGN_REVIEW_REQUIRED 并请求新 REV |
| HYP-04 | HYPOTHESIS | 生产构建、浏览器、选择器、进程退出、端口释放、PWA 生成物补偿与证据写入可组成可判定且可复算的 GATE-01 验证设施 | EVID-27/28/29 的基础设施失败谱系和当前检查器补偿合同 | EXP-08/12/13 任一完整通过 GATE-00；三次差异资格实验均失败则熔断 | EXP-08、EXP-12、EXP-13 | 保持产品门冻结；每次保留独立 ATTEMPT，不借资格失败修改产品实现 |
| EXP-08 | EXPERIMENT | 基线资格：唯一测试枚举、唯一可访问目标、生产服务启动退出、3102 释放、public 补偿、日志与 SHA 复算 | clean REV-0002 控制提交、固定空库与只读探针 | 完整通过 GATE-00；失败写 EVID-51 | HYP-04 | 保留 ATTEMPT，转 EXP-12 验证进程管理差异 |
| EXP-12 | EXPERIMENT | 进程差异：隔离临时 public 副本与显式进程组生命周期，再复核相同资格结果 | EXP-08 ATTEMPT、相同输入不同进程/补偿机制 | 完整通过 GATE-00；失败写 EVID-52 | HYP-04 | 保留 ATTEMPT，转 EXP-13 验证服务启动差异 |
| EXP-13 | EXPERIMENT | 启动差异：预构建产物与显式服务健康探针，不由测试框架隐式管理 WebServer | 前两次资格 ATTEMPT、相同退出与哈希判据 | 完整通过 GATE-00；失败写 EVID-53，第三次失败即熔断 | HYP-04 | 写入 BLOCKED_DESIGN_REVIEW_REQUIRED 并请求新 REV |
| EXP-09 | EXPERIMENT | 资格门通过后的产品基线：固定 EPUB + 兼容存储，使用按书 ID 唯一定位器完成相同纵切用户结果 | GATE-00 FINAL、EVID-29、固定 EPUB 和 clean 候选 | 完整通过 GATE-01；失败写 EVID-48 | HYP-01 | 保留 ATTEMPT，转 EXP-10 的 TXT 主线程兼容机制 |
| EXP-10 | EXPERIMENT | 导入差异：固定 TXT 改走主线程解析与兼容存储，复用相同离线/备份恢复结果 | EXP-09 ATTEMPT、相同用户结果不同格式与解析机制 | 完整通过 GATE-01；失败写 EVID-49 | HYP-01 | 保留 ATTEMPT，转 EXP-11 的预构建读取机制 |
| EXP-11 | EXPERIMENT | 读取差异：预构建固定书籍快照从版本化备份恢复后进入阅读，再验证落盘、离线与二次恢复 | 前两次 REV-0002 ATTEMPT、固定版本化快照 | 完整通过 GATE-01；失败写 EVID-50，第三次失败即熔断 | HYP-01 | 写入 BLOCKED_DESIGN_REVIEW_REQUIRED 并请求新 REV |
| HYP-02 | HYPOTHESIS | 公开、版本化备份契约可同时支撑迁移回滚、跨设备恢复和数据主权 | 现有 IndexedDB/OPFS/SQLite 边界 | EXP-07 完成原数据与恢复数据逐项哈希/计数对账 | EXP-07 | 删除不可靠格式，回到只读导出并重新设计 |
| EXP-07 | EXPERIMENT | 在隔离副本导出含书、进度、书签、笔记和设置的备份，再以合并与副本两种模式恢复 | PHASE-02 数据契约和固定样本 | 恢复前可预览、恢复后逐项一致且失败不污染原库 | HYP-02 | 记录 ATTEMPT 并阻断所有迁移与同步扩张 |
| HYP-03 | HYPOTHESIS | 浏览器端密钥主权与密文服务端可在不伤害离线体验下完成双端同步 | Web Crypto、现有 API/SQLite/Blob 边界 | EXP-04/05/06 任一通过 GATE-02；三次均失败则熔断 | EXP-04、EXP-05、EXP-06 | 保持同步关闭，保留导出搬运，进入设计复核 |
| EXP-04 | EXPERIMENT | 基线机制：两浏览器上下文用恢复码加入，轻量同步、逐书全文、离线双写、冲突副本与撤销 | 固定协议 fixture、隔离 SQLite/Blob | 通过 GATE-02；失败写 EVID-30 | HYP-03 | 保留密文与 ATTEMPT，转 EXP-05 验证设备授权差异 |
| EXP-05 | EXPERIMENT | 授权差异：第二设备改由已授权设备扫码/短码加入，重复冲突、撤销和明文扫描 | EXP-04 ATTEMPT、相同数据不同加入机制 | 通过 GATE-02；失败写 EVID-31 | HYP-03 | 保持功能隐藏，转 EXP-06 验证网络/重放差异 |
| EXP-06 | EXPERIMENT | 故障差异：Docker 隔离服务中注入断网、乱序重放和恢复包重建，再执行撤销与明文扫描 | 前两次 ATTEMPT、固定故障序列 | 通过 GATE-02；失败写 EVID-32；第三次失败即熔断 | HYP-03 | 写入 BLOCKED_DESIGN_REVIEW_REQUIRED 并请求新 REV |

## 风险门与先纵切后扩张
- 扩张规则：先纵切后扩张；REV-0002 必须先通过 GATE-00 验证基础设施资格门，再用现有 UI 和最小兼容层完整通过早期薄切片 GATE-01，才能进入 PHASE-03 并批量扩张导入、阅读、书架、PWA 或迁移；GATE-02 通过前不得把全文同步扩到正式入口。
- 设计复核规则：同一风险门在同一控制修订下完成 3 次差异化实验仍失败，状态写入 BLOCKED_DESIGN_REVIEW_REQUIRED，停止堆实现并请求新修订；REV-0001 的 TRY-01/02/03 继续保留，但不计入 REV-0002 的失败次数。

| 风险门 ID | 用户结果 | 纵向切片 | 失败判据 | 放行证据 | 扩张权限 |
|---|---|---|---|---|---|
| GATE-00 | GATE-01 的检查结果能稳定区分产品失败与验证器不可判定，并在失败后无遗留副作用 | 唯一测试枚举 -> 生产服务健康 -> 唯一目标定位 -> 受控失败探针 -> 进程退出/端口释放 -> public 补偿 -> 日志与 SHA 复算 | 测试枚举不唯一、选择器歧义未预检、孤儿进程、端口占用、受控文件未恢复、日志/哈希不闭合或检查器把自身故障写成产品结论 | EVID-45 | 仅允许执行 REV-0002 的 EXP-09/10/11；不放行 PHASE-03 或任何产品扩张 |
| GATE-01 | 一本固定真实书在最小改动下可稳定阅读、续读、离线和备份恢复 | PHASE-02 内用现有 UI + 最小兼容服务完成输入 -> 解析预览 -> 书架 -> 阅读 -> 1 秒落盘 -> 刷新/真断网 -> 最小备份 -> 隔离副本恢复 | 任一步伪成功、数据丢失、无法回滚、离线不可读或证据不可复算 | EVID-17 | 通过后才允许 PHASE-03~06 扩张；后续 REQ 终局证据仍须全量重采 |
| GATE-02 | 两台设备能在服务端只见密文的前提下可靠同步 | 设备建库 -> 恢复码加入 -> 轻量同步 -> 逐书全文 -> 离线编辑 -> 冲突副本 -> 撤销设备 | 服务端出现明文、冲突覆盖、离线队列丢失、撤销失效或无恢复出口 | EVID-18 | 允许把加密同步与 Docker 自托管作为正式功能 |

## 阶段计划清单
- `docs/goals/reading-world-v1/phases/phase-01-truth-audit.md`
- `docs/goals/reading-world-v1/phases/phase-02-local-data-slice.md`
- `docs/goals/reading-world-v1/phases/phase-03-import-and-portability.md`
- `docs/goals/reading-world-v1/phases/phase-04-reader-experience.md`
- `docs/goals/reading-world-v1/phases/phase-05-library-notes-ui.md`
- `docs/goals/reading-world-v1/phases/phase-06-offline-pwa.md`
- `docs/goals/reading-world-v1/phases/phase-07-encrypted-sync.md`
- `docs/goals/reading-world-v1/phases/phase-08-cross-environment-hardening.md`
- `docs/goals/reading-world-v1/phases/phase-09-release-candidate.md`

## 愿景与真实需求
- 真实用户：项目所有者本人，在手机、桌面浏览器和可安装 PWA 上长期阅读自有或有权访问的小说。
- 核心场景：导入或更新一本书，舒服阅读，随时退出或断网后准确续读，可靠保存笔记，并在个人设备间安全同步或完整搬迁数据。
- 当前替代方式：使用当前不稳定项目或转向起点、番茄等成熟平台；后者体验稳定但不满足个人数据、本地文件、离线与私有同步主权。
- 不做的后果：阅读中断和数据不可信会使系统失去长期使用价值，继续堆功能只会扩大故障面和迁移成本。
- 最终目标：交付可审计、可恢复、跨屏稳定的个人阅读系统生产级候选，并用新鲜真实回放证明本 Goal 全部承诺。

## 项目现场
- 已确认事实：当前提交 c900af34e81d5b09319498f57953bf2c0205c02c；Monorepo 含 web-pwa、api、reader/parser/storage 等共享包；存在单元、API 与 Playwright 测试；旧报告未覆盖新同步与备份承诺。
- 合理推断：现有模块边界足以支持演进式重构，但 LibraryDefault、useReader 和导入页仍是高风险集中点；需以阶段审计和纵向实验确认。
- 已关闭冲突：用户明确放弃多用户内容平台、原生 App、官方托管云、内置侵权书源和 AI 核心化，选择轻量本地优先方案。
- 事实源：代码与运行产物为实现事实源；IndexedDB/OPFS 是浏览器本地事实源，SQLite/Blob 是自托管密文与服务状态事实源；后端执行访问控制，前端只表达状态。
- 当前基线：旧主旅程和 PWA 有候选实现与旧绿灯，但完整备份、版本迁移、端到端同步、恢复码/设备撤销、Docker 交付和本 Goal 压力/跨环境证据均未证明。

## 范围契约
- 必须完成：稳定书架、TXT/EPUB/文件夹/合法 URL 导入、解析预览、沉浸阅读与准确续读、搜索、书签笔记、完整备份恢复与 Markdown/JSON 导出、生产离线 PWA、端到端加密自托管同步、清晰同步 UI、跨浏览器与压力验收。
- 明确不做：多用户账号平台、商城、社交、广告、推荐流、原生 App、官方托管云、内置盗版书源、绕过登录/付费/反爬、AI 核心依赖、PostgreSQL/Redis/Kubernetes。
- 必须保持：现有用户数据、旧稳定版本可读性、安静柔和纸感国风基调、核心功能无 AI/无网络仍可用、服务端不见同步明文。
- 时间与成本边界：不设虚假固定期限；每阶段按预算收敛。不得产生付费服务、官方云运维或未经批准的外部成本。
- 工具与权限边界：允许仓库内读取、修改、构建、测试、浏览器/本地服务和隔离 Docker 验证；公开部署、外部发送、付费、删用户数据、扩大权限和破坏性迁移必须另行授权。

## 方案与取舍
| 方案 | 用户价值 | 主要工作 | 成本与风险 | 结论 |
|---|---|---|---|---|
| 只修表层问题 | 短期快 | 零散修补 UI 与已知 Bug | 无法解决数据、同步、集中 Hook 和真实性缺口 | 放弃 |
| 现有 Monorepo 演进式重构 | 保留资产与数据，逐切片提升稳定性 | 契约、适配器、领域服务、迁移和回放 | 需要严格阶段门与兼容层 | 采用 |
| 全仓推倒重写 | 可重新设计 | 建第二套系统并迁移全部数据 | 故障半径最大、长期双轨、伪完成风险高 | 放弃，除非新 REV 证明必要 |

### 推荐方案
- 总体方案：以 GATE-01 本地纵向切片先证明数据与阅读核心，再分阶段演进；GATE-02 独立证明端到端同步后才正式开放。
- 架构边界：页面只组合 UI；领域服务管理书架、导入、阅读、备份和同步；reader/parser/storage 核心保持无 UI；浏览器与 API 存储走适配器；后端只保存同步密文并执行设备授权。
- 复用入口：现有 shared-types、reader-core、parser-core、storage-core、gesture-core、AppShell/UI 标准件、数据库 Repository、Playwright 与 CI；同语义能力先统一再新增。
- 异常与兜底：网络或 API 失败不影响本地阅读；迁移前备份，失败自动回滚；同步冲突保留副本；AI/Provider 失败明确降级；任何保存失败不得伪装成功。

## 阶段路线
| 阶段 ID | 目标 | 稳定输入 | 交付物 | 依赖 | 定向检查 | 活体验收 | 人工检查点 |
|---|---|---|---|---|---|---|---|
| PHASE-01 | 建立当前真实性基线与缺口清单 | clean@c900af34 | 架构图、功能矩阵、失败基线、复用清单 | REV-0001 | lint/test/build 与定向静态审计 | 启动当前应用回放主旅程 | 确认未遗漏真实常用场景 |
| PHASE-02 | 打通本地数据安全纵向切片 | PHASE-01 基线 | 数据契约、1 秒落盘、备份前置、迁移框架、完整早期 GATE-01 薄切片 | PHASE-01 | 存储/进度/迁移测试 | 崩溃刷新与隔离恢复 | 确认恢复行为可理解 |
| PHASE-03 | 稳定导入解析与数据可携带性 | PHASE-02 契约 | 流式导入、任务恢复、完整备份恢复、Markdown/JSON 导出 | PHASE-02 | fixtures、容量、故障注入 | 大文件导入和两模式恢复 | 审核预览与影响文案 |
| PHASE-04 | 达成低干扰、准确恢复的阅读体验 | PHASE-02/03 | 阅读会话服务、滚动/分页、设置、触控、进度恢复 | PHASE-03 | reader/gesture/位置测试 | 手机桌面长读、后台恢复 | 阅读舒适度量表通过 |
| PHASE-05 | 收敛书架、搜索、笔记和同步状态 UI | PHASE-04 | 统一领域入口与共享反馈组件 | PHASE-04 | 组件/领域/E2E | 500 本书架与单手操作 | UI 保持品牌气质且清晰 |
| PHASE-06 | 证明生产离线 PWA | PHASE-03/04 | 缓存策略、升级恢复、存储诊断 | PHASE-05 | SW/manifest/offline E2E | 真断网冷启、升级、配额异常 | 安装与恢复说明可理解 |
| PHASE-07 | 证明端到端加密私有同步和 Docker | GATE-01 通过 | 密钥/设备协议、密文同步、冲突、恢复包、单机 Docker | PHASE-06 | crypto/protocol/API/Docker tests | 双端 GATE-02 回放 | 恢复码与不可恢复警告确认 |
| PHASE-08 | 跨环境、性能、安全与可访问性硬化 | 前述正式功能 | 压力、兼容、a11y、安全与故障矩阵 | PHASE-07 | 全门禁与浏览器矩阵 | 指定桌面/移动环境回放 | 体验评分和残余风险签认 |
| PHASE-09 | 形成生产级候选并按 A/B/C 封账 | 全阶段完成 | A 实现、B FINAL 证据、C 总控账本 | PHASE-08 | ready/complete 检查器与安全扫描 | clean@A 全量重放 | 用户最终体验验收 |

## 承诺覆盖矩阵
| 承诺 ID | 承诺或否定项 | 阶段 ID | 验证证据 |
|---|---|---|---|
| DEC-01 | 单用户、本地优先个人阅读系统及 REV-0001 仓库内实施授权 | PHASE-01 | EVID-01 |
| DEC-03 | 本 Goal 只交付桌面网页、手机网页和可安装 PWA，不开发原生 App | PHASE-01 | EVID-33 |
| DEC-04 | 默认只同步轻量数据，全文必须逐书显式开启并端到端加密 | PHASE-07 | EVID-34 |
| DEC-05 | 密钥只在设备端；恢复码/已授权设备加入，丢失恢复条件时明确不可恢复 | PHASE-07 | EVID-35 |
| DEC-06 | 私有云采用本机运行与单机 Docker、SQLite/挂载目录，不引入重型基础设施或官方云 | PHASE-07 | EVID-36 |
| DEC-07 | 内容只来自有权使用的本地文件/合法 URL/自配 Provider，不绕过访问限制 | PHASE-03 | EVID-37 |
| DEC-08 | AI 默认关闭且非核心，外发前预览，可取消、清缓存和按书禁用 | PHASE-08 | EVID-38 |
| DEC-09 | 存储/协议变化先备份，版本化幂等迁移、失败回滚、至少读取上一稳定版 | PHASE-02 | EVID-39 |
| DEC-10 | 核心数据提供公开结构、可校验、可合并/副本恢复的完整备份与人读导出 | PHASE-03 | EVID-40 |
| DEC-11 | 按约定规模、Web Vitals 和桌面/移动浏览器真实或等价环境验收 | PHASE-08 | EVID-41 |
| DEC-12 | 保留安静纸感国风基调，允许为层级、性能、a11y 和单手操作重排删减 | PHASE-05 | EVID-42 |
| DEC-13 | 只在现有 Monorepo 演进式替换；证据证明不可修复时才局部重写 | PHASE-01 | EVID-43 |
| DEC-14 | 批准 REV-0002：保留旧失败，先通过验证基础设施资格门，再执行新登记的 GATE-01 产品实验 | PHASE-02 | EVID-44 |
| REQ-01 | 本地导入、解析、阅读、1 秒内落盘、刷新与离线续读稳定 | PHASE-04 | EVID-02 |
| REQ-02 | TXT 200MB、EPUB 500MB 与单本 1 万章导入不阻塞且失败可恢复 | PHASE-03 | EVID-03 |
| REQ-03 | 完整版本化备份支持预览、合并/副本恢复和逐项校验 | PHASE-03 | EVID-04 |
| REQ-04 | 书签笔记可导出 Markdown/JSON，核心数据不锁死 | PHASE-03 | EVID-05 |
| REQ-05 | 500 本书架、搜索、笔记、设置与同步状态清晰流畅 | PHASE-05 | EVID-06 |
| REQ-06 | 阅读器在手机与桌面提供低干扰、触控友好、滚动/分页和后台恢复体验 | PHASE-04 | EVID-07 |
| REQ-07 | PWA 真断网冷启、缓存阅读、升级与配额异常时不丢已确认数据 | PHASE-06 | EVID-08 |
| REQ-08 | 默认轻量数据同步，全文逐书显式端到端加密上传 | PHASE-07 | EVID-09 |
| REQ-09 | 恢复码/已授权设备加入、设备撤销、离线恢复包与不可恢复警告完整 | PHASE-07 | EVID-10 |
| REQ-10 | 单机 Docker 自托管支持 NAS/VPS 挂载目录与完整备份恢复 | PHASE-07 | EVID-11 |
| REQ-11 | 达到 LCP≤2.5s、INP≤200ms、CLS≤0.1 的约定环境性能基线 | PHASE-08 | EVID-12 |
| REQ-12 | 指定桌面和移动浏览器完成导入、离线、恢复、备份还原和双端同步回放 | PHASE-08 | EVID-13 |
| REQ-13 | 保留国风纸感基调并改进信息层级、单手操作、可访问性与状态反馈 | PHASE-05 | EVID-14 |
| REQ-14 | AI 默认关闭且任何失败不伤核心；外发前预览并可清缓存/按书禁用 | PHASE-08 | EVID-15 |
| REQ-15 | 合法 URL/自配 Provider 有边界刷新，不绕过登录付费反爬 | PHASE-03 | EVID-16 |
| RISK-01 | 先通过本地纵向切片再扩张，不允许数据丢失或伪成功 | PHASE-02 | EVID-17 |
| RISK-02 | 端到端同步服务端无明文且冲突、撤销、恢复均可验证 | PHASE-07 | EVID-18 |
| NREQ-01 | 不出现商城、社交、广告、推荐流、多用户平台或原生 App 范围膨胀 | PHASE-09 | EVID-19 |
| NREQ-02 | 不出现静默清库、破坏性迁移、旧数据不可读或无备份回滚 | PHASE-08 | EVID-20 |
| NREQ-03 | 不出现服务端同步明文、前端显隐冒充权限或密钥被日志/构建泄漏 | PHASE-08 | EVID-21 |
| NREQ-04 | 不出现 AI/网络/Provider 故障阻断核心阅读，不内置侵权来源 | PHASE-08 | EVID-22 |
| NREQ-05 | 不出现白屏、遮挡、横向溢出、关键控件小于 44px、不可见焦点或数据伪成功 | PHASE-08 | EVID-23 |
| NREQ-06 | 不以旧报告、单次绿灯、阶段完成或检查器通过冒充 Goal complete | PHASE-09 | EVID-24 |
| RISK-03 | 迁移和协议变化必须先备份、幂等、失败回滚且至少读上一稳定版 | PHASE-02 | EVID-25 |
| RISK-04 | GATE-01 验证设施必须先证明可判定、无遗留副作用且证据可复算 | PHASE-02 | EVID-45 |
| DEC-02 | 正式功能稳定前暂停新增，实验能力可隐藏但不删除数据 | PHASE-01 | EVID-26 |

## 循环与预算
- 最大修复轮数：每项任务 3 轮差异化修复；同一控制修订内同一风险门 3 次差异化实验失败立即设计复核；资格门与产品门分别计数。
- 单阶段时间上限：连续执行 8 小时或 3 个工作批次，以先到者为准；超过后收束证据和账本，不自动续期。
- Token 或上下文预算：每阶段先读账本和当前计划；单次调查最多 8 个定向文件/命令输出，超出前先写报告索引并压缩；禁止全仓倾倒。
- 子任务数量上限：实现与 GATE-01 仍不委派；用户已明确允许适合时并发，PHASE-01 仅启用 1 个边界独立的只读复审任务；单阶段最多 3 个边界独立任务、最大并发 2。
- 工具范围：本地文件、Git、pnpm/Node、浏览器、SQLite、隔离 Docker、静态与安全扫描；不含部署、付费和外部写入。
- 缺证据熔断：关键数据样本、目标浏览器或隔离服务不可用且三次替代取证仍不能验证时写阻塞，不降级完成定义。
- 重复运行要求：测试和生成器须幂等；迁移/恢复/同步重跑前按阶段重放表核验隔离目录、幂等键、备份和外部状态。

## 委派与收束
- 委派判定：实现与 GATE-01 由单一主控完成，避免共享工作树和数据契约发生所有权冲突；TASK-0104 在落盘只读审查包后作为唯一例外委派，不扩大实现范围。
- 最大并发子任务：1
- 单任务时间上限：2 小时；到限后停止扩张，写报告、证据缺口和下一入口。
- 委派包：若启用，必须绑定 Brief、所有权与可改范围、明确不做、BASE 完整提交、报告路径和规格/质量审查包。
- 返回状态：DONE / DONE_WITH_CONCERNS / NEEDS_CONTEXT / BLOCKED
- 心跳与收束：每 30 分钟或每个实质证据后检查；连续两次无新证据、重复调查或越界即停止或取消并收束。
- 独立审查：阶段完成由未参与该切片产出的审查视角按 BASE..HEAD、真实报告和证据复核；终局另做 clean@A 复算。

| 任务 ID | Brief | 所有权与可改范围 | 明确不做 | 基线版本 | 报告路径 | 审查包 | 收束预算 |
|---|---|---|---|---|---|---|---|
| TASK-0104 | 独立复核 PHASE-01 事实覆盖、证据新鲜度和放行边界 | 只写 `reviews/phase-01-readiness.md` | 不改源码、报告、控制文档、账本、证据或 Git | c900af34 + brief 内四项 SHA | `docs/goals/reading-world-v1/reviews/phase-01-readiness.md` | `docs/goals/reading-world-v1/reports/task-0104-review-brief.md` | 1 个审查批次；输入 SHA 变化即 NEEDS_CONTEXT |

## 主线验证门
- 静态检查：`git diff --check`、`corepack pnpm --filter web-pwa lint`、`corepack pnpm --filter api exec eslint "{src,apps,libs,test}/**/*.ts"`，零错误、零警告且不使用 `--fix`；PHASE-01 将根 lint 改为非写入门后才能恢复 `corepack pnpm lint`。
- 测试：`corepack pnpm test`，并按阶段增加迁移、备份、加密、冲突、离线、容量与可访问性测试；不得以跳过用例放行。
- 构建或导出：`corepack pnpm build`，检查 Web/PWA、API、Docker 镜像和完整备份产物可从干净环境重建。
- 安全与隐私：项目安全扫描、依赖审计、密文服务端明文探针、密钥/绝对路径/缓存扫描；未跟踪控制包也必须覆盖。
- 真实运行：隔离浏览器配置、真实断网、双设备/双上下文、SQLite/挂载目录、Docker、指定浏览器与视口回放。
- 证据新鲜度：FINAL 必须从 clean@A 重新构建并生成，晚于源码、数据和配置；记录完整提交、命令、退出码、环境与 SHA-256。

## 最终完成定义
- 正向条件：全部阶段为完成；REQ、DEC、RISK 的 FINAL 证据新鲜通过；GATE-01/GATE-02 通过；正式核心旅程、备份恢复、PWA 离线、密文同步、Docker、性能和浏览器矩阵均有活体证据。
- 否定清单：任何 NREQ 出现、任何数据丢失/伪成功、任何密钥或同步明文泄漏、任何目标环境未验证、任何旧证据冒充新鲜证据、任何公开部署/付费/删数据越权，均不得完成。
- 完成边界：仅本 Goal 的有限交付；不得外推为终极愿景或时间型结果完成。
- 独立验收：从 clean@A 由不同审查视角复跑主线门、风险门、证据哈希、安全扫描和 `check_long_goal_pack.py --mode complete`。
- 人工体验：用户或明确代理在手机与桌面按“舒适、低干扰、状态清晰、恢复可信、单手易用”五项各 1–5 分评分；每项至少 4 分且无阻断问题。
- 完成口径：阶段完成只说明切片通过；MVP/local-only 不含私有同步；release candidate 包含全部功能和跨环境证据；production-ready 还要求运维与安全门；Goal complete 仅在 A/B/C 封账后成立。

## 风险、授权与停止条件
| 动作 ID | 风险或动作 | 版本或摘要哈希 | 有效期或失效条件 | 是否需要人工授权 | 授权状态 | 授权证据 |
|---|---|---|---|---|---|---|
| ACT-01 | 按 REV-0001 创建控制包并进行仓库内可逆实现、测试和演进式重构 | 方向摘要 3296525f366ebb43b0df89b2bf0b44de2a48d90bd908bafc5d0bc08f52ca7b4a | 机制、范围、成本、权限、持久化、依赖或故障半径实质变化即失效 | 是 | APPROVED | DEC-01 |
| ACT-02 | 公开部署、发布镜像、付费或发送外部消息 | REV-0001；具体环境与参数尚未批准 | 每次具体动作、环境或参数变化均需新授权 | 是 | PENDING | 待授权 |
| ACT-03 | 删除真实用户数据、破坏性迁移或撤销不可恢复密钥 | REV-0001；只允许隔离测试数据 | 触及非隔离真实数据即需新授权 | 是 | PENDING | 待授权 |
| ACT-04 | 本地隔离构建、测试、浏览器回放和 Docker 验证 | c900af34 基线 + 当前阶段提交 | 超出本机/隔离环境或产生公开副作用即失效 | 否 | NOT_REQUIRED | 仓库内可逆验证规则 |
| ACT-05 | 创建本地 Git 切片提交，不推送远端 | REV-0001 + 当前阶段暂存清单 | 暂存含无关用户改动或需要改写历史即失效 | 否 | NOT_REQUIRED | ACT-01 的仓库内可逆实施授权 |
| ACT-06 | push、PR 或其他远端 Git 写入 | 具体远端、分支和提交尚未批准 | 远端、分支、提交或可见范围变化均需新授权 | 是 | PENDING | 待授权 |
| ACT-07 | 创建并执行 REV-0002：先验证 GATE-00 资格门，再执行预登记的 GATE-01 实验；永久保留 REV-0001 失败证据 | 批准摘要 9858a1c86f33c74aa42ce5801060d1dca7b974881c0e140a56e7e9af5de1a7df + 基线 fbbbf5642ee8e4aa36699d8f466fc630f0f93447 | 资格门设计、产品实验、范围、权限、依赖或故障半径实质变化即失效；公开/远端/真实数据动作仍另行授权 | 是 | APPROVED | DEC-14 |

## 恢复协议
1. 读取本总控的范围、阶段路线、最终完成定义和停止条件。
2. 读取执行账本最后一条记录、失败命令、残余风险和下一入口。
3. 对账当前工作树、最近提交、运行服务和证据新鲜度，保护用户已有改动。
4. 读取当前阶段计划，只从账本记录的下一入口继续。
5. 按任务重放类别处理：replay_safe 可重跑；verify_before_repeat 先核对状态；compensate 先补偿；human_required 重新取得绑定当前版本的授权。
6. 源码、数据或配置晚于证据时先刷新证据；新事实证伪总控时暂停并申请新 REV。

## 终局封账顺序
- 实现提交：待生成
- 证据提交：待生成
- 封账定位：待生成

1. 全阶段收敛后提交实现 A，并确保报告指出所有阶段已到终局候选。
2. 从 clean@A 重建、运行、生成新鲜证据并由独立验证视角复算；EVID-01 与 EVID-33~43 的决定证据也必须重采为 clean@A（保留原始用户授权内容与哈希谱系），只提交 evidence、reports、reviews 为 B。
3. B 后只更新本总控与执行账本为完成并提交 C；记录完整 A/B object ID 和 `derived@master+ledger`。
4. 运行 complete 检查器、安全报告复算和人工检查；C 后不得改写终局证据或账本历史。
