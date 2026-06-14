"use client";
import * as React from "react";
import { cn } from "@/lib/utils";
import { ToastProvider } from "@/components/ui/toast";
import { TooltipProvider } from "@/components/ui/tooltip";
import { UIProvider, useUI } from "./ui-context";
import { Sidebar } from "./sidebar";
import { Topbar } from "./topbar";
import { CommandPalette } from "./command-palette";
import { CopilotPanel } from "./copilot-panel";

function ShellInner({ children }: { children: React.ReactNode }) {
  const { sidebarCollapsed } = useUI();
  return (
    <div className="app-bg min-h-screen">
      <Sidebar />
      <div
        className={cn(
          "flex min-h-screen flex-col transition-[margin] duration-300 ease-out",
          sidebarCollapsed ? "ml-[76px]" : "ml-64"
        )}
      >
        <Topbar />
        <main className="mx-auto w-full max-w-[1500px] flex-1 px-6 py-7">{children}</main>
      </div>
      <CommandPalette />
      <CopilotPanel />
    </div>
  );
}

export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <ToastProvider>
      <UIProvider>
        <TooltipProvider delayDuration={200}>
          <ShellInner>{children}</ShellInner>
        </TooltipProvider>
      </UIProvider>
    </ToastProvider>
  );
}
