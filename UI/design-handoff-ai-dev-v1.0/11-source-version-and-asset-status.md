# 11 来源版本与资产状态

## 设计基线

当前 handoff 采用会话中最新记录的设计基线：

```text
v1.9 page-by-page polished
24 张逐页 SVG + 4 张审查 Board
无 <image>、无 PNG/JPG/WebP、无 base64/data:image
```

## 当前工作区可读取资产

当前运行环境中可直接读取到的 SVG 包是：

```text
/mnt/data/novel_ui_true_vector_svg_v0.2.zip
```

它已被解包并复制到：

```text
svg/
assets/source_svg_manifest_v0.2.json
```

## 使用说明

- 若你已有 v1.9 原始 SVG，请用 v1.9 的 `svg/`、`manifest.json`、`vector_validation_report.json` 替换本包对应目录。
- 本 handoff 的页面规格、tokens、组件清单、交互规则、验收清单不依赖具体 SVG 版本，可直接用于 AI 开发。
- SVG 是视觉参考与可编辑备份，不是最终前端实现本体。
