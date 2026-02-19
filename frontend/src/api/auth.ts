import { apiFetch, setAccessToken } from "./apiClients";

export async function login(payload: { username: string; password: string; otp: string }) {
  const data = await apiFetch("/auth/login", { method: "POST", body: JSON.stringify(payload), skipAuth: true });
  setAccessToken(data.accessToken);
  return data;
}
