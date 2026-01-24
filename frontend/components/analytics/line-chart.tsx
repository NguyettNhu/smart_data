"use client";

import React from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";

interface LineChartProps {
  title: string;
  description: string;
  data: { hour: string; falls: number }[];
}

export function LineChart({ title, description, data }: LineChartProps) {
  const maxValue = Math.max(...data.map((d) => d.falls), 1);
  const height = 200;
  const width = 700;
  const padding = { top: 20, right: 30, bottom: 40, left: 40 };
  const chartWidth = width - padding.left - padding.right;
  const chartHeight = height - padding.top - padding.bottom;

  const points = data.map((d, i) => ({
    x: padding.left + (i / (data.length - 1)) * chartWidth,
    y: padding.top + chartHeight - (d.falls / maxValue) * chartHeight,
    value: d.falls,
    label: d.hour,
  }));

  const pathD = points
    .map((p, i) => (i === 0 ? `M ${p.x} ${p.y}` : `L ${p.x} ${p.y}`))
    .join(" ");

  const areaD = `${pathD} L ${points[points.length - 1].x} ${padding.top + chartHeight} L ${points[0].x} ${padding.top + chartHeight} Z`;

  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent>
        <svg width="100%" viewBox={`0 0 ${width} ${height}`} className="overflow-visible">
          {/* Grid lines */}
          {[0, 0.25, 0.5, 0.75, 1].map((tick, i) => (
            <g key={i}>
              <line
                x1={padding.left}
                y1={padding.top + chartHeight * (1 - tick)}
                x2={width - padding.right}
                y2={padding.top + chartHeight * (1 - tick)}
                stroke="#e5e7eb"
                strokeDasharray="4"
              />
              <text
                x={padding.left - 10}
                y={padding.top + chartHeight * (1 - tick) + 4}
                textAnchor="end"
                fontSize="10"
                fill="#6b7280"
              >
                {Math.round(maxValue * tick)}
              </text>
            </g>
          ))}

          {/* Area under curve */}
          <path d={areaD} fill="url(#gradient)" opacity="0.3" />

          {/* Line */}
          <path d={pathD} fill="none" stroke="#f97316" strokeWidth="2" />

          {/* Points */}
          {points.map((p, i) => (
            <g key={i}>
              <circle cx={p.x} cy={p.y} r="4" fill="#f97316" />
              <text
                x={p.x}
                y={height - 10}
                textAnchor="middle"
                fontSize="9"
                fill="#6b7280"
              >
                {p.label}
              </text>
            </g>
          ))}

          {/* Gradient definition */}
          <defs>
            <linearGradient id="gradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#f97316" />
              <stop offset="100%" stopColor="#fff7ed" />
            </linearGradient>
          </defs>
        </svg>
      </CardContent>
    </Card>
  );
}
