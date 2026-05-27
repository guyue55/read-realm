# 页面：移动端发现搜索页

## 基本信息

| 字段         | 值                                         |
| ------------ | ------------------------------------------ |
| 页面 ID      | `M14`                                      |
| 路由         | `/search`                                  |
| 平台         | `mobile`                                   |
| 类型         | `page`                                     |
| SVG 视觉参考 | `../svg/02_bookshelf_discovery_detail.svg` |

## 页面目标

提供本地书架搜索、免费候选发现和链接解析入口。

## 主要区域

- 搜索框
- 筛选 chips
- 候选结果
- 来源标识

## 关键交互

- 输入搜索
- 选择来源
- 进入详情或解析
- 无结果重试

## 状态覆盖

- 默认
- 搜索中
- 无结果
- 候选污染提示
- 网络失败

## 组件建议

- `BookCard` / `ContinueReadingCard`：用于书籍相关区块。
- `ReaderCanvas`：用于正文阅读。
- `TocDrawer` / `SettingsSheet` / `ProgressSheet` / `AIReaderPanel`：用于阅读辅助层。
- `EmptyState` / `ErrorState` / `QualityBadge` / `OfflineBadge`：用于状态表达。

## 验收标准

- [ ] 搜索结果卡片可读
- [ ] 来源风险可见
- [ ] 不把搜索结果直接当内容源
- [ ] 移动端按钮不压扁

## 禁止事项

- 不得直接把 SVG 嵌入页面当最终 UI。
- 不得使用固定截图尺寸死写布局。
- 不得绕过 Design Tokens 自定义颜色、圆角、字号和正文宽度。
- 阅读类页面不得出现移动端底部主导航。
