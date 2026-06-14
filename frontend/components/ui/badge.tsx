import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-semibold transition-colors",
  {
    variants: {
      variant: {
        default: "border-line-2 bg-surface-2 text-ink-2",
        accent: "border-accent-line bg-accent-soft text-accent-ink",
        success: "border-success-line bg-success-soft text-success",
        warning: "border-warning-line bg-warning-soft text-warning",
        danger: "border-danger-line bg-danger-soft text-danger",
        critical: "border-critical-line bg-critical-soft text-critical",
        outline: "border-line-2 bg-transparent text-ink-2",
        solid: "border-transparent bg-ink text-white",
      },
      size: {
        default: "",
        sm: "px-1.5 py-0 text-[10px]",
      },
    },
    defaultVariants: { variant: "default", size: "default" },
  }
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

export function Badge({ className, variant, size, ...props }: BadgeProps) {
  return <div className={cn(badgeVariants({ variant, size }), className)} {...props} />;
}

export { badgeVariants };
