# 页面：Web 三栏阅读工作区

## 基本信息

| 字段         | 值                                              |
| ------------ | ----------------------------------------------- |
| 页面 ID      | `W04`                                           |
| 路由         | `/reader/:bookId`                               |
| 平台         | `web`                                           |
| 类型         | `reader-state`                                  |
| SVG 视觉参考 | `../svg/04_web_immersive_reading_workspace.svg` |

## 页面目标

桌面端提供稳定三栏阅读工作区，兼顾目录、正文与 AI/笔记。

## 主要区域

- 左目录 240px
- 中间正文 700px 内限宽
- 右 AI/笔记约 338px
- 顶部弱工具栏

## 关键交互

- 点击目录跳章
- 阅读区快捷键翻页
- 右栏切换 AI/笔记
- 窄屏横向滚动或降级单栏

## 状态覆盖

- 标准三栏
- 目录收起
- AI 收起
- 沉浸全屏
- 夜间

## 组件建议

- `BookCard` / `ContinueReadingCard`：用于书籍相关区块。
- `ReaderCanvas`：用于正文阅读。
- `TocDrawer` / `SettingsSheet` / `ProgressSheet` / `AIReaderPanel`：用于阅读辅助层。
- `EmptyState` / `ErrorState` / `QualityBadge` / `OfflineBadge`：用于状态表达。

## 验收标准

- [ ] 固定 1280px 工作区
- [ ] 正文不可铺满宽屏
- [ ] 窄屏不得强行压扁三栏
- [ ] 阅读容器点击区按局部坐标计算

## 禁止事项

- 不得直接把 SVG 嵌入页面当最终 UI。
- 不得使用固定截图尺寸死写布局。
- 不得绕过 Design Tokens 自定义颜色、圆角、字号和正文宽度。
- 阅读类页面不得出现移动端底部主导航。
