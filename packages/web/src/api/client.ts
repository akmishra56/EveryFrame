export class ApiError extends Error {
  status: number;
  code?: string;
  constructor(status: number, message: string, code?: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

let csrfTokenCache: string | null = null;

async function getCsrfToken(): Promise<string> {
  if (csrfTokenCache) return csrfTokenCache;
  const res = await fetch('/api/auth/csrf-token', { credentials: 'include' });
  const json = await res.json();
  csrfTokenCache = json.csrfToken as string;
  return csrfTokenCache;
}

/** Call after logout, or on a 403 csrf failure, so the next mutating request fetches a fresh token. */
export function clearCsrfCache(): void {
  csrfTokenCache = null;
}

interface RequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE';
  body?: unknown;
}

async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const method = options.method ?? 'GET';
  const headers: Record<string, string> = {};
  let body: string | undefined;
  if (options.body !== undefined) {
    headers['Content-Type'] = 'application/json';
    body = JSON.stringify(options.body);
  }
  if (method !== 'GET') {
    headers['x-csrf-token'] = await getCsrfToken();
  }

  const res = await fetch(path, { method, headers, body, credentials: 'include' });
  const json = await res.json().catch(() => null);

  if (!res.ok) {
    throw new ApiError(res.status, json?.message ?? `Request failed with status ${res.status}`, json?.error);
  }
  return json as T;
}

export const api = {
  get: <T>(path: string): Promise<T> => request<T>(path),
  post: <T>(path: string, body?: unknown): Promise<T> => request<T>(path, { method: 'POST', body }),
  put: <T>(path: string, body?: unknown): Promise<T> => request<T>(path, { method: 'PUT', body }),
};
