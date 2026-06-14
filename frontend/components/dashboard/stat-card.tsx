"use client";
import { motion } from "motion/react";
import { ArrowDownRight, ArrowUpRight } from "lucide-react";
import { AnimatedNumber } from "@/components/common/animated-number";
import { fadeUpItem } from "@/lib/motion";
import { cn } from "@/lib/utils";

export function StatCard({
  label,
  value,
  decimals = 0,
  suffix = "",
  prefix = "",
  icon: Icon,
  accent = "accent",
  trend,
  hint,
}: {
  label: string;
  value: number;
  decimals?: number;
  suffix?: string;
  prefix?: string;
  icon: React.ElementType;
  accent?: "accent" | "danger" | "warning" | "success" | "violet";
  trend?: { value: number; goodWhenDown?: boolean };
  hint?: string;
}) {
  const accentMap = {
    accent: "bg-accent-soft text-accent",
    danger: "bg-danger-soft text-danger",
    warning: "bg-warning-soft text-warning",
    success: "bg-success-soft text-success",
    violet: "bg-[#f1ecfe] text-[#8b5cf6]",
  } as const;

  let trendGood = false;
  if (trend) {
    const up = trend.value >= 0;
    trendGood = trend.goodWhenDown ? !up : up;
  }

  return (
    <motion.div
      variants={fadeUpItem}
      className="card-hover group relative overflow-hidden rounded-xl border border-line bg-surface p-4 shadow-sm"
    >
      <div className="flex items-start justify-between">
        <span className="text-[13px] font-medium text-ink-3">{label}</span>
        <div className={cn("grid size-9 place-items-center rounded-lg transition-transform group-hover:scale-110", accentMap[accent])}>
          <Icon className="size-[18px]" />
        </div>
      </div>
      <div className="mt-2 flex items-end gap-2">
        <AnimatedNumber
          value={value}
          decimals={decimals}
          prefix={prefix}
          suffix={suffix}
          className="text-[28px] font-bold leading-none tracking-tight text-ink"
        />
        {trend && (
          <span
            className={cn(
              "mb-0.5 inline-flex items-center gap-0.5 rounded-md px-1.5 py-0.5 text-[11px] font-semibold",
              trendGood ? "bg-success-soft text-success" : "bg-danger-soft text-danger"
            )}
          >
            {trend.value >= 0 ? <ArrowUpRight className="size-3" /> : <ArrowDownRight className="size-3" />}
            {Math.abs(trend.value).toFixed(0)}%
          </span>
        )}
      </div>
      {hint && <p className="mt-1.5 text-[11.5px] text-ink-4">{hint}</p>}
    </motion.div>
  );
}
