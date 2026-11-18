/**
 * 静态部署（GitHub Pages 等无后端环境）模式开关。
 *
 * NEXT_PUBLIC_STATIC_MODE=true 时，前端隐藏纯依赖后端、无本地替代的功能入口
 * （藏经阁），并在设置页与关键功能处给出友好提示；默认（未设置）保持完整功能，
 * 使本地开发、桌面/移动壳与带后端的部署行为完全不变（控制边界）。
 *
 * 该变量由 GitHub Pages 部署工作流注入，仅语义化"当前是纯静态站"，
 * 与 NEXT_PUBLIC_BASE_PATH（子路径）互不耦合：用户站部署到根域时 basePath 为空，
 * 但依然是静态站，因此不能用 basePath 推断本开关。
 */
export const isStaticMode: boolean =
  process.env.NEXT_PUBLIC_STATIC_MODE === "true";
