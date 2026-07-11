# 墨问全面升级验收报告

## 验收范围

本次验收覆盖真实数据、SQLite 完整性、导入、阅读、笔记、搜索、AI 阅读意图、分享隔离、PWA 离线、中文产品语言、响应式布局、生产构建与依赖安全。

## 自动门禁

- `CI=true pnpm lint`：通过。
- `CI=true pnpm test`：通过；AI Core 4、Gesture Core 10、Shared Types 20、Reader Core 52、Storage Core 6、Parser Core 9、API 31、Web PWA 42。
- `CI=true pnpm build`：通过。
- `CI=true pnpm --filter web-pwa test:e2e`：7/7 通过，包含首次导入、书签续读、分享作用域和五档视口。
- `pnpm audit --prod`：未发现已知生产依赖漏洞。
- `git diff --check`：通过。

## 生产包体

共享首载 JavaScript 为 103 kB。主要路由首载为：根页 137 kB、书籍详情 148 kB、导入 171 kB、书架 214 kB、笔记 145 kB、阅读器 186 kB、搜索 152 kB、设置 154 kB。导入解析器保持动态加载，不进入共享首屏包。

## 活体验收

- 视口：340x740、390x844、768x1024、1440x900、1920x1080；全部无横向溢出、无页面异常和控制台错误。截图位于 `.tmp/verification/`。
- 移动首屏：主标题在 340px 视口内完整显示，主操作和底部导航可见。
- 真实离线：生产服务中导入 TXT，加入书架并进入正文；Service Worker 接管后切断 Chromium 网络并重载。重载后正文、本地设置和应用标题仍可用，无溢出、无控制台错误。
- 编码：解析器通过 UTF-8、UTF-16 BOM 和 GB18030 定向测试，移除 Worker 中不稳定的 CommonJS 字符集探测器。

## 现实审查结论

没有发现阻断发布的未完成功能、假数据入口、前端硬编码权限判定、已知生产依赖漏洞或自动门禁失败。分享数据范围由后端令牌与仓储边界强制，前端仅表达可见状态。

仍有三个非阻断性结构风险：`LibraryDefault.tsx`、`useReader.ts` 和导入页仍较大。本轮已抽离书架纯状态与同步标记、阅读位置、导入 reducer、字符解码和 PWA 注册边界；后续结构调整应按可独立验证的行为分段提取，不建议在无新功能驱动时进行一次性大搬迁。
