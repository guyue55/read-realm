const DEFAULT_API_PORT = "4000";

export function getApiBaseUrl() {
  const configuredBaseUrl = process.env.NEXT_PUBLIC_API_BASE_URL;
  if (configuredBaseUrl) return configuredBaseUrl.replace(/\/$/, "");

  const apiPort = process.env.NEXT_PUBLIC_API_PORT || DEFAULT_API_PORT;

  if (typeof window === "undefined") {
    return `http://127.0.0.1:${apiPort}`;
  }

  return `${window.location.protocol}//${window.location.hostname}:${apiPort}`;
}

export function apiUrl(path: string) {
  return `${getApiBaseUrl()}${path}`;
}
