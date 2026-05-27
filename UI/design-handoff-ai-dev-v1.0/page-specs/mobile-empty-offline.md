# 页面：移动端空状态/离线态

## 基本信息

| 字段         | 值                                         |
| ------------ | ------------------------------------------ |
| 页面 ID      | `M10`                                      |
| 路由         | `/library or /reader/:bookId`              |
| 平台         | `mobile`                                   |
| 类型         | `state`                                    |
| SVG 视觉参考 | `../svg/06_states_exceptions_recovery.svg` |

## 页面目标

完成该页面的核心任务，并保持阅读平台的一致视觉与交互。

## 主要区域

- 主内容区
- 操作区
- 状态提示

## 关键交互

- 进入/退出
- 确认/取消
- 错误恢复

## 状态覆盖

- 默认
- 加载
- 空
- 错误

## 组件建议

- `BookCard` / `ContinueReadingCard`：用于书籍相关区块。
- `ReaderCanvas`：用于正文阅读。
- `TocDrawer` / `SettingsSheet` / `ProgressSheet` / `AIReaderPanel`：用于阅读辅助层。
- `EmptyState` / `ErrorState` / `QualityBadge` / `OfflineBadge`：用于状态表达。

## 验收标准

- [ ] 不挤压
- [ ] 不变形
- [ ] 状态完整
- [ ] 符合 tokens

## 禁止事项

- 不得直接把 SVG 嵌入页面当最终 UI。
- 不得使用固定截图尺寸死写布局。
- 不得绕过 Design Tokens 自定义颜色、圆角、字号和正文宽度。
- 阅读类页面不得出现移动端底部主导航。
