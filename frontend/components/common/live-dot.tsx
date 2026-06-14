import { cn } from "@/lib/utils";

const COLORS = {
  success: "bg-success",
  accent: "bg-accent",
  warning: "bg-warning",
  critical: "bg-critical",
  danger: "bg-danger",
} as const;

export function LiveDot({
  color = "success",
  className,
  pulse = true,
}: {
  color?: keyof typeof COLORS;
  className?: string;
  pulse?: boolean;
}) {
  return (
    <span className={cn("relative flex size-2.5", className)}>
      {pulse && (
        <span
          className={cn("absolute inline-flex h-full w-full rounded-full opacity-60 animate-[pulse-ring_1.8s_cubic-bezier(0.4,0,0.6,1)_infinite]", COLORS[color])}
        />
      )}
      <span className={cn("relative inline-flex size-2.5 rounded-full", COLORS[color])} />
    </span>
  );
}
