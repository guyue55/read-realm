/**
 * @file url-fetch-preference.ts
 * @description URL 抓取档位偏好的本地存储（localStorage）。
 *
 * 职责：
 * - 持久化「标准/激进」档位与第三方通道开关；
 * - 读写统一走 url-source-policy 的 parse/createDefault 校验，保证数据契约一致；
 * - 供设置页展示与导入页读取。
 */

import {
  createDefaultUrlFetchPreference,
  parseUrlFetchPreference,
  type UrlFetchPreference,
} from "../url-source-policy";

const STORAGE_KEY = "url-fetch-preference";

/** 从 localStorage 读取抓取档位（无存储/损坏回退默认） */
export function loadUrlFetchPreference(): UrlFetchPreference {
  if (typeof window === "undefined") return createDefaultUrlFetchPreference();
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return createDefaultUrlFetchPreference();
    const parsed = JSON.parse(raw) as unknown;
    return parseUrlFetchPreference(parsed);
  } catch {
    return createDefaultUrlFetchPreference();
  }
}

/** 保存抓取档位到 localStorage（非法值抛错，由调用方展示） */
export function saveUrlFetchPreference(
  preference: UrlFetchPreference,
): void {
  if (typeof window === "undefined") return;
  const normalized = parseUrlFetchPreference(preference);
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(normalized));
}

/** 纯函数版：供测试与 SSR 安全场景使用 */
export function loadUrlFetchPreferenceFromStorage(
  storage: Pick<Storage, "getItem">,
): UrlFetchPreference {
  try {
    const raw = storage.getItem(STORAGE_KEY);
    if (!raw) return createDefaultUrlFetchPreference();
    return parseUrlFetchPreference(JSON.parse(raw) as unknown);
  } catch {
    return createDefaultUrlFetchPreference();
  }
}

export function saveUrlFetchPreferenceToStorage(
  storage: Pick<Storage, "setItem">,
  preference: UrlFetchPreference,
): void {
  const normalized = parseUrlFetchPreference(preference);
  storage.setItem(STORAGE_KEY, JSON.stringify(normalized));
}
