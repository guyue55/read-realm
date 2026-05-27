# 用于生成 SVG 的套图源图

本目录补充保存用于生成 / 复刻 SVG 的原始套图 PNG，方便 AI 开发时追溯视觉来源。

## 目录说明

- `canonical-board-png/`：按 01-09 标准编号整理后的九张源套图 PNG。
- `raw-png/`：保留工作区内检测到的原始 PNG 文件名；其中 `imagegen.png` 与 `多端书籍平台ui展示.png` 内容重复，已在 canonical 中只取一份。
- `source-boards-contact-sheet.jpg`：九张源套图总览。
- `source_boards_manifest.json`：PNG 与 `svg/*.svg` 的配对关系、尺寸、hash。
- `image_svg_color_comparison.json`：源 PNG 与当前随包 SVG 渲染后的颜色/背景差异抽样结果。

## 使用原则

1. 源 PNG 只作为视觉回溯与质量对照，不作为前端实现本体。
2. `svg/` 仍作为逐元素可编辑视觉参考，不得直接嵌入应用页面。
3. 前端实现必须以 `tokens/`、`page-specs/`、`05-component-inventory.md` 和 `08-acceptance-checklist.md` 为准。
4. 后续如果补齐 v1.9 原始 SVG 或 PNG，只需要替换本目录和 `svg/`，其余 handoff 文档可继续沿用。
