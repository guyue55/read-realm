export interface SourceCheckPreference {
  enabled: boolean;
  intervalHours: 6 | 12 | 24 | 72 | 168;
}

export interface UrlSourceCheckPreview {
  status: "current" | "update_available";
  remoteTitle: string;
  remoteChapterCount: number;
  differences: string[];
}

/** URL 抓取档位：standard（默认，L0+L1）| aggressive（+L2 headless + 高并发） */
export type FetchTier = "standard" | "aggressive";

/** URL 抓取偏好（档位 + 第三方通道开关 + 并发联动） */
export interface UrlFetchPreference {
  tier: FetchTier;
  /** 第三方抓取通道（默认关闭，尊重"先显式启用"约束） */
  thirdPartyEnabled: boolean;
  /** 章节并发数（档位联动：标准 5 / 激进 10） */
  concurrency: 5 | 10;
}

const supportedIntervals = new Set([6, 12, 24, 72, 168]);

/** 档位 → fetcher 路由结果（纯函数，可测） */
export interface FetchTierRoute {
  /** 启用的抓取级别（L0 浏览器直连 / L1 本地 API / L2 headless） */
  levels: Array<"browser" | "api" | "headless">;
  /** 章节并发数 */
  concurrency: 5 | 10;
}

/** 档位 → 抓取级别与并发（纯函数：标准 L0+L1 并发 5；激进 +L2 并发 10） */
export function resolveFetchTier(preference: UrlFetchPreference): FetchTierRoute {
  if (preference.tier === "aggressive") {
    return { levels: ["browser", "api", "headless"], concurrency: 10 };
  }
  return { levels: ["browser", "api"], concurrency: 5 };
}

export function assertAuthorizedPublicSourceUrl(
  rawUrl: string,
  rightsConfirmed: boolean,
): string {
  let url: URL;
  try {
    url = new URL(rawUrl.trim());
  } catch {
    throw new Error("SOURCE_URL_INVALID");
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("SOURCE_URL_PROTOCOL_UNSUPPORTED");
  }
  if (url.username || url.password) {
    throw new Error("SOURCE_URL_EMBEDDED_CREDENTIALS_FORBIDDEN");
  }
  if (!rightsConfirmed) {
    throw new Error("SOURCE_RIGHTS_CONFIRMATION_REQUIRED");
  }
  url.hash = "";
  return url.toString();
}

export function createDefaultSourceCheckPreference(): SourceCheckPreference {
  return { enabled: false, intervalHours: 24 };
}

export function parseSourceCheckPreference(value: unknown): SourceCheckPreference {
  if (value === null || typeof value !== "object") {
    return createDefaultSourceCheckPreference();
  }
  const candidate = value as Record<string, unknown>;
  const enabled = candidate.enabled === true;
  const intervalHours = candidate.intervalHours;
  if (
    typeof intervalHours !== "number" ||
    !supportedIntervals.has(intervalHours)
  ) {
    throw new Error("SOURCE_CHECK_INTERVAL_UNSUPPORTED");
  }
  return {
    enabled,
    intervalHours: intervalHours as SourceCheckPreference["intervalHours"],
  };
}

export function nextSourceCheckAt(
  preference: SourceCheckPreference,
  lastCheckedAt: number,
): number | null {
  if (!preference.enabled) return null;
  return lastCheckedAt + preference.intervalHours * 60 * 60 * 1_000;
}

export function createUrlSourceCheckPreview(
  local: { title: string; chapterCount: number },
  remote: { title: string; chapters: readonly unknown[] },
): UrlSourceCheckPreview {
  const remoteTitle = remote.title.trim() || local.title;
  const remoteChapterCount = remote.chapters.length;
  const differences: string[] = [];
  if (remoteTitle !== local.title) {
    differences.push(`书名：${local.title} → ${remoteTitle}`);
  }
  if (remoteChapterCount !== local.chapterCount) {
    differences.push(`章节数：${local.chapterCount} → ${remoteChapterCount}`);
  }
  return {
    status: differences.length === 0 ? "current" : "update_available",
    remoteTitle,
    remoteChapterCount,
    differences,
  };
}

export function isSourceCheckDue(
  preference: SourceCheckPreference,
  lastCheckedAt?: string,
  now = new Date(),
): boolean {
  if (!preference.enabled) return false;
  if (!lastCheckedAt) return true;
  const checkedAt = Date.parse(lastCheckedAt);
  if (!Number.isFinite(checkedAt)) return true;
  return now.getTime() >= checkedAt + preference.intervalHours * 60 * 60 * 1_000;
}

/** 默认抓取档位：标准（L0+L1，并发 5），第三方通道关闭 */
export function createDefaultUrlFetchPreference(): UrlFetchPreference {
  return { tier: "standard", thirdPartyEnabled: false, concurrency: 5 };
}

/** 校验并解析抓取档位偏好（非法值回退默认；tier 非法抛错） */
export function parseUrlFetchPreference(value: unknown): UrlFetchPreference {
  if (value === null || typeof value !== "object") {
    return createDefaultUrlFetchPreference();
  }
  const candidate = value as Record<string, unknown>;
  const tier = candidate.tier;
  if (tier !== "standard" && tier !== "aggressive") {
    throw new Error("URL_FETCH_TIER_UNSUPPORTED");
  }
  const thirdPartyEnabled = candidate.thirdPartyEnabled === true;
  return {
    tier,
    thirdPartyEnabled,
    concurrency: tier === "aggressive" ? 10 : 5,
  };
}
