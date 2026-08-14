# TASK-0504 藏经阁主功能扩张规格

- Goal ID：GOAL-READING-WORLD-V1
- 控制修订：REV-0003
- 前置：EVID-57 / GATE-03 / TASK-0503 已通过
- 状态：冻结；只允许按 A → F 的最小可逆切片实现
- 任务门：`TASK-0504-PUBLIC-LIBRARY-EXPANSION`
- 任务证据：EVID-62 ATTEMPT；通过后由 EVID-56 FINAL 引用
- 计数边界：本任务门不是 HYP-05 的新实验，不复用 EXP-15/16；失败不增加 GATE-03 设计失败计数，不改写 EVID-57/59 或历史 records。

## 用户结果

已绑定非默认私有云密钥的单实例维护者，可以在藏经阁中直接选择 TXT 文件、嵌套 TXT 文件夹或预配置的服务端维护目录，将书籍复制为独立公共明文馆藏；也可以从个人书架发布一份已经完整验证过的云端正文快照。匿名访客可以按书籍、维护者标识、分类、标签检索和分页，复制加入本地后不再依赖公共服务阅读。

当前版本优先完成上传方法、目录组织和浏览主功能，只接收 TXT。EPUB 解析能力继续保留在个人导入系统，公共 EPUB 入口不得在 TXT canonical publisher、重放和边界门通过前并行扩张。

## 不变边界

1. 公共域继续使用独立 PublicLibraryModule、SQLite、Blob、API、维护凭据和任务表；不得注入个人 DRIZZLE、BookRepository、ChapterRepository、个人 DB/Blob 或同步任务。
2. 匿名 GET 不发送 `x-share-token` 或 `x-public-library-maintenance-key`。所有公共写操作只接受 `x-public-library-maintenance-key`；缺失、`default`、错误值和仅 `x-share-token` 必须拒绝。
3. 浏览器可以把已经存在的 normalized `reader-share-token` 作为一次操作的凭据快照交给独立 maintenance client，但该 client 只能发送公共维护头。页面、URL、DTO、日志、错误和 DOM 均不得出现密钥值。
4. “维护者标识”是公共 DB 首次初始化时生成并持久化的随机 maintainerId 和固定展示名“本阁维护者”；不得从维护密钥做裸 hash 或向匿名端提供任何可校验密钥猜测的派生值。它不是账号、用户身份、所有权或 ACL，不提供用户主页。
5. 不新增账号、审核、版权投诉/下架、配额、恶意文件隔离、运营统计或完整审计平台；界面诚实标注“单实例自管公共明文副本”。
6. 原始浏览器文件、维护目录文件和个人书籍永不被公共流程移动、重命名、删除或写入。扫描源和个人云只能作为输入，匿名下载事实源始终是独立公共不可变 package Blob。
7. 公共故障不得阻断个人书架、笔记、进度或已加入书的离线阅读；GATE-03 回归旅程永久保留。

## 唯一写入管线

四个 adapter——旧 JSON 单本兼容入口、multipart 文件/文件夹、维护目录扫描、个人云快照——只能生成同一个 `CanonicalPublicBookCandidate`，统一交给 `PublicLibraryPublisher`：

1. 规范化来源、标题、作者、章节、分类、标签和相对藏书路径；拒绝空章、断裂 index、未知模板和非法路径。
2. 计算 `sourceHash` 与不含可编辑目录元数据的 `editionHash`；相同 edition 只保存一次正文。相同 edition 但元数据冲突必须返回 `duplicate_metadata_conflict` 与 existing book ID，不得假报新元数据生效。
3. package 以内容寻址写入公共 Blob：临时文件 → 完整写入/close/fsync → 原子 rename 或 put-if-absent → SHA-256 读回。
4. 单个候选在同一 SQLite 事务写入并回读 book、edition、source association、tags 和 ingest receipt。Blob 后 DB 失败只允许留下不可见可复用孤儿，不得出现半本目录。
5. 批量是“逐本原子 + 诚实汇总”，不做一个文件夹巨事务。结果逐项区分 `created / unchanged / duplicate / failed`，只允许重试失败项。
6. 可编辑的 category、tags、collectionPath 是带 metadataVersion/If-Match 的 catalog overlay。修改 overlay 不重写 package/content/edition hash；package GET 在完成 Blob 校验后叠加当前 catalog 元数据。

## 来源与路径合同

### 浏览器文件与文件夹

- UI 使用单文件 multipart 请求，文件夹由客户端队列逐本上传，并发固定为 2；不把整批正文装入一个 JSON。
- 新 multipart 单文件最大 20 MiB；一次前端批量最多 200 个 TXT、总计最多 200 MiB、目录深度最多 12。旧 JSON 兼容入口只保留 GATE-03 和不超过 8 MiB 的小型 TXT。
- `relativePath` 只能是 UTF-8 规范相对路径：拒绝 Unix/Windows 绝对路径、`..`、NUL、混合分隔符、空段、规范化重名和非 `.txt` 文件。
- 文件夹默认以顶层目录作为 collectionPath；用户只能在固定分类/标签模板和安全相对藏书路径内调整。

### 服务端维护目录

- 运维通过 `READER_PUBLIC_LIBRARY_MAINTENANCE_ROOTS` 配置 `rootId -> label + absolute path`；匿名 API 永不返回绝对路径，请求不得提交任意主机路径。
- 启动和扫描都做 realpath 隔离：维护根不得与个人/公共 DB、Blob、staging 相等、互含或经 symlink alias 重叠。
- 手动触发、无 watcher；不跟随 symlink，只接受 regular file。默认最大深度 32、候选 5000、单文件 20 MiB；超限明确失败，不截断后假成功。
- 打开文件后执行 fstat → hash/read → fstat；期间 inode、size 或 mtime 改变则记 `source_changed`，不发布。
- stat fingerprint 只用于变化提示；`(rootId, normalizedRelativePath, sourceHash)` 才是重放 receipt。同目录重复扫描必须 0 created；同 root 同时最多一个带 lease 的 generation，旧 generation 晚完成不得覆盖新结果。
- generation 持久化 `leaseOwner/leaseExpiresAt/heartbeatAt`。进程崩溃后过期 running 必须先转 `interrupted`，再按已提交 receipts 重放；不得把旧 running 永久锁死，也不得重新发布已完成候选。
- 单次扫描累计源文件字节默认最大 2 GiB，并可由更低的部署配置收紧；达到候选数、单文件、深度或累计字节任一上限都必须整次诚实失败，不截断后宣称完整。
- 只有完整 generation 成功才更新来源可见状态；partial/failed scan 不把未见文件标 missing。原件后续删除或修改不得使已发布 package 失读。

## 分类、标签与视图

- 顶级分类固定为：`文学 / 经典 / 思想 / 技术 / 其他`。
- 标签模板版本为 `public-library-taxonomy-v1`，固定为：`经部 / 史部 / 子部 / 集部 / 诗词 / 小说 / 传记 / 随笔 / 科学 / 编程 / 产品 / 其他`；单书 0–5 个，重复输入直接拒绝，不提供模板 CRUD。
- 公共目录保存稳定 categoryId/tagId，中文仅为 label；数据库约束和 API parser 必须同时拒绝未知值。
- 匿名提供书籍列表与维护者/分类/标签 facets。四种视图都在服务端检索和分页，每页 24 项；facet 点击后回到书籍视图带精确筛选，不在分组卡下嵌套全量书。
- 公共 DB 维护单调 `catalogRevision`，每次新增书或 catalog overlay 成功提交时在同一事务递增。首个列表请求省略 snapshotRevision，服务端在同一只读事务返回当前 revision；后续 page 必须原样携带。
- 服务端读取后续页时先在同一只读事务核对 `snapshotRevision === current catalogRevision`，再计算 COUNT 和 items。任一发布或 overlay 使旧 revision 明确返回 `CATALOG_SNAPSHOT_STALE`/409，客户端只能清空旧 items 并从第 1 页重启；不得在旧页集里混入新 revision。书籍顺序仍为 `(publishedAt DESC, id ASC)`。
- 切换 view、q、filter 时清除 snapshotRevision、重置 page=1 并废弃旧响应；facets 分页采用相同 revision 合同。revision 是服务端单调整数，不使用墙钟或客户端时间。
- 分类、标签、维护者走索引；书名/作者/维护者检索使用受控搜索索引，不允许页面或 service 先全量读取再过滤。
- 匿名 DTO 可以返回安全 collectionPath、标签和维护者别名，但不得返回 rootId、绝对路径、source fingerprint、job 内部字段或任何密钥。

## 个人书架发布

1. 入口放在个人书籍现有治理菜单，不给 500 张卡片常驻新按钮。无 normalized 私有密钥时隐藏或禁用，并解释需要先配置私有云。
2. 发布前必须用同一 token 在私人云 inventory 中找到目标书，并完整分页读取、校验书目、章节数、顺序、正文 hash 和 edition；远端不存在、metadata-only、缺章、空 Blob、hash mismatch 或读取中代际变化都必须拒绝。
3. PersonalBookExportPort 随后固定与远端同版的一致快照；本地 `chapters_full/full_cached` 只能作为已验证同版正文的传输优化，不能替代云端存在性证明。正式发布通过独立 PublicLibraryMaintenancePort 只向公共接口发送维护头；公共 module/service/repository 永不读取个人表。
4. 发布动作不修改个人 book/chapters/progress/notes，不写 `reader-active-sync-tasks`。成功文案是“公共明文副本已入阁”，不是“同步成功”；相同 edition 返回“已在阁中”。
5. 固定确认文案：“将创建公共明文副本，本实例访客可读取；私人原书、进度与笔记不会公开或改动。”

## API 最小面

- 兼容：`POST /public-library/books`、`GET /public-library/books`、`GET /public-library/books/:id/package`。list 首响应返回 snapshotRevision，后续 page 请求必须携带同值；stale 返回 409 并要求重启分页。
- 新增：`POST /public-library/maintenance/files`（单文件 multipart）。
- 新增：`GET /public-library/maintenance/scan-roots`、`POST /public-library/maintenance/scans`、`GET /public-library/maintenance/scans/:id`。
- 新增：`PATCH /public-library/books/:id/catalog`，只更新 category/tags/collectionPath，要求 metadataVersion。
- 新增：`GET /public-library/facets?view=maintainers|categories|tags&q=&page=&pageSize=&snapshotRevision=`；首响应和后续页使用与书籍列表相同的 catalogRevision 合同。
- maintenance endpoints 均复用同一 fail-closed 凭据验证器；匿名 GET 不挂维护 guard。

## UI 与上界

- 保持现有藏经阁单页、纸感卡片和 6 项主导航，不新增第 7 个主导航项。
- 标题区域只增加一个最小 44px“入阁”入口；移动端放 bottom sheet，桌面为同一语义 dialog。Sheet 分“文件 / 文件夹 / 服务端目录”，不暴露绝对路径。
- 页内使用可横滑且每项至少 44px 的 `书籍 / 维护者 / 分类 / 标签` 分段；加载、空、错误、部分成功和离线状态均有持久、可重试的真实反馈。
- 上传任务 DOM 最多 50 行，其余只显示汇总；书卡与 facet 卡均最多 24。340/390/768/1440 视口无横向溢出，dialog/sheet 有初始焦点、Tab 圈定、Escape、焦点归还。
- 文件夹选择 API 不可用时显示“当前设备请多选 TXT 文件”，不得伪装已选择目录。

## 实现顺序

- A：canonical publisher、additive schema、原子对象写、edition/source/receipt、并发/崩溃/重放测试。
- B：单文件 multipart 与浏览器文件队列。
- C：folder relativePath/collectionPath 与部分结果。
- D：allowlisted scanner、generation、重放和只读源指纹。
- E：PersonalBookExportPort → PublicLibraryMaintenancePort。
- F：catalog overlay、taxonomy/facets、四视图与移动交互。

A 未通过前不得并行实现 B–F；D 只在隔离维护目录执行，E 只在隔离个人云 fixture 执行。

## TASK-0504 固定验收

正式 runner 固定 25 本 TXT：维护目录 16、本地两层文件夹 7、直接文件 1、已验证个人云正文 1，形成 24+1 真分页。至少验证：

1. 无私钥时浏览正常、维护入口不可用；正确值只走 maintenance header，缺失/default/wrong/仅 x-share-token 均拒绝。
2. 两个合法文件成功、一个非法文件失败时逐项结果准确，失败项无可见 book/source/tag 半数据。
3. 两层文件夹保留安全 relativePath；未知/重复/超限 tag、穿越路径、规范化重名和非 TXT 明确拒绝。
4. 服务端 root scan 不改源树、不跟 symlink/特殊文件、不泄绝对路径；重复扫描 0 created；失败 generation 不改上一完成代际。
5. Blob 成功/DB 失败、并发相同 edition/不同元数据、进程停在 Blob 后与旧 generation 晚完成均能重放收敛，无可见半本或假成功。
6. overlay 修改后 package/content/edition hash 不变，package GET 返回新 catalog 元数据。
7. 完整个人书可发布，半缓存/缺章/hash mismatch 不可；发布期间个人 DB/Blob、本地源书、进度、笔记和同步任务哨兵不变。
8. 四视图、检索和 facets 都是真实服务端 24 项分页；旧响应不覆盖新 view/filter，DOM 上界成立。固定反例在 page 1 后以相同 now 发布新书并 PATCH 既有书分类/标签，再取旧 revision 的 page 2，必须 409/restart，重启后无重复或漏项。
9. 匿名 GET 无两种密钥，公共写无 x-share-token；公共源码依赖图不含个人 repository/DRIZZLE。
10. 公共 500/离线/扫描失败时，个人书架和已加入书仍可打开并连续阅读两章。

## 正式任务门

命令：

```bash
node scripts/verify-public-library-expansion.mjs \
  --task TASK-0504 \
  --output docs/goals/reading-world-v1/evidence/artifacts/task-0504-expansion-attempt-01.json
```

精确 14 项 checks：`PATCH_WHITESPACE`、`GATE_03_FINAL_PREREQUISITE`、`PUBLIC_LIBRARY_EXPANSION_FIXTURE_CONTRACT`、`API_TEST`、`API_LINT_NON_FIXING`、`API_TYPECHECK`、`API_BUILD`、`WEB_TEST`、`WEB_LINT`、`WEB_TYPECHECK`、`WEB_BUILD_NO_PWA_WRITE`、`PUBLIC_PRIVATE_BOUNDARY_CONTRACT`、`TASK_0504_RUN_CONTRACT`、`TASK_0504_PUBLIC_LIBRARY_LIVE`。

- `VALIDATOR_INDETERMINATE`：EVID-57 前置、fixture/枚举、production service/marker、端口/进程/清理或 records 不可靠。
- `TASK0504_FAILURE`：可靠进入产品阶段后功能、原文件/个人哨兵、边界、重放、分页或匿名路径泄漏任一失败。
- `PASS`：14/14 records SHA、exit 0、tracked mutation false，固定 25 本旅程和所有边界同时通过。

本门只证明 TASK-0504 主功能，不证明 TASK-0505 UI 质感、TASK-0506 压力/a11y、PHASE-05 整体、VPS 部署或 Goal 完成。

## 副作用与重放

| 副作用 | 类别 | 重放规则 |
|---|---|---|
| fixture 与两棵源树 | verify_before_repeat | manifest、相对路径、字节 SHA、size、mode、mtime 全匹配才复用；不检查 atime |
| 维护目录扫描 | verify_before_repeat | 只复算，不在源目录清理或写入 |
| 隔离公共 DB/Blob/staging | compensate | 仅删除带本轮 ownership sentinel 的临时根 |
| 个人云/浏览器 profile | compensate | 先验证远端、再取哨兵；结束销毁隔离 profile，不碰真实数据 |
| API/Web/Chrome | compensate | 显式进程组退出，复查端口和孤儿进程 |
| production build | replay_safe | `READING_WORLD_VERIFY_NO_PWA_WRITE=1` |
| EVID-62 report/records | verify_before_repeat | 旧证据自动归档，禁止覆盖或改写 EVID-57/59 |
| 真实维护目录、真实馆藏、VPS | human_required | TASK-0504 门禁止访问；另行绑定具体授权后才可操作 |
