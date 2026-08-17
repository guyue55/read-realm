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

## 快速开始（一键启动）

> 仓库内包含可直接运行的前端（`apps/web-pwa`）与本地后端（`apps/api`），使用一键脚本同时启动，并自动打开浏览器。

```bash
bash scripts/start-app.sh            # 开发模式（默认局域网可访问）
bash scripts/start-app.sh --prod     # 生产模式（先构建再启动）
bash scripts/start-app.sh --local    # 仅本机访问（强制 127.0.0.1）
```

启动后脚本会打印：

- 本机访问地址 `http://127.0.0.1:3000`；
- 局域网访问地址 `http://<局域网IP>:3000`（同一 Wi-Fi/局域网内其他设备可访问，如手机、平板）；
- 藏经阁入阁口令与无限制入阁状态。

### 局域网访问

- 一键脚本默认监听 `0.0.0.0` 并自动检测本机局域网 IP，局域网内其他设备可通过打印出的地址访问书架。
- API 已放行本机与局域网私网（RFC1918）来源的跨域请求；检测不到局域网 IP 时自动回退为仅本机访问。
- 关闭局域网访问：`bash scripts/start-app.sh --local`。

### 藏经阁入阁（上传公共明文副本）

「藏经阁 → 入阁」用于上传 TXT 到公共馆藏，供本实例访客浏览。入阁受维护凭据保护：

- 一键脚本默认配置维护口令 `reader-lan-maintenance`（可用环境变量覆盖）。
- 前端需在「设置 → 同步口令」填入同一口令才有入阁权限；口令不一致会被拒绝并提示。
- **无限制入阁**（`READER_PUBLIC_LIBRARY_MAINTENANCE_ALLOW_ANY`）**默认开启**：任何人都可入阁，无需口令。

### 常用环境变量

| 变量 | 默认 | 说明 |
|---|---|---|
| `API_PORT` | `4000` | API 端口 |
| `WEB_PORT` | `3000` | 前端端口 |
| `READER_PUBLIC_LIBRARY_MAINTENANCE_KEY` | `reader-lan-maintenance` | 藏经阁入阁口令（设置页同步口令需一致） |
| `READER_PUBLIC_LIBRARY_MAINTENANCE_ALLOW_ANY` | `1` | 无限制入阁开关：`1` 任何人可入阁，`0` 仅口令匹配者可入阁 |
| `READING_WORLD_NO_OPEN` | — | 设为 `1` 时不自动打开浏览器 |

示例：改用自定义入阁口令并关闭无限制模式：

```bash
READER_PUBLIC_LIBRARY_MAINTENANCE_KEY=my-own-key \
READER_PUBLIC_LIBRARY_MAINTENANCE_ALLOW_ANY=0 \
bash scripts/start-app.sh
```

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
scripts/               # 工程脚本：start-app.sh（一键启动）、各验收/网关脚本
data/                  # MVP 本地轻量版数据目录占位
```
