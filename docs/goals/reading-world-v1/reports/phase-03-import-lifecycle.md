# PHASE-03 / TASK-0301 导入任务生命周期子切片

- 状态：部分完成；仅覆盖单文件 TXT/EPUB 的耐久任务与预览落库，不代表 TASK-0301、PHASE-03 或 REQ-02 完成。
- 实现基线：PHASE-02 checkpoint `634c85f42434211ceba4a5e3f553dda226fcf52b` 之后的当前候选。
- 日期：2026-08-13。

## 已闭合事实

- 读取文件字节前先持久化 `queued` 草稿，并对每次写入做精确读回校验。
- 单任务 Worker 事件按任务 ID 串行处理，状态依次进入 `reading / parsing / preview`，章节进度单调递增。
- TXT Worker 与 EPUB 兼容解析复用草稿预留的 task/book ID，不再用最终结果覆盖另一条任务记录。
- 刷新或异常关闭后遗留的活动任务会转为带明确原因的 `failed`，重新选择同名同大小文件可增加 attempt 后重试。
- 用户可取消当前任务；取消、失败和中断草稿不再被 2 分钟或 15 分钟后台 GC 静默删除。GC 只清理旧版、无生命周期、无章节的空壳。
- 预览页加入书架时，`preview -> saving -> completed` 与书、章节写入位于同一 Dexie 事务；失败回滚后保留完整解析草稿并允许重新保存，完成态只保留轻量任务历史。

## 新鲜验证

- `corepack pnpm test`：exit 0；10 个工作区包共 226 tests 通过。
- `corepack pnpm --filter web-pwa lint`：exit 0。
- `corepack pnpm --filter api exec eslint "{src,apps,libs,test}/**/*.ts"`：exit 0，未使用 `--fix`。
- `READING_WORLD_VERIFY_NO_PWA_WRITE=1 corepack pnpm build`：exit 0；Web/PWA、API 和共享包完整构建通过，PWA 受控文件未写入。
- `PLAYWRIGHT_BROWSER_CHANNEL=chrome corepack pnpm --filter web-pwa exec playwright test e2e/reader.spec.ts --reporter=line`：exit 0；真实 Chrome 完成 TXT 导入、预览、加入书架、阅读、书签和刷新续读。
- `check_long_goal_pack.py --mode resume`：exit 0；控制包仍为执行中。
- 控制包安全预检 37/37 Green；九个新增或关键改动实现文件逐项 Green。导入页唯一 Yellow 来自既有合法 URL 协议字面量，经人工复核不属于新增外传、密钥或权限扩张。

## 未完成与下一入口

- 文件夹与合法 URL 仍走旧任务路径，尚未统一到耐久状态机。
- 尚未生成 TXT 200MB、EPUB 500MB、1 万章的可复算容量 fixtures，也未证明主线程响应与中断恢复。
- 尚未验证存储配额不足、文件权限丢失、Worker 强制终止后的真实 UI 恢复。
- 下一入口：继续 TASK-0301，把文件夹/URL 适配到统一任务端口，并建立容量 fixture 生成器、故障注入与 PHASE-03 检查器合同。

## 追加：批量与合法 URL 子切片

- 批量 TXT/EPUB 与合法 URL 已复用同一耐久任务控制器和原子书架提交端口；批量仍保持无需逐本预览的产品行为，URL 仍先进入解析预览。
- 生产与开发均取消“生产主线程整本解析、开发 Worker”的语义分裂。TXT/EPUB Worker 按格式拆分依赖，TXT 不再初始化 EPUB/XML 运行时。
- 首次 Chrome 回放中，合法 URL 通过，批量两本均以 `Cannot read properties of undefined (reading 'bind')` 安全进入 `failed` 并保留任务；trace 未改写。拆分 Worker 依赖后，第二次开发 Chrome 2/2 通过，生产构建 `next start` 下再次 2/2 通过。
- 新增的事务端口测试证明配额失败全回滚、完整草稿无需重解析即可重新保存、完成态只留轻量历史；URL 适配器保持原 URL、task ID 与 book ID。
- 生产 Web 回放发现旁路缺口：API 的 `start:prod` 因 `dist/main.js` 找不到直接依赖 `express` 而退出。本次两条旅程不调用 API，使用只响应 `/ai/status` 的本机健康桩满足 Playwright 既有启动合同；因此只证明生产 Web/Worker，不证明 API 生产启动。该缺口留待生产硬化范围处理。
