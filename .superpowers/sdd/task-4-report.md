# Task 4 执行报告

## RED / GREEN

- 新增静态边界测试后 3/3 失败：根页仍静态导入八个业务视图，保留 500ms 模糊转场、`poison-test`、`window.db` 和 LXGW 远程字体缓存。
- 首次实现用辅助函数复用 dynamic options，单测通过但 Next.js 生产构建拒绝非对象字面量配置；随后按框架静态分析要求展开八个 `ssr: false` 对象，并把测试收紧为八个真实边界。
- 最终 Web Vitest 8/8 文件、20/20 测试通过，lint、tsc、生产构建与 `git diff --check` 通过。

## 变更

- 八个业务视图使用 `next/dynamic` 独立加载，统一复用轻量 `ViewLoading`。
- 删除同步保活的八视图 React 树、500ms 模糊缩放卸载和生产崩溃插桩；切换后 DOM 只保留当前视图。
- 错误边界改为明确中文恢复路径，不默认展示堆栈，不监听无关的全局 Promise 拒绝。
- 删除生产 `window.db` 暴露。
- PWA 回到官方 runtime caching 基线，删除已无请求来源的 LXGW CDN 专用规则；构建后的 Service Worker 仍预缓存八个业务页面块。

## 性能与活体验收

- 根路由 First Load JS：268 kB 降至 137 kB，减少约 49%。
- shared first load 保持 102 kB，没有增加新的运行时依赖。
- 390×844 生产服务器：书架与笺注切换前后均只有 1 个 `.view-enter`、1 个可见应用外壳；页面 `scrollWidth = clientWidth = 390`。
- 点击“笔记与书签”后 URL 准确变为 `#/notes`，标题为“阅历与笔记”，没有旧页面 500ms 残留。
