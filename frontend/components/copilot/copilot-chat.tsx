"use client";
import * as React from "react";
import { motion } from "motion/react";
import { Sparkles, ArrowUp, Wrench, Quote, User } from "lucide-react";
import { api } from "@/lib/api";
import type { AgentAnswer } from "@/lib/types";
import { cn } from "@/lib/utils";
import { MiniMarkdown } from "./markdown";
import { AgentChartView } from "./agent-chart";

interface Msg {
  id: string;
  role: "user" | "assistant";
  content?: string;
  answer?: AgentAnswer;
  pending?: boolean;
}

const GREETING: AgentAnswer = {
  answer:
    "Xin chào, tôi là **Trợ lý Aegis**. Tôi phân tích dữ liệu phát hiện ngã trực tiếp — hãy hỏi tôi về xu hướng, giờ cao điểm, khu vực rủi ro, thời gian phản hồi, hoặc yêu cầu một bản tóm tắt.",
  mode: "grounded",
  tools_used: [],
  chart: null,
  table: null,
  citations: [],
  suggestions: [
    "Tóm tắt 7 ngày qua",
    "Ngã thường xảy ra khi nào?",
    "Khu vực nào nguy hiểm nhất?",
    "Chúng ta phản hồi nhanh thế nào?",
  ],
};

let _id = 0;
const nextId = () => `m${++_id}`;

export function CopilotChat({
  initialPrompt,
  onConsumed,
  compact = false,
}: {
  initialPrompt?: string | null;
  onConsumed?: () => void;
  compact?: boolean;
}) {
  const [messages, setMessages] = React.useState<Msg[]>([
    { id: nextId(), role: "assistant", answer: GREETING },
  ]);
  const [input, setInput] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const scrollRef = React.useRef<HTMLDivElement>(null);

  const scrollToEnd = React.useCallback(() => {
    requestAnimationFrame(() => {
      scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
    });
  }, []);

  const send = React.useCallback(
    async (text: string) => {
      const q = text.trim();
      if (!q || busy) return;
      setInput("");
      setBusy(true);
      const userMsg: Msg = { id: nextId(), role: "user", content: q };
      const pendingMsg: Msg = { id: nextId(), role: "assistant", pending: true };
      setMessages((m) => [...m, userMsg, pendingMsg]);
      scrollToEnd();
      const answer = await api.agentQuery(q);
      setMessages((m) => m.map((msg) => (msg.id === pendingMsg.id ? { ...msg, pending: false, answer } : msg)));
      setBusy(false);
      scrollToEnd();
    },
    [busy, scrollToEnd]
  );

  const lastSentRef = React.useRef<string | null>(null);
  React.useEffect(() => {
    // Guard against React StrictMode's double-invoked effects (dev) and
    // re-renders so a given prompt is only auto-sent once.
    if (initialPrompt && lastSentRef.current !== initialPrompt) {
      lastSentRef.current = initialPrompt;
      send(initialPrompt);
      onConsumed?.();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialPrompt]);

  return (
    <div className="flex h-full flex-col">
      <div ref={scrollRef} className="flex-1 space-y-4 overflow-y-auto px-4 py-5">
        {messages.map((m) => (
          <MessageRow key={m.id} msg={m} onSuggestion={send} compact={compact} />
        ))}
      </div>

      <div className="border-t border-line bg-surface/60 p-3 backdrop-blur">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            send(input);
          }}
          className="flex items-end gap-2 rounded-xl border border-line-2 bg-surface p-2 shadow-xs focus-within:border-accent focus-within:ring-2 focus-within:ring-accent/20"
        >
          <textarea
            name="copilot-input"
            aria-label="Hỏi Trợ lý Aegis"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                send(input);
              }
            }}
            rows={1}
            placeholder="Hỏi về ngã, khu vực, xu hướng…"
            className="max-h-28 flex-1 resize-none bg-transparent px-2 py-1.5 text-sm text-ink outline-none placeholder:text-ink-4"
          />
          <button
            type="submit"
            disabled={!input.trim() || busy}
            className="grid size-8 place-items-center rounded-lg bg-accent text-white transition-all hover:bg-accent-2 disabled:opacity-40"
          >
            <ArrowUp className="size-4" />
          </button>
        </form>
        <p className="mt-1.5 px-1 text-center text-[10.5px] text-ink-4">
          Dựa trên dữ liệu phát hiện trực tiếp · kiểm chứng trước khi hành động
        </p>
      </div>
    </div>
  );
}

function MessageRow({ msg, onSuggestion, compact }: { msg: Msg; onSuggestion: (s: string) => void; compact: boolean }) {
  if (msg.role === "user") {
    return (
      <div className="flex justify-end gap-2.5">
        <div className="max-w-[85%] rounded-2xl rounded-tr-sm bg-accent px-3.5 py-2 text-sm text-white shadow-sm">
          {msg.content}
        </div>
        <div className="mt-0.5 grid size-7 shrink-0 place-items-center rounded-full bg-surface-2 text-ink-3">
          <User className="size-4" />
        </div>
      </div>
    );
  }

  return (
    <div className="flex gap-2.5">
      <div className="mt-0.5 grid size-7 shrink-0 place-items-center rounded-full bg-gradient-to-br from-accent to-[#13b8a4] text-white shadow-sm">
        <Sparkles className="size-4" />
      </div>
      <div className="min-w-0 flex-1 space-y-2.5">
        {msg.pending ? (
          <Thinking />
        ) : msg.answer ? (
          <>
            {msg.answer.tools_used.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {msg.answer.tools_used.map((t, i) => (
                  <span
                    key={i}
                    className="inline-flex items-center gap-1 rounded-md border border-line bg-surface-2 px-1.5 py-0.5 text-[10.5px] font-medium text-ink-3"
                    title={t.summary}
                  >
                    <Wrench className="size-3" />
                    {t.name}
                  </span>
                ))}
              </div>
            )}

            <div className="rounded-2xl rounded-tl-sm border border-line bg-surface px-3.5 py-2.5 shadow-xs">
              <MiniMarkdown text={msg.answer.answer} />

              {msg.answer.chart && (
                <div className="mt-3 rounded-lg border border-line bg-canvas/60 p-2">
                  <AgentChartView chart={msg.answer.chart} />
                </div>
              )}

              {msg.answer.table && msg.answer.table.length > 0 && (
                <AnswerTable rows={msg.answer.table} />
              )}

              {msg.answer.citations.length > 0 && (
                <div className="mt-2.5 flex items-start gap-1.5 border-t border-line pt-2 text-[11px] text-ink-4">
                  <Quote className="mt-0.5 size-3 shrink-0" />
                  <span>{msg.answer.citations.join(" · ")}</span>
                </div>
              )}
            </div>

            {msg.answer.suggestions.length > 0 && (
              <div className={cn("flex flex-wrap gap-1.5", compact && "flex-col items-start")}>
                {msg.answer.suggestions.map((s, i) => (
                  <button
                    key={i}
                    onClick={() => onSuggestion(s)}
                    className="rounded-full border border-line-2 bg-surface px-2.5 py-1 text-[12px] text-ink-2 transition-colors hover:border-accent-line hover:bg-accent-soft hover:text-accent-ink"
                  >
                    {s}
                  </button>
                ))}
              </div>
            )}
          </>
        ) : null}
      </div>
    </div>
  );
}

function Thinking() {
  return (
    <div className="inline-flex items-center gap-2 rounded-2xl rounded-tl-sm border border-line bg-surface px-3.5 py-2.5 shadow-xs">
      {[0, 1, 2].map((i) => (
        <motion.span
          key={i}
          className="size-1.5 rounded-full bg-accent"
          animate={{ opacity: [0.3, 1, 0.3], y: [0, -3, 0] }}
          transition={{ duration: 1, repeat: Infinity, delay: i * 0.18 }}
        />
      ))}
      <span className="text-[12px] text-ink-3">Đang phân tích dữ liệu…</span>
    </div>
  );
}

function AnswerTable({ rows }: { rows: Record<string, unknown>[] }) {
  const cols = Object.keys(rows[0] ?? {});
  return (
    <div className="mt-3 overflow-x-auto rounded-lg border border-line">
      <table className="w-full text-[12px]">
        <thead>
          <tr className="bg-surface-2 text-left text-ink-3">
            {cols.map((c) => (
              <th key={c} className="px-2.5 py-1.5 font-medium capitalize">
                {c.replace(/_/g, " ")}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} className="border-t border-line">
              {cols.map((c) => (
                <td key={c} className="px-2.5 py-1.5 text-ink-2">
                  {String(r[c])}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
