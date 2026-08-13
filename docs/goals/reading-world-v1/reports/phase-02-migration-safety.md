# PHASE-02 / TASK-0203 迁移安全报告

- Goal ID：GOAL-READING-WORLD-V1
- 控制修订：REV-0001
- 任务：TASK-0203
- 结论：版本化完整快照的可恢复迁移编排内核已实现；后续 TASK-0207 已把真实 v9→v10 Dexie 启动升级、升级前备份、幂等重开、故障回滚与用户可见启动门接入并通过 EVID-25。本报告前半保留 TASK-0203 当时事实，最终状态以末尾补遗为准。

## 基线事实

- Dexie 当前声明 v6、v7、v8、v9；v8→v9 只新增 `aiUserConfigs` 表，没有 `.upgrade()` 数据转换回调。
- 现有 `backupMetadataToStorage()` 只包含 books/progress/bookmarks，且 localStorage 路径会按 100 本书/500 书签裁剪；不能作为数据迁移的完整回滚副本。
- TASK-0201 已冻结 `read-realm-local-snapshot` / schemaVersion 1 完整数据契约，可复用为迁移前备份和回滚载体。

## 实现合同

- `LocalDataMigrationStore` 把当前快照读取、原子替换、备份写入与备份回读作为注入端口；编排器不直接打开真实 IndexedDB。
- 只接受从当前版本到目标版本的完整、单向、无循环路径；缺步骤或降级请求在备份/当前数据写入前停止。
- 迁移前先稳定序列化完整快照，写入备份后必须字节相等回读，再次解析并与原快照对账；任一不一致时当前数据零写入。
- 每个迁移步骤都要返回契约合法且版本与步骤目标一致的快照。
- 替换当前数据后必须复核新快照；失败时重新回读未变的备份，恢复旧快照并再对账。
- 如果迁移步骤在尚未尝试替换前失败，不做多余补偿写；如果回滚也失败，稳定错误同时保留原迁移错误与回滚错误。
- 默认路径只注册 v8→v9：除 `source.databaseVersion` 从 8 更新为 9 外，书籍、章节正文、进度、书签、设置与文件引用逐项保持。
- 已到目标版本时返回 `already_current`，不重复备份或替换。

## TDD 与故障注入

1. 首次定向测试因 `local-data-migration` 模块不存在而 RED。
2. 实现后 4/5 场景通过；“备份回读不一致”夹具因删除章节而先触发 TASK-0201 引用完整性校验。改用“仍合法但章节正文被篡改”的回读副本后，正确证明在替换前拒绝不一致备份。
3. 运行时测试绿灯后，TypeScript 构建发现数组首章可能为 `undefined`；夹具加入明确存在断言后构建通过。
4. 额外否定场景证明：缺失 9→10 路径时在任何写入前停止；备份写入故障时当前数据零改动。
5. 评审新增“写前迁移步骤失败不应补偿写”探针，先观察到错误被报为 `FAILED_ROLLED_BACK` 的 RED；加入替换尝试边界后转为 `FAILED_BEFORE_WRITE` 并零当前数据写入。

## 定向验证

- `corepack pnpm --filter @reader/storage-core test -- local-data-migration.test.ts`：exit 0；storage-core 4 个文件、22 个测试通过，其中迁移编排器 8 个场景。
- `corepack pnpm --filter @reader/storage-core build`：exit 0。
- `corepack pnpm test`：exit 0，187 个工作区测试通过。
- `corepack pnpm --filter web-pwa lint` 与 API 非写入 ESLint：exit 0。
- `READING_WORLD_VERIFY_NO_PWA_WRITE=1 corepack pnpm build`：exit 0，工作区构建通过且未生成 Service Worker 写入。
- `git diff --check`：exit 0。

## 诚实边界

- 浏览器 Dexie schema 升级发生在数据库连接初始化期间。当前项目没有在连接初始化之前可安全生成 TASK-0201 完整快照的启动协调层；把本编排器在连接后接上会伪装成“迁移前备份”。
- v8→v9 仅新增空表、无现有数据转换；本任务以完整 v8 快照证明上一稳定版数据可保持迁移。未升级 Dexie schema，也未触及真实用户库。
- 本内核是后续首个需要转换存量数据的 schema 变更的强制安全入口，但只在实际适配器与隔离浏览器故障回放通过后才能声称真实迁移门通过。
- 未生成 EVID-20/EVID-25 终局证据，未运行 EXP-01，GATE-01 仍未过门。

## 下一入口

PHASE-02 / TASK-0204：先为检查器实现 PHASE-02/EXP-01 真实命令合同，再用固定 TXT 严格执行输入→预览→入架→阅读→1 秒落盘→刷新/真断网→最小备份→隔离副本恢复。

## TASK-0207 真实迁移门补遗

- v10 新增 `migrationBackups` 表；真实 Dexie versionchange 事务先读取书、章、进度、书签、来源和文件引用，并结合阅读设置生成公开 schemaVersion 1 完整 v9 快照。
- 快照在同一升级事务内写入并回读解析；任何设置损坏、快照校验或备份回读失败都会中止 versionchange，数据库保持 v9，旧书与正文仍可读。
- 隔离浏览器活体回放证明 v9→v10 成功升级、完整备份、重开幂等；损坏旧设置触发失败后数据库版本仍为 v9，且未出现 `migrationBackups` 表。
- `RouteProvider` 在渲染业务视图前显式等待数据库打开；失败时显示“本地数据暂时无法打开”、保留备份的下一步和 44px 最小高度“重试打开本地数据”按钮。点击重试仍失败时不污染旧数据。
- EVID-25 最终 SHA-256：`724a0308733bd188722dff407bf42d0ae14e4931eeb9cc2364fb89696cee9e91`；6/6 records 独立复算匹配，绑定 clean@`d1ccbaf644c2e6df77d6b76f62b090028b81baa3`。
- clean@`a249d5139bee1f0382d7b974387a404f0ab07628` 再次活体复验升级、回滚、失败说明和重试均通过；该复验不覆盖或改写 EVID-25。

补遗后的边界：RISK-03 已通过，但 EVID-20 的终局迁移否定证据仍须在 PHASE-09 从 clean@A 重采；本阶段不声称大文件导入、完整合并恢复、同步或 Goal 完成。
