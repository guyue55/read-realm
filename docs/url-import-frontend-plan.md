# URL 导入解析与多级抓取能力方案及执行计划

- 项目：read-realm（本地优先中文小说阅读 PWA，pnpm monorepo）
- 文档性质：现状盘点 → 目标架构 → 模块化设计 → 分阶段执行计划 → 能力与护栏 → 风险 → 完成定义
- 核心诉求：
  1. **贯彻"服务端下线也不影响客户端"**：已导入内容的阅读零后端依赖；URL 导入的解析能力前端优先，服务端是可替换网络桥。
  2. **功能强大、体验更好**：突破简单静态抓取，具备**多级抓取能力**（静态 → 动态渲染/headless → 用户手动协助），显著提高各种站点（含 JS 渲染、反爬、Cloudflare）的导入成功率；导入过程流畅、可感知、可恢复。
  3. **双端能力分工**：前端负责解析与轻量抓取；后端（本地 API + worker）承担重抓取（headless/UA/指纹/并发）；能力可扩展、可替换。
- 能力与护栏：**能力优先**——不预设"只能做合法兼容"；提供静态/动态/手动多级抓取与反爬应对（UA、Cookie、重定向、重试、并发、限速、headless 渲染、JS 挑战识别与引导）。同时保留**用户知情与可配置护栏**：默认启用稳妥档，激进档（headless/指纹/高并发）用户显式开启；任何登录/验证码/付费墙场景**引导用户手动完成**而非静默绕过；数据契约不变；不与 Goal 体系既有证据冲突。
- 依据：全链路源码盘点（2026-09）+ 成熟方案调研 + 项目既有文档风格

---

## 一、现状全链路分析（已逐项核实）

### 1.1 URL 导入的完整数据流

```
用户输入 URL（导入页 apps/web-pwa/src/app/import/page.tsx）
   │ ① assertAuthorizedPublicSourceUrl(rawUrl, rightsConfirmed)
   │    （url-source-policy.ts：协议/http(s)、无内嵌凭据、必须显式权利确认）
   ▼
durableImportController.create({ format: "html", sourceKind: "url", url })
   │    （建持久化任务，状态机 reading → parsing → progress → preview → saving）
   ▼
parseAuthorizedUrlSource(url, true, onProgress)        ← lib/url-source-client.ts
   │ ② 首选前端：parseUrlBookInBrowser(url)
   │    ├─ fetch(url) 直连（12s 超时，AbortController，无 UA/重定向/重试）
   │    ├─ DOMParser.parseFromString → innerText 提取正文
   │    ├─ 正则识别章节链接 / "下一页"分页 / 反爬拦截（blockedPagePattern）
   │    └─ 产出 ParsedBook { title, chapters[] }
   │
   └─ ③ 失败且 shouldUseBackendUrlFallback(error) 为真
        └─ POST /imports/url/parse（后端）
              ├─ 服务端 fetch（无 CORS 限制，可设 UA）
              ├─ 手动重定向（最多 5 次，每次重过 SSRF 校验）
              ├─ 正则提取 → parseWebPageWithReadability 兜底（html-parser.ts）
              └─ 返回同构 ParsedBook
   ▼
buildParsedImportResult → attachParsedResult（写入 Dexie 本地缓存 chapters_full）
   ▼
导入预览页 → 确认 → 写入书架（本地事实源）
```

### 1.2 三个事实源（代码佐证）

| 层 | 文件 | 角色 | 是否依赖服务端 |
|---|---|---|---|
| 前端解析 | `apps/web-pwa/src/lib/url-import.ts` | 浏览器内 fetch + DOMParser + 正则 | 仅 CORS 通畅时 |
| 前端兜底策略 | `apps/web-pwa/src/lib/url-source-client.ts` + `url-source-policy.ts` | 先前端，`TypeError: fetch/network/cors` 才降级后端 | 失败时依赖 |
| 后端解析 | `apps/api/src/modules/imports/url-import.service.ts` | 服务端 fetch + Readability 兜底 | 全依赖 |
| 阅读懒加载 | `apps/web-pwa/src/hooks/useReader.ts:1686` | 本地未缓存章节时 `fetch(apiUrl(/books/:id/chapters/:index))` | **依赖**（在线时） |
| 更新检查 | `apps/web-pwa/src/app/book/[bookId]/BookDetailClient.tsx` `checkUrlSource` | `parseAuthorizedUrlSource` 取远端 title/chapterCount | 失败时依赖 |

### 1.3 已核实的六个关键事实

1. **前端已有解析雏形**，但不是"没有"，而是"质量弱 + 强依赖后端兜底"。
2. **前端解析未用 Readability**：`url-import.ts` 用 `innerText` + 正则；Readability（`html-parser.ts`）**仅后端用**，且绑定了 `jsdom`（Node 专用）。
3. **`@mozilla/readability@0.6.0` 浏览器可用**：构造函数 `Readability(doc, options)` 只依赖标准 DOM API（`firstChild`/`baseURI`/`createTextNode`），传浏览器原生 `document` 即可，无需 jsdom。
4. **浏览器限制**：`fetch` 第三方几乎必被 CORS 拦截；**无法设置 `User-Agent`**；无法执行目标站 JS（动态渲染/Cloudflare 挑战无解）——这些必须靠后端/headless。
5. **"已导入内容"已经离线可读**：导入成功即写入 Dexie `chapters_full`，阅读不依赖后端。
6. **基础设施已备**：根 devDeps 有 `puppeteer-core@25`（E2E 在用）；`apps/worker` 是空 processors 占位——**headless 渲染通道有现成落点**。

### 1.4 抓取能力现状差距（双端对比）

| 能力 | 前端 `url-import.ts` | 后端 `url-import.service.ts` | 差距 |
|---|---|---|---|
| 超时 | ✅ 12s `AbortController` | ✅ 15s `AbortSignal.timeout` | 一致 |
| 自定义 User-Agent | ❌ 浏览器禁止 | ✅ 自定义 UA | 前端天然不能，需后端 |
| Accept / Accept-Language | ❌ 默认 | ✅ 设置 | 前端可补 |
| 重定向控制 | ❌ 跟随默认 | ✅ `redirect:'manual'` + ≤5 次 + SSRF | 前端弱 |
| 重试 / 退避 | ❌ 无 | ❌ 无 | 双端都缺 |
| 反爬正文识别 | ✅ `blockedPagePattern` | ✅ 同款 | 一致 |
| **动态渲染 / JS 挑战（Cloudflare 等）** | ❌ 无解 | ❌ 无解（无 headless） | **双端都缺，最大短板** |
| **真实浏览器指纹 / Cookie** | ❌ | ❌ | 双端都缺 |
| 并发抓取章节 | ❌ 串行 80 章逐个 | ❌ 串行 | 双端都弱，体验慢 |
| 限速 / 礼貌抓取 | ❌ 无 | ❌ 无 | 双端都缺 |
| 响应大小上限 | ❌ 无 | ❌ 无 | 双端都缺 |
| 进度可视化 | ⚠️ onProgress 字符串 | ❌ | 可增强 |

### 1.5 问题清单（按影响排序）

| 级别 | 问题 | 影响 | 归属 |
|---|---|---|---|
| **P0** | **动态渲染 / Cloudflare 页面完全无法导入**（双端都无 headless） | 大量现代小说站（JS 渲染、挑战页）导入失败 | 双端缺 headless 通道 |
| **P0** | **章节串行抓取，80 章逐章等待**（无并发、无进度细节） | 大书导入极慢、体验差 | 前端/后端 parseChapterPages |
| P1 | 前端正文提取质量低于后端（innerText vs Readability） | 复杂页面提取不全/混入导航 | 前端 url-import.ts |
| P1 | 阅读懒加载依赖后端（useReader:1686） | 服务端下线 → 未缓存章节不可读 | useReader.ts |
| P1 | 前端无重试/退避，一次网络抖动即失败 | 导入成功率低 | 前端 url-import.ts |
| P1 | 无真实浏览器指纹/Cookie，部分站点直接 403 | 反爬站点导入失败 | 后端抓取层 |
| P2 | 双端都无响应大小上限 | 超大页面拖垮内存 | 双端 |
| P2 | CORS 失败即整链失败（无第三方通道可选） | 本地 API 退出时导入不可用 | url-source-client.ts |
| P3 | 前后端解析逻辑重复且不一致 | 行为漂移、维护成本翻倍 | 双端 |

---

## 二、目标架构（多级抓取 + 前端优先 + 体验优先）

### 2.1 架构原则

1. **解析逻辑 100% 在前端**：正文提取、章节链接识别、分页、反爬识别全部由浏览器完成；服务端**永不参与解析**。
2. **多级抓取能力（核心）**：按站点难度自动升级，目标"能导入就导入"：

```
L0 浏览器直连（CORS 通畅）         → 前端，最快
   ↓ 失败（CORS / 超时 / 403）
L1 本地 API 静态抓取（UA/重定向/重试） → 后端，可设 UA，覆盖多数静态站
   ↓ 失败（JS 渲染 / Cloudflare 挑战 / 动态加载）
L2 本地 headless 渲染（worker + puppeteer） → 后端 worker，真实浏览器执行 JS，拿渲染后 DOM
   ↓ 失败（登录 / 验证码 / 付费墙）
L3 用户手动协助（新窗口打开 + 手动复制/确认） → 前端引导，不静默绕过
```

3. **双端能力分工**：
   - **前端**：解析引擎 + L0 直连 + 体验层（进度/队列/恢复/手动协助 UI）
   - **后端 API**：L1 静态抓取（UA/重定向/重试/限速/SSRF）+ L2 调度入口
   - **后端 worker**：L2 headless 渲染（puppeteer-core，真实浏览器，拿渲染后 HTML）
4. **体验优先**：
   - 章节**并发抓取**（有限并发池，默认如 5，可配）→ 大书导入时间从"80 串行"降到"16 批"
   - **进度可视化**：每章状态（排队/抓取中/解析中/成功/失败/重试），非字符串
   - **失败恢复**：失败章节自动重试（退避）→ 仍失败则标记可单独重试，不整体失败
   - **动态渲染自动降级**：L1 遇 JS 挑战自动转 L2，用户无感
   - **手动协助**：L2 仍失败（登录/验证码）→ 弹窗引导"在新窗口打开该章 → 用户确认已能看到内容 → 粘贴或自动读取"
5. **护栏（知情 + 可配置，非"不做"）**：
   - 抓取档位：`标准（默认）| 激进（headless/高并发/指纹，显式开启）`
   - 登录/验证码/付费墙：**引导用户手动完成**（自动填验证码/绕过登录不在范围内，但提供手动通道保住体验）
   - 第三方通道（可选 Reader 服务）默认关闭、显式开启
   - 数据契约不变；不与 Goal 体系既有证据冲突

### 2.2 目标模块划分（高内聚低耦合）

```
apps/web-pwa/src/lib/
├── url-source-policy.ts        【不变】授权校验 / 档位偏好 / 更新检查（纯函数）
├── url-import.ts               【重构】纯前端解析引擎（不直接 fetch 第三方）
│     └── parseHtmlInBrowser(html, url)   ← 新增：浏览器内 Readability 提取（纯函数，可测）
│     └── antiScrape/                       ← 新增：前端反爬/识别子模块（纯函数）
│           ├── detectBlockedPage(text)     # 反爬正文识别
│           ├── isJsChallengePage(doc)      # Cloudflare/JS 挑战识别
│           ├── isLoginOrPaywallPage(doc)   # 登录/付费墙识别 → 引导手动
│           └── normalizeRedirect(url)      # 重定向白名单
├── url-fetch-adapter.ts        【新增】抓取端口（Port）+ 多级路由 + 重试/并发/限速
│     ├── interface UrlFetcher { fetch(url, opts): Promise<FetchResult> }
│     ├── BrowserDirectFetcher        # L0 浏览器直连
│     ├── LocalApiStaticFetcher       # L1 本地 API 静态抓取
│     ├── LocalHeadlessFetcher        # L2 本地 worker headless 渲染
│     ├── PublicReaderServiceFetcher  # 可选第三方（用户显式开启）
│     ├── TauriNativeFetcher          # 预留（desktop 端原生网络栈）
│     ├── retryWithBackoff()          # 指数退避 + 抖动
│     ├── createConcurrencyPool()     # 章节并发池（默认 5，可配）
│     └── rateLimit()                 # 抓取节流（按档位）
├── url-source-client.ts        【重构】编排层：档位策略 → 多级抓取 → 解析 → 恢复
└── url-import.test.ts          【新增】解析引擎 + 反爬识别 + 并发/重试纯函数测试

apps/api/src/modules/imports/
├── url-import.service.ts       【阶段 D 后废弃解析】保留 assertPublicUrl + 静态抓取能力
├── proxy-fetch.controller.ts   【新增】L1 静态抓取网络桥（UA/重定向/重试/限速/SSRF/大小上限）
└── headless-fetch.controller.ts【新增】L2 渲染调度入口（转 worker，返回渲染后 HTML）

apps/worker/src/processors/
└── headless-render.processor.ts【新增】L2 headless 渲染执行器（puppeteer-core）
      # 输入：url + 档位；输出：渲染后 HTML + 渲染元信息（成功/挑战/超时）
```

关键解耦：
- **解析引擎与抓取分离** → 解析纯函数可单测；抓取是多级端口可替换。
- **L1/L2 物理分离** → API 是轻量静态抓取（快、低资源）；worker 是重渲染（慢、高资源），互不阻塞；worker 失败不影响 L1。
- **并发池独立** → 抓取/解析共用，默认 5，档位可调；避免 80 章串行。
- **反爬识别是纯函数** → `detectBlockedPage`/`isJsChallengePage`/`isLoginOrPaywallPage` 可单测，抓取层只根据判定路由。
- **`url-source-client` 只编排**：档位 → 逐级尝试 → 失败降级 → 恢复 → 进度上报。

### 2.3 双端能力分工（明确边界）

| 能力 | 前端 | 后端 API（L1） | 后端 worker（L2） |
|---|---|---|---|
| 正文提取（Readability） | ✅ 主链路 | ❌ | ❌ |
| 章节链接/分页/反爬识别 | ✅ 主链路 | ❌ | ❌ |
| 静态抓取（UA/重定向/重试） | ⚠️ L0 直连 | ✅ 主链路 | ❌ |
| **headless 渲染（JS/Cloudflare）** | ❌ | 调度入口 | ✅ 执行（puppeteer） |
| **真实浏览器指纹 / Cookie 保持** | ❌ | ❌ | ✅（可演进） |
| 并发抓取 | ✅ 前端并发池（L0） | ✅ 服务端并发（L1） | ✅ 单页渲染（L2） |
| 登录/验证码/付费墙 | ✅ 引导手动（不静默绕） | ❌ | ❌ |
| 已导入阅读 | ✅ Dexie 全离线 | ❌ | ❌ |

---

## 三、分阶段执行计划

> 每阶段独立 commit、独立验证；阶段间严格依赖，不跳步。

### 阶段 A：前端 Readability 解析引擎 + 前端识别层（P1，基础）

**目标**：前端解析质量追平后端；前端具备反爬/挑战/登录识别能力（纯函数）。

**改动**：
1. `packages/parser-core` 新增浏览器 Readability 入口 `src/browser-readability.ts`（`extractArticleFromDocument(doc, url)`，DOMPurify 净化）；exports 增加 `"./browser-readability"`，与 Node 版 `./html` 隔离。
2. `apps/web-pwa/src/lib/url-import.ts` 重构：`parseHtmlInBrowser(html, url)` 纯函数；保留正则章节/分页；`fetchDocument` 接抓取器。
3. 前端识别子模块 `antiScrape/`：`detectBlockedPage` / `isJsChallengePage` / `isLoginOrPaywallPage` / `normalizeRedirect`（全部纯函数）。
4. `url-fetch-adapter.ts` 骨架：`UrlFetcher` 接口 + `BrowserDirectFetcher` + `retryWithBackoff` + `createConcurrencyPool`。
5. 新增 `url-import.test.ts`：采样 HTML（章页/嵌套/反爬/挑战/登录/无正文）+ 识别函数 + 并发池/退避纯函数测试。

**验收**：`tsc` + ESLint + `web-pwa test` 全绿；识别函数覆盖 6 类采样页；前端解析与后端 Readability 抽样一致（≥3 页）。

**边界**：只动 parser-core 新增入口 + url-import.ts + url-fetch-adapter 骨架；数据契约不变；后端不动。

### 阶段 B：L1 静态抓取网络桥（后端 API，P1）

**目标**：本地 API 提供 UA/重定向/重试/限速/SSRF/大小上限齐备的静态抓取。

**改动**：
1. `proxy-fetch.controller.ts`：`POST /proxy/fetch` → 仅抓取返回 HTML；复用 `assertPublicUrl`（SSRF 四重）+ `fetchHtml`（UA/重定向/超时）；增强响应大小上限（5MB→413）、服务级节流（20 req/min）、重试退避。
2. `url-fetch-adapter.ts` 新增 `LocalApiStaticFetcher`（L1，默认）。
3. `url-source-client.ts`：`policy → L0 → L1 → 降级` 路由。

**验收**：API 单测（透传/协议拒绝/内网拒绝/413/429/退避）；web-pwa 走 L1 抓取成功；导入 E2E 全绿。

**边界**：L1 只抓取不解析；不引入 headless（阶段 C）。

### 阶段 C：L2 headless 渲染通道（worker + puppeteer，P1，能力跃升）

**目标**：JS 渲染 / Cloudflare 挑战页面可导入——**本项目抓取能力的最大短板补齐**。

**改动**：
1. `apps/worker` 落地：
   - `apps/worker/package.json`（补全：`@nestjs` 或轻量任务入口 + `puppeteer-core`）
   - `src/processors/headless-render.processor.ts`：输入 url + 档位 → 启动无头浏览器 → 渲染完成（等待 networkidle / 指定时长）→ 返回 `{ html, meta: { succeeded | challenge | timeout | loginRequired } }`
   - 复用根 devDeps 已装的 `puppeteer-core@25`（需在 worker 内声明依赖）
2. `apps/api` 新增 `headless-fetch.controller.ts`：`POST /imports/headless-fetch` → 转 worker 任务 → 轮询/回调结果；校验：仅接受前端发起的 url、SSRF 前置校验、结果大小上限、并发上限（默认 2 个 headless 实例，防资源耗尽）。
3. `url-fetch-adapter.ts` 新增 `LocalHeadlessFetcher`（L2，激进档或 L1 失败后自动升级）。
4. 前端识别：L2 返回 `challenge/loginRequired` → 分别引导"已升级到动态渲染"或"请手动打开"。

**验收**：
- worker 单测：mock 页面渲染成功 / 挑战页返回 challenge / 超时
- API 单测：L2 调度 + SSRF + 并发上限 + 结果大小上限
- **端到端**：本地起一个 JS 渲染 demo 页（无 headless 拿不到正文），验证 L1 失败 → L2 成功拿正文
- 导入 E2E：L2 路径全链路

**边界**：L2 是激进能力，**默认关**（用户开启"激进档"或 L1 明确失败才用）；并发上限保护本机资源；不保存渲染中间态。

### 阶段 D：后端解析降级 + 章节并发抓取（P2，体验跃升）

**目标**：前端不再调后端解析接口；章节并发抓取让大书导入提速。

**改动**：
1. 前端改调 `POST /proxy/fetch`（L1）+ 前端解析；`url-import.service.ts` 解析逻辑停用（保留 `assertPublicUrl`/`fetchHtml` 供复用）；更新 `shouldUseBackendUrlFallback`。
2. **章节并发抓取**：`parseChapterPages` 改为并发池（默认 5，档位可调）；每章独立 try/catch + 退避重试 + 失败标记（可单独重试）；进度回调升级为结构化事件（非字符串）。
3. 导入预览页/进度 UI：章节状态列表（排队/抓取/解析/成功/失败/重试）。

**验收**：
- 导入 80 章 mock：并发 5 下耗时 ≈ 串行 1/5；失败章节可单独重试不阻断
- `grep` 前端无 `/imports/url/parse` 引用
- 进度 UI contract 测试

**边界**：并发上限受档位约束，默认保守；不改变 ParsedBook 契约。

### 阶段 E：阅读懒加载离线化 + 手动协助通道（P1，体验闭环）

**目标**：**"服务端下线不影响客户端"闭环** + 登录/验证码场景体验不中断。

**改动**：
1. `useReader.ts:1686` 懒加载：URL 书永不走网络（已 chapters_full）；cloud 书失败静默降级。
2. **手动协助通道（L3）**：L2 返回 `loginRequired`/`challenge` 时，导入页弹"在新窗口打开该章"引导；用户确认可见内容后，前端读取该窗口（若同源）或粘贴内容 → 继续导入。**不自动填验证码/绕登录**，但保住"用户能看到就能导入"的体验。
3. 更新检查保持纯前端；429 退避联动。

**验收**：
- E2E：断网 + 本地 API 下线 → 已导入 URL 书完整阅读
- E2E：登录页 mock → 引导手动 → 粘贴内容 → 导入成功
- 单测：懒加载分支 + 手动协助流程

**边界**：手动协助只引导、不绕过；同源窗口读取受限时提供粘贴兜底。

### 阶段 F：档位设置 + 全量回归（P2，收口）

**目标**：抓取档位可配置；全量验证。

**改动**：
1. 设置页新增"URL 抓取档位"：`标准（默认，L0+L1）| 激进（+L2 headless + 高并发）`；第三方通道独立开关。
2. 档位 → fetcher 路由/并发/限速联动（纯函数可测）。
3. 完整验证矩阵：TS / ESLint / 全量单测 / 生产构建 / Playwright E2E / 五视口导入走查 / `git diff --check`。

**验收**：档位切换生效（单测）；全矩阵全绿；无端口/进程残留。

---

## 四、执行顺序与依赖

| 阶段 | 内容 | 依赖 | 预估 | 关键验收命令 |
|---|---|---|---|---|
| A | 前端解析引擎 + 识别层 | 无 | 5-7h | `pnpm --filter parser-core build && pnpm --filter web-pwa test` |
| B | L1 静态抓取网络桥 | A | 4h | API 单测 + 导入 E2E |
| C | L2 headless 渲染通道 | B | 6-8h | worker 单测 + JS 渲染 demo 端到端 |
| D | 后端解析降级 + 章节并发 | B | 4h | 并发耗时对比 + grep 无旧接口 |
| E | 阅读离线化 + 手动协助 | A | 4h | 断网阅读 E2E + 登录引导 E2E |
| F | 档位设置 + 全量回归 | A-E | 3h | 完整矩阵 |

**关键路径**：A → B → C → D → E → F；C 是能力跃升核心，D/E 可与 C 部分并行。

---

## 五、能力与护栏（全程生效）

1. **能力优先**：目标是"能导入就导入"。L0→L1→L2→L3 四级抓取，覆盖静态站、JS 渲染站、Cloudflare 挑战站；不因"合规顾虑"主动削弱能力。
2. **默认稳妥，激进显式**：L0+L1 默认开启；L2 headless、高并发、指纹等激进能力**默认关闭，用户显式开启**（设置页档位）。既保证能力上限，又保证用户知情。
3. **不静默绕过人机验证**：登录、验证码、付费墙场景**引导用户手动完成**（新窗口打开 → 确认 → 粘贴/读取），不自动填验证码、不模拟真人对抗风控；这是"能力与责任"的平衡点——体验不中断，但由用户自己完成受限部分。
4. **数据契约不变**：`ParsedBook`、导入任务状态机、Dexie 存储结构零改动。
5. **第三方通道默认关闭**：尊重 TASK-0304"先显式启用"约束；外传 URL 需用户明确授权。
6. **模块高内聚低耦合**：解析（纯函数）/抓取（多级端口）/识别（纯函数）/编排（薄层）严格分离；L1/L2 物理隔离（API 轻、worker 重）；并发池/退避/限速独立可测。
7. **逐阶段提交**：每阶段独立 commit；改动前跑基线测试记录绿态。
8. **不碰既有 Goal 证据**：不改 `docs/goals/reading-world-v1/` 账本/证据；遇 PHASE 约束冲突先停并上报。
9. **服务端下线语义**：本地 API 是"本机服务"非"云端"；方案保证——本地 API 进程退出/云端不可达时，已导入内容阅读不受影响；"导入新 URL"的 L0 可纯前端，L1/L2 依赖本地服务，L3 手动通道保底。

---

## 六、风险与对策

| 风险 | 对策 |
|---|---|
| headless 渲染资源占用（CPU/内存） | worker 并发上限（默认 2 实例）+ 渲染超时（默认 30s）+ 激进档才启用 |
| L2 被滥用（渲染任意 URL / 放大攻击） | 仅接受前端发起的 url + SSRF 前置校验 + 结果大小上限 + 会话校验 |
| puppeteer-core 无浏览器内核（需用户 Chrome） | 复用系统 Chrome（E2E 已在用同款）；启动时检测并给出安装引导 |
| 登录/验证码页被"假装成功" | 识别函数保守判定；引导手动，不静默绕；错误文案给可执行下一步 |
| 章节并发触发目标站风控 | 档位节流联动（激进档才高并发）+ 指数退避 + 失败标记可重试 |
| 前端/后端 Readability 结果不一致 | 阶段 A 抽样双端对照；算法同源差异应极小 |
| 阅读懒加载改动影响 cloud 书 | 仅改 `sourceType=url` 分支；cloud 书保持原在线拉取；E2E 覆盖两型 |
| 与 Goal 体系（TASK-0304）冲突 | 激进档显式开启天然符合"先显式启用"；遇账本级冲突立即停并上报 |
| parser-core 新增浏览器入口破坏构建 | exports 子路径独立打包；`tsc` + `next build` 双验证 |

---

## 七、完成定义（Definition of Done）

- [ ] 前端 `parseHtmlInBrowser` 纯函数可单测，提取质量 ≥ 后端 Readability
- [ ] 前端识别层：`detectBlockedPage` / `isJsChallengePage` / `isLoginOrPaywallPage` / `normalizeRedirect` 全部纯函数可单测
- [ ] 抓取端口 `UrlFetcher` 五种实现（直连/静态/headless/第三方/Tauri），多级路由单测覆盖
- [ ] L1 网络桥 `/proxy/fetch`：UA/重定向/重试/限速/SSRF/大小上限 全单测
- [ ] L2 headless：**JS 渲染 demo 页端到端导入成功**（L1 失败 → L2 成功）
- [ ] 章节并发抓取（默认 5）生效，80 章 mock 耗时 ≤ 串行 1/3；失败章节可单独重试
- [ ] 登录/验证码页 → 引导手动 → 粘贴/读取 → 导入成功（E2E）
- [ ] 已导入 URL 书在**断网 + 本地 API 下线**下完整阅读（E2E）
- [ ] 抓取档位（标准/激进）+ 第三方通道开关在设置页可配且生效
- [ ] 后端解析不再被前端调用（grep 无 `/imports/url/parse`）
- [ ] `ParsedBook` 与导入任务数据契约零改动
- [ ] TypeScript / ESLint（0 警告）/ 全量单测 / 生产构建 / Playwright E2E 全绿
- [ ] 五视口导入流程视觉走查无回归；`git diff --check` 零错误

---

## 八、附：与既有代码的映射

| 既有文件 | 处置 |
|---|---|
| `apps/web-pwa/src/lib/url-import.ts` | 重构：拆 `parseHtmlInBrowser` + 识别子模块；接抓取器 |
| `apps/web-pwa/src/lib/url-source-client.ts` | 重构：编排层（档位 → L0→L3 路由 → 恢复 → 进度） |
| `apps/web-pwa/src/lib/url-source-policy.ts` | 阶段 D 更新 fallback；阶段 F 加档位偏好；其余不动 |
| `apps/web-pwa/src/hooks/useReader.ts` | 阶段 E 改 1686 懒加载分支 |
| `apps/web-pwa/src/app/import/page.tsx` | 阶段 D/E 增强进度 UI + 手动协助弹窗 |
| `apps/api/src/modules/imports/url-import.service.ts` | 阶段 D 停用解析，保留 `assertPublicUrl`/`fetchHtml` 供复用 |
| `apps/api/src/modules/imports/proxy-fetch.controller.ts` | 【新增】L1 静态抓取网络桥 |
| `apps/api/src/modules/imports/headless-fetch.controller.ts` | 【新增】L2 渲染调度入口 |
| `apps/worker/src/processors/headless-render.processor.ts` | 【新增】L2 headless 执行器（puppeteer-core） |
| `packages/parser-core/src/html-parser.ts` | 保持（Node/jsdom 版）；新增 `browser-readability.ts` |
| `packages/parser-core/src/browser-readability.ts` | 【新增】浏览器 Readability 入口 |
| `apps/web-pwa/src/app/book/[bookId]/BookDetailClient.tsx` | 不改（更新检查已纯前端） |
