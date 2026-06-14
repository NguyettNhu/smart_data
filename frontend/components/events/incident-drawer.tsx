"use client";
import * as React from "react";
import Image from "next/image";
import { motion } from "motion/react";
import { Camera, MapPin, Clock, Gauge, Sparkles, CheckCircle2, Activity, ShieldQuestion } from "lucide-react";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { SeverityBadge, StatusBadge } from "@/components/common/badges";
import { useToast } from "@/components/ui/toast";
import { useUI } from "@/components/shell/ui-context";
import { api, snapshotUrl } from "@/lib/api";
import type { FallEvent } from "@/lib/types";
import { parseTs, formatDate, formatTime, formatDuration, pct } from "@/lib/utils";

export function IncidentDrawer({
  event,
  open,
  onOpenChange,
  onChanged,
}: {
  event: FallEvent | null;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onChanged: () => void;
}) {
  const { toast } = useToast();
  const { askCopilot } = useUI();
  const [outcome, setOutcome] = React.useState("true_fall");
  const [busy, setBusy] = React.useState(false);

  if (!event) return null;
  const img = snapshotUrl(event.image_url || event.image_path);
  const ts = parseTs(event.timestamp);

  const act = async (fn: () => Promise<{ status: string }>, label: string) => {
    setBusy(true);
    const r = await fn();
    setBusy(false);
    if (r.status === "success") {
      toast({ title: label, variant: "success" });
      onChanged();
    } else {
      toast({ title: "Thao tác thất bại", description: "Backend có đang chạy không?", variant: "critical" });
    }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full overflow-y-auto p-0 sm:max-w-[460px]">
        {/* Header */}
        <div className="sticky top-0 z-10 border-b border-line bg-surface/90 px-5 py-4 backdrop-blur">
          <div className="flex items-center gap-2">
            <SeverityBadge severity={event.severity} />
            <StatusBadge status={event.status} />
            <span className="ml-auto font-mono text-[12px] text-ink-4">#{event.id}</span>
          </div>
          <h2 className="mt-2 text-lg font-semibold text-ink">Sự cố ngã</h2>
          <p className="text-[13px] text-ink-3">
            {formatDate(ts)} · {formatTime(ts)}
          </p>
        </div>

        <div className="space-y-5 p-5">
          {/* Snapshot */}
          <div className="relative aspect-video overflow-hidden rounded-xl border border-line bg-[#0f1822]">
            {img ? (
              <Image src={img} alt="snapshot" fill unoptimized className="object-cover" />
            ) : (
              <div className="grid h-full place-items-center text-center">
                <div className="grid-bg absolute inset-0 opacity-30" />
                <div className="relative">
                  <Camera className="mx-auto size-7 text-white/30" />
                  <p className="mt-1 text-[12px] text-white/40">Chưa có ảnh chụp</p>
                </div>
              </div>
            )}
            <motion.div
              className="absolute left-[36%] top-[28%] h-[44%] w-[20%] rounded border-2 border-critical"
              animate={{ opacity: [0.6, 1, 0.6] }}
              transition={{ duration: 1.4, repeat: Infinity }}
            />
          </div>

          {/* Facts */}
          <div className="grid grid-cols-2 gap-3">
            <Fact icon={MapPin} label="Khu vực" value={event.zone} />
            <Fact icon={Camera} label="Camera" value={event.camera} />
            <Fact icon={Gauge} label="Độ tin cậy" value={pct(event.confidence)} />
            <Fact icon={Clock} label="Phản hồi" value={formatDuration(event.response_time)} />
            <Fact icon={Activity} label="Bất động" value={formatDuration(event.immobile_seconds)} />
            <Fact icon={ShieldQuestion} label="Kết quả" value={event.outcome ? event.outcome.replace(/_/g, " ") : "—"} />
          </div>

          {/* Narrative */}
          {event.narrative && (
            <div className="rounded-xl border border-line bg-surface-2/60 p-3.5">
              <div className="mb-1 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-ink-4">
                <Sparkles className="size-3 text-accent" /> MÔ TẢ TỪ AI
              </div>
              <p className="text-[13px] leading-relaxed text-ink-2">{event.narrative}</p>
            </div>
          )}

          <Separator />

          {/* Lifecycle actions */}
          <div className="space-y-2.5">
            <div className="text-[11px] font-semibold uppercase tracking-wider text-ink-4">QUY TRÌNH ỨNG PHÓ</div>
            {event.status === "active" && (
              <Button className="w-full" disabled={busy} onClick={() => act(() => api.acknowledgeEvent(event.id), "Đã tiếp nhận sự cố")}>
                <CheckCircle2 className="size-4" /> Tiếp nhận sự cố
              </Button>
            )}
            {event.status === "acknowledged" && (
              <Button className="w-full" disabled={busy} onClick={() => act(() => api.respondEvent(event.id), "Đã đánh dấu đang ứng phó")}>
                <Activity className="size-4" /> Đánh dấu đang ứng phó
              </Button>
            )}
            {(event.status === "responding" || event.status === "acknowledged") && (
              <div className="flex gap-2">
                <Select value={outcome} onValueChange={setOutcome}>
                  <SelectTrigger className="flex-1">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="true_fall">Ngã đã xác nhận</SelectItem>
                    <SelectItem value="false_alarm">Báo động giả</SelectItem>
                    <SelectItem value="assisted">Đã hỗ trợ</SelectItem>
                    <SelectItem value="medical">Cần y tế</SelectItem>
                  </SelectContent>
                </Select>
                <Button variant="success" disabled={busy} onClick={() => act(() => api.resolveEvent(event.id, outcome), "Sự cố đã xử lý")}>
                  Xử lý xong
                </Button>
              </div>
            )}
            {event.status === "resolved" && (
              <div className="flex items-center gap-2 rounded-lg border border-success-line/60 bg-success-soft px-3 py-2.5 text-[13px] text-success">
                <CheckCircle2 className="size-4" /> Sự cố đã xử lý{event.outcome ? ` · ${event.outcome.replace(/_/g, " ")}` : ""}
              </div>
            )}
            <Button variant="outline" className="w-full" onClick={() => askCopilot(`Đánh giá rủi ro cho ${event.zone}`)}>
              <Sparkles className="size-4" /> Hỏi Trợ lý AI về {event.zone}
            </Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}

function Fact({ icon: Icon, label, value }: { icon: React.ElementType; label: string; value: string }) {
  return (
    <div className="rounded-lg border border-line bg-surface p-2.5">
      <div className="flex items-center gap-1.5 text-[11px] text-ink-4">
        <Icon className="size-3.5" /> {label}
      </div>
      <div className="mt-0.5 truncate text-[14px] font-semibold capitalize text-ink">{value}</div>
    </div>
  );
}
