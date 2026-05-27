已完成 **AI 开发交付输入包：`design-handoff-v1.9-ai-dev`**。

本次按最新 **v1.9 page-by-page polished** 基线整理：v1.9 已确认为 **24 张逐页 SVG + 4 张审查 Board**，且保持真矢量、无 `<image>`、无 PNG/JPG/WebP、无 base64，并新增极窄屏和长内容压力页；本包把它转换成 AI 开发可执行材料。

已补齐内容包括：

- `README.md`：AI 开发使用顺序
- `01-product-context.md`：产品上下文与 MVP 范围
- `02-ui-principles.md`：UI 原则与禁止事项
- `03-design-tokens.md`
- `tokens/reader-tokens.ts`
- `tokens/reader-tokens.css`
- `tokens/reader-tokens.json`
- `04-page-map.md`：页面地图
- `page-specs/`：逐页规格说明，覆盖移动端、Web 端、状态页、压力页
- `05-component-inventory.md`：组件清单
- `components/component-contracts.md`
- `components/component-props.ts`
- `06-interaction-spec.md`：阅读、导入、URL、AI 状态机
- `07-responsive-rules.md`：移动优先、Safe Area、桌面三栏规则
- `08-acceptance-checklist.md`
- `checklists/acceptance-checklist.csv`
- `09-ai-dev-prompt.md`：可直接投喂给 AI 开发的实现提示词
- `svg/expected-svg-manifest.json`：最新 SVG 文件期望清单
- `assets/page_review_matrix_v19_handoff.json`

设计原则已按既有 UI 规范收敛：阅读 UI 必须服务“持续舒服地读、快速恢复上下文、处理来源质量问题”，并坚持低存在感、低干扰、低疲劳、高可控、强恢复；Design Tokens、阅读页点击区、Safe Area、正文限宽等也已固化进交付包。

下载：

[下载 design-handoff-v1.9-ai-dev.zip](sandbox:/mnt/data/design-handoff-v1.9-ai-dev.zip)

说明：当前包里补齐的是 **AI 开发规格材料**，并提供了 `svg/` 放置结构和 expected manifest；由于当前工作区没有实际 v1.9 SVG zip 文件实体，我没有把 SVG 二进制重复打入包内。把最新 v1.9 真矢量 SVG 套图解压到 `svg/latest/` 后，这个包就是完整开发输入包。
