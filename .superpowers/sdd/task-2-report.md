# Task 2 执行报告

## 基线与范围

- 基线：`5788dc5552309625bfffaaa7fb1c87c5ff5c4b3b`
- 新增：`apps/api/src/modules/database/database-bootstrap.ts`
- 新增：`apps/api/src/modules/database/database-bootstrap.spec.ts`
- 修改：`apps/api/src/modules/database/database.module.ts`
- 未启动 API，未读取或修改 `data/app.sqlite`、`data/backups`。

## RED

先只创建内存 SQLite 测试，再运行：

```text
CI=true corepack pnpm --filter api test -- database-bootstrap.spec.ts
```

结果：退出码 `1`。Jest 因 `Cannot find module './database-bootstrap'` 失败，失败原因与尚未实现生产代码一致。

真实副本演练随后暴露第二个 RED：FTS5 表没有按 `id` 唯一约束，原有 `INSERT OR IGNORE` 会在每次启动时完整追加书籍。新增“重复搜索行 + 过期标题 + 连续准备”测试后，旧实现收到 4 条相同搜索结果而不是 1 条。

性能复审又增加一条 RED：原迁移每次启动都会更新所有 `books` 行并触发 FTS 更新。审计触发器记录到两本书在连续两次准备中被更新 4 次；目标是仅首次修正 2 次，第二次不写入。

## GREEN

完成实现并整理后，定向测试结果：

```text
Test Suites: 1 passed, 1 total
Tests:       6 passed, 6 total
```

覆盖内容：

- 按 `created_at DESC, id DESC` 去重，并更新所有图书的 `chapter_count`。
- 通过 `PRAGMA index_list/index_info` 验证目标索引为非部分 UNIQUE 索引，列顺序严格为 `book_id,index`。
- 预建同名非唯一索引、同名列不匹配唯一索引时均抛错，并证明章节删除与计数更新已回滚。
- 空库可完成建表、普通索引、FTS5 与三个同步触发器初始化。
- 历史 `books` 表可补齐 `last_read_progress` 与 `source_folder_id`。
- FTS 搜索表会在计数、唯一 ID 或标题/作者集合不一致时原子重建；一致状态下重复准备不写入、不增长。
- 唯一章节索引在计数校正前建立，计数查询可使用 `book_id` 索引前缀；仅实际不一致的图书会更新，避免启动时触发全量 FTS 写入。
- 每个测试 Client 均在 `finally` 中关闭。

## 变更

- 新增 `ensureChapterIntegrity(client)`：在同一 Client 上显式执行 `BEGIN IMMEDIATE`，原子完成去重、计数修正、唯一索引创建与结构验证；失败执行 `ROLLBACK` 并向上抛错，成功执行 `COMMIT`。
- 新增 `prepareDatabase(client)`：集中承接原有外键开关、核心建表、历史补列、普通索引、FTS5 数据同步与触发器初始化，并返回 `{ deduplicatedChapters, uniqueIndexReady: true }`。
- FTS 同步不再依赖无效的 `INSERT OR IGNORE`。启动先检查书籍数、搜索行数、唯一 ID 数与标题/作者集合，仅在不一致时用独立事务重建并在提交前复验。
- `DatabaseModule` 仅保留本地 Client 创建、`prepareDatabase` 调用、结构化结果日志和 Drizzle 返回；准备失败时关闭 Client 并重新抛错。

## 真实副本演练

在经 `PRAGMA quick_check` 验证的备份副本上直接调用构建产物中的 `prepareDatabase`，未启动 API、未修改原始 `data/app.sqlite`：

- 最终版本首次执行不足 1 秒，返回 `{ "deduplicatedChapters": 53, "uniqueIndexReady": true }`；优化前副本演练约 26 秒。
- 重复章节组从 53 变为 0，章节计数不一致从 42 本变为 0。
- 唯一索引为 `unique=1`、`partial=0`，列顺序为 `book_id,index`。
- FTS 从 28,771 行收敛为 3,661 行，与 3,661 本书一一对应。
- `PRAGMA quick_check` 返回 `ok`。
- 同一副本第二次执行不足 1 秒，返回去重 0；FTS 仍为 3,661 行，证明启动幂等且没有全量图书更新。

## 真实数据库迁移

代码提交并完成副本复核后，对 `data/app.sqlite` 执行同一构建产物：

- 迁移前最终备份：`data/backups/app-before-chapter-dedup-final-20260711-015945.sqlite`。
- 备份 `PRAGMA quick_check` 为 `ok`，SHA-256 为 `6185806af56e7eb9a60ca4f46f4bfa5c744ae07ded520f202d45d4f300054418`。
- 首次返回 `{ "deduplicatedChapters": 53, "uniqueIndexReady": true }`；重复组、章节计数不一致和外键违规均为 0。
- FTS 为 3,661 行 / 3,661 个唯一 ID，与 books 表 3,661 行一致。
- 第二次返回 `{ "deduplicatedChapters": 0, "uniqueIndexReady": true }`，`PRAGMA quick_check` 仍为 `ok`，无 journal/WAL 残留。

## libSQL 语义核验

- 当前 `@libsql/client@0.17.4` 的本地 `executeMultiple` 直接调用 `db.exec`，其他传输实现使用独立 sequence，不适合在中途读取 PRAGMA 结果后决定提交或回滚。
- 实测本地 `client.transaction('write')` 会把当前连接交给事务对象；在 `file::memory:` 提交后，Client 后续查询会创建新的内存连接并丢失原库。
- 因生产模块固定创建 `file:` 本地 Client，本次采用同一 Client 上的显式事务 SQL；实测 `BEGIN IMMEDIATE` 至 `ROLLBACK` 保持在同一连接并恢复原数据。

## 验证结果

| 验证 | 结果 |
| --- | --- |
| 定向 Jest | 1/1 suites，6/6 tests，通过 |
| API 全量 Jest | 9/9 suites，30/30 tests，通过 |
| 所属文件 ESLint `--fix` | 通过 |
| 全 API ESLint（不带 `--fix`） | 通过 |
| API `tsc --noEmit` | 通过 |
| API `nest build` | 通过 |
| `git diff --check` | 通过 |

## 自审与剩余风险

- 事务原子范围是历史章节去重、图书计数更新、唯一索引创建及索引结构验证；原有建表、补列、普通索引和 FTS 初始化继续保持独立启动步骤。
- 已在真实历史数据库的独立副本和原始数据库上依次完成迁移、完整性检查与二次幂等验证，并保留迁移前备份。
- 保留规则按需求依赖 `created_at` 文本可排序；异常或非统一格式的历史时间值未做额外归一化。
- 导出的迁移函数面向当前本地 `file:` Client 启动链路；未来若改为 HTTP/WS libSQL，需要改用能固定远端连接的事务方案。
