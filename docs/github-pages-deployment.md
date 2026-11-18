# GitHub Pages 项目站静态部署

本应用是本地优先 PWA：所有业务数据存于浏览器 IndexedDB，服务端（API）停止后仍可离线阅读与导入解析。构建产物可纯静态部署到 GitHub Pages。本文说明「项目站子路径」与「用户站根域」两种部署形态及可切换的 basePath 构建开关。

## 一、两种部署形态

| 形态 | 访问地址 | `NEXT_PUBLIC_BASE_PATH` |
|---|---|---|
| 用户站（根域） | `https://<owner>.github.io/` | 留空（默认） |
| 项目站（子路径） | `https://<owner>.github.io/<repo>/` | `/<repo>`，如 `/read-realm` |

本项目 git remote 为 `guyue55/read-realm`，仓库 Pages 项目站地址为 `https://guyue55.github.io/read-realm/`，故部署工作流固定使用 `NEXT_PUBLIC_BASE_PATH=/read-realm`。

静态站没有后端服务，另有一个独立开关 `NEXT_PUBLIC_STATIC_MODE=true`（见第六节）用于隐藏不可用入口并给出友好提示；它与 basePath 语义相互独立——用户站根域部署时 basePath 为空，但同样应开启静态模式。

## 二、basePath 构建开关

唯一开关是环境变量 `NEXT_PUBLIC_BASE_PATH`，默认空字符串＝根域，行为与历史构建完全一致：

- `apps/web-pwa/next.config.mjs`：设值时配置 Next 的 `basePath` 与 `assetPrefix`（Next 会自动给 `/_next/*` 资源与 `<Link>` 加前缀）；next-pwa 从 `config.basePath` 自动推导 SW 的 scope、`_sw` 路径、start-url 与 precache 前缀。
- `apps/web-pwa/src/lib/base-path.ts`：前端共享工具，导出 `withBasePath()` / `appPathname()` / `resolveHashRedirect()` / `swScope()`；所有绝对路径（manifest、Service Worker、直链收敛 guard）统一经此加前缀或剥离。
- `apps/web-pwa/public/manifest.json`：`start_url`/`scope` 用相对路径 `./`，icon 用相对路径 `icons/icon.svg`，天然兼容根域与子路径，无需构建期改写。

本地手动构建项目站产物：

```bash
# 先构建 workspace 依赖（storage-core / parser-core 等）
pnpm --filter "web-pwa^..." build
# 再构建静态站点
EXPORT_MODE=true NEXT_PUBLIC_BASE_PATH=/read-realm pnpm --filter web-pwa build
# 产物在 apps/web-pwa/out/
```

根域构建只需去掉 `NEXT_PUBLIC_BASE_PATH`（或不设）：

```bash
EXPORT_MODE=true pnpm --filter web-pwa build
```

## 三、自动部署（GitHub Actions）

已提供 `.github/workflows/deploy-pages.yml`，推送到 `main` 或手动触发 `workflow_dispatch` 时：

1. 按 pnpm 9 / Node 20 安装依赖并先构建 workspace 依赖；
2. 以 `EXPORT_MODE=true`、`NEXT_PUBLIC_BASE_PATH=/read-realm` 构建静态导出；
3. 确保产物含 `.nojekyll`（防止 Jekyll 吞掉 `_next` 目录）；
4. 上传 `apps/web-pwa/out` 为 Pages 产物并部署。

启用前需在仓库 **Settings → Pages → Build and deployment** 把 Source 设为 **GitHub Actions**。工作流已申请 `pages: write` 与 `id-token: write` 权限。

若要用在个人用户站（根域），把工作流中 `NEXT_PUBLIC_BASE_PATH` 改为空字符串即可。

## 四、部署后自检

部署完成后打开 `https://guyue55.github.io/read-realm/`，确认：

- 首页书架正常加载，资源（`/read-realm/_next/*`）无 404；
- 浏览器 DevTools → Application → Manifest：`Start URL` / 图标路径均指向 `/read-realm/` 下；
- DevTools → Application → Service Workers：scope 为 `/read-realm/`，无重复注册；
- 断网刷新仍可打开已缓存页面（离线降级生效）；
- 浏览器地址栏的路由在 `#/...` 中，形如 `https://guyue55.github.io/read-realm/#/library`。

## 五、边界说明

- 用户站/项目站的差异**只在构建期**由 `NEXT_PUBLIC_BASE_PATH` 决定，运行期不做路径探测，避免误判。
- API 地址由 `apps/web-pwa/src/lib/api.ts` 依 `NEXT_PUBLIC_API_BASE_URL` / `NEXT_PUBLIC_API_PORT` 解析，走本地端口（默认 4000），不受 basePath 影响；Pages 静态站无后端时，API 相关功能（藏经阁同步、云同步、URL 抓取的 L1/L2 降级通道）自动降级或给出离线提示，不影响离线阅读与本地导入。
- `.nojekyll` 随 `public/` 进入构建产物，同时工作流里有 `touch` 兜底，双保险。

## 六、静态模式开关（NEXT_PUBLIC_STATIC_MODE）

GitHub Pages 是纯静态托管，没有 API 后端。虽然所有联网功能都有 try/catch 不会崩溃，但静态站 `navigator.onLine` 仍为 `true`（有网络、只是无后端），既有「离线」文案不会触发，用户会遇到「藏经阁打不开」「请检查后端服务」等费解提示。为此增加独立开关 `NEXT_PUBLIC_STATIC_MODE`：

- 默认空＝完整功能，行为与本地开发、桌面/移动壳完全一致（控制边界：这些形态有本地后端，不要设置）。
- 设为 `true`＝静态模式，构建期把开关固化进前端，运行期零探测：
  - **隐藏**纯依赖后端、无本地替代的入口——导航栏「藏经阁」（`APP_NAV_ITEMS` 过滤，底栏格数自适应）；
  - **保留**其余入口，但在关键位置给出友好提示，明确「当前为网页静态版，该功能需要本地服务暂不可用」：设置页统一「运行环境」说明卡、私人云同步卡、AI 配置面板，以及 AI 伴读 / 云同步失败文案（`i18n.ts` 一处收敛）；
  - **不影响**纯本地能力：书架、TXT/EPUB 导入、阅读与书签笔记、本地搜索、备份恢复照常可用；网址导入的 L0 浏览器直连通道在目标站 CORS 允许时仍可用，动态/登录页建议改用本地版或手动粘贴。

开关与 basePath 相互独立：`NEXT_PUBLIC_BASE_PATH` 决定资源路径前缀，`NEXT_PUBLIC_STATIC_MODE` 决定功能可见性与提示。用户站根域部署时 basePath 为空，但仍应开启静态模式。部署工作流已固定注入 `NEXT_PUBLIC_STATIC_MODE: "true"`。

实现入口：`apps/web-pwa/src/lib/static-mode.ts`（唯一布尔源 `isStaticMode`）、`apps/web-pwa/src/components/app-shell/nav-items.ts`（导航过滤）、`apps/web-pwa/src/app/settings/page.tsx`（说明卡）、`apps/web-pwa/src/lib/i18n.ts`（文案变体）。
