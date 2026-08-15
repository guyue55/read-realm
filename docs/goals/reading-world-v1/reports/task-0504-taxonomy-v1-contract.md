# TASK-0504 F taxonomy 与 catalog wire 合同

- Goal ID：GOAL-READING-WORLD-V1
- 控制修订：REV-0003
- 父规格：`task-0504-public-library-expansion-spec.md`
- 状态：冻结；只窄化 F 的持久 ID 与 wire，不扩张总控
- taxonomyVersion：`public-library-taxonomy-v1`

## 稳定模板

分类 ID 与展示 label：

| categoryId | label |
|---|---|
| `literature` | 文学 |
| `classics` | 经典 |
| `thought` | 思想 |
| `technology` | 技术 |
| `other` | 其他 |

标签 ID 与展示 label：

| tagId | label |
|---|---|
| `jing` | 经部 |
| `history` | 史部 |
| `masters` | 子部 |
| `collections` | 集部 |
| `poetry` | 诗词 |
| `fiction` | 小说 |
| `biography` | 传记 |
| `essay` | 随笔 |
| `science` | 科学 |
| `programming` | 编程 |
| `product` | 产品 |
| `other` | 其他 |

模板顺序即分类/标签 facet 的稳定顺序。单书标签为 `0..5` 个不同 tagId；未知、重复和第 6 个标签均由 parser 与 DB 双层拒绝。无模板 CRUD。

## 匿名 DTO

`PublicLibraryBookDto` 保留兼容字段 `category`（中文 label），并新增：

- `taxonomyVersion`
- `categoryId`
- `tags`：由稳定 `id` 与中文 `label` 组成的数组，按模板顺序
- `maintainerId`
- `maintainerLabel`，固定语义为维护者标识而非账号/用户/所有者
- `metadataVersion`

书籍列表、facets 与 package envelope 均返回 `taxonomyVersion`。`GET /public-library/taxonomy` 返回 `{ taxonomyVersion, categories, tags }`，只读且不要求任何凭据。

`GET /public-library/facets` 返回：

```text
{
  taxonomyVersion,
  view: maintainers | categories | tags,
  items: [{ id, label, bookCount }],
  page, pageSize, total, totalPages, snapshotRevision
}
```

分类/标签按模板顺序；维护者按 `bookCount DESC, id ASC`。facet 的 `q` 为 NFKC + trim 后对 label 的不区分大小写前缀检索；页面不得下载全书后分组。

## 书籍列表 wire

`GET /public-library/books` 新增精确过滤参数 `categoryId/tagId/maintainerId`，继续兼容旧 `category=中文label`。`q` 在服务端公共搜索索引检索 title、author 与 maintainerLabel；结果仍按 `(publishedAt DESC, id ASC)`。书籍与 facets 的 `pageSize` 默认且最大均为 `24`，响应必须回显请求 page/pageSize，items 不超过 24。

书籍和 facets 首请求省略 `snapshotRevision`，服务端在同一只读事务返回当前 revision；后续页必须原样携带。任一发布或 overlay 成功后，旧 revision 请求统一返回 `409 / CATALOG_SNAPSHOT_STALE`。

## Catalog overlay wire

`PATCH /public-library/books/:id/catalog` 只接受公共维护凭据，并要求完整 desired state：

```text
{
  metadataVersion: positive integer,
  categoryId: stable category ID,
  tagIds: 0..5 distinct stable tag IDs,
  collectionPath: "" or normalized safe relative catalog path
}
```

`metadataVersion` 是本版本明确采用的 If-Match 等价 wire；不再并行增加 HTTP `If-Match` header。缺书返回 `404`；旧版本返回 `409 / CATALOG_METADATA_VERSION_STALE`。每个成功 PATCH 在同一 SQLite write batch 中恰好令 metadataVersion 与 catalogRevision 各加一，任一失败保持 book/tags/version/revision 全部不变。

`categoryId/tagIds/collectionPath` 是可编辑 current overlay。publisher 的冲突判定改为不可变 `ingestMetadataHash`，覆盖 title、author、description、初始 categoryId、初始 collectionPath 与排序后的初始 tagIds；overlay 不参与后续同 source/receipt 重放判定。新书 ingest/current 初值一致，旧书 bootstrap 从当前值回填。这样 overlay 后重复扫描仍为 unchanged 且不回退 current overlay，而新的同 edition 异 ingest baseline 仍返回 typed conflict。

Package GET 必须先验证 immutable Blob/package/逐章 hash，再叠加 current category、tags、collectionPath、maintainer 与 metadataVersion；PATCH 不得改变 packageHash、editionHash、sourceHash、contentHash 或 Blob 字节。

## 搜索与数据库门

- 公共 SQLite 显式启用 foreign keys。
- taxonomy seed 使用稳定表、`INSERT OR IGNORE` 与精确 readback；发现 ID/label/version 漂移即启动失败。
- current category、ingest category 与 tag 关系具 DB 约束；tag 增加 `(tag_id, book_id)` 反向索引，book 增加 category/maintainer 排序索引。
- `q` 必须命中独立公共 FTS/search index；不得降级为 `%LIKE%` 全表扫描。无所选索引能力时 bootstrap fail-closed。
- overlay 继续用无 await 间隙的 libSQL `batch(..., "write")`，所有 tag/revision 操作以同一 expected metadataVersion 为条件，最后按 update rowsAffected 区分成功、404 与 409。

## UI 状态机

四视图是藏经阁页内 `书籍 / 维护者 / 分类 / 标签` 分段，不新增第 7 个主导航。切 view、q 或 facet filter 时同时清 revision、page=1、清旧 items、递增 request generation；旧响应不得覆盖新状态。点击 facet 回书籍视图并携带稳定 ID 精确过滤。

Catalog editor 是独立 `ReaderDialogSurface`，只用 maintenance client；无密钥禁用并解释。成功后清 snapshot 回第一页；失败保留 dialog 与持久错误。340/390/768/1440 无整页横向溢出，tab、分页、关闭与编辑控件双轴至少 44px；book/facet DOM 每页最多 24。
