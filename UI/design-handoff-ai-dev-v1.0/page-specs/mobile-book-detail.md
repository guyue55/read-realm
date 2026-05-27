# 页面：移动端书籍详情页

## 基本信息

| 字段         | 值                                         |
| ------------ | ------------------------------------------ |
| 页面 ID      | `M11`                                      |
| 路由         | `/book/:bookId`                            |
| 平台         | `mobile`                                   |
| 类型         | `page`                                     |
| SVG 视觉参考 | `../svg/02_bookshelf_discovery_detail.svg` |

## 页面目标

沉淀阅读增强资产，包括摘要、前情、笔记、书签和人物/设定信息。

## 主要区域

- 筛选栏
- 资产卡片
- 当前书籍上下文
- 空状态

## 关键交互

- 切换资产类型
- 跳回原文
- 重新生成 AI 视图
- 删除笔记

## 状态覆盖

- 空
- 加载中
- 生成失败
- 有内容
- 离线缓存

## 组件建议

- `BookCard` / `ContinueReadingCard`：用于书籍相关区块。
- `ReaderCanvas`：用于正文阅读。
- `TocDrawer` / `SettingsSheet` / `ProgressSheet` / `AIReaderPanel`：用于阅读辅助层。
- `EmptyState` / `ErrorState` / `QualityBadge` / `OfflineBadge`：用于状态表达。

## 验收标准

- [ ] AI 不覆盖原文
- [ ] 跳转可返回阅读位置
- [ ] 卡片圆润不拥挤
- [ ] 失败可重试

## 禁止事项

- 不得直接把 SVG 嵌入页面当最终 UI。
- 不得使用固定截图尺寸死写布局。
- 不得绕过 Design Tokens 自定义颜色、圆角、字号和正文宽度。
- 阅读类页面不得出现移动端底部主导航。
