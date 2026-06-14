"use client";
import * as React from "react";
import { motion } from "motion/react";
import { Clock, TrendingUp, MapPin, Timer, Activity, Sparkles, ArrowRight } from "lucide-react";
import type { Insight } from "@/lib/types";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";
import { useUI } from "@/components/shell/ui-context";
import { Skeleton } from "@/components/ui/skeleton";

const KIND_ICON: Record<string, React.ElementType> = {
  peak_hour: Clock,
  trend: TrendingUp,
  risk_zone: MapPin,
  response_time: Timer,
  anomaly: Activity,
  summary: Sparkles,
};

const SEV_STYLE: Record<string, { wrap: string; chip: string; icon: string }> = {
  info: { wrap: "border-line", chip: "bg-accent-soft text-accent-ink", icon: "text-accent" },
  warning: { wrap: "border-warning-line/60", chip: "bg-warning-soft text-warning", icon: "text-warning" },
  critical: { wrap: "border-critical-line/60", chip: "bg-critical-soft text-critical", icon: "text-critical" },
  success: { wrap: "border-success-line/60", chip: "bg-success-soft text-success", icon: "text-success" },
};

export function useInsights(pollMs = 0) {
  const [insights, setInsights] = React.useState<Insight[] | null>(null);
  React.useEffect(() => {
    let on = true;
    const load = async () => {
      const r = await api.insights();
      if (on) setInsights(r.insights);
    };
    load();
    if (pollMs) {
      const t = setInterval(load, pollMs);
      return () => {
        on = false;
        clearInterval(t);
      };
    }
    return () => {
      on = false;
    };
  }, [pollMs]);
  return insights;
}

export function InsightCard({ insight, index = 0 }: { insight: Insight; index?: number }) {
  const { askCopilot } = useUI();
  const Icon = KIND_ICON[insight.kind] ?? Sparkles;
  const style = SEV_STYLE[insight.severity] ?? SEV_STYLE.info;

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.05, type: "spring", stiffness: 200, damping: 24 }}
      className={cn("rounded-xl border bg-surface p-3.5 shadow-xs", style.wrap)}
    >
      <div className="flex items-start gap-3">
        <div className={cn("mt-0.5 grid size-8 shrink-0 place-items-center rounded-lg", style.chip)}>
          <Icon className={cn("size-4", style.icon)} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-[13.5px] font-semibold text-ink">{insight.title}</div>
          <p className="mt-0.5 text-[12.5px] leading-relaxed text-ink-2">{insight.body}</p>
          {insight.citation && <p className="mt-1.5 text-[10.5px] text-ink-4">{insight.citation}</p>}
          {insight.suggested_prompt && (
            <button
              onClick={() => askCopilot(insight.suggested_prompt!)}
              className="mt-2 inline-flex items-center gap-1 text-[12px] font-medium text-accent transition-colors hover:text-accent-2"
            >
              Hỏi Trợ lý AI <ArrowRight className="size-3" />
            </button>
          )}
        </div>
      </div>
    </motion.div>
  );
}

export function InsightList({ insights, max }: { insights: Insight[] | null; max?: number }) {
  if (insights === null) {
    return (
      <div className="space-y-2.5">
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-20 w-full rounded-xl" />
        ))}
      </div>
    );
  }
  const list = max ? insights.slice(0, max) : insights;
  if (list.length === 0)
    return <div className="rounded-xl border border-line bg-surface p-4 text-sm text-ink-3">Chưa có phân tích nào.</div>;
  return (
    <div className="space-y-2.5">
      {list.map((ins, i) => (
        <InsightCard key={ins.id} insight={ins} index={i} />
      ))}
    </div>
  );
}
