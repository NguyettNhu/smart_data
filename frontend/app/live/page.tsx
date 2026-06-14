"use client";
import { Badge } from "@/components/ui/badge";
import { LiveDot } from "@/components/common/live-dot";
import { LiveMonitor } from "@/components/live/live-monitor";

export default function LivePage() {
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="space-y-1.5">
          <div className="flex items-center gap-2">
            <Badge variant="critical" className="gap-1.5">
              <LiveDot color="critical" className="size-1.5" /> Phát hiện trực tiếp
            </Badge>
            <span className="text-[12px] text-ink-3">YOLO-Pose · theo dõi ngã theo thời gian</span>
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-ink">Giám sát trực tiếp</h1>
        </div>
      </div>
      <LiveMonitor />
    </div>
  );
}
