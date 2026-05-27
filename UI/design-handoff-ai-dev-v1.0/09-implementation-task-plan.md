# 09 AI 开发实施任务顺序

## 第一阶段：主链路闭环

1. 建立 `shared-types` 数据结构。
2. 建立 Design Tokens 与基础 CSS Variables。
3. 实现 `BookCard / ContinueReadingCard`。
4. 实现书架页 `/library`。
5. 实现导入页 `/import`。
6. 实现 TXT / EPUB 最小解析流程。
7. 实现解析预览页 `/import/preview/:taskId`。
8. 实现阅读页 `/reader/:bookId` 沉浸态。
9. 实现 `ReaderBottomBar / TocDrawer / SettingsSheet`。
10. 实现阅读进度保存与恢复。

## 第二阶段：状态与体验补强

1. 空书架、无结果、解析失败、离线状态。
2. 章节质量提示与手动修正。
3. 移动端安全区与极窄屏验收。
4. 桌面三栏阅读工作区。
5. 夜间模式、护眼绿、纸白、米黄主题。

## 第三阶段：AI 与搜索

1. 当前章摘要。
2. 前情提要。
3. 本地书架搜索。
4. URL 解析候选入口。

## 不允许一开始做

- 多端 App 壳。
- 完整书源生态。
- 复杂批注系统。
- 默认云端同步全文。
- 完整 PDF 小说化。
