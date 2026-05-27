# 小说平台 MVP 本地版开发执行文档 v0.1

> 适用范围：Web/PWA 跨屏 MVP，本地轻量版后端。  
> 目标：先把“导入 → 解析 → 阅读 → 离线 → 续读”的核心闭环做稳，再扩展搜索、书源、AI、多端和云端能力。


## 1. 测试策略

| 层级 | 工具 | 覆盖 |
|---|---|---|
| 单元测试 | Vitest | parser-core、reader-core、content-utils、sync-core |
| 组件测试 | Testing Library | 书架、导入、目录、设置面板 |
| E2E | Playwright | 上传、解析、阅读、离线、进度恢复 |
| API 测试 | Supertest | NestJS API |
| SQLite 测试 | 临时 SQLite | migration、repository、task_queue |
| IndexedDB 测试 | fake-indexeddb | storage-core、Dexie schema migration |
| Worker 测试 | Vitest | parser worker、task processor |
| 性能测试 | benchmark | 大 TXT、章节切分、分页计算 |

## 2. Fixtures 清单

### TXT

```text
fixtures/books/txt/
  utf8-normal.txt
  gbk-normal.txt
  gb18030-normal.txt
  big5-normal.txt
  no-chapter.txt
  bad-chapter-title.txt
  duplicated-chapters.txt
  missing-chapter.txt
  ad-polluted.txt
  huge-book.txt
  table-of-contents-front.txt
```

### EPUB

```text
fixtures/books/epub/
  nav-normal.epub
  ncx-only.epub
  no-cover.epub
  malformed-nav.epub
  image-heavy.epub
  css-complex.epub
```

### HTML / URL

```text
fixtures/html/
  detail-page.html
  toc-page.html
  chapter-page.html
  paginated-chapter.html
  ad-polluted.html
  dynamic-placeholder.html
  wrong-encoding.html
```

## 3. MVP 功能验收

### 3.1 导入解析

| 项 | 验收标准 |
|---|---|
| UTF-8 TXT | 成功导入并识别章节 |
| GBK TXT | 编码可识别或提供手动选择 |
| GB18030 / Big5 | 基础可识别或可解释失败 |
| 无章节 TXT | 可作为纯文本书籍导入 |
| 目录页 | 能识别并跳过前置目录 |
| 重复章节 | 有重复提示 |
| 广告水印 | 有清理或异常提示 |
| 超大文件 | 解析不阻塞主线程 |
| EPUB | 能读取元数据、目录和章节 |
| 解析失败 | 显示具体错误和下一步操作 |

### 3.2 阅读器

| 项 | 验收标准 |
|---|---|
| 默认排版 | 手机与桌面打开即舒适 |
| 字号/行高 | 调整即时生效 |
| 主题/夜间 | 切换不刺眼、不闪屏 |
| 滚动模式 | 阅读流畅，进度保存 |
| 分页模式 | 可翻页，进度不依赖页码 |
| 目录 | 打开自动定位当前章 |
| 书签 | 可添加、取消、恢复 |
| 刷新恢复 | 重新打开回到上次章节和接近位置 |
| 离线 | 已缓存章节断网可读 |

### 3.3 移动 Web/PWA

| 项 | 验收标准 |
|---|---|
| 点击区 | 左/中/右行为稳定 |
| 底部菜单 | 不遮挡 Home Indicator |
| 设置 Sheet | 半屏弹出，第一屏有字号/行高/主题 |
| Safe Area | 刘海屏和底部安全区适配 |
| 软键盘 | 搜索/输入不破坏阅读布局 |
| PWA | 可安装，离线可打开 App Shell |

### 3.4 后端本地版

| 项 | 验收标准 |
|---|---|
| SQLite | migration 可重复执行 |
| Repository | 业务层不直接裸查 SQLite |
| LocalFileBlobStorage | 可写入/读取章节和原文件 |
| TaskQueue | 可入队、加锁、重试、失败记录 |
| FTS5 | 可搜索书名、作者、章节标题 |
| URL 代理 | CORS 场景可兜底，失败可解释 |
| AI 摘要 | 生成 AIView，不覆盖原文，重复请求可缓存 |

## 4. E2E 核心用例

1. 上传 UTF-8 TXT → 解析 → 预览 → 加入书架 → 阅读 → 刷新恢复。
2. 上传 GBK TXT → 编码识别 → 成功切章。
3. 上传 EPUB → 目录正确 → 阅读第一章。
4. 手机尺寸阅读 → 点击右侧翻页 → 中央呼出菜单 → 打开设置。
5. 修改字号 → 关闭设置 → 阅读位置尽量保持。
6. 断网 → 已缓存章节可读 → 未缓存章节有提示。
7. 粘贴 URL → 前端失败 → 后端兜底 → 解析结果预览。
8. 当前章 AI 摘要 → 重复点击复用缓存。

## 5. 发布门禁

MVP 发布候选必须满足：

```text
[ ] P0 Story 全部 Done
[ ] 核心 E2E 全部通过
[ ] 解析 fixtures 通过率达到发布标准
[ ] 阅读进度恢复通过移动端和桌面端测试
[ ] 离线测试通过
[ ] 错误状态均有可理解提示
[ ] 无严重布局错乱
[ ] 核心包依赖边界检查通过
[ ] 风险台账已更新
```
