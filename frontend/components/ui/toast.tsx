"use client";
import * as React from "react";
import { AnimatePresence, motion } from "motion/react";
import { AlertTriangle, CheckCircle2, Info, X } from "lucide-react";
import { cn } from "@/lib/utils";

export type ToastVariant = "default" | "success" | "warning" | "critical";

export interface ToastData {
  id: string;
  title: string;
  description?: string;
  variant?: ToastVariant;
  duration?: number;
}

interface ToastContextValue {
  toast: (t: Omit<ToastData, "id">) => void;
}

const ToastContext = React.createContext<ToastContextValue | null>(null);

export function useToast() {
  const ctx = React.useContext(ToastContext);
  if (!ctx) return { toast: () => {} };
  return ctx;
}

const VARIANT_STYLE: Record<ToastVariant, { ring: string; icon: React.ReactNode }> = {
  default: { ring: "border-line", icon: <Info className="size-4 text-accent" /> },
  success: { ring: "border-success-line", icon: <CheckCircle2 className="size-4 text-success" /> },
  warning: { ring: "border-warning-line", icon: <AlertTriangle className="size-4 text-warning" /> },
  critical: { ring: "border-critical-line", icon: <AlertTriangle className="size-4 text-critical" /> },
};

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = React.useState<ToastData[]>([]);

  const remove = React.useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const toast = React.useCallback(
    (t: Omit<ToastData, "id">) => {
      const id = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
      const data: ToastData = { id, duration: 5000, variant: "default", ...t };
      setToasts((prev) => [data, ...prev].slice(0, 5));
      if (data.duration && data.duration > 0) {
        setTimeout(() => remove(id), data.duration);
      }
    },
    [remove]
  );

  return (
    <ToastContext.Provider value={{ toast }}>
      {children}
      <div className="pointer-events-none fixed bottom-4 right-4 z-[100] flex w-[360px] max-w-[calc(100vw-2rem)] flex-col gap-2.5">
        <AnimatePresence initial={false}>
          {toasts.map((t) => {
            const style = VARIANT_STYLE[t.variant ?? "default"];
            return (
              <motion.div
                key={t.id}
                layout
                initial={{ opacity: 0, x: 80, scale: 0.96 }}
                animate={{ opacity: 1, x: 0, scale: 1 }}
                exit={{ opacity: 0, x: 80, scale: 0.9 }}
                transition={{ type: "spring", stiffness: 300, damping: 28 }}
                className={cn(
                  "pointer-events-auto flex items-start gap-3 rounded-xl border bg-surface/95 p-3.5 shadow-lg backdrop-blur",
                  style.ring,
                  t.variant === "critical" && "shadow-[0_0_0_3px_rgba(224,85,42,0.12)]"
                )}
              >
                <div className="mt-0.5">{style.icon}</div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-semibold text-ink">{t.title}</div>
                  {t.description && <div className="mt-0.5 text-[13px] text-ink-2">{t.description}</div>}
                </div>
                <button
                  onClick={() => remove(t.id)}
                  className="rounded-md p-0.5 text-ink-4 transition-colors hover:bg-surface-2 hover:text-ink"
                >
                  <X className="size-4" />
                </button>
              </motion.div>
            );
          })}
        </AnimatePresence>
      </div>
    </ToastContext.Provider>
  );
}
