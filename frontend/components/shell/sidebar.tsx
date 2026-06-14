"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion } from "motion/react";
import {
  LayoutDashboard,
  ScanFace,
  Siren,
  BarChart3,
  Sparkles,
  Settings,
  ShieldCheck,
  PanelLeftClose,
  PanelLeftOpen,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useUI } from "./ui-context";
import { LiveDot } from "@/components/common/live-dot";

const NAV = [
  { href: "/", label: "Trung tâm điều hành", icon: LayoutDashboard },
  { href: "/live", label: "Giám sát trực tiếp", icon: ScanFace },
  { href: "/events", label: "Sự cố", icon: Siren },
  { href: "/analytics", label: "Phân tích", icon: BarChart3 },
  { href: "/copilot", label: "Trợ lý AI", icon: Sparkles },
  { href: "/settings", label: "Cấu hình", icon: Settings },
];

export function Sidebar() {
  const pathname = usePathname();
  const { sidebarCollapsed, toggleSidebar } = useUI();

  return (
    <aside
      className={cn(
        "fixed inset-y-0 left-0 z-40 flex flex-col bg-sidebar text-sidebar-ink transition-[width] duration-300 ease-out",
        sidebarCollapsed ? "w-[76px]" : "w-64"
      )}
    >
      {/* Brand */}
      <div className="flex h-16 items-center gap-3 px-4">
        <div className="relative grid size-10 shrink-0 place-items-center rounded-xl bg-gradient-to-br from-accent to-[#13b8a4] shadow-[0_4px_16px_-4px_rgba(14,155,138,0.6)]">
          <ShieldCheck className="size-5 text-white" />
        </div>
        {!sidebarCollapsed && (
          <div className="min-w-0">
            <div className="truncate text-[15px] font-semibold tracking-tight text-white">Aegis</div>
            <div className="truncate text-[11px] text-sidebar-muted">AI phát hiện ngã</div>
          </div>
        )}
      </div>

      {/* Nav */}
      <nav className="flex-1 space-y-1 overflow-y-auto px-3 py-3 no-scrollbar">
        {NAV.map((item) => {
          const active = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "group relative flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
                active
                  ? "bg-sidebar-2 text-white"
                  : "text-sidebar-ink/80 hover:bg-sidebar-2/60 hover:text-white",
                sidebarCollapsed && "justify-center px-0"
              )}
            >
              {active && (
                <motion.span
                  layoutId="nav-active"
                  className="absolute left-0 top-1/2 h-6 w-1 -translate-y-1/2 rounded-r-full bg-sidebar-accent"
                  transition={{ type: "spring", stiffness: 380, damping: 32 }}
                />
              )}
              <Icon className={cn("size-5 shrink-0", active && "text-sidebar-accent")} />
              {!sidebarCollapsed && <span className="truncate">{item.label}</span>}
              {!sidebarCollapsed && item.href === "/live" && (
                <LiveDot color="critical" className="ml-auto" />
              )}
            </Link>
          );
        })}
      </nav>

      {/* Footer */}
      <div className="border-t border-white/5 p-3">
        {!sidebarCollapsed && (
          <div className="mb-2 flex items-center gap-2 rounded-lg bg-sidebar-2/50 px-3 py-2">
            <LiveDot color="success" />
            <div className="text-[11px] leading-tight text-sidebar-muted">
              <div className="font-medium text-sidebar-ink">Tất cả hệ thống trực tuyến</div>
              <div>8 camera · 99.9% hoạt động</div>
            </div>
          </div>
        )}
        <button
          onClick={toggleSidebar}
          className={cn(
            "flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm text-sidebar-muted transition-colors hover:bg-sidebar-2/60 hover:text-white",
            sidebarCollapsed && "justify-center px-0"
          )}
        >
          {sidebarCollapsed ? <PanelLeftOpen className="size-5" /> : <PanelLeftClose className="size-5" />}
          {!sidebarCollapsed && <span>Thu gọn</span>}
        </button>
      </div>
    </aside>
  );
}
