"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import {
  LayoutDashboard,
  ScanFace,
  Siren,
  BarChart3,
  Sparkles,
  Settings,
  Database,
  FileText,
  TrendingUp,
  MapPin,
} from "lucide-react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Command, CommandInput, CommandList, CommandEmpty, CommandGroup, CommandItem } from "@/components/ui/command";
import { useUI } from "./ui-context";
import { api } from "@/lib/api";
import { useToast } from "@/components/ui/toast";

const NAV = [
  { label: "Trung tâm điều hành", href: "/", icon: LayoutDashboard },
  { label: "Giám sát trực tiếp", href: "/live", icon: ScanFace },
  { label: "Sự cố", href: "/events", icon: Siren },
  { label: "Phân tích", href: "/analytics", icon: BarChart3 },
  { label: "Trợ lý AI", href: "/copilot", icon: Sparkles },
  { label: "Cấu hình", href: "/settings", icon: Settings },
];

const AI_PROMPTS = [
  { label: "Tóm tắt 7 ngày qua", icon: FileText },
  { label: "Cho tôi xem xu hướng ngã", icon: TrendingUp },
  { label: "Khu vực nào nguy hiểm nhất?", icon: MapPin },
];

export function CommandPalette() {
  const { commandOpen, setCommandOpen, askCopilot } = useUI();
  const router = useRouter();
  const { toast } = useToast();

  const go = (href: string) => {
    setCommandOpen(false);
    router.push(href);
  };

  const ask = (prompt: string) => {
    setCommandOpen(false);
    askCopilot(prompt);
  };

  return (
    <Dialog open={commandOpen} onOpenChange={setCommandOpen}>
      <DialogContent hideClose className="max-w-xl gap-0 overflow-hidden p-0 shadow-xl">
        <Command>
          <CommandInput placeholder="Nhập lệnh hoặc tìm kiếm…" />
          <CommandList>
            <CommandEmpty>Không tìm thấy kết quả.</CommandEmpty>
            <CommandGroup heading="Điều hướng">
              {NAV.map((n) => (
                <CommandItem key={n.href} value={n.label} onSelect={() => go(n.href)}>
                  <n.icon />
                  {n.label}
                </CommandItem>
              ))}
            </CommandGroup>
            <CommandGroup heading="Hỏi Trợ lý AI">
              {AI_PROMPTS.map((p) => (
                <CommandItem key={p.label} value={`ai ${p.label}`} onSelect={() => ask(p.label)}>
                  <p.icon />
                  {p.label}
                </CommandItem>
              ))}
            </CommandGroup>
            <CommandGroup heading="Hành động">
              <CommandItem
                value="tạo dữ liệu mẫu"
                onSelect={async () => {
                  setCommandOpen(false);
                  toast({ title: "Đang tạo dữ liệu mẫu…", description: "Đang chèn sự cố thực tế." });
                  const r = await api.seed(220);
                  toast({
                    title: r.status === "success" ? "Đã tạo dữ liệu mẫu" : "Tạo dữ liệu thất bại",
                    description: r.status === "success" ? `Đã chèn ${r.inserted} sự cố.` : "Backend có đang chạy không?",
                    variant: r.status === "success" ? "success" : "critical",
                  });
                }}
              >
                <Database />
                Tạo dữ liệu mẫu
              </CommandItem>
            </CommandGroup>
          </CommandList>
        </Command>
      </DialogContent>
    </Dialog>
  );
}
