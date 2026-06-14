"use client";
import * as React from "react";
import Link from "next/link";
import { motion } from "motion/react";
import {
  BarChart3,
  Siren,
  Target,
  Timer,
  TrendingDown,
  TrendingUp,
  Sparkles,
  MapPin,
  Clock,
  Activity,
  CheckCircle2,
  AlertCircle,
  Radio,
  ShieldCheck,
  ArrowRight,
} from "lucide-react";
import { api, EMPTY_STATS } from "@/lib/api";
import type { Stats } from "@/lib/types";
import { pct, formatDuration, cn, SEVERITY_VI } from "@/lib/utils";
import { staggerContainer } from "@/lib/motion";
import { useUI } from "@/components/shell/ui-context";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { StatCard } from "@/components/dashboard/stat-card";
import {
  TrendArea,
  CategoryBar,
  SeverityDonut,
  CHART,
  SEVERITY_COLOR,
} from "@/components/charts/charts";
import { LiveDot } from "@/components/common/live-dot";
import { InsightList, useInsights } from "@/components/copilot/insight-cards";

// ---------------------------------------------------------------------------
// Zone risk helpers
// ---------------------------------------------------------------------------
function riskColor(risk: number): string {
  if (risk < 30) return "#10b981"; // green
  if (risk < 55) return "#f59e0b"; // amber
  if (risk < 75) return "#e0552a"; // orange
  return "#dc2626"; // red
}

function riskLabel(risk: number): string {
  if (risk < 30) return "Thấp";
  if (risk < 55) return "Trung bình";
  if (risk < 75) return "Cao";
  return "Nghiêm trọng";
}

function riskBadgeVariant(risk: number): "success" | "warning" | "danger" | "critical" {
  if (risk < 30) return "success";
  if (risk < 55) return "warning";
  if (risk < 75) return "danger";
  return "critical";
}

// ---------------------------------------------------------------------------
// Status breakdown tile config
// ---------------------------------------------------------------------------
const STATUS_CONFIG: Record<
  string,
  { label: string; icon: React.ElementType; color: string; bg: string }
> = {
  active: {
    label: "Mới",
    icon: Siren,
    color: "text-danger",
    bg: "bg-danger-soft",
  },
  acknowledged: {
    label: "Đã tiếp nhận",
    icon: AlertCircle,
    color: "text-warning",
    bg: "bg-warning-soft",
  },
  responding: {
    label: "Đang ứng phó",
    icon: Radio,
    color: "text-accent",
    bg: "bg-accent-soft",
  },
  resolved: {
    label: "Đã xử lý",
    icon: ShieldCheck,
    color: "text-success",
    bg: "bg-success-soft",
  },
};

// ---------------------------------------------------------------------------
// Page component
// ---------------------------------------------------------------------------
type TimeRange = "7d" | "14d" | "30d";

const RANGE_LABEL: Record<TimeRange, string> = {
  "7d": "7 ngày",
  "14d": "14 ngày",
  "30d": "30 ngày",
};

export default function AnalyticsPage() {
  const [stats, setStats] = React.useState<Stats>(EMPTY_STATS);
  const [range, setRange] = React.useState<TimeRange>("14d");
  const insights = useInsights(30000);
  const { askCopilot } = useUI();

  // Poll stats every 10 s
  const load = React.useCallback(async () => {
    const s = await api.stats();
    setStats(s);
  }, []);

  React.useEffect(() => {
    load();
    const t = setInterval(load, 10_000);
    return () => clearInterval(t);
  }, [load]);

  // Slice daily_data to the selected range for the trend chart label
  const trendLabel = `Số ca ngã · ${RANGE_LABEL[range]} qua`;

  // Rank zones by count descending
  const rankedZones = React.useMemo(
    () => [...stats.zone_breakdown].sort((a, b) => b.count - a.count),
    [stats.zone_breakdown]
  );

  const maxZoneCount = rankedZones[0]?.count ?? 1;

  return (
    <div className="space-y-6">
      {/* ------------------------------------------------------------------ */}
      {/* Header                                                              */}
      {/* ------------------------------------------------------------------ */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="space-y-1.5">
          <div className="flex items-center gap-2">
            <Badge variant="accent" className="gap-1.5">
              <LiveDot color="accent" className="size-1.5" />
              Trực tiếp
            </Badge>
            <span className="text-[12px] text-ink-3">
              Cập nhật mỗi 10 giây · {pct(stats.uptime, 2)} uptime
            </span>
          </div>
          <h1 className="text-[26px] font-bold tracking-tight text-ink">Phân tích</h1>
          <p className="text-[13px] text-ink-3">
            Hiệu năng phát hiện, xu hướng và rủi ro trên toàn bộ khu vực.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Time range tabs */}
          <Tabs value={range} onValueChange={(v) => setRange(v as TimeRange)}>
            <TabsList>
              <TabsTrigger value="7d">7 ngày</TabsTrigger>
              <TabsTrigger value="14d">14 ngày</TabsTrigger>
              <TabsTrigger value="30d">30 ngày</TabsTrigger>
            </TabsList>
          </Tabs>

          <Button
            size="sm"
            onClick={() => askCopilot("Summarize fall analytics and key risks")}
          >
            <Sparkles className="size-4" />
            Hỏi Trợ lý AI
          </Button>
        </div>
      </div>

      {/* ------------------------------------------------------------------ */}
      {/* KPI row                                                             */}
      {/* ------------------------------------------------------------------ */}
      <motion.div
        variants={staggerContainer}
        initial="hidden"
        animate="show"
        className="grid grid-cols-2 gap-4 lg:grid-cols-4"
      >
        <StatCard
          label="Tổng số ca ngã"
          value={stats.total_falls}
          icon={BarChart3}
          accent="accent"
          hint="Tất cả các lần phát hiện đã ghi nhận"
        />
        <StatCard
          label="Số ca ngã tuần này"
          value={stats.weekly_falls}
          icon={TrendingDown}
          accent="danger"
          trend={{ value: stats.weekly_change, goodWhenDown: true }}
          hint={
            stats.weekly_change > 0
              ? `+${stats.weekly_change}% so với tuần trước`
              : `${stats.weekly_change}% so với tuần trước`
          }
        />
        <StatCard
          label="Thời gian phản hồi TB"
          value={stats.avg_response_time}
          suffix="s"
          icon={Timer}
          accent="violet"
          hint="Số giây đến khi tiếp nhận"
        />
        <StatCard
          label="Độ chính xác phát hiện"
          value={stats.accuracy * 100}
          decimals={1}
          suffix="%"
          icon={Target}
          accent="success"
          hint="Điểm độ tin cậy trung bình"
        />
      </motion.div>

      {/* ------------------------------------------------------------------ */}
      {/* Bento grid                                                          */}
      {/* ------------------------------------------------------------------ */}
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-12">

        {/* ── Fall activity trend ──────────────────────────────────────── */}
        <Card className="xl:col-span-8">
          <CardHeader className="flex-row items-center justify-between">
            <div>
              <CardTitle>Diễn biến số ca ngã theo thời gian</CardTitle>
              <CardDescription>{trendLabel}</CardDescription>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-2xl font-bold tabular-nums text-ink">
                {stats.weekly_falls}
              </span>
              <Badge variant={stats.weekly_change > 0 ? "danger" : "success"}>
                {stats.weekly_change > 0 ? (
                  <TrendingUp className="size-3" />
                ) : (
                  <TrendingDown className="size-3" />
                )}
                {stats.weekly_change > 0 ? "+" : ""}
                {stats.weekly_change}% wk
              </Badge>
            </div>
          </CardHeader>
          <CardContent>
            <TrendArea
              data={stats.daily_data}
              xKey="label"
              yKey="falls"
              height={280}
              label="Số ca ngã"
            />
          </CardContent>
        </Card>

        {/* ── Severity distribution ────────────────────────────────────── */}
        <Card className="xl:col-span-4">
          <CardHeader>
            <CardTitle>Phân bố mức độ</CardTitle>
            <CardDescription>Tất cả sự cố đã ghi nhận</CardDescription>
          </CardHeader>
          <CardContent>
            <SeverityDonut data={stats.severity_breakdown} height={200} />
            <div className="mt-4 space-y-2">
              {stats.severity_breakdown.map((s) => (
                <div key={s.severity} className="flex items-center gap-2.5 text-[12.5px]">
                  <span
                    className="size-2.5 shrink-0 rounded-full"
                    style={{ background: SEVERITY_COLOR[s.severity] ?? CHART.teal }}
                  />
                  <span className="text-ink-2">{SEVERITY_VI[s.severity] ?? s.severity}</span>
                  <div className="ml-auto flex items-center gap-2">
                    <div className="h-1.5 w-16 overflow-hidden rounded-full bg-surface-2">
                      <div
                        className="h-full rounded-full transition-all duration-700"
                        style={{
                          width: `${
                            stats.severity_breakdown.reduce((a, b) => a + b.count, 0) > 0
                              ? (s.count /
                                  stats.severity_breakdown.reduce((a, b) => a + b.count, 0)) *
                                100
                              : 0
                          }%`,
                          background: SEVERITY_COLOR[s.severity] ?? CHART.teal,
                        }}
                      />
                    </div>
                    <span className="w-6 text-right font-semibold tabular-nums text-ink">
                      {s.count}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* ── Distribution by hour ─────────────────────────────────────── */}
        <Card className="xl:col-span-6">
          <CardHeader className="flex-row items-center gap-2">
            <Clock className="size-4 text-ink-3" />
            <div>
              <CardTitle>Phân bố theo giờ</CardTitle>
              <CardDescription>Số ca ngã theo giờ trong ngày · 7 ngày gần đây</CardDescription>
            </div>
          </CardHeader>
          <CardContent>
            <CategoryBar
              data={stats.hourly_data}
              xKey="hour"
              yKey="falls"
              color={CHART.teal}
              height={240}
              label="Số ca ngã"
            />
          </CardContent>
        </Card>

        {/* ── Incidents by zone ────────────────────────────────────────── */}
        <Card className="xl:col-span-6">
          <CardHeader className="flex-row items-center gap-2">
            <MapPin className="size-4 text-ink-3" />
            <div>
              <CardTitle>Sự cố theo khu vực</CardTitle>
              <CardDescription>Nhấn vào khu vực để hỏi AI đánh giá rủi ro</CardDescription>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <CategoryBar
              data={stats.zone_breakdown}
              xKey="zone"
              yKey="count"
              color={CHART.violet}
              height={200}
              label="Sự cố"
            />

            {/* Ranked zone list */}
            {rankedZones.length > 0 && (
              <div className="space-y-1.5">
                {rankedZones.map((z, idx) => (
                  <button
                    key={z.zone}
                    onClick={() => askCopilot(`Đánh giá rủi ro cho ${z.zone}`)}
                    className={cn(
                      "group w-full rounded-lg border border-line px-3 py-2 text-left",
                      "transition-all hover:border-accent-line hover:bg-accent-soft/40"
                    )}
                  >
                    <div className="flex items-center gap-2.5">
                      <span className="w-4 shrink-0 text-[11px] font-bold tabular-nums text-ink-4">
                        {idx + 1}
                      </span>
                      <span className="flex-1 truncate text-[13px] font-medium text-ink">
                        {z.zone}
                      </span>
                      <Badge variant={riskBadgeVariant(z.risk)} size="sm">
                        {riskLabel(z.risk)}
                      </Badge>
                      <span className="text-[12px] font-semibold tabular-nums text-ink-2">
                        {z.count}
                      </span>
                      <ArrowRight className="size-3.5 shrink-0 text-ink-4 opacity-0 transition-opacity group-hover:opacity-100" />
                    </div>
                    {/* Mini progress bar */}
                    <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-surface-2 pl-6">
                      <div
                        className="h-full rounded-full transition-all duration-700"
                        style={{
                          width: `${maxZoneCount > 0 ? (z.count / maxZoneCount) * 100 : 0}%`,
                          background: riskColor(z.risk),
                        }}
                      />
                    </div>
                  </button>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* ── Incident status & response ───────────────────────────────── */}
        <Card className="xl:col-span-8">
          <CardHeader className="flex-row items-center justify-between">
            <div className="flex items-center gap-2">
              <Activity className="size-4 text-ink-3" />
              <div>
                <CardTitle>Trạng thái &amp; ứng phó sự cố</CardTitle>
                <CardDescription>
                  Thời gian phản hồi TB:{" "}
                  <span className="font-semibold text-ink">
                    {formatDuration(stats.avg_response_time)}
                  </span>{" "}
                  · tỷ lệ đã xử lý{" "}
                  <span className="font-semibold text-ink">
                    {pct(stats.resolved_rate, 0)}
                  </span>
                </CardDescription>
              </div>
            </div>
            <div className="flex items-center gap-1.5 text-[12px] text-ink-4">
              <CheckCircle2 className="size-3.5 text-success" />
              <span>{pct(stats.resolved_rate, 0)} đã xử lý</span>
            </div>
          </CardHeader>
          <CardContent>
            {/* Status tiles */}
            <div className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
              {(["active", "acknowledged", "responding", "resolved"] as const).map((status) => {
                const cfg = STATUS_CONFIG[status];
                const Icon = cfg.icon;
                const entry = stats.status_breakdown.find((s) => s.status === status);
                const count = entry?.count ?? 0;
                const total = stats.status_breakdown.reduce((a, b) => a + b.count, 0);
                const share = total > 0 ? (count / total) * 100 : 0;

                return (
                  <div
                    key={status}
                    className="rounded-xl border border-line bg-surface p-3.5 shadow-xs"
                  >
                    <div className="flex items-center justify-between">
                      <div
                        className={cn(
                          "grid size-8 place-items-center rounded-lg",
                          cfg.bg
                        )}
                      >
                        <Icon className={cn("size-4", cfg.color)} />
                      </div>
                      <span className="text-[11px] font-medium text-ink-4">
                        {share.toFixed(0)}%
                      </span>
                    </div>
                    <div className="mt-2.5 text-[26px] font-bold leading-none tabular-nums text-ink">
                      {count}
                    </div>
                    <div className="mt-1 text-[11.5px] font-medium text-ink-3">{cfg.label}</div>
                    {/* Mini share bar */}
                    <div className="mt-2 h-1 overflow-hidden rounded-full bg-surface-2">
                      <div
                        className="h-full rounded-full transition-all duration-700"
                        style={{
                          width: `${share}%`,
                          background:
                            status === "active"
                              ? CHART.red
                              : status === "acknowledged"
                              ? CHART.amber
                              : status === "responding"
                              ? CHART.teal
                              : CHART.emerald,
                        }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Response insight line */}
            <div className="flex flex-wrap items-center gap-x-6 gap-y-2 rounded-xl border border-line bg-surface-2/60 px-4 py-3 text-[13px] text-ink-2">
              <span className="flex items-center gap-1.5">
                <Timer className="size-3.5 text-ink-4" />
                Thời gian tiếp nhận TB:{" "}
                <strong className="text-ink">
                  {formatDuration(stats.avg_response_time)}
                </strong>
              </span>
              <span className="flex items-center gap-1.5">
                <CheckCircle2 className="size-3.5 text-success" />
                Đã xử lý trong kỳ:{" "}
                <strong className="text-ink">
                  {stats.status_breakdown.find((s) => s.status === "resolved")?.count ?? 0}
                </strong>
              </span>
              <span className="flex items-center gap-1.5">
                <Activity className="size-3.5 text-ink-4" />
                Tỷ lệ xử lý:{" "}
                <strong className="text-ink">{pct(stats.resolved_rate, 1)}</strong>
              </span>
            </div>
          </CardContent>
        </Card>

        {/* ── AI Insights ──────────────────────────────────────────────── */}
        <Card className="xl:col-span-4">
          <CardHeader className="flex-row items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="grid size-7 place-items-center rounded-lg bg-gradient-to-br from-accent to-[#13b8a4] text-white">
                <Sparkles className="size-4" />
              </div>
              <CardTitle>Nhận định từ AI</CardTitle>
            </div>
            <Button asChild variant="ghost" size="sm">
              <Link href="/copilot" className="gap-1 text-[12px]">
                Mở Trợ lý AI <ArrowRight className="size-3" />
              </Link>
            </Button>
          </CardHeader>
          <CardContent className="max-h-[400px] overflow-y-auto no-scrollbar">
            <InsightList insights={insights} max={4} />
          </CardContent>
        </Card>
      </div>

      {/* Footer */}
      <p className="pt-2 text-center text-[11px] text-ink-4">
        Aegis · YOLO-Pose detection · {pct(stats.uptime, 2)} uptime · chế độ phân tích
      </p>
    </div>
  );
}
