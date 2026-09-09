import type { ParsedBook } from "@reader/parser-core";
import { parseUrlBookInBrowserWithFetchers } from "./url-import/index";
import { assertAuthorizedPublicSourceUrl } from "./url-source-policy";

/**
 * 解析授权公开来源 URL 为 ParsedBook。
 *
 * 设计（阶段 D/F）：纯前端解析 + 多级抓取（L0 浏览器直连 → L1 本地 API 网络桥 → L2 headless）。
 * 不再回退后端解析接口（后端解析已停用）；CORS/UA 限制由多级抓取在内部解决。
 * 抓取档位（标准/激进）由调用方传入（设置页偏好 → 导入页读取）。
 *
 * @param rawUrl 原始 URL（需通过授权校验）
 * @param rightsConfirmed 是否已确认有权访问和保存该公开来源
 * @param options 抓取档位与进度回调
 */
export async function parseAuthorizedUrlSource(
  rawUrl: string,
  rightsConfirmed: boolean,
  options?:
    | ((message: string) => void)
    | { onProgress?: (message: string) => void; tier?: "standard" | "aggressive" },
): Promise<ParsedBook> {
  const url = assertAuthorizedPublicSourceUrl(rawUrl, rightsConfirmed);

  // 兼容旧签名：第三个参数为字符串进度回调
  if (typeof options === "function") {
    return parseUrlBookInBrowserWithFetchers(url, { onProgress: options });
  }
  return parseUrlBookInBrowserWithFetchers(url, {
    onProgress: options?.onProgress,
    tier: options?.tier,
  });
}
