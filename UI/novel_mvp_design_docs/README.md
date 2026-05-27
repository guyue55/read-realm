# MVP 版设计文档包

生成时间：2026-05-25 15:00:14

本包用于“小说阅读 / 个人小说聚合阅读平台”的 MVP 版设计交付，重点服务后续结合设计图进行前端与本地轻量后端开发。

## 主文档

```text
docs/product/01-requirements-design.md
docs/product/02-functional-design.md
docs/design/01-ui-design-development-spec.md
docs/architecture/01-tech-stack-architecture.md
```

## 辅助来源文档

```text
docs/sources/source-product-and-search-plan.md
docs/sources/source-reading-function-research.md
docs/sources/source-reading-ui-research.md
docs/sources/source-reading-ui-summary.md
docs/sources/source-mvp-local-dev-plan-summary.md
docs/sources/source-ai-design-handoff-summary.md
docs/sources/source-ai-dev-input-summary.md
```

## 推荐阅读顺序

1. `docs/product/01-requirements-design.md`
2. `docs/product/02-functional-design.md`
3. `docs/design/01-ui-design-development-spec.md`
4. `docs/architecture/01-tech-stack-architecture.md`
5. `docs/sources/*` 作为追溯材料阅读

## MVP 基线

- 产品定位：个人小说聚合阅读平台
- 第一阶段：Web/PWA 跨屏 MVP
- 核心闭环：导入 TXT/EPUB → 自动解析章节 → 解析预览/修正 → 舒服阅读 → 自动保存进度 → 离线可读
- 技术基线：TypeScript 全栈、Next.js/React、IndexedDB/OPFS、NestJS、SQLite、本地文件存储、可替换 Adapter 架构
