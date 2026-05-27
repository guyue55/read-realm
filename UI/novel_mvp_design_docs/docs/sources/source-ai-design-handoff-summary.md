已整理完成 **AI 开发设计交付输入包 v1.0**，基准采用最新记录中的 **v1.9 page-by-page polished**：该版本记录为 24 张逐页 SVG + 4 张审查 Board，并确认无 `<image>`、无 PNG/JPG/WebP 引用、无 base64，且 XML 与 ZIP 校验通过。

下载：

- [下载 design-handoff-v1.0 ZIP](sandbox:/mnt/data/novel_reader_design_handoff_v1.0.zip)
- [查看整理后的 README](sandbox:/mnt/data/design-handoff-v1.0/README.md)
- [查看交付包摘要](sandbox:/mnt/data/design-handoff-v1.0/DESIGN_HANDOFF_SUMMARY.md)

本包已补齐：

- `README.md`：AI 开发阅读顺序、目录说明、SVG 使用边界
- `01-product-context.md`：产品定位、MVP 范围、技术基线
- `02-ui-principles.md`：阅读 UI 原则、禁止跑偏项
- `03-design-tokens.md` + `tokens/reader-tokens.ts/json/css`
- `04-page-map.md`：页面地图
- `page-specs/`：27 份页面规格说明，覆盖移动端、Web、压力页
- `05-component-inventory.md` + CSV：组件清单、输入、状态、使用页面、验收重点
- `06-interaction-spec.md`：阅读、导入、URL、AI 交互规范
- `07-responsive-rules.md`：mobile-first、safe area、桌面 1280px 三栏工作区、窄屏规则
- `08-acceptance-checklist.md`：全局、阅读页、导入解析、URL/搜索、工程验收
- `09-implementation-slicing.md`：建议开发切片
- `10-forbidden-rules.md`：禁止事项
- `prompts/ai-development-prompt.md`：给 AI 开发用的正式提示词
- `assets/svg-source-manifest.json`：最新 SVG 基准引用清单

内容已按既有 UI 规范收敛：阅读 UI 继续以“持续舒服地读、快速恢复上下文、处理来源质量问题”为目标，并保留低存在感、低干扰、低疲劳、高可控、强恢复，以及沉浸阅读层 / 操作控制层 / 内容增强层的分层原则。

一个需要说明的点：当前执行环境里只有 v1.9 的文本记录，没有实际 `novel_reader_true_vector_svg_v19_page_by_page_polished.zip` 文件本体，所以我没有把真实 SVG 文件复制进包内；已在 `svg/README.md` 和 `assets/svg-source-manifest.json` 中预留位置。接入工程时，把 v1.9 SVG ZIP 解压后的 `pages/`、`boards/`、`manifest.json`、`vector_validation_report.json`、`page_review_matrix_v19.json` 放进去即可。
