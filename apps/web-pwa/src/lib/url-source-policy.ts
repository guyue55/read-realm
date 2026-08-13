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

const supportedIntervals = new Set([6, 12, 24, 72, 168]);

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

export function shouldUseBackendUrlFallback(error: unknown): boolean {
  return error instanceof TypeError && /fetch|network|cors|load/i.test(error.message);
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
