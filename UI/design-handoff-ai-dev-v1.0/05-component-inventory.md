# 05 组件清单

前端不允许按页面硬编码，应按下列组件组合页面。

| 组件                      | 输入数据                           | 状态                                  | 使用页面                   |
| ------------------------- | ---------------------------------- | ------------------------------------- | -------------------------- |
| `BookCard`                | book, progress, displayMode        | 默认/无封面/离线/选中/错误封面        | 书架、搜索、书籍详情推荐区 |
| `ContinueReadingCard`     | book, progress, lastReadAt         | 有进度/无进度/离线可读/缓存缺失       | 书架首页                   |
| `ImportDropzone`          | acceptedFormats, maxSize           | 空/拖拽悬停/校验失败/上传中           | 导入页                     |
| `ImportProgress`          | task                               | 排队/解析中/成功/失败/可取消          | 导入页、解析页             |
| `ParsePreviewChapterList` | chapters, qualityIssues            | 正常/可编辑/异常章/删除候选/空目录    | 解析预览页                 |
| `ReaderCanvas`            | chapter, readerSettings, progress  | 加载中/正文/空章/错误/夜间/离线       | 阅读页                     |
| `ReaderTopBar`            | book, chapter, visibility          | 隐藏/显示/返回/更多                   | 阅读菜单态                 |
| `ReaderBottomBar`         | actions, safeArea                  | 隐藏/显示/禁用/夜间                   | 阅读菜单态                 |
| `TapZoneLayer`            | viewport, readingMode              | 上一页区/菜单区/下一页区/禁用         | 阅读页                     |
| `TocDrawer`               | chapters, currentChapterId, issues | 当前章/异常章/搜索结果/空目录         | 阅读页                     |
| `SettingsSheet`           | readerSettings                     | 字号/行高/边距/主题/亮度/实时预览     | 阅读页                     |
| `ProgressSheet`           | progress, chapters                 | 拖动/跳章/章末/离线                   | 阅读页                     |
| `AIReaderPanel`           | chapter, aiViews                   | 摘要/前情/人物/术语/加载/失败         | 阅读页                     |
| `QualityBadge`            | issueType, severity                | 缺章/重复/广告/乱码/低质量            | 解析预览、目录             |
| `OfflineBadge`            | cacheStatus                        | 已缓存/未缓存/缓存中/失败             | 书架、阅读页               |
| `SearchResultCard`        | result, source                     | 本地/链接/书源/不可解析               | 发现搜索页                 |
| `StorageStatusCard`       | quota, usage                       | 正常/接近上限/清理中/失败             | 设置页                     |
| `EmptyState`              | title, action                      | 空书架/无结果/无笔记/无缓存           | 状态页                     |
| `ErrorState`              | errorCode, retry                   | 解析失败/网络失败/格式不支持/恢复失败 | 状态页                     |
