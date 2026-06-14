"use client";
import { motion } from "motion/react";
import { useUI } from "@/components/shell/ui-context";
import { cn } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";

function riskColor(risk: number) {
  if (risk >= 75) return { bar: "bg-danger", text: "text-danger", label: "High" };
  if (risk >= 55) return { bar: "bg-critical", text: "text-critical", label: "Elevated" };
  if (risk >= 30) return { bar: "bg-warning", text: "text-warning", label: "Moderate" };
  return { bar: "bg-success", text: "text-success", label: "Low" };
}

export function ZoneRisk({ zones }: { zones: { zone: string; count: number; risk: number }[] | null }) {
  const { askCopilot } = useUI();
  if (zones === null) {
    return (
      <div className="space-y-3">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-9 w-full rounded-lg" />
        ))}
      </div>
    );
  }
  const sorted = [...zones].sort((a, b) => b.risk - a.risk).slice(0, 6);
  if (sorted.length === 0) return <p className="py-6 text-center text-sm text-ink-3">Không có dữ liệu khu vực.</p>;

  return (
    <div className="space-y-3.5">
      {sorted.map((z, i) => {
        const c = riskColor(z.risk);
        return (
          <button
            key={z.zone}
            onClick={() => askCopilot(`Đánh giá rủi ro cho ${z.zone}`)}
            className="block w-full text-left"
          >
            <div className="mb-1 flex items-center justify-between text-[12.5px]">
              <span className="font-medium text-ink">{z.zone}</span>
              <span className={cn("font-semibold tabular-nums", c.text)}>{z.risk}</span>
            </div>
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-surface-2">
              <motion.div
                initial={{ width: 0 }}
                animate={{ width: `${z.risk}%` }}
                transition={{ delay: i * 0.06, type: "spring", stiffness: 120, damping: 20 }}
                className={cn("h-full rounded-full", c.bar)}
              />
            </div>
          </button>
        );
      })}
    </div>
  );
}
