"use client";
import * as React from "react";
import { Sparkles, X } from "lucide-react";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { useUI } from "./ui-context";
import { CopilotChat } from "@/components/copilot/copilot-chat";
import { Badge } from "@/components/ui/badge";

export function CopilotPanel() {
  const { copilotOpen, setCopilotOpen, copilotPrompt, consumePrompt } = useUI();

  return (
    <Sheet open={copilotOpen} onOpenChange={setCopilotOpen}>
      <SheetContent
        side="right"
        hideClose
        className="flex w-full flex-col gap-0 p-0 sm:max-w-[440px]"
      >
        <div className="flex items-center gap-2.5 border-b border-line bg-gradient-to-r from-accent-soft/70 to-surface px-4 py-3">
          <div className="grid size-8 place-items-center rounded-lg bg-gradient-to-br from-accent to-[#13b8a4] text-white shadow-sm">
            <Sparkles className="size-4" />
          </div>
          <div className="flex-1">
            <div className="flex items-center gap-2 text-[14px] font-semibold text-ink">
              Aegis Trợ lý <Badge variant="accent" size="sm">AI</Badge>
            </div>
            <div className="text-[11px] text-ink-3">Hiểu ngữ cảnh · dựa trên dữ liệu trực tiếp</div>
          </div>
          <button
            onClick={() => setCopilotOpen(false)}
            className="rounded-md p-1.5 text-ink-3 transition-colors hover:bg-surface-2 hover:text-ink"
          >
            <X className="size-4" />
          </button>
        </div>
        <div className="min-h-0 flex-1">
          <CopilotChat initialPrompt={copilotPrompt} onConsumed={consumePrompt} compact />
        </div>
      </SheetContent>
    </Sheet>
  );
}
