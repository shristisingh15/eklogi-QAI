const API_BASE = import.meta.env.VITE_API_BASE || "https://exacoda-qai-q8up.onrender.com";
let accessToken: string | null = null;

export function setAccessToken(token: string | null) { accessToken = token; }

async function handleResponse(res: Response) {
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err: any = new Error(data?.message || `HTTP ${res.status}`);
    err.status = res.status; err.code = data?.code; err.details = data;
    throw err;
  }
  return data;
}

export async function apiFetch(path: string, init: RequestInit & { skipAuth?: boolean } = {}) {
  const { skipAuth, ...rest } = init;
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(accessToken && !skipAuth ? { Authorization: `Bearer ${accessToken}` } : {})
  };
  return handleResponse(await fetch(`${API_BASE}${path}`, { ...rest, headers: { ...headers, ...(init.headers as any) } }));
}
