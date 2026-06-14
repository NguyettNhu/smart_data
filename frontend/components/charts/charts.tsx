"use client";
import * as React from "react";
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  BarChart,
  Bar,
  Cell,
  PieChart,
  Pie,
  LineChart,
  Line,
} from "recharts";

export const CHART = {
  teal: "#0e9b8a",
  blue: "#3b82f6",
  emerald: "#10b981",
  amber: "#f59e0b",
  red: "#ef4444",
  violet: "#8b5cf6",
  orange: "#e0552a",
};

export const SEVERITY_COLOR: Record<string, string> = {
  low: "#10b981",
  medium: "#f59e0b",
  high: "#e0552a",
  critical: "#dc2626",
};

const axisProps = {
  stroke: "#aab6bf",
  fontSize: 11,
  tickLine: false,
  axisLine: false,
} as const;

type TooltipEntry = { color?: string; fill?: string; name?: string; value?: number | string };
function ChartTooltip({
  active,
  payload,
  label,
  unit,
}: {
  active?: boolean;
  payload?: TooltipEntry[];
  label?: string | number;
  unit?: string;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border border-line bg-surface/95 px-3 py-2 shadow-lg backdrop-blur">
      {label != null && <div className="mb-1 text-[11px] font-medium text-ink-3">{label}</div>}
      {payload.map((p, i) => (
        <div key={i} className="flex items-center gap-2 text-[13px]">
          <span className="size-2 rounded-full" style={{ background: p.color || p.fill }} />
          <span className="text-ink-2">{p.name}</span>
          <span className="ml-auto font-semibold tabular-nums text-ink">
            {p.value}
            {unit || ""}
          </span>
        </div>
      ))}
    </div>
  );
}

function useMounted() {
  const [m, setM] = React.useState(false);
  React.useEffect(() => setM(true), []);
  return m;
}

/** Gates the Recharts ResponsiveContainer to client mount (avoids the SSR width(-1) warning). */
function ChartHost({ height, children }: { height: number; children: React.ReactElement }) {
  const mounted = useMounted();
  return (
    <div style={{ height }}>
      {mounted && (
        <ResponsiveContainer width="100%" height="100%">
          {children}
        </ResponsiveContainer>
      )}
    </div>
  );
}

export function TrendArea({
  data,
  xKey,
  yKey,
  color = CHART.teal,
  height = 240,
  label = "Falls",
}: {
  data: Record<string, unknown>[];
  xKey: string;
  yKey: string;
  color?: string;
  height?: number;
  label?: string;
}) {
  const id = React.useId().replace(/:/g, "");
  return (
    <ChartHost height={height}>
        <AreaChart data={data} margin={{ top: 8, right: 8, left: -18, bottom: 0 }}>
          <defs>
            <linearGradient id={`grad-${id}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={color} stopOpacity={0.32} />
              <stop offset="100%" stopColor={color} stopOpacity={0.02} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="#eef3f5" vertical={false} />
          <XAxis dataKey={xKey} {...axisProps} interval="preserveStartEnd" minTickGap={20} />
          <YAxis {...axisProps} width={34} allowDecimals={false} />
          <Tooltip content={<ChartTooltip />} cursor={{ stroke: color, strokeOpacity: 0.25 }} />
          <Area
            type="monotone"
            dataKey={yKey}
            name={label}
            stroke={color}
            strokeWidth={2.5}
            fill={`url(#grad-${id})`}
            dot={false}
            activeDot={{ r: 4, strokeWidth: 2, stroke: "#fff" }}
            animationDuration={900}
          />
        </AreaChart>
    </ChartHost>
  );
}

export function MiniArea({ data, yKey, color = CHART.teal, height = 48 }: { data: Record<string, unknown>[]; yKey: string; color?: string; height?: number }) {
  const id = React.useId().replace(/:/g, "");
  return (
    <ChartHost height={height}>
        <AreaChart data={data} margin={{ top: 4, right: 0, left: 0, bottom: 0 }}>
          <defs>
            <linearGradient id={`mini-${id}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={color} stopOpacity={0.35} />
              <stop offset="100%" stopColor={color} stopOpacity={0} />
            </linearGradient>
          </defs>
          <Area type="monotone" dataKey={yKey} stroke={color} strokeWidth={2} fill={`url(#mini-${id})`} dot={false} animationDuration={700} />
        </AreaChart>
    </ChartHost>
  );
}

export function CategoryBar({
  data,
  xKey,
  yKey,
  color = CHART.teal,
  height = 240,
  colorByIndex,
  label = "Count",
}: {
  data: Record<string, unknown>[];
  xKey: string;
  yKey: string;
  color?: string;
  height?: number;
  colorByIndex?: string[];
  label?: string;
}) {
  return (
    <ChartHost height={height}>
        <BarChart data={data} margin={{ top: 8, right: 8, left: -18, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#eef3f5" vertical={false} />
          <XAxis dataKey={xKey} {...axisProps} interval={0} angle={data.length > 6 ? -25 : 0} textAnchor={data.length > 6 ? "end" : "middle"} height={data.length > 6 ? 50 : 24} />
          <YAxis {...axisProps} width={34} allowDecimals={false} />
          <Tooltip content={<ChartTooltip />} cursor={{ fill: "#f1f5f7" }} />
          <Bar dataKey={yKey} name={label} radius={[6, 6, 0, 0]} animationDuration={800} maxBarSize={46}>
            {data.map((_, i) => (
              <Cell key={i} fill={colorByIndex ? colorByIndex[i % colorByIndex.length] : color} />
            ))}
          </Bar>
        </BarChart>
    </ChartHost>
  );
}

export function SeverityDonut({
  data,
  height = 240,
}: {
  data: { severity: string; count: number }[];
  height?: number;
}) {
  const total = data.reduce((s, d) => s + d.count, 0);
  const mounted = useMounted();
  return (
    <div className="relative" style={{ height }}>
      {mounted && (
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Tooltip content={<ChartTooltip />} />
          <Pie
            data={data}
            dataKey="count"
            nameKey="severity"
            innerRadius="62%"
            outerRadius="92%"
            paddingAngle={2}
            stroke="none"
            animationDuration={800}
          >
            {data.map((d, i) => (
              <Cell key={i} fill={SEVERITY_COLOR[d.severity] || CHART.teal} />
            ))}
          </Pie>
        </PieChart>
      </ResponsiveContainer>
      )}
      <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-2xl font-bold tabular-nums text-ink">{total}</span>
        <span className="text-[11px] text-ink-3">tổng sự cố</span>
      </div>
    </div>
  );
}

export function SimpleLine({ data, xKey, series, height = 240 }: { data: Record<string, unknown>[]; xKey: string; series: { key: string; color: string; label: string }[]; height?: number }) {
  return (
    <ChartHost height={height}>
        <LineChart data={data} margin={{ top: 8, right: 8, left: -18, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#eef3f5" vertical={false} />
          <XAxis dataKey={xKey} {...axisProps} />
          <YAxis {...axisProps} width={34} />
          <Tooltip content={<ChartTooltip />} />
          {series.map((s) => (
            <Line key={s.key} type="monotone" dataKey={s.key} name={s.label} stroke={s.color} strokeWidth={2.5} dot={false} animationDuration={800} />
          ))}
        </LineChart>
    </ChartHost>
  );
}
