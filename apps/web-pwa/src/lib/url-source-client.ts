import type { ParsedBook } from "@reader/parser-core";
import { apiUrl, getShareHeaders } from "./api";
import { parseUrlBookInBrowser } from "./url-import";
import {
  assertAuthorizedPublicSourceUrl,
  shouldUseBackendUrlFallback,
} from "./url-source-policy";

export async function parseAuthorizedUrlSource(
  rawUrl: string,
  rightsConfirmed: boolean,
  onProgress?: (message: string) => void,
): Promise<ParsedBook> {
  const url = assertAuthorizedPublicSourceUrl(rawUrl, rightsConfirmed);
  try {
    return await parseUrlBookInBrowser(url, onProgress);
  } catch (error) {
    if (!shouldUseBackendUrlFallback(error)) throw error;
    onProgress?.("浏览器受 CORS 或网络拓扑限制，改由本机服务读取公开页面…");
    const response = await fetch(apiUrl("/imports/url/parse"), {
      method: "POST",
      headers: { "Content-Type": "application/json", ...getShareHeaders() },
      body: JSON.stringify({ url, rightsConfirmed: true }),
    });
    if (!response.ok) {
      const detail = await response.text();
      let message = detail;
      try {
        const parsed = JSON.parse(detail) as { message?: string | string[] };
        message = Array.isArray(parsed.message)
          ? parsed.message.join("，")
          : parsed.message || detail;
      } catch {
        message = detail;
      }
      throw new Error(message || `后端解析失败：HTTP ${response.status}`);
    }
    return (await response.json()) as ParsedBook;
  }
}
