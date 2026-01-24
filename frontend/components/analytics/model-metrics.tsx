"use client";

import React from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";

interface ModelMetricsProps {
  title: string;
  description: string;
}

export function ModelMetrics({ title, description }: ModelMetricsProps) {
  // Simulated training metrics
  const lossData = [
    { epoch: 1, train: 2.5, val: 2.8 },
    { epoch: 10, train: 1.2, val: 1.5 },
    { epoch: 20, train: 0.8, val: 1.1 },
    { epoch: 30, train: 0.5, val: 0.8 },
    { epoch: 40, train: 0.3, val: 0.6 },
    { epoch: 50, train: 0.2, val: 0.5 },
    { epoch: 60, train: 0.15, val: 0.45 },
    { epoch: 70, train: 0.12, val: 0.42 },
    { epoch: 80, train: 0.1, val: 0.4 },
    { epoch: 90, train: 0.08, val: 0.38 },
    { epoch: 100, train: 0.06, val: 0.35 },
  ];

  const mapData = [
    { epoch: 1, mAP50: 0.15, mAP95: 0.05 },
    { epoch: 10, mAP50: 0.45, mAP95: 0.2 },
    { epoch: 20, mAP50: 0.6, mAP95: 0.35 },
    { epoch: 30, mAP50: 0.72, mAP95: 0.45 },
    { epoch: 40, mAP50: 0.8, mAP95: 0.52 },
    { epoch: 50, mAP50: 0.85, mAP95: 0.58 },
    { epoch: 60, mAP50: 0.88, mAP95: 0.62 },
    { epoch: 70, mAP50: 0.9, mAP95: 0.65 },
    { epoch: 80, mAP50: 0.92, mAP95: 0.68 },
    { epoch: 90, mAP50: 0.93, mAP95: 0.7 },
    { epoch: 100, mAP50: 0.94, mAP95: 0.72 },
  ];

  const width = 350;
  const height = 180;
  const padding = { top: 20, right: 30, bottom: 35, left: 45 };
  const chartWidth = width - padding.left - padding.right;
  const chartHeight = height - padding.top - padding.bottom;

  const createPath = (data: { x: number; y: number }[]) => {
    return data.map((p, i) => (i === 0 ? `M ${p.x} ${p.y}` : `L ${p.x} ${p.y}`)).join(" ");
  };

  // Loss chart data
  const lossMax = 3;
  const lossPoints = {
    train: lossData.map((d, i) => ({
      x: padding.left + (i / (lossData.length - 1)) * chartWidth,
      y: padding.top + chartHeight - (d.train / lossMax) * chartHeight,
    })),
    val: lossData.map((d, i) => ({
      x: padding.left + (i / (lossData.length - 1)) * chartWidth,
      y: padding.top + chartHeight - (d.val / lossMax) * chartHeight,
    })),
  };

  // mAP chart data
  const mapPoints = {
    mAP50: mapData.map((d, i) => ({
      x: padding.left + (i / (mapData.length - 1)) * chartWidth,
      y: padding.top + chartHeight - d.mAP50 * chartHeight,
    })),
    mAP95: mapData.map((d, i) => ({
      x: padding.left + (i / (mapData.length - 1)) * chartWidth,
      y: padding.top + chartHeight - d.mAP95 * chartHeight,
    })),
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Loss Chart */}
          <div>
            <h4 className="text-sm font-medium text-gray-700 mb-2">Loss theo Epoch</h4>
            <svg width="100%" viewBox={`0 0 ${width} ${height}`}>
              {/* Grid */}
              {[0, 0.5, 1].map((tick, i) => (
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
                    x={padding.left - 8}
                    y={padding.top + chartHeight * (1 - tick) + 3}
                    textAnchor="end"
                    fontSize="9"
                    fill="#6b7280"
                  >
                    {(lossMax * tick).toFixed(1)}
                  </text>
                </g>
              ))}

              {/* Train Loss */}
              <path
                d={createPath(lossPoints.train)}
                fill="none"
                stroke="#f97316"
                strokeWidth="2"
              />

              {/* Val Loss */}
              <path
                d={createPath(lossPoints.val)}
                fill="none"
                stroke="#3b82f6"
                strokeWidth="2"
              />

              {/* X axis label */}
              <text
                x={padding.left + chartWidth / 2}
                y={height - 5}
                textAnchor="middle"
                fontSize="10"
                fill="#6b7280"
              >
                Epoch
              </text>

              {/* Legend */}
              <g transform={`translate(${width - 80}, ${padding.top})`}>
                <line x1="0" y1="0" x2="15" y2="0" stroke="#f97316" strokeWidth="2" />
                <text x="20" y="4" fontSize="9" fill="#374151">Train</text>
                <line x1="0" y1="15" x2="15" y2="15" stroke="#3b82f6" strokeWidth="2" />
                <text x="20" y="19" fontSize="9" fill="#374151">Val</text>
              </g>
            </svg>
          </div>

          {/* mAP Chart */}
          <div>
            <h4 className="text-sm font-medium text-gray-700 mb-2">mAP theo Epoch</h4>
            <svg width="100%" viewBox={`0 0 ${width} ${height}`}>
              {/* Grid */}
              {[0, 0.5, 1].map((tick, i) => (
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
                    x={padding.left - 8}
                    y={padding.top + chartHeight * (1 - tick) + 3}
                    textAnchor="end"
                    fontSize="9"
                    fill="#6b7280"
                  >
                    {tick.toFixed(1)}
                  </text>
                </g>
              ))}

              {/* mAP50 */}
              <path
                d={createPath(mapPoints.mAP50)}
                fill="none"
                stroke="#22c55e"
                strokeWidth="2"
              />

              {/* mAP95 */}
              <path
                d={createPath(mapPoints.mAP95)}
                fill="none"
                stroke="#8b5cf6"
                strokeWidth="2"
              />

              {/* X axis label */}
              <text
                x={padding.left + chartWidth / 2}
                y={height - 5}
                textAnchor="middle"
                fontSize="10"
                fill="#6b7280"
              >
                Epoch
              </text>

              {/* Legend */}
              <g transform={`translate(${width - 80}, ${padding.top})`}>
                <line x1="0" y1="0" x2="15" y2="0" stroke="#22c55e" strokeWidth="2" />
                <text x="20" y="4" fontSize="9" fill="#374151">mAP50</text>
                <line x1="0" y1="15" x2="15" y2="15" stroke="#8b5cf6" strokeWidth="2" />
                <text x="20" y="19" fontSize="9" fill="#374151">mAP50-95</text>
              </g>
            </svg>
          </div>
        </div>

        {/* Model Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-6 pt-4 border-t">
          <div className="text-center">
            <p className="text-2xl font-bold text-orange-500">94.2%</p>
            <p className="text-xs text-gray-500">mAP@50</p>
          </div>
          <div className="text-center">
            <p className="text-2xl font-bold text-purple-500">72.1%</p>
            <p className="text-xs text-gray-500">mAP@50-95</p>
          </div>
          <div className="text-center">
            <p className="text-2xl font-bold text-green-500">98.5%</p>
            <p className="text-xs text-gray-500">Precision</p>
          </div>
          <div className="text-center">
            <p className="text-2xl font-bold text-blue-500">96.8%</p>
            <p className="text-xs text-gray-500">Recall</p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
