"use client";
import * as React from "react";
import { motion } from "motion/react";
import { Search, SlidersHorizontal, ChevronRight, Siren, ShieldAlert, Activity, CheckCircle2, Camera } from "lucide-react";
import { api } from "@/lib/api";
import type { FallEvent, Stats } from "@/lib/types";
import { EMPTY_STATS } from "@/lib/api";
import { parseTs, timeAgo, formatDuration, pct, cn } from "@/lib/utils";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { SeverityBadge, StatusBadge } from "@/components/common/badges";
import { IncidentDrawer } from "@/components/events/incident-drawer";

const SUMMARY = [
  { key: "active", label: "Mới", icon: Siren, accent: "text-danger bg-danger-soft" },
  { key: "acknowledged", label: "Đã tiếp nhận", icon: ShieldAlert, accent: "text-warning bg-warning-soft" },
  { key: "responding", label: "Đang ứng phó", icon: Activity, accent: "text-accent bg-accent-soft" },
  { key: "resolved", label: "Đã xử lý", icon: CheckCircle2, accent: "text-success bg-success-soft" },
] as const;

export default function EventsPage() {
  const [events, setEvents] = React.useState<FallEvent[] | null>(null);
  const [stats, setStats] = React.useState<Stats>(EMPTY_STATS);
  const [q, setQ] = React.useState("");
  const [severity, setSeverity] = React.useState("all");
  const [status, setStatus] = React.useState("all");
  const [zone, setZone] = React.useState("all");
  const [selected, setSelected] = React.useState<FallEvent | null>(null);
  const [open, setOpen] = React.useState(false);

  const load = React.useCallback(async () => {
    const [e, s] = await Promise.all([
      api.events({ limit: 100, severity, status, zone, q }),
      api.stats(),
    ]);
    setEvents(e);
    setStats(s);
    // keep an open incident drawer in sync after a lifecycle action
    setSelected((prev) => (prev ? e.find((x) => x.id === prev.id) ?? prev : prev));
  }, [severity, status, zone, q]);

  React.useEffect(() => {
    const t = setTimeout(load, q ? 250 : 0);
    return () => clearTimeout(t);
  }, [load, q]);

  React.useEffect(() => {
    const t = setInterval(load, 10000);
    return () => clearInterval(t);
  }, [load]);

  const statusCount = (k: string) => stats.status_breakdown.find((s) => s.status === k)?.count ?? 0;

  const openEvent = (ev: FallEvent) => {
    setSelected(ev);
    setOpen(true);
  };

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h1 className="text-2xl font-bold tracking-tight text-ink">Sự cố</h1>
        <p className="text-sm text-ink-3">Mọi cú ngã được phát hiện cùng quy trình ứng phó đầy đủ.</p>
      </div>

      {/* Summary tiles */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {SUMMARY.map((s) => (
          <button
            key={s.key}
            onClick={() => setStatus(status === s.key ? "all" : s.key)}
            className={cn(
              "flex items-center gap-3 rounded-xl border bg-surface p-3.5 text-left shadow-sm transition-all hover:shadow-md",
              status === s.key ? "border-accent ring-2 ring-accent/20" : "border-line"
            )}
          >
            <div className={cn("grid size-9 place-items-center rounded-lg", s.accent)}>
              <s.icon className="size-[18px]" />
            </div>
            <div>
              <div className="text-xl font-bold tabular-nums text-ink">{statusCount(s.key)}</div>
              <div className="text-[12px] text-ink-3">{s.label}</div>
            </div>
          </button>
        ))}
      </div>

      {/* Toolbar */}
      <Card>
        <CardContent className="flex flex-wrap items-center gap-2 py-3">
          <div className="relative min-w-[220px] flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-4" />
            <Input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Tìm khu vực, camera, mức độ…"
              className="pl-9"
            />
          </div>
          <SlidersHorizontal className="size-4 text-ink-4" />
          <FilterSelect value={severity} onChange={setSeverity} placeholder="Mức độ" allLabel="Tất cả mức độ" options={["critical", "high", "medium", "low"]} displayMap={{ critical: "Nghiêm trọng", high: "Cao", medium: "Trung bình", low: "Thấp" }} />
          <FilterSelect value={status} onChange={setStatus} placeholder="Trạng thái" allLabel="Tất cả trạng thái" options={["active", "acknowledged", "responding", "resolved"]} displayMap={{ active: "Mới", acknowledged: "Đã tiếp nhận", responding: "Đang ứng phó", resolved: "Đã xử lý" }} />
          <FilterSelect value={zone} onChange={setZone} placeholder="Khu vực" allLabel="Tất cả khu vực" options={stats.zone_breakdown.map((z) => z.zone)} displayMap={{}} />
          {(severity !== "all" || status !== "all" || zone !== "all" || q) && (
            <Button variant="ghost" size="sm" onClick={() => { setSeverity("all"); setStatus("all"); setZone("all"); setQ(""); }}>
              Xóa lọc
            </Button>
          )}
        </CardContent>
      </Card>

      {/* Table */}
      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[820px] text-sm">
            <thead>
              <tr className="border-b border-line bg-surface-2/50 text-left text-[11px] uppercase tracking-wider text-ink-4">
                <th className="px-4 py-3 font-semibold">MỨC ĐỘ</th>
                <th className="px-4 py-3 font-semibold">SỰ CỐ</th>
                <th className="px-4 py-3 font-semibold">ĐỘ TIN CẬY</th>
                <th className="px-4 py-3 font-semibold">PHÁT HIỆN</th>
                <th className="px-4 py-3 font-semibold">PHẢN HỒI</th>
                <th className="px-4 py-3 font-semibold">TRẠNG THÁI</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {events === null
                ? Array.from({ length: 8 }).map((_, i) => (
                    <tr key={i} className="border-b border-line">
                      <td colSpan={7} className="px-4 py-3">
                        <Skeleton className="h-6 w-full" />
                      </td>
                    </tr>
                  ))
                : events.length === 0
                ? (
                  <tr>
                    <td colSpan={7} className="px-4 py-16 text-center text-ink-3">
                      Không có sự cố nào khớp bộ lọc.
                    </td>
                  </tr>
                )
                : events.map((ev, i) => (
                    <motion.tr
                      key={ev.id}
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      transition={{ delay: Math.min(i * 0.015, 0.3) }}
                      onClick={() => openEvent(ev)}
                      className="group cursor-pointer border-b border-line transition-colors last:border-0 hover:bg-surface-2/60"
                    >
                      <td className="px-4 py-3"><SeverityBadge severity={ev.severity} /></td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2.5">
                          <div className="grid size-8 place-items-center rounded-lg bg-surface-2 text-ink-3">
                            <Camera className="size-4" />
                          </div>
                          <div>
                            <div className="font-medium text-ink">{ev.zone}</div>
                            <div className="font-mono text-[11px] text-ink-4">{ev.camera}</div>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3 tabular-nums text-ink-2">{pct(ev.confidence)}</td>
                      <td className="px-4 py-3 text-ink-2">{timeAgo(parseTs(ev.timestamp))}</td>
                      <td className="px-4 py-3 tabular-nums text-ink-2">{formatDuration(ev.response_time)}</td>
                      <td className="px-4 py-3"><StatusBadge status={ev.status} /></td>
                      <td className="px-4 py-3 text-right">
                        <ChevronRight className="ml-auto size-4 text-ink-4 transition-transform group-hover:translate-x-0.5 group-hover:text-ink-2" />
                      </td>
                    </motion.tr>
                  ))}
            </tbody>
          </table>
        </div>
      </Card>

      <IncidentDrawer event={selected} open={open} onOpenChange={setOpen} onChanged={load} />
    </div>
  );
}

function FilterSelect({
  value,
  onChange,
  placeholder,
  allLabel,
  options,
  displayMap = {},
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  allLabel?: string;
  options: string[];
  displayMap?: Record<string, string>;
}) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger className="h-9 w-[150px] capitalize">
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="all">{allLabel ?? `Tất cả ${placeholder.toLowerCase()}`}</SelectItem>
        {options.map((o) => (
          <SelectItem key={o} value={o} className="capitalize">
            {displayMap[o] ?? o}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
