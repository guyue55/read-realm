# 页面：Web 导入解析页

## 基本信息

| 字段         | 值                                              |
| ------------ | ----------------------------------------------- |
| 页面 ID      | `W02`                                           |
| 路由         | `/import`                                       |
| 平台         | `web`                                           |
| 类型         | `page`                                          |
| SVG 视觉参考 | `../svg/03_import_parse_content_governance.svg` |

## 页面目标

帮助用户把本地文件或链接转成可阅读的 Book / Chapter 结构。

## 主要区域

- 上传/粘贴入口
- 格式说明
- 解析任务进度
- 失败与重试提示

## 关键交互

- 选择文件后开始解析
- 粘贴 URL 后进入解析任务
- 取消任务
- 查看解析预览

## 状态覆盖

- 空
- 拖拽中
- 解析中
- 成功
- 失败
- 格式不支持

## 组件建议

- `BookCard` / `ContinueReadingCard`：用于书籍相关区块。
- `ReaderCanvas`：用于正文阅读。
- `TocDrawer` / `SettingsSheet` / `ProgressSheet` / `AIReaderPanel`：用于阅读辅助层。
- `EmptyState` / `ErrorState` / `QualityBadge` / `OfflineBadge`：用于状态表达。

## 验收标准

- [ ] 导入入口清晰
- [ ] 进度可见
- [ ] 失败可恢复
- [ ] 不阻塞 UI

## 禁止事项

- 不得直接把 SVG 嵌入页面当最终 UI。
- 不得使用固定截图尺寸死写布局。
- 不得绕过 Design Tokens 自定义颜色、圆角、字号和正文宽度。
- 阅读类页面不得出现移动端底部主导航。
