# TASK-0503 / GATE-03 最小公共馆藏纵切规格

- 控制修订：REV-0003
- 实验：EXP-14
- 状态：冻结候选；只允许最小可逆实现与隔离 fixture
- 用户结果：维护者发布一份固定合法 TXT，匿名访客分页找到并完整加入本地，公共服务断开后仍能从个人书架阅读正文。

## 硬边界

1. 公共域使用独立 `PublicLibraryModule`、`PUBLIC_LIBRARY_DB`、SQLite 文件和 Blob 根；不得注入个人 `DRIZZLE`，不得使用个人 `books`、`chapters`、`storage_objects`、`/books` 或 `/folders`。
2. 写入头固定为 `x-public-library-maintenance-key`。服务端仅接受与实例配置 `READER_PUBLIC_LIBRARY_MAINTENANCE_KEY` 精确相同、且不为 `default` 的值；`x-share-token` 对公共写入无效。该值是单实例维护能力，不是账号、用户身份或 E2EE 密钥。
3. 匿名 GET 不发送凭据。公共 DTO 不包含阅读进度、笔记、本地路径、个人文件夹、同步状态或任何密钥。
4. 一本书保存为一个不可变规范包 Blob；包包含完整章节、连续 index 和逐章哈希。Blob 完整写入并按包哈希读回通过后，SQLite 目录行才可见；失败不得出现半本可浏览记录。
5. 加入本地前先下载并完整验证规范包；生成新的本地 book/chapter ID，在同一 Dexie 事务一次提交。不得覆盖同 ID 本地书，不得写 `reader-active-sync-tasks`，不得调用个人同步客户端。
6. 成功加入后的书为 `chapters_full/full_cached`，不保留公共正文 locator；阅读器只读本地 Dexie。公共 API 断开、500 或真断网不得影响已加入书。
7. 本切片只开放匿名目录、固定分类、检索、分页和加入本地。上传 UI、目录扫描、批量上传、多视图、维护者页和个人书架发布均属于 TASK-0504，GATE-03 通过前隐藏。

## 最小 API

- `POST /public-library/books`：维护凭据发布固定合法 TXT；请求只含 `title`、可选 `author/description`、固定 `category`、`content` 与 `rightsConfirmed: true`。
- `GET /public-library/books?q=&category=&page=&pageSize=`：匿名稳定分页，`pageSize` 最大 48，顺序为发布时间倒序再按 ID。
- `GET /public-library/books/:id/package`：匿名获取并重新校验完整不可变包。

## EXP-14 判据

固定 TXT 在隔离公共库中以配置维护密钥发布；匿名、无任何凭据完成分类/检索/分页定位；加入本地后核对完整章节与新本地 ID；随后拦截全部 `/public-library/**` 并切真断网，从个人书架打开并翻章阅读。全过程 `/books` 请求数为 0，个人同步任务和个人服务端哨兵不变。

以下任一情况直接判本次 ATTEMPT 失败并保留证据：缺失/默认/错误密钥可写；公共与个人表、Blob、API 或任务混用；目录先于完整包可见；包/章节哈希不一致仍加入；覆盖既有本地书；断网阅读回源；公共故障阻断本地书架或阅读。

## 明确不外推

EXP-14 通过只放行 TASK-0504，不证明目录扫描、批量上传、多视图、维护者视图、分类标签模板、VPS 部署、审核治理、版权处理或 Goal 完成。
