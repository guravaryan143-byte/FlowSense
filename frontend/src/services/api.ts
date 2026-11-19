import axios, { AxiosError } from "axios";

/** Empty in development (Vite proxies /api and /ws). In production set VITE_API_URL=https://your-backend. */
export const API_BASE: string = (import.meta.env.VITE_API_URL as string | undefined)?.replace(/\/$/, "") ?? "";
const TOKEN_KEY = "flowsense.token";
export const UNAUTHORIZED_EVENT = "flowsense:unauthorized";

/** localStorage can throw (private mode, blocked storage), so every access is guarded. */
export const tokenStore = {
  get(): string | null {
    try { return localStorage.getItem(TOKEN_KEY); } catch { return null; }
  },
  set(token: string): void {
    try { localStorage.setItem(TOKEN_KEY, token); } catch { /* ignore */ }
  },
  clear(): void {
    try { localStorage.removeItem(TOKEN_KEY); } catch { /* ignore */ }
  },
};

export const api = axios.create({ baseURL: API_BASE, timeout: 20000 });

api.interceptors.request.use((config) => {
  const token = tokenStore.get();
  if (token) config.headers.set("Authorization", `Bearer ${token}`);
  return config;
});

api.interceptors.response.use(
  (r) => r,
  (error: AxiosError) => {
    const isLogin = error.config?.url?.includes("/auth/login");
    if (error.response?.status === 401 && !isLogin) {
      tokenStore.clear();
      window.dispatchEvent(new Event(UNAUTHORIZED_EVENT));
    }
    return Promise.reject(error);
  },
);

interface ApiErrorBody { error?: string; message?: string; details?: { field: string; message: string }[] }

/** Turn any thrown value into a message that is safe and useful to show in the UI. */
export function errorMessage(err: unknown): string {
  if (axios.isAxiosError(err)) {
    if (err.code === "ECONNABORTED") return "The server took too long to respond.";
    if (!err.response) return "Cannot reach the FlowSense API. Is the backend running?";
    const body = err.response.data as ApiErrorBody | undefined;
    if (body?.details?.length) return body.details.map((d) => (d.field ? `${d.field}: ${d.message}` : d.message)).join("; ");
    if (body?.message) return body.message;
    return `Request failed (${err.response.status}).`;
  }
  return err instanceof Error ? err.message : "Something went wrong.";
}

export function wsUrl(): string {
  if (API_BASE) return API_BASE.replace(/^http/, "ws") + "/ws/traffic";
  const proto = window.location.protocol === "https:" ? "wss" : "ws";
  return `${proto}://${window.location.host}/ws/traffic`;
}
