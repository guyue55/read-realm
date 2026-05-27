# 页面：Web 解析预览页

## 基本信息

| 字段         | 值                                              |
| ------------ | ----------------------------------------------- |
| 页面 ID      | `W03`                                           |
| 路由         | `/import/preview/:taskId`                       |
| 平台         | `web`                                           |
| 类型         | `page`                                          |
| SVG 视觉参考 | `../svg/03_import_parse_content_governance.svg` |

## 页面目标

在加入书架前确认章节结构、正文质量和可修正项。

## 主要区域

- 书籍元数据
- 章节列表
- 质量提示
- 确认加入书架按钮

## 关键交互

- 编辑章节标题
- 删除误识别章节
- 查看异常章
- 确认导入

## 状态覆盖

- 正常
- 异常章
- 空章节
- 重复章节
- 失败

## 组件建议

- `BookCard` / `ContinueReadingCard`：用于书籍相关区块。
- `ReaderCanvas`：用于正文阅读。
- `TocDrawer` / `SettingsSheet` / `ProgressSheet` / `AIReaderPanel`：用于阅读辅助层。
- `EmptyState` / `ErrorState` / `QualityBadge` / `OfflineBadge`：用于状态表达。

## 验收标准

- [ ] 章节列表不挤压
- [ ] 异常有 QualityBadge
- [ ] 确认前不破坏旧数据
- [ ] 长目录可滚动

## 禁止事项

- 不得直接把 SVG 嵌入页面当最终 UI。
- 不得使用固定截图尺寸死写布局。
- 不得绕过 Design Tokens 自定义颜色、圆角、字号和正文宽度。
- 阅读类页面不得出现移动端底部主导航。
