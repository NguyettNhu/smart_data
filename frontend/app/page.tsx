"use client";
import * as React from "react";
import Link from "next/link";
import { motion } from "motion/react";
import {
  Siren,
  ShieldAlert,
  Target,
  Timer,
  CheckCircle2,
  Sparkles,
  Clock,
  MapPin,
  Activity,
  ArrowRight,
  Database,
  Video,
} from "lucide-react";
import { api } from "@/lib/api";
import type { Stats, FallEvent } from "@/lib/types";
import { EMPTY_STATS } from "@/lib/api";
import { pct, SEVERITY_VI } from "@/lib/utils";
import { staggerContainer } from "@/lib/motion";
import { useUI } from "@/components/shell/ui-context";
import { useToast } from "@/components/ui/toast";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { LiveDot } from "@/components/common/live-dot";
import { StatCard } from "@/components/dashboard/stat-card";
import { RecentIncidents } from "@/components/dashboard/recent-incidents";
import { ZoneRisk } from "@/components/dashboard/zone-risk";
import { TrendArea, CategoryBar, SeverityDonut, SEVERITY_COLOR } from "@/components/charts/charts";
import { InsightList, useInsights } from "@/components/copilot/insight-cards";

export default function CommandCenter() {
  const [stats, setStats] = React.useState<Stats>(EMPTY_STATS);
  const [events, setEvents] = React.useState<FallEvent[] | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [seeding, setSeeding] = React.useState(false);
  const insights = useInsights(30000);
  const { askCopilot } = useUI();
  const { toast } = useToast();

  const load = React.useCallback(async () => {
    const [s, e] = await Promise.all([api.stats(), api.events({ limit: 7 })]);
    setStats(s);
    setEvents(e);
    setLoading(false);
  }, []);

  React.useEffect(() => {
    load();
    const t = setInterval(load, 8000);
    return () => clearInterval(t);
  }, [load]);

  const seed = async () => {
    setSeeding(true);
    toast({ title: "Đang tạo dữ liệu mẫu…", description: "Đang tạo các sự cố thực tế trong 14 ngày qua." });
    const r = await api.seed(240);
    await load();
    setSeeding(false);
    toast({
      title: r.status === "success" ? "Đã tạo dữ liệu mẫu" : "Tạo dữ liệu thất bại",
      description: r.status === "success" ? `Đã chèn ${r.inserted} sự cố.` : "Backend có đang chạy trên :8000 không?",
      variant: r.status === "success" ? "success" : "critical",
    });
  };

  const isEmpty = !loading && stats.total_falls === 0;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="space-y-1.5">
          <div className="flex items-center gap-2">
            <Badge variant="accent" className="gap-1.5">
              <LiveDot color="accent" className="size-1.5" /> Trực tiếp
            </Badge>
            <span className="text-[12px] text-ink-3">Giám sát thời gian thực trên 8 camera</span>
          </div>
          <h1 className="text-[26px] font-bold tracking-tight text-ink">Trung tâm điều hành</h1>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={seed} disabled={seeding}>
            <Database className="size-4" />
            {seeding ? "Đang tạo…" : "Dữ liệu mẫu"}
          </Button>
          <Button size="sm" onClick={() => askCopilot("Tóm tắt 7 ngày qua")}>
            <Sparkles className="size-4" />
            Hỏi Trợ lý AI
          </Button>
        </div>
      </div>

      {isEmpty && (
        <Card className="border-accent-line/60 bg-gradient-to-r from-accent-soft/50 to-surface">
          <CardContent className="flex flex-wrap items-center gap-4 py-4">
            <div className="grid size-10 place-items-center rounded-xl bg-accent text-white">
              <Sparkles className="size-5" />
            </div>
            <div className="flex-1">
              <div className="text-sm font-semibold text-ink">Trung tâm điều hành đã sẵn sàng</div>
              <div className="text-[13px] text-ink-3">
                Tạo dữ liệu mẫu thực tế để xem phân tích, thông tin chi tiết và Trợ lý AI — hoặc phát trực tiếp qua webcam.
              </div>
            </div>
            <Button onClick={seed} disabled={seeding}>
              <Database className="size-4" /> Tạo dữ liệu mẫu
            </Button>
          </CardContent>
        </Card>
      )}

      {/* KPI row */}
      <motion.div
        variants={staggerContainer}
        initial="hidden"
        animate="show"
        className="grid grid-cols-2 gap-4 lg:grid-cols-5"
      >
        <StatCard label="Số ca ngã hôm nay" value={stats.today_falls} icon={Siren} accent="danger" hint="Phát hiện trong 24 giờ qua" />
        <StatCard label="Sự cố đang mở" value={stats.active_incidents} icon={ShieldAlert} accent="warning" hint="Đang chờ xử lý" />
        <StatCard
          label="Độ chính xác phát hiện"
          value={stats.accuracy * 100}
          decimals={1}
          suffix="%"
          icon={Target}
          accent="accent"
          trend={{ value: 2.1, goodWhenDown: false }}
        />
        <StatCard
          label="Phản hồi TB"
          value={stats.avg_response_time}
          suffix="s"
          icon={Timer}
          accent="violet"
          trend={{ value: -12, goodWhenDown: true }}
        />
        <StatCard
          label="Tỷ lệ đã xử lý"
          value={stats.resolved_rate * 100}
          decimals={0}
          suffix="%"
          icon={CheckCircle2}
          accent="success"
        />
      </motion.div>

      {/* Bento */}
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-12">
        {/* Activity trend */}
        <Card className="xl:col-span-8">
          <CardHeader className="flex-row items-center justify-between">
            <div>
              <CardTitle>Hoạt động ngã</CardTitle>
              <CardDescription>Số ca phát hiện mỗi ngày · 14 ngày qua</CardDescription>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-2xl font-bold tabular-nums text-ink">{stats.weekly_falls}</span>
              <Badge variant={stats.weekly_change > 0 ? "danger" : "success"}>
                {stats.weekly_change > 0 ? "+" : ""}
                {stats.weekly_change}% wk
              </Badge>
            </div>
          </CardHeader>
          <CardContent>
            <TrendArea data={stats.daily_data} xKey="label" yKey="falls" height={260} />
          </CardContent>
        </Card>

        {/* AI insights */}
        <Card className="xl:col-span-4">
          <CardHeader className="flex-row items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="grid size-7 place-items-center rounded-lg bg-gradient-to-br from-accent to-[#13b8a4] text-white">
                <Sparkles className="size-4" />
              </div>
              <CardTitle>Phân tích từ AI</CardTitle>
            </div>
            <Link href="/copilot" className="text-[12px] font-medium text-accent hover:text-accent-2">
              Mở Trợ lý AI
            </Link>
          </CardHeader>
          <CardContent className="max-h-[300px] overflow-y-auto no-scrollbar">
            <InsightList insights={insights} max={4} />
          </CardContent>
        </Card>

        {/* Severity */}
        <Card className="xl:col-span-4">
          <CardHeader>
            <CardTitle>Phân bố mức độ</CardTitle>
            <CardDescription>Toàn bộ sự cố đã ghi nhận</CardDescription>
          </CardHeader>
          <CardContent>
            <SeverityDonut data={stats.severity_breakdown} height={200} />
            <div className="mt-3 grid grid-cols-2 gap-2">
              {stats.severity_breakdown.map((s) => (
                <div key={s.severity} className="flex items-center gap-2 text-[12.5px]">
                  <span className="size-2.5 rounded-full" style={{ background: SEVERITY_COLOR[s.severity] }} />
                  <span className="text-ink-2">{SEVERITY_VI[s.severity] ?? s.severity}</span>
                  <span className="ml-auto font-semibold tabular-nums text-ink">{s.count}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Peak hours */}
        <Card className="xl:col-span-4">
          <CardHeader className="flex-row items-center gap-2">
            <Clock className="size-4 text-ink-3" />
            <div>
              <CardTitle>Giờ cao điểm</CardTitle>
              <CardDescription>Số ca ngã theo giờ · 7 ngày</CardDescription>
            </div>
          </CardHeader>
          <CardContent>
            <CategoryBar data={stats.hourly_data} xKey="hour" yKey="falls" height={228} />
          </CardContent>
        </Card>

        {/* Zone risk */}
        <Card className="xl:col-span-4">
          <CardHeader className="flex-row items-center gap-2">
            <MapPin className="size-4 text-ink-3" />
            <div>
              <CardTitle>Rủi ro theo khu vực</CardTitle>
              <CardDescription>Bấm vào khu vực để hỏi AI</CardDescription>
            </div>
          </CardHeader>
          <CardContent>
            <ZoneRisk zones={loading ? null : stats.zone_breakdown} />
          </CardContent>
        </Card>

        {/* Recent incidents */}
        <Card className="xl:col-span-8">
          <CardHeader className="flex-row items-center justify-between">
            <div className="flex items-center gap-2">
              <Activity className="size-4 text-ink-3" />
              <CardTitle>Sự cố gần đây</CardTitle>
            </div>
            <LiveDot color="critical" />
          </CardHeader>
          <CardContent>
            <RecentIncidents events={events} />
          </CardContent>
        </Card>

        {/* Live monitor preview */}
        <Card className="relative overflow-hidden xl:col-span-4">
          <div className="absolute inset-0 grid-bg opacity-60" />
          <div className="absolute inset-0 bg-gradient-to-b from-transparent to-surface/80" />
          <CardHeader className="relative flex-row items-center justify-between">
            <CardTitle>Giám sát trực tiếp</CardTitle>
            <Badge variant="critical" className="gap-1">
              <LiveDot color="critical" className="size-1.5" /> REC
            </Badge>
          </CardHeader>
          <CardContent className="relative">
            <div className="relative aspect-video overflow-hidden rounded-lg border border-line bg-[#0f1822]">
              <div className="absolute inset-0 grid-bg opacity-30" />
              <motion.div
                className="absolute left-[34%] top-[26%] h-[46%] w-[20%] rounded-md border-2 border-accent"
                animate={{ opacity: [0.5, 1, 0.5] }}
                transition={{ duration: 1.6, repeat: Infinity }}
              >
                <span className="absolute -top-5 left-0 rounded bg-accent px-1.5 py-0.5 text-[10px] font-semibold text-white">
                  person 0.95
                </span>
              </motion.div>
              <div className="absolute bottom-2 left-2 font-mono text-[10px] text-white/70">CAM-01 · LIVE</div>
            </div>
            <Button asChild variant="secondary" className="mt-3 w-full">
              <Link href="/live">
                <Video className="size-4" /> Mở phát hiện trực tiếp <ArrowRight className="size-4" />
              </Link>
            </Button>
          </CardContent>
        </Card>
      </div>

      <p className="pt-2 text-center text-[11px] text-ink-4">
        Aegis · Phát hiện YOLO-Pose · {pct(stats.uptime, 1)} thời gian hoạt động · Trợ lý AI
      </p>
    </div>
  );
}
