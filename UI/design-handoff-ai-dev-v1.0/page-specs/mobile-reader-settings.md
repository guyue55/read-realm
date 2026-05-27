# 页面：移动端阅读设置态

## 基本信息

| 字段         | 值                                                       |
| ------------ | -------------------------------------------------------- |
| 页面 ID      | `M06`                                                    |
| 路由         | `/reader/:bookId`                                        |
| 平台         | `mobile`                                                 |
| 类型         | `reader-state`                                           |
| SVG 视觉参考 | `../svg/05_mobile_immersive_reading_operation_layer.svg` |

## 页面目标

管理阅读偏好、主题、存储、同步和隐私相关配置。

## 主要区域

- 阅读偏好
- 主题字体
- 存储状态
- 同步状态
- 帮助反馈

## 关键交互

- 调整 tokens 对应设置
- 清理缓存
- 导入/导出数据

## 状态覆盖

- 默认
- 存储接近上限
- 离线
- 同步失败

## 组件建议

- `BookCard` / `ContinueReadingCard`：用于书籍相关区块。
- `ReaderCanvas`：用于正文阅读。
- `TocDrawer` / `SettingsSheet` / `ProgressSheet` / `AIReaderPanel`：用于阅读辅助层。
- `EmptyState` / `ErrorState` / `QualityBadge` / `OfflineBadge`：用于状态表达。

## 验收标准

- [ ] 设置分组清晰
- [ ] 危险操作二次确认
- [ ] 移动端不遮挡底部安全区
- [ ] Web 布局不空洞

## 禁止事项

- 不得直接把 SVG 嵌入页面当最终 UI。
- 不得使用固定截图尺寸死写布局。
- 不得绕过 Design Tokens 自定义颜色、圆角、字号和正文宽度。
- 阅读类页面不得出现移动端底部主导航。
