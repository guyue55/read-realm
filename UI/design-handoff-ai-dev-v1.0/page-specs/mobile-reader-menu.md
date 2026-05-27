# 页面：移动端阅读菜单态

## 基本信息

| 字段         | 值                                                       |
| ------------ | -------------------------------------------------------- |
| 页面 ID      | `M05`                                                    |
| 路由         | `/reader/:bookId`                                        |
| 平台         | `mobile`                                                 |
| 类型         | `reader-state`                                           |
| SVG 视觉参考 | `../svg/05_mobile_immersive_reading_operation_layer.svg` |

## 页面目标

阅读中点击中央区域后展示临时操作菜单，不破坏沉浸阅读。

## 主要区域

- 顶部临时栏：返回、书名、更多
- 正文阅读区：背景弱化但不遮挡
- 底部菜单：目录、进度、设置、夜间、书签、AI
- TapZoneLayer

## 关键交互

- 点击中央显示/隐藏菜单
- 左 25% 上一页/上一屏
- 右 25% 下一页/下一屏
- 3 秒无操作自动淡出

## 状态覆盖

- 默认沉浸态
- 菜单态
- 夜间态
- 离线态
- 加载失败态

## 组件建议

- `BookCard` / `ContinueReadingCard`：用于书籍相关区块。
- `ReaderCanvas`：用于正文阅读。
- `TocDrawer` / `SettingsSheet` / `ProgressSheet` / `AIReaderPanel`：用于阅读辅助层。
- `EmptyState` / `ErrorState` / `QualityBadge` / `OfflineBadge`：用于状态表达。

## 验收标准

- [ ] 无常驻底部主导航
- [ ] 菜单不得遮挡正文关键内容
- [ ] 底部适配 safe area
- [ ] 设置实时生效

## 禁止事项

- 不得直接把 SVG 嵌入页面当最终 UI。
- 不得使用固定截图尺寸死写布局。
- 不得绕过 Design Tokens 自定义颜色、圆角、字号和正文宽度。
- 阅读类页面不得出现移动端底部主导航。
