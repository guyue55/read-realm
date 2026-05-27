# 页面：移动端长文本压力页

## 基本信息

| 字段         | 值                                                       |
| ------------ | -------------------------------------------------------- |
| 页面 ID      | `M15`                                                    |
| 路由         | `/reader/:bookId`                                        |
| 平台         | `mobile`                                                 |
| 类型         | `stress`                                                 |
| SVG 视觉参考 | `../svg/05_mobile_immersive_reading_operation_layer.svg` |

## 页面目标

验证阅读核心状态，保证正文优先、浮层克制、极端内容不挤压。

## 主要区域

- 正文阅读区
- 临时操作层
- 目录/设置/进度/AI 浮层
- 进度弱提示

## 关键交互

- 点击区翻页
- 呼出浮层
- 实时调整排版
- 跳章并保存进度

## 状态覆盖

- 沉浸
- 菜单
- 夜间
- 离线
- 长文本
- 极窄屏

## 组件建议

- `BookCard` / `ContinueReadingCard`：用于书籍相关区块。
- `ReaderCanvas`：用于正文阅读。
- `TocDrawer` / `SettingsSheet` / `ProgressSheet` / `AIReaderPanel`：用于阅读辅助层。
- `EmptyState` / `ErrorState` / `QualityBadge` / `OfflineBadge`：用于状态表达。

## 验收标准

- [ ] 正文优先
- [ ] 浮层不常驻
- [ ] 安全区正常
- [ ] 极端宽度不挤压
- [ ] 进度可恢复

## 禁止事项

- 不得直接把 SVG 嵌入页面当最终 UI。
- 不得使用固定截图尺寸死写布局。
- 不得绕过 Design Tokens 自定义颜色、圆角、字号和正文宽度。
- 阅读类页面不得出现移动端底部主导航。
