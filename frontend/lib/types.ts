// ============================================================================
// Shared domain types for Aegis (fall-detection command center)
// ============================================================================

export type Severity = "low" | "medium" | "high" | "critical";
export type IncidentStatus = "active" | "acknowledged" | "responding" | "resolved";
export type DetectionStatus = "standing" | "sitting" | "falling" | "fallen" | "unknown";

export interface FallEvent {
  id: number;
  type: string;
  confidence: number; // 0..1
  severity: Severity;
  status: IncidentStatus;
  zone: string;
  camera: string;
  image_path: string | null;
  image_url: string | null; // absolute URL to snapshot
  timestamp: string; // "YYYY-MM-DD HH:MM:SS"
  response_time: number | null; // seconds to acknowledge
  immobile_seconds: number;
  reasons: string[];
  narrative: string | null;
  outcome: string | null;
}

export interface Stats {
  total_falls: number;
  today_falls: number;
  weekly_falls: number;
  weekly_change: number;
  active_incidents: number;
  accuracy: number; // 0..1 (avg confidence)
  avg_response_time: number; // seconds
  resolved_rate: number; // 0..1
  uptime: number; // 0..1
  hourly_data: { hour: string; falls: number }[];
  daily_data: { date: string; label: string; falls: number }[];
  severity_breakdown: { severity: Severity; count: number }[];
  zone_breakdown: { zone: string; count: number; risk: number }[];
  status_breakdown: { status: IncidentStatus; count: number }[];
}

export type InsightKind =
  | "peak_hour"
  | "trend"
  | "risk_zone"
  | "response_time"
  | "anomaly"
  | "summary";

export interface Insight {
  id: string;
  kind: InsightKind;
  severity: "info" | "warning" | "critical" | "success";
  title: string;
  body: string;
  metric: string | null;
  citation: string | null;
  suggested_prompt: string | null;
}

export interface RiskFactor {
  label: string;
  weight: number; // contribution points
}

export interface RiskAssessment {
  target_type: "zone" | "system";
  target_id: string;
  score: number; // 0..100
  level: "low" | "moderate" | "elevated" | "high";
  factors: RiskFactor[];
  recommendations: string[];
}

export interface AgentChart {
  kind: "bar" | "line" | "area" | "donut";
  x_key: string;
  y_key: string;
  data: Record<string, unknown>[];
  label?: string;
}

export interface AgentAnswer {
  answer: string;
  mode: "grounded" | "llm";
  tools_used: { name: string; summary: string }[];
  chart: AgentChart | null;
  table: Record<string, unknown>[] | null;
  citations: string[];
  suggestions: string[];
}

// Live detection (over WebSocket)
export interface LiveDetection {
  box: [number, number, number, number]; // x1,y1,x2,y2 in source pixels
  confidence: number;
  class_id: number;
  class_name: DetectionStatus;
  is_fall: boolean;
  fall_confidence: number;
}

export interface LiveFrameResult {
  detections: LiveDetection[];
  fall_detected: boolean;
}

export interface SystemInfo {
  yolo_version: string;
  model_path: string;
  detection_method: string;
  features: string[];
  device?: string;
  llm_enabled?: boolean;
}
