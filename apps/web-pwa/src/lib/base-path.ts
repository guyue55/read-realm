/**
 * GitHub Pages 项目站 basePath 支持。
 *
 * NEXT_PUBLIC_BASE_PATH 为空（默认）时保持根域行为，所有函数退化为原样返回；
 * 设值（如 /read-realm）时为项目站的所有绝对路径加前缀。
 * 该变量由 next.config.mjs 在同一次构建中读取，前端与构建配置共用同一套规范化规则。
 */

/** 构建期注入的原始值（Next.js 会把 NEXT_PUBLIC_* 静态替换进 bundle）。 */
const RAW_BASE_PATH = process.env.NEXT_PUBLIC_BASE_PATH ?? "";

/**
 * 规范化后的 basePath：去除首尾斜杠后补一个前导斜杠；
 * 根域模式返回空字符串。例："/read-realm/" → "/read-realm"，"" → ""。
 */
export const normalizedBasePath: string = RAW_BASE_PATH
  ? `/${RAW_BASE_PATH.replace(/^\/+|\/+$/g, "")}`
  : "";

/**
 * 给应用内的绝对路径加 basePath 前缀。
 * 根域模式下原样返回，保证历史行为完全不变。
 */
export function withBasePath(path: string): string {
  if (!normalizedBasePath) return path;
  if (path === "/") return normalizedBasePath;
  return `${normalizedBasePath}${path.startsWith("/") ? path : `/${path}`}`;
}

/**
 * Service Worker 的 scope：与 next-pwa 内部 path.posix.join(basePath, '/') 保持一致，
 * 始终带尾斜杠（根域 "/"、项目站 "/read-realm/"），避免 getRegistration 与 register
 * 因 scope 不一致而重复注册或匹配失败。
 */
export function swScope(): string {
  return normalizedBasePath ? `${normalizedBasePath}/` : "/";
}

/**
 * 从 window.location.pathname 剥离 basePath 前缀，得到「应用逻辑路径」。
 * 静态导出下业务路由都在 hash 里，pathname 通常只应是 basePath 或 basePath + "/"；
 * 但历史直链（如 /read-realm/reader/xxx）仍可能残留，需原样保留给 hash 跳转。
 */
export function appPathname(pathname: string): string {
  if (!normalizedBasePath) return pathname;
  if (pathname === normalizedBasePath || pathname === `${normalizedBasePath}/`) {
    return "/";
  }
  if (pathname.startsWith(`${normalizedBasePath}/`)) {
    return pathname.slice(normalizedBasePath.length);
  }
  return pathname;
}

/**
 * 旧式直链（pathname 不是应用根路径）收敛到 hash 路由的目标 URL。
 * 返回 null 表示当前路径即应用根，无需跳转。
 * 根域模式目标形如 "/#/reader/x"，项目站模式形如 "/read-realm#/reader/x"；
 * 两种情况都与历史 "/#..." 语义一致，只是项目站多了 basePath 前缀。
 */
export function resolveHashRedirect(
  pathname: string,
  search: string,
): string | null {
  const appPath = appPathname(pathname);
  if (appPath === "/") return null;
  return `${withBasePath("/")}#${appPath}${search}`;
}
