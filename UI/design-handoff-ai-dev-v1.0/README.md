# 小说阅读平台 AI 开发交付包 v1.0

本包用于把最终视觉套图升级为 **可实现、可验收、可拆任务的 AI 开发输入包**。  
设计基线按当前会话最新记录采用：**v1.9 page-by-page polished**。当前随包可读取的 SVG 视觉参考来自工作区可用的 `novel_ui_true_vector_svg_v0.2.zip`，已放入 `svg/`；如果后续补齐 v1.9 原始 SVG，请直接替换 `svg/` 目录，并保留本文档体系。

## AI 开发阅读顺序

1. `01-product-context.md`
2. `02-ui-principles.md`
3. `03-design-tokens.md` 与 `tokens/readerTokens.ts`
4. `04-page-map.md`
5. `05-component-inventory.md`
6. `06-interaction-spec.md`
7. `07-responsive-rules.md`
8. `08-acceptance-checklist.md`
9. `page-specs/*.md`
10. `svg/*.svg` 仅作视觉参考，不能直接嵌入页面当 UI

## 核心要求

- 前端必须用 React 组件、真实数据结构、CSS tokens 实现。
- SVG 只作为视觉参考与可编辑备份，不是实现本体。
- 先实现主链路：`书架 -> 导入 -> 解析预览 -> 阅读页`。
- 阅读页默认沉浸，不允许常驻复杂工具栏或移动端底部主导航。
- 所有页面必须同时考虑桌面浏览器、手机浏览器和可安装 PWA。

## 目录

```text
design-handoff-ai-dev-v1.0/
  README.md
  01-product-context.md
  02-ui-principles.md
  03-design-tokens.md
  04-page-map.md
  05-component-inventory.md
  06-interaction-spec.md
  07-responsive-rules.md
  08-acceptance-checklist.md
  09-implementation-task-plan.md
  10-ai-development-prompt.md
  11-source-version-and-asset-status.md
  svg/
  source-boards/
  page-specs/
  tokens/
  assets/
  schemas/
  checklists/
  prompts/
  traceability/
```

## 本次补充：源套图 PNG

已新增 `source-boards/`，保存用于生成/复刻 SVG 的原始套图 PNG、标准编号副本、总览图、manifest 与图片/SVG 色彩背景差异核查。

详见：`source-boards/README.md` 与 `12-image-svg-color-background-check.md`。
