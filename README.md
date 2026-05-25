# 小说阅读平台项目启动包 v0.1

生成日期：2026-05-25

本启动包用于在正式开发前冻结产品、架构、工程、测试、设计、合规、数据与项目治理准备项。它面向第一阶段 **Web/PWA 跨屏 MVP + MVP 本地轻量版后端**。

## 核心定位

本项目定位为：**个人小说聚合阅读平台**。

第一阶段不追求做全功能生态，而是验证：

1. 用户能否顺畅导入 TXT / EPUB；
2. 系统能否稳定解析目录、章节和正文；
3. 阅读页能否做到舒服、沉浸、离线、续读稳定。

## 第一阶段技术基线

- 前端：Next.js App Router + React + TypeScript + Tailwind CSS + Dexie/IndexedDB + OPFS + PWA。
- 后端：NestJS + TypeScript + SQLite + Drizzle ORM + Local File Storage + SQLite Task Queue + SQLite FTS5。
- 架构：Monorepo + packages 共享核心 + Adapter 可替换基础设施。
- 端策略：Web/PWA 覆盖桌面浏览器、手机浏览器、可安装 PWA；小程序、移动 App、桌面端后续扩展。

## 如何使用

建议先按顺序阅读：

1. `docs/project/project-master-plan-v0.1.md`
2. `docs/product/mvp-scope.md`
3. `docs/prd/reader-module-prd.md`
4. `docs/architecture/01-overview.md`
5. `docs/architecture/02-module-boundaries.md`
6. `docs/engineering/development-startup-checklist.md`
7. `docs/testing/testing-strategy.md`
8. `docs/legal/content-policy.md`

## 目录说明

```text
apps/                  # 后续代码应用目录占位
packages/              # 后续共享核心包占位
docs/                  # 本次启动包核心文档
adr/                   # 架构决策记录
fixtures/              # 测试样例占位与说明
templates/             # PRD、ADR、Bug、Issue、验收模板
scripts/               # 后续工程脚本占位
data/                  # MVP 本地轻量版数据目录占位
```
