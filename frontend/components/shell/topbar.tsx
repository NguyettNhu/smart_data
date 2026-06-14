"use client";
import * as React from "react";
import Link from "next/link";
import { Search, Sparkles, Bell } from "lucide-react";
import { useUI } from "./ui-context";
import { Kbd } from "@/components/ui/kbd";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { LiveDot } from "@/components/common/live-dot";
import { api } from "@/lib/api";
import { formatTime } from "@/lib/utils";

export function Topbar() {
  const { setCommandOpen, askCopilot } = useUI();
  const [active, setActive] = React.useState(0);
  const [clock, setClock] = React.useState("");

  React.useEffect(() => {
    const tick = () => setClock(formatTime(new Date()));
    tick();
    const t = setInterval(tick, 1000);
    return () => clearInterval(t);
  }, []);

  React.useEffect(() => {
    let on = true;
    const load = async () => {
      const s = await api.stats();
      if (on) setActive(s.active_incidents);
    };
    load();
    const t = setInterval(load, 8000);
    return () => {
      on = false;
      clearInterval(t);
    };
  }, []);

  return (
    <header className="sticky top-0 z-30 flex h-16 items-center gap-3 border-b border-line bg-canvas/80 px-6 backdrop-blur-xl">
      {/* Command search */}
      <button
        onClick={() => setCommandOpen(true)}
        className="group flex h-9 w-full max-w-sm items-center gap-2.5 rounded-lg border border-line-2 bg-surface px-3 text-sm text-ink-4 shadow-xs transition-colors hover:border-line-3"
      >
        <Search className="size-4" />
        <span className="flex-1 text-left">Tìm sự cố, khu vực, hành động…</span>
        <Kbd>⌘K</Kbd>
      </button>

      <div className="ml-auto flex items-center gap-2.5">
        <div className="hidden items-center gap-2 rounded-lg border border-line bg-surface px-3 py-1.5 md:flex">
          <LiveDot color="success" />
          <span className="font-mono text-[13px] tabular-nums text-ink-2">{clock}</span>
        </div>

        <Button variant="subtle" size="sm" onClick={() => askCopilot()} className="gap-1.5">
          <Sparkles className="size-4" />
          Hỏi AI
        </Button>

        <Link
          href="/events"
          className="relative grid size-9 place-items-center rounded-lg border border-line-2 bg-surface text-ink-2 transition-colors hover:bg-surface-2"
        >
          <Bell className="size-[18px]" />
          {active > 0 && (
            <span className="absolute -right-1 -top-1 grid h-4 min-w-4 place-items-center rounded-full bg-critical px-1 text-[10px] font-bold text-white">
              {active}
            </span>
          )}
        </Link>

        <Avatar className="size-9 ring-2 ring-line">
          <AvatarFallback>OP</AvatarFallback>
        </Avatar>
      </div>
    </header>
  );
}
