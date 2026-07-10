# Task 1 报告：接通前端测试与诚实质量入口

## 结果

实现已完成：`web-pwa` 现在提供可独立测试的导航状态模块，并且根工作区 `test` 会执行 PWA 的 Vitest 入口。全量 PWA 测试仍会如实失败，原因见“顾虑”。

## RED / GREEN 记录

### RED

```sh
corepack pnpm --filter web-pwa test
```

首次执行退出码为 `0` 且没有输出。原因是 `apps/web-pwa/package.json` 当时没有 `test` 脚本，说明原入口未实际运行测试。

随后为满足严格 TDD，直接执行已可解析到的 Vitest：

```sh
corepack pnpm --filter web-pwa exec vitest run src/lib/navigation-state.test.ts
```

退出码为 `1`，关键输出：

```text
FAIL src/lib/navigation-state.test.ts
Error: Cannot find module './navigation-state'
Test Files 1 failed (1)
```

### GREEN

```sh
corepack pnpm --filter web-pwa test -- src/lib/navigation-state.test.ts
```

退出码为 `0`，关键输出：

```text
Test Files 1 passed (1)
Tests 2 passed (2)
```

## 改动文件

- 修改 `apps/web-pwa/package.json`：添加 `test: vitest run`，将 lint 改为 ESLint CLI。
- 新增 `apps/web-pwa/vitest.config.ts`：Node 测试环境和 `@` 别名。
- 新增 `apps/web-pwa/src/lib/navigation-state.ts`：拥有 `AppView`、`RouteState`、默认状态、位置解析与序列化。
- 新增 `apps/web-pwa/src/lib/navigation-state.test.ts`：覆盖阅读页 URI 往返、非法视图和负章节。
- 修改 `apps/web-pwa/src/lib/route-store.ts`：复用导航状态模块，保留 `parseHash` 与 `serializeState` 兼容导出。
- 删除 `scripts/audit-pwa.js`。
- 新增本报告 `.superpowers/sdd/task-1-report.md`。

## 自审

- 书籍和任务 ID 在解析时解码、序列化时编码；无效百分号编码回退至默认路由。
- 章节只接受非负安全整数；阅读面板仅接受现有的 `toc`、`progress`、`ai`、`settings`。
- 默认状态在每次返回时复制，避免调用方共享可变对象。
- 没有新增生产依赖、开发依赖或锁文件变更。
- `route-store.ts` 仍管理订阅、快照和浏览器 History；纯导航语义已移出。

## 验证结果

```sh
corepack pnpm --filter web-pwa lint
corepack pnpm --filter web-pwa exec tsc --noEmit
git diff --check
```

三条命令均以退出码 `0` 完成。

```sh
corepack pnpm --filter web-pwa test
corepack pnpm test
```

两条全量测试命令都实际执行了 `web-pwa` 的 Vitest，但以退出码 `1` 结束。PWA 当前结果为 `3 failed | 3 passed` 文件、`2 failed | 8 passed` 测试，失败项如下：

- `apps/web-pwa/e2e/reader.spec.ts` 导入缺失的 `@playwright/test`。
- `apps/web-pwa/src/styles/themes.test.ts` 期望 `THEMES.paper` 为 `#F8F8F5/#2F2A24`，当前实现为 `#F4EFE6/#2C2621`。
- `apps/web-pwa/src/styles/default-ui-theme.test.ts` 有相同的主题色不一致。

根工作区测试在到达 PWA 前，`ai-core`、`gesture-core`、`shared-types`、`reader-core`、`storage-core`、`parser-core` 和 `api` 均通过；根命令失败由上述 PWA 项导致。

## 顾虑

任务简报限定的可修改文件没有包含上述 E2E 规格、主题测试或主题实现，因此未为制造全绿而改动它们，也没有通过 Vitest 排除规则隐藏这些失败。全量 PWA 与根工作区测试目前不能全绿，需由后续任务决定补齐 Playwright 依赖还是迁移该 E2E 规格，并校准主题测试与实现。

## 追踪修复与最终验证

控制器确认 `apps/web-pwa/e2e/reader.spec.ts` 是 Task 10 所属的 Playwright 规格，不应由 Vitest 收集；同时冻结设计文档 `UI/design-handoff-ai-dev-v1.0/03-design-tokens.md` 确认主题断言是正确的真相源。

### 本轮 RED

修复前重新执行：

```sh
corepack pnpm --filter web-pwa test
```

退出码为 `1`，关键输出：

```text
FAIL e2e/reader.spec.ts
Error: Cannot find package '@playwright/test'
FAIL src/styles/themes.test.ts
FAIL src/styles/default-ui-theme.test.ts
Test Files 3 failed | 3 passed (6)
Tests 2 failed | 8 passed (10)
```

### 修复

- `apps/web-pwa/vitest.config.ts` 明确仅收集 `src/**/*.test.ts` 与 `src/**/*.test.tsx`，未安装 Playwright。
- `apps/web-pwa/src/styles/themes.ts` 已将 `paper`、`sepia`、`green`、`warmGray`、`dark` 的背景色和文字色对齐冻结设计令牌及现有测试期望。

### 最终 GREEN

```sh
corepack pnpm --filter web-pwa test
CI=true corepack pnpm test
corepack pnpm --filter web-pwa lint
corepack pnpm --filter web-pwa exec tsc --noEmit
git diff --check
```

全部以退出码 `0` 完成。PWA 全量 Vitest 为 `5 passed` 文件、`10 passed` 测试；根工作区测试包含 PWA 在内的全部包均通过，API 为 `8 passed` 测试套件、`24 passed` 测试。

### 最终顾虑

无。Playwright 规格未被删除或修改，仅从 Vitest 的单元测试收集范围排除，留待 Task 10 使用其专属运行器执行。

## 审查修复：路由状态归一化

审查发现 `route-store.ts` 之前会将运行时未校验状态写入内存和 LocalStorage，快照 JSON 也会被直接信任；`useVirtualRouter.push` 对 reader URL 的手工拆解会丢失 `panel`。

### RED

先在 `navigation-state.test.ts` 添加归一化测试，覆盖负章节和非法面板归为 `null`、非法运行时视图回退 `library`，随后执行：

```sh
corepack pnpm --filter web-pwa test -- src/lib/navigation-state.test.ts
```

退出码为 `1`，关键输出：

```text
TypeError: normalizeRouteState is not a function
Test Files 1 failed (1)
Tests 1 failed | 2 passed (3)
```

### 修复

- `navigation-state.ts` 导出 `normalizeRouteState(input: unknown)`，以最小结构校验统一视图、书籍/任务 ID、章节和阅读面板；无效运行时状态回退默认书架状态。
- `serializeAppLocation`、快照保存/加载、`emitChange`、`navigateTo` 和 `replaceTo` 都在写入或使用状态前归一化，保证地址栏、内存和快照遵循同一语义。
- `useVirtualRouter.push` 改为复用 `parseAppLocation` 再导航，阅读器的 `chapter` 与 `panel` 都会保留；`/library?folderId=...` 继续写入 hash，保持书架文件夹筛选行为。

### GREEN 与最终验证

```sh
corepack pnpm --filter web-pwa test -- src/lib/navigation-state.test.ts
corepack pnpm --filter web-pwa test
CI=true corepack pnpm test
corepack pnpm --filter web-pwa lint
corepack pnpm --filter web-pwa exec tsc --noEmit
git diff --check
```

全部以退出码 `0` 完成。导航定向测试为 `1 passed` 文件、`3 passed` 测试；PWA 全量为 `5 passed` 文件、`11 passed` 测试；根 CI 测试包含所有工作区包均通过。
