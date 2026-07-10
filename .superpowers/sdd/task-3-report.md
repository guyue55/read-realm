# Task 3 执行报告

## 范围

- 建立单一语义设计令牌、强国风产品语言和五项导航表。
- 新增图标按钮、分段控制和状态提示三个基础控件。
- `AppShell` 成为桌面侧栏、移动底栏、在线状态与滚动记忆的唯一外壳。
- `PageLayout` 收敛为薄适配器，删除重复 `Sidebar`。
- 删除三处远程字体入口与全局禁止文本选择，补齐减少动效模式。

## RED / GREEN

先新增 `ui-tokens.test.ts` 与 `product-language.test.ts`，定向测试因缺少 `APP_NAV_ITEMS`、`UI_TOKENS` 和 `PRODUCT_LANGUAGE` 两个 suite 失败。

实现后结果：

- Web Vitest：7/7 文件、17/17 测试通过。
- Web ESLint：0 warning / 0 error。
- TypeScript `tsc --noEmit`：通过。
- Next.js 生产构建：13/13 静态页面生成，shared first load 102 kB。
- `pnpm audit --prod`：无已知漏洞。
- `git diff --check`：通过。

## 设计与维护边界

- 可见诗意标签集中在 `PRODUCT_LANGUAGE`；Tooltip、`aria-label` 和辅助说明使用白话中文。
- 删除、权限、错误、隐私与恢复操作不得只使用隐喻，`deleteBook` 明确为“删除书籍及本地章节”。
- 配色由暖白、炭黑、松柏绿、天青和低饱和朱砂组成；卡片圆角令牌为 8px。
- 使用本地 Geist 与系统中文宋/楷字体栈，不再依赖 Google Fonts 或 LXGW CDN。
- 只增加 `lucide-react`，简单过渡继续使用 CSS；没有为外壳引入 GSAP 运行时。

## 活体验收

- 桌面 1440×1000：页面 `scrollWidth = clientWidth = 1440`；桌面导航可见、移动导航隐藏；五项导航及白话可访问名称完整。
- 移动 390×844：页面 `scrollWidth = clientWidth = 390`；移动导航为 374×70，位于安全区上方；书架、寻书、纳书、笺注、设置均可见且无文字溢出。
- 笺注页面稳定态只显示统一外壳，返回按钮与移动导航无重叠。

## 后续已知项

- 书架与笺注页面自身仍含“18 天”等虚构修行数据和旧大圆角卡片，不属于外壳；已分别纳入 Task 5 与 Task 9，不能据此宣称 UI 全部完成。
- 未启动 API 时书架会记录云端请求失败；真实状态与降级体验由 Task 5 统一处理。
- 根页面仍同步装载所有业务视图，生产根路由 First Load JS 为 268 kB；由 Task 4 的动态加载切片处理。
