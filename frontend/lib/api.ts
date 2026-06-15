// Centralised, typed backend client.
//
// Override at build/run time via .env(.local):
//   NEXT_PUBLIC_API_BASE   e.g. https://xxxx.trycloudflare.com (cloud GPU backend)
//   NEXT_PUBLIC_WS_BASE    e.g. wss://xxxx.trycloudflare.com   (optional)

import type {
  Stats,
  FallEvent,
  Insight,
  RiskAssessment,
  AgentAnswer,
  SystemInfo,
} from "./types";

function stripTrailingSlash(u: string): string {
  return u.replace(/\/+$/, "");
}

function deriveWs(apiBase?: string): string | undefined {
  if (!apiBase) return undefined;
  if (apiBase.startsWith("https://")) return "wss://" + apiBase.slice(8);
  if (apiBase.startsWith("http://")) return "ws://" + apiBase.slice(7);
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

export function apiUrl(path: string): string {
  return `${API_BASE}/${path.replace(/^\/+/, "")}`;
}

export function wsUrl(path: string): string {
  return `${WS_BASE}/${path.replace(/^\/+/, "")}`;
}

/** Absolute URL for a snapshot path returned by the backend. */
export function snapshotUrl(imagePath: string | null | undefined): string | null {
  if (!imagePath) return null;
  if (imagePath.startsWith("http")) return imagePath;
  return `${API_BASE}${imagePath}`;
}

async function getJSON<T>(path: string, fallback: T): Promise<T> {
  try {
    const res = await fetch(apiUrl(path), { cache: "no-store" });
    if (!res.ok) return fallback;
    return (await res.json()) as T;
  } catch {
    return fallback;
  }
}

async function postJSON<T>(path: string, body: unknown, fallback: T): Promise<T> {
  try {
    const res = await fetch(apiUrl(path), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) return fallback;
    return (await res.json()) as T;
  } catch {
    return fallback;
  }
}

export const EMPTY_STATS: Stats = {
  total_falls: 0,
  today_falls: 0,
  weekly_falls: 0,
  weekly_change: 0,
  active_incidents: 0,
  accuracy: 0,
  avg_response_time: 0,
  resolved_rate: 0,
  uptime: 0.999,
  hourly_data: [],
  daily_data: [],
  severity_breakdown: [],
  zone_breakdown: [],
  status_breakdown: [],
};

export const api = {
  stats: () => getJSON<Stats>("/api/stats", EMPTY_STATS),

  events: (params?: {
    limit?: number;
    severity?: string;
    zone?: string;
    status?: string;
    q?: string;
  }) => {
    const sp = new URLSearchParams();
    if (params?.limit) sp.set("limit", String(params.limit));
    if (params?.severity && params.severity !== "all") sp.set("severity", params.severity);
    if (params?.zone && params.zone !== "all") sp.set("zone", params.zone);
    if (params?.status && params.status !== "all") sp.set("status", params.status);
    if (params?.q) sp.set("q", params.q);
    const qs = sp.toString();
    return getJSON<FallEvent[]>(`/api/events${qs ? `?${qs}` : ""}`, []);
  },

  acknowledgeEvent: (id: number) =>
    postJSON<{ status: string }>(`/api/events/${id}/ack`, {}, { status: "error" }),
  respondEvent: (id: number) =>
    postJSON<{ status: string }>(`/api/events/${id}/respond`, {}, { status: "error" }),
  resolveEvent: (id: number, outcome: string) =>
    postJSON<{ status: string }>(`/api/events/${id}/resolve`, { outcome }, { status: "error" }),

  insights: () =>
    getJSON<{ insights: Insight[]; mode: string; generated_at: string }>("/api/insights", {
      insights: [],
      mode: "rule_based",
      generated_at: "",
    }),

  risk: (type: "zone" | "system", id: string) =>
    getJSON<RiskAssessment>(`/api/risk?type=${type}&id=${encodeURIComponent(id)}`, {
      target_type: type,
      target_id: id,
      score: 0,
      level: "low",
      factors: [],
      recommendations: [],
    }),

  agentQuery: (question: string) =>
    postJSON<AgentAnswer>("/api/agent/query", { question }, {
      answer:
        "I couldn't reach the analysis engine. Make sure the backend is running on port 8000.",
      mode: "grounded",
      tools_used: [],
      chart: null,
      table: null,
      citations: [],
      suggestions: [],
    }),

  seed: (n = 220) => postJSON<{ status: string; inserted: number }>("/api/seed", { n }, { status: "error", inserted: 0 }),

  clearData: () => postJSON<{ status: string }>("/api/system/clear-data", {}, { status: "error" }),

  systemInfo: () =>
    getJSON<SystemInfo>("/api/system/info", {
      yolo_version: "—",
      model_path: "—",
      detection_method: "—",
      features: [],
    }),

  deleteSnapshot: (id: number) =>
    fetch(apiUrl(`/api/snapshots/${id}`), { method: "DELETE" }).catch(() => undefined),

  // An event IS a detection row, so deleting the row removes the incident
  // (and its snapshot). Reuses the existing DELETE /api/snapshots/{id}.
  deleteEvent: (id: number) =>
    fetch(apiUrl(`/api/snapshots/${id}`), { method: "DELETE" })
      .then((r) => r.ok)
      .catch(() => false),
};
