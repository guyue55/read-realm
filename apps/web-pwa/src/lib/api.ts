const API_PORT = '3001';

export function getApiBaseUrl() {
  if (typeof window === 'undefined') {
    return `http://127.0.0.1:${API_PORT}`;
  }

  return `${window.location.protocol}//${window.location.hostname}:${API_PORT}`;
}

export function apiUrl(path: string) {
  return `${getApiBaseUrl()}${path}`;
}
