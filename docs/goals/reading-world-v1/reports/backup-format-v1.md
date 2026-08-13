# 阅读世界可携带备份包 v1

## 目标与边界

备份包用于单用户、本地优先阅读数据的公开、可校验携带。v1 包含完整缓存的书籍元数据、章节正文、阅读进度、书签笔记、阅读设置和可选文件引用；不包含账号凭证、AI 密钥、同步密钥或未缓存的外部文件正文。

TASK-0302 只开放校验后“空库副本恢复”。合并恢复、冲突选择与失败回滚由 TASK-0303 实现；在其完成前 UI 必须明确显示不可用，不得以覆盖现有书架代替合并。

## 外层信封

```json
{
  "kind": "read-realm-portable-backup",
  "packageVersion": 1,
  "createdAt": "2026-08-13T22:40:00+08:00",
  "source": {
    "appVersion": "0.1.0",
    "databaseVersion": 10
  },
  "manifest": {
    "algorithm": "SHA-256",
    "entryCount": 1,
    "entries": []
  },
  "entries": {}
}
```

- `kind` 固定为 `read-realm-portable-backup`。
- `packageVersion` 固定为 `1`；更高版本必须稳定拒绝并提示升级。
- `createdAt` 与 `source` 必须和包内本地快照一致。
- JSON 使用 UTF-8、两空格缩进与单个末尾换行；相同输入生成相同字节。

## manifest 与条目

v1 必须且只允许一个条目：`data/local-snapshot-v1.json`，媒体类型为 `application/json`。manifest 每项包含：

- `path`：安全相对路径；拒绝绝对路径、反斜杠、空段、`.` 或 `..`。
- `mediaType`：`application/json`。
- `byteLength`：UTF-8 实际字节数。
- `sha256`：条目完整 UTF-8 字节的小写 64 位 SHA-256。

manifest 不得重复路径；`entryCount`、manifest 路径集合与 `entries` 实际键集合必须完全一致。任何缺失、多余、重复、大小或摘要不一致都必须在生成恢复预览前拒绝，且不得写入数据库。

下载文件名使用快照条目摘要前 16 位：`read-realm-portable-backup-{contentId16}.json`，使重复生成可识别且不依赖本机路径。

## 数据条目

`data/local-snapshot-v1.json` 沿用 `LocalDataSnapshotEnvelope` v1 公开契约：

- `books`
- `chapters`
- `progress`
- `bookmarks`（含可选笔记）
- `settings`
- `fileRefs`

结构校验同时检查书、章、进度、书签与文件引用关系，不允许悬空引用。完整包当前只导出已缓存完整正文；依赖外部文件、目录句柄或章节不足的书必须先完整缓存，否则停止导出并显示可执行说明。

## 恢复预览与兼容

选择备份文件后先执行：外层版本 -> 路径集合 -> 每项大小/SHA -> 内层 schema/关系 -> 信封一致性。通过后只显示书、章、进度、书签、文件引用计数、警告和当前可用恢复模式，书架仍保持零写入。

用户再次点击“确认恢复到空书架”后，才允许事务写入；写后逐项回读必须与快照完全一致。失败时清理本次临时写入并恢复原阅读设置。

上一稳定版的 `read-realm-local-snapshot` v1 单快照 JSON 仍可导入：先按旧公开 schema 校验，再显示“无包级 SHA-256 manifest”警告；不得将它伪装成已具备包级完整性清单。

## 安全与隐私

- 包内不得包含 API Key、同步密钥、恢复码或浏览器目录句柄。
- 文件引用只保存公开元数据，恢复时要求重新绑定来源。
- 预览、取消和校验失败不得写库。
- v1 不执行压缩包解压或动态代码，不访问网络，不信任文件名或条目路径。
