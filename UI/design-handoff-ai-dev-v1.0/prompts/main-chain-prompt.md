# 10 给 AI 开发的主提示词

你将实现一个个人小说聚合阅读平台的 Web/PWA MVP。请严格按本 handoff 包开发，不要只看 SVG 画壳。

## 技术栈

- Next.js / React / TypeScript
- Tailwind CSS + CSS Variables
- Dexie / IndexedDB / OPFS / Cache Storage
- 共享包：`shared-types`、`reader-core`、`parser-core`、`storage-core`、`viewport-core`、`gesture-core`、`ui-reader`

## 优先顺序

1. 阅读 `README.md`、产品上下文、UI 原则、tokens。
2. 按组件清单实现可复用组件。
3. 先实现主链路：书架 -> 导入 -> 解析预览 -> 阅读页。
4. 再实现状态页、设置、目录、AI 面板。
5. SVG 只能作为视觉参考，不得直接嵌入页面作为最终 UI。

## 硬性规则

- 阅读页默认沉浸。
- 移动端阅读页无底部主导航。
- 桌面正文不铺满宽屏。
- 三栏不可强行压缩到窄屏。
- 夜间默认不是纯黑纯白。
- 设置、目录、AI 面板是临时辅助层。
- 所有颜色、字号、行高、圆角、间距必须来自 tokens。
- `reader-core` 不依赖 React、Dexie、API。
- `parser-core` 不依赖 UI。

## 输出要求

- 提供可运行代码。
- 提供组件级拆分。
- 提供页面路由。
- 提供状态处理。
- 提供至少主链路测试。
- 每个完成项对照 `08-acceptance-checklist.md` 自检。
