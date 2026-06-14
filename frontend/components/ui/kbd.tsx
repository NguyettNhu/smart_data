import { cn } from "@/lib/utils";

export function Kbd({ className, children }: { className?: string; children: React.ReactNode }) {
  return (
    <kbd
      className={cn(
        "inline-flex h-5 min-w-[20px] select-none items-center justify-center rounded border border-line-2 bg-surface-2 px-1.5 font-mono text-[10px] font-medium text-ink-3 shadow-xs",
        className
      )}
    >
      {children}
    </kbd>
  );
}
