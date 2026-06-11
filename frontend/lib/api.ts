// Centralised backend endpoints.
//
// Override at build/run time via .env(.local):
//   NEXT_PUBLIC_API_BASE   e.g. https://xxxx.trycloudflare.com   (cloud GPU backend)
//   NEXT_PUBLIC_WS_BASE    e.g. wss://xxxx.trycloudflare.com      (optional)
//
// When only NEXT_PUBLIC_API_BASE is set, the WebSocket base is derived from it
// (http -> ws, https -> wss). With nothing set, it falls back to the local
// dev backend so the app keeps working out of the box.

function stripTrailingSlash(u: string): string {
  return u.replace(/\/+$/, "");
}

function deriveWs(apiBase?: string): string | undefined {
  if (!apiBase) return undefined;
  if (apiBase.startsWith("https://")) return "wss://" + apiBase.slice("https://".length);
  if (apiBase.startsWith("http://")) return "ws://" + apiBase.slice("http://".length);
  return undefined;
}

export const API_BASE = stripTrailingSlash(
  process.env.NEXT_PUBLIC_API_BASE || "http://localhost:8000"
);

export const WS_BASE = stripTrailingSlash(
  process.env.NEXT_PUBLIC_WS_BASE ||
    deriveWs(process.env.NEXT_PUBLIC_API_BASE) ||
    "ws://127.0.0.1:8000"
);

/** Build an absolute backend API URL from a path, e.g. apiUrl("/api/stats"). */
export function apiUrl(path: string): string {
  return `${API_BASE}/${path.replace(/^\/+/, "")}`;
}

/** Build an absolute backend WebSocket URL from a path, e.g. wsUrl("/ws/predict"). */
export function wsUrl(path: string): string {
  return `${WS_BASE}/${path.replace(/^\/+/, "")}`;
}
