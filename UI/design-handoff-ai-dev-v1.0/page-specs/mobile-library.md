# 页面：移动端书架首页

## 基本信息

| 字段         | 值                                         |
| ------------ | ------------------------------------------ |
| 页面 ID      | `M01`                                      |
| 路由         | `/library`                                 |
| 平台         | `mobile`                                   |
| 类型         | `page`                                     |
| SVG 视觉参考 | `../svg/02_bookshelf_discovery_detail.svg` |

## 页面目标

用户打开 App 后快速恢复阅读上下文，查看书架与导入入口。

## 主要区域

- 顶部栏：应用名/搜索/导入
- 继续阅读卡
- 书架列表
- 快捷入口：导入、链接、最近阅读、离线缓存

## 关键交互

- 点击继续阅读进入 `/reader/:bookId`
- 点击导入进入 `/import`
- 搜索进入 `/search`
- 长按书籍进入管理态

## 状态覆盖

- 默认
- 空书架
- 离线可读
- 加载中
- 删除确认

## 组件建议

- `BookCard` / `ContinueReadingCard`：用于书籍相关区块。
- `ReaderCanvas`：用于正文阅读。
- `TocDrawer` / `SettingsSheet` / `ProgressSheet` / `AIReaderPanel`：用于阅读辅助层。
- `EmptyState` / `ErrorState` / `QualityBadge` / `OfflineBadge`：用于状态表达。

## 验收标准

- [ ] 继续阅读卡必须突出
- [ ] 卡片不可挤压封面
- [ ] 底部主导航如存在不得进入阅读页
- [ ] 340px 宽度仍可读

## 禁止事项

- 不得直接把 SVG 嵌入页面当最终 UI。
- 不得使用固定截图尺寸死写布局。
- 不得绕过 Design Tokens 自定义颜色、圆角、字号和正文宽度。
- 阅读类页面不得出现移动端底部主导航。
