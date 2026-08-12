# PHASE-02 最小版本化本地数据契约

- Goal：GOAL-READING-WORLD-V1
- 控制修订：REV-0001
- 任务：TASK-0201
- 输入提交：`8d36005`
- 状态：契约内核冻结；不代表 GATE-01、备份恢复 UI 或迁移完成。

## 1. 冻结结论

本地数据权威格式固定为 `read-realm-local-snapshot` / `schemaVersion: 1`。公开格式由 `packages/shared-types` 的 `LocalDataSnapshotEnvelopeSchema` 定义，序列化/解析边界由 `packages/storage-core/src/local-snapshot.ts` 实现。页面、Dexie、localStorage、SQLite 和文件系统不得各自发明备份 JSON。

```text
LocalDataSnapshotEnvelope v1
├── kind = read-realm-local-snapshot
├── schemaVersion = 1
├── createdAt
├── source
│   ├── appVersion
│   └── databaseVersion
└── data
    ├── books[]
    ├── chapters[]
    ├── progress[]
    ├── bookmarks[]
    ├── settings
    └── fileRefs[]
```

## 2. 数据语义

| 集合 | 主键/引用 | v1 必须保留 | 当前来源候选 |
|---|---|---|---|
| `books` | `Book.id` | 书目、来源类型、格式、状态、目录和缓存/来源定位扩展 | Dexie `books` |
| `chapters` | `id`；引用 `bookId` | 章节序号、标题、完整正文 | Dexie `chapters` |
| `progress` | `bookId`；引用 `bookId/chapterId` | 章节、偏移、百分比、段落/字符锚点与更新时间 | Dexie `progress` |
| `bookmarks` | `id`；引用 `bookId` | 偏移、预览、段落/字符锚点、笔记与创建时间 | Dexie `bookmarks` |
| `settings` | 单对象 | 字体、字号、行高、主题、滚动/分页、UI 密度、段距、字距、自动切章 | localStorage `reader-settings` |
| `fileRefs` | `id`；引用 `bookId` | 来源类型、相对路径、必填格式、大小/时间/指纹/内容哈希 | Dexie 来源/索引表的兼容映射 |

AI 密钥、AI 缓存、临时导入任务和设备私密状态不在 GATE-01 的 v1 最小恢复集合内；它们不得借此被宣称已可携带。PHASE-03 的完整备份若纳入更多数据，必须通过新 schema 版本或向后兼容的显式字段修订，不得静默复用未知字段。

## 3. 写入前完整性门

`LocalDataSnapshotEnvelopeSchema` 在任何恢复写入前执行：

- 章节、进度、书签、文件引用的 `bookId` 必须存在于 `books`；
- 进度 `chapterId` 必须存在于 `chapters`，禁止猜测或静默跳到其他章节；
- `fileRefs.format` 必填，索引阶段的未知格式仍可显式写为 `unknown`；
- 阅读设置九个真实字段必须保留；旧六字段设置由 schema 补 `paragraphSpacing=16`、`letterSpacing=0.03`、`autoFlipAtBottom=false`；
- 未来 `schemaVersion` 由 codec 抛出稳定错误，例如检测到版本 2 时为 `UNSUPPORTED_LOCAL_DATA_SCHEMA_VERSION:2`；冒号后的数字是实际检测版本。普通 JSON 损坏和字段不完整保留各自解析错误。

当前 v1 尚未冻结哈希清单、签名、压缩、合并冲突或恢复事务协议。它们属于 TASK-0203/PHASE-03，不能由本契约报告冒充。

## 4. 适配器边界

storage-core 公开两个最小端口：

- `LocalDataSnapshotReader.readSnapshotData()`：从具体存储读取六类完整数据，返回共享 `LocalDataSnapshotData`；
- `LocalDataSnapshotWriter.writeValidatedSnapshotData(data)`：只接收已通过完整信封校验的数据，具体实现必须写隔离目标或在事务/补偿保护下写入。

`serializeLocalDataSnapshot()` 在写出前再次校验，并使用两空格缩进与单一 EOF 换行生成稳定 JSON；`parseLocalDataSnapshot()` 先解码、检查未来版本，再运行完整 schema。Dexie 版本、表对象、localStorage key、文件句柄和 SQLite client 都不得进入公开信封。

## 5. 兼容与迁移规则

1. v1 只读解析必须持续支持当前稳定版生成的 v1 数据。
2. 新增必填语义必须通过默认值、显式迁移或新 schema 版本处理，禁止依赖 Zod 静默剥离未知字段。
3. 迁移前必须先用本 codec 生成可解析副本；TASK-0203 将证明故障回滚和上一稳定版读取。
4. 恢复必须先完整解析和预检，再写入；解析失败不得产生任何数据副作用。
5. `LocalChapter` 已从 storage-core 私有接口收敛为 shared-types 单一来源，storage-core 只做兼容重导出。

## 6. TDD 与验证证据

本任务逐项观察过 RED，随后最小实现转 GREEN：

- v1 完整信封 API 缺失；
- 章节、进度、书签、文件引用四类孤儿引用被错误接受；
- `fileRefs.format` 因复用索引可选字段而被错误接受；
- 进度的章节锚点不存在仍被接受；
- 三个真实阅读设置字段被 Zod 静默剥离；
- codec API 缺失；未来 schema 版本只暴露 Zod 内部消息；
- build 后包测试误扫描 `dist` 编译副本，已把 shared-types/storage-core 测试入口限定为 `src`。

当前定向绿灯：shared-types 源码测试 17 个、storage-core 源码测试 5 个、reader-core 52 个；两包类型构建和全工作区测试/构建通过。最终阶段 JSON、迁移故障注入、1 秒进度与 EXP-01 尚未生成。

## 7. 下一入口

TASK-0202：把分散的阅读进度写入收敛为统一服务，定义 `pending/saved/failed` 状态和 1 秒内落盘合同；只使用隔离数据测试。TASK-0203 完成前不把 codec 接到破坏性恢复入口，TASK-0204 前不生成 GATE-01 ATTEMPT。
