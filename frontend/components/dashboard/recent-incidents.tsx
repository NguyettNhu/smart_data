"use client";
import Link from "next/link";
import { motion, AnimatePresence } from "motion/react";
import { Camera, ArrowRight } from "lucide-react";
import type { FallEvent } from "@/lib/types";
import { parseTs, timeAgo, pct } from "@/lib/utils";
import { SeverityBadge, StatusBadge } from "@/components/common/badges";
import { Skeleton } from "@/components/ui/skeleton";

export function RecentIncidents({ events }: { events: FallEvent[] | null }) {
  if (events === null) {
    return (
      <div className="space-y-2">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-14 w-full rounded-lg" />
        ))}
      </div>
    );
  }
  if (events.length === 0) {
    return (
      <div className="grid place-items-center rounded-lg border border-dashed border-line-2 py-10 text-center">
        <p className="text-sm text-ink-3">Chưa ghi nhận sự cố nào.</p>
      </div>
    );
  }
  return (
    <div className="space-y-1.5">
      <AnimatePresence initial={false}>
        {events.map((ev, i) => (
          <motion.div
            key={ev.id}
            layout
            initial={{ opacity: 0, x: -12 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: Math.min(i * 0.03, 0.2) }}
            className="group flex items-center gap-3 rounded-lg border border-transparent px-2.5 py-2 transition-colors hover:border-line hover:bg-surface-2"
          >
            <div className="grid size-9 shrink-0 place-items-center rounded-lg bg-surface-2 text-ink-3 group-hover:bg-surface">
              <Camera className="size-4" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className="truncate text-[13.5px] font-medium text-ink">{ev.zone}</span>
                <span className="font-mono text-[11px] text-ink-4">{ev.camera}</span>
              </div>
              <div className="text-[11.5px] text-ink-3">
                {timeAgo(parseTs(ev.timestamp))} · {pct(ev.confidence)} độ tin cậy
              </div>
            </div>
            <SeverityBadge severity={ev.severity} />
            <StatusBadge status={ev.status} className="hidden sm:inline-flex" />
          </motion.div>
        ))}
      </AnimatePresence>
      <Link
        href="/events"
        className="mt-1 inline-flex items-center gap-1 px-2.5 text-[12.5px] font-medium text-accent transition-colors hover:text-accent-2"
      >
        Xem tất cả sự cố <ArrowRight className="size-3.5" />
      </Link>
    </div>
  );
}
