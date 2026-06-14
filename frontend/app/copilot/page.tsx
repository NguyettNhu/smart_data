"use client";
import * as React from "react";
import { Sparkles, Wrench, ShieldCheck, Database, Zap } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { CopilotChat } from "@/components/copilot/copilot-chat";
import { InsightList, useInsights } from "@/components/copilot/insight-cards";

const CAPABILITIES = [
  { icon: Database, label: "Truy vấn dữ liệu phát hiện trực tiếp", desc: "số liệu, sự kiện, xu hướng, khu vực" },
  { icon: Wrench, label: "Gọi công cụ phân tích", desc: "giờ cao điểm, chấm điểm rủi ro, thời gian phản hồi" },
  { icon: ShieldCheck, label: "Có căn cứ & trích dẫn nguồn", desc: "mọi con số đều truy xuất đến dữ liệu thực" },
  { icon: Zap, label: "Hoạt động ngoại tuyến", desc: "engine dựa trên quy tắc, không cần API key" },
];

export default function CopilotPage() {
  const insights = useInsights(30000);

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3">
        <div className="grid size-11 place-items-center rounded-xl bg-gradient-to-br from-accent to-[#13b8a4] text-white shadow-[0_6px_20px_-6px_rgba(14,155,138,0.6)]">
          <Sparkles className="size-5" />
        </div>
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight text-ink">
            Trợ lý Aegis <Badge variant="accent">Tác tử AI</Badge>
          </h1>
          <p className="text-sm text-ink-3">Hỏi bất cứ điều gì về dữ liệu phát hiện ngã — Trợ lý suy luận trên sự cố trực tiếp.</p>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
        <Card className="flex flex-col overflow-hidden lg:col-span-8" style={{ height: "calc(100vh - 220px)", minHeight: 520 }}>
          <CopilotChat />
        </Card>

        <div className="space-y-4 lg:col-span-4">
          <Card>
            <CardHeader>
              <CardTitle>Khả năng</CardTitle>
              <CardDescription>Trợ lý có thể làm gì</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {CAPABILITIES.map((c) => (
                <div key={c.label} className="flex items-start gap-3">
                  <div className="grid size-8 shrink-0 place-items-center rounded-lg bg-accent-soft text-accent">
                    <c.icon className="size-4" />
                  </div>
                  <div>
                    <div className="text-[13px] font-medium text-ink">{c.label}</div>
                    <div className="text-[12px] text-ink-3">{c.desc}</div>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Sparkles className="size-4 text-accent" /> Phân tích chủ động
              </CardTitle>
              <CardDescription>Tự động rút ra từ dữ liệu của bạn</CardDescription>
            </CardHeader>
            <CardContent>
              <InsightList insights={insights} max={4} />
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
