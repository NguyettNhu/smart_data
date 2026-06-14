import { Badge } from "@/components/ui/badge";
import type { Severity, IncidentStatus } from "@/lib/types";
import { cn } from "@/lib/utils";

const SEV_MAP: Record<Severity, { variant: "success" | "warning" | "critical" | "danger"; label: string; dot: string }> = {
  low: { variant: "success", label: "Thấp", dot: "bg-success" },
  medium: { variant: "warning", label: "Trung bình", dot: "bg-warning" },
  high: { variant: "critical", label: "Cao", dot: "bg-critical" },
  critical: { variant: "danger", label: "Nghiêm trọng", dot: "bg-danger" },
};

export function SeverityBadge({ severity, className }: { severity: Severity; className?: string }) {
  const s = SEV_MAP[severity] ?? SEV_MAP.low;
  return (
    <Badge variant={s.variant} className={className}>
      <span className={cn("size-1.5 rounded-full", s.dot)} />
      {s.label}
    </Badge>
  );
}

const STATUS_MAP: Record<IncidentStatus, { variant: "danger" | "warning" | "accent" | "success"; label: string }> = {
  active: { variant: "danger", label: "Mới" },
  acknowledged: { variant: "warning", label: "Đã tiếp nhận" },
  responding: { variant: "accent", label: "Đang ứng phó" },
  resolved: { variant: "success", label: "Đã xử lý" },
};

export function StatusBadge({ status, className }: { status: IncidentStatus; className?: string }) {
  const s = STATUS_MAP[status] ?? STATUS_MAP.resolved;
  return (
    <Badge variant={s.variant} className={className}>
      {s.label}
    </Badge>
  );
}
