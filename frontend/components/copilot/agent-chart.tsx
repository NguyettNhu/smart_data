"use client";
import type { AgentChart } from "@/lib/types";
import { TrendArea, CategoryBar, SimpleLine, SeverityDonut, CHART, SEVERITY_COLOR } from "@/components/charts/charts";

export function AgentChartView({ chart }: { chart: AgentChart }) {
  const { kind, x_key, y_key, data, label } = chart;
  if (!data?.length) return null;

  if (kind === "area") return <TrendArea data={data} xKey={x_key} yKey={y_key} height={180} label={label || "Falls"} />;
  if (kind === "line") return <SimpleLine data={data} xKey={x_key} series={[{ key: y_key, color: CHART.teal, label: label || "Value" }]} height={180} />;
  if (kind === "donut") {
    const donut = data.map((d) => ({ severity: String(d[x_key]), count: Number(d[y_key]) }));
    return <SeverityDonut data={donut} height={180} />;
  }
  // bar (default) — colour zones/severity nicely
  const colors = data.map((d) => SEVERITY_COLOR[String(d[x_key]).toLowerCase()] || CHART.teal);
  return <CategoryBar data={data} xKey={x_key} yKey={y_key} height={190} colorByIndex={colors} label={label || "Count"} />;
}
