const TOKEN_KEY = "zeppole_session_token";

export function getToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

export function setToken(token: string | null): void {
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token);
    else localStorage.removeItem(TOKEN_KEY);
  } catch {
    /* storage disabled or quota — ignore */
  }
}

/** Same-origin `/api/v1` in production (nginx proxy); dev uses Vite proxy. */
export function apiBase(): string {
  const env = import.meta.env.VITE_API_BASE as string | undefined;
  if (env) return env.replace(/\/$/, "");
  return "/api/v1";
}

export async function api<T>(
  path: string,
  options: RequestInit & { json?: unknown } = {},
): Promise<T> {
  const { json, headers, ...rest } = options;
  const token = getToken();
  const res = await fetch(`${apiBase()}${path}`, {
    ...rest,
    headers: {
      Accept: "application/json",
      ...(json !== undefined ? { "Content-Type": "application/json" } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...headers,
    },
    body: json !== undefined ? JSON.stringify(json) : rest.body,
  });
  if (res.status === 204) return undefined as T;
  const text = await res.text();
  let data: unknown;
  try {
    data = text ? JSON.parse(text) : undefined;
  } catch {
    throw new Error(
      res.ok
        ? `Invalid JSON from API (${path})`
        : `API error ${res.status} (${path}): ${text.slice(0, 200)}`,
    );
  }
  if (!res.ok) {
    const msg = (data as { error?: string })?.error ?? res.statusText;
    throw new Error(msg);
  }
  return data as T;
}
