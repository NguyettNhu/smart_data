"use client";

import React from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";

interface HeatmapCell {
  x: number;
  y: number;
  value: number;
}

interface HeatmapChartProps {
  title: string;
  description: string;
  data: HeatmapCell[];
  rows: number;
  cols: number;
}

export function HeatmapChart({ title, description, data, rows, cols }: HeatmapChartProps) {
  const maxValue = Math.max(...data.map((d) => d.value), 1);
  const cellWidth = 50;
  const cellHeight = 50;
  const width = cols * cellWidth + 60;
  const height = rows * cellHeight + 60;

  const getColor = (value: number) => {
    const intensity = value / maxValue;
    if (intensity === 0) return "#f3f4f6";
    if (intensity < 0.25) return "#fef3c7";
    if (intensity < 0.5) return "#fcd34d";
    if (intensity < 0.75) return "#f97316";
    return "#dc2626";
  };

  // Create a grid lookup
  const gridLookup: Record<string, number> = {};
  data.forEach((d) => {
    gridLookup[`${d.x}-${d.y}`] = d.value;
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="relative">
          {/* Room layout visualization */}
          <svg width="100%" viewBox={`0 0 ${width} ${height}`}>
            {/* Grid cells */}
            {Array.from({ length: rows }).map((_, row) =>
              Array.from({ length: cols }).map((_, col) => {
                const value = gridLookup[`${col}-${row}`] || 0;
                return (
                  <g key={`${row}-${col}`}>
                    <rect
                      x={30 + col * cellWidth}
                      y={30 + row * cellHeight}
                      width={cellWidth - 2}
                      height={cellHeight - 2}
                      fill={getColor(value)}
                      rx="4"
                      className="transition-all hover:opacity-80"
                    />
                    {value > 0 && (
                      <text
                        x={30 + col * cellWidth + cellWidth / 2}
                        y={30 + row * cellHeight + cellHeight / 2 + 4}
                        textAnchor="middle"
                        fontSize="12"
                        fontWeight="bold"
                        fill={value / maxValue > 0.5 ? "#fff" : "#374151"}
                      >
                        {value}
                      </text>
                    )}
                  </g>
                );
              })
            )}

            {/* Room elements overlay */}
            <rect
              x={30}
              y={30}
              width={cellWidth * 2 - 2}
              height={cellHeight - 2}
              fill="none"
              stroke="#374151"
              strokeWidth="2"
              strokeDasharray="4"
              rx="4"
            />
            <text x={30 + cellWidth} y={30 + cellHeight / 2 + 4} textAnchor="middle" fontSize="10" fill="#374151">
              Giường
            </text>

            <rect
              x={30 + cellWidth * 4}
              y={30 + cellHeight * 3}
              width={cellWidth - 2}
              height={cellHeight - 2}
              fill="none"
              stroke="#374151"
              strokeWidth="2"
              strokeDasharray="4"
              rx="4"
            />
            <text x={30 + cellWidth * 4.5} y={30 + cellHeight * 3.5 + 4} textAnchor="middle" fontSize="10" fill="#374151">
              Bàn
            </text>

            {/* Axis labels */}
            {Array.from({ length: cols }).map((_, i) => (
              <text
                key={`col-${i}`}
                x={30 + i * cellWidth + cellWidth / 2}
                y={20}
                textAnchor="middle"
                fontSize="10"
                fill="#6b7280"
              >
                {i + 1}
              </text>
            ))}
            {Array.from({ length: rows }).map((_, i) => (
              <text
                key={`row-${i}`}
                x={15}
                y={30 + i * cellHeight + cellHeight / 2 + 4}
                textAnchor="middle"
                fontSize="10"
                fill="#6b7280"
              >
                {String.fromCharCode(65 + i)}
              </text>
            ))}
          </svg>

          {/* Legend */}
          <div className="flex items-center justify-center gap-4 mt-4">
            <span className="text-xs text-gray-500">Ít</span>
            <div className="flex gap-1">
              {["#f3f4f6", "#fef3c7", "#fcd34d", "#f97316", "#dc2626"].map((color, i) => (
                <div
                  key={i}
                  className="w-6 h-4 rounded"
                  style={{ backgroundColor: color }}
                />
              ))}
            </div>
            <span className="text-xs text-gray-500">Nhiều</span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
