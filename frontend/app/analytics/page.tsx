"use client";

import React from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { LineChart } from "@/components/analytics/line-chart";
import { HeatmapChart } from "@/components/analytics/heatmap-chart";
import { ModelMetrics } from "@/components/analytics/model-metrics";
import { Badge } from "@/components/ui/badge";

export default function AnalyticsPage() {
  // Sample data for line chart - Falls by hour
  const hourlyFallData = [
    { hour: "00:00", falls: 0 },
    { hour: "02:00", falls: 1 },
    { hour: "04:00", falls: 0 },
    { hour: "06:00", falls: 2 },
    { hour: "08:00", falls: 1 },
    { hour: "10:00", falls: 0 },
    { hour: "12:00", falls: 1 },
    { hour: "14:00", falls: 0 },
    { hour: "16:00", falls: 1 },
    { hour: "18:00", falls: 2 },
    { hour: "20:00", falls: 3 },
    { hour: "22:00", falls: 2 },
  ];

  // Sample data for heatmap - Fall locations in room
  const heatmapData = [
    { x: 0, y: 0, value: 2 },
    { x: 1, y: 0, value: 1 },
    { x: 2, y: 1, value: 3 },
    { x: 3, y: 1, value: 5 },
    { x: 2, y: 2, value: 4 },
    { x: 3, y: 2, value: 2 },
    { x: 4, y: 2, value: 1 },
    { x: 1, y: 3, value: 2 },
    { x: 2, y: 3, value: 6 },
    { x: 3, y: 3, value: 3 },
  ];

  // Summary stats
  const stats = [
    { label: "Tổng số lần ngã", value: "47", change: "+12%", isUp: true },
    { label: "Ngã tuần này", value: "8", change: "-25%", isUp: false },
    { label: "Thời gian phản hồi TB", value: "2.3s", change: "-15%", isUp: false },
    { label: "Độ chính xác phát hiện", value: "94.2%", change: "+2.1%", isUp: true },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Phân tích & Thống kê</h1>
        <p className="text-gray-500">Báo cáo chi tiết về hoạt động phát hiện ngã</p>
      </div>

      {/* Summary Stats */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {stats.map((stat, index) => (
          <Card key={index}>
            <CardContent className="p-4">
              <p className="text-sm text-gray-500">{stat.label}</p>
              <div className="flex items-end justify-between mt-1">
                <p className="text-3xl font-bold text-gray-900">{stat.value}</p>
                <Badge
                  variant={stat.isUp ? (stat.label.includes("Độ chính xác") ? "success" : "destructive") : "success"}
                  className="text-xs"
                >
                  {stat.change}
                </Badge>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Line Chart - Falls by Hour */}
        <LineChart
          title="Tần suất ngã theo khung giờ"
          description="Phân tích số lần ngã theo từng khung giờ trong ngày (7 ngày gần nhất)"
          data={hourlyFallData}
        />

        {/* Heatmap - Fall Locations */}
        <HeatmapChart
          title="Vị trí hay bị ngã trong phòng"
          description="Bản đồ nhiệt dựa trên tọa độ bounding box từ YOLO"
          data={heatmapData}
          rows={4}
          cols={6}
        />
      </div>

      {/* Model Metrics */}
      <ModelMetrics
        title="Hiệu suất Model YOLO"
        description="Biểu đồ Loss và mAP qua quá trình huấn luyện (100 epochs)"
      />

      {/* Additional Insights */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Peak Hours */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Giờ cao điểm</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {[
                { time: "20:00 - 22:00", count: 12, percent: 25.5 },
                { time: "06:00 - 08:00", count: 8, percent: 17.0 },
                { time: "18:00 - 20:00", count: 7, percent: 14.9 },
              ].map((item, i) => (
                <div key={i} className="flex items-center justify-between">
                  <span className="text-sm font-medium">{item.time}</span>
                  <div className="flex items-center gap-2">
                    <div className="w-24 h-2 bg-gray-200 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-orange-500 rounded-full"
                        style={{ width: `${item.percent}%` }}
                      />
                    </div>
                    <span className="text-sm text-gray-500 w-8">{item.count}</span>
                  </div>
                </div>
              ))}
            </div>
            <p className="text-xs text-gray-500 mt-4">
              💡 Gợi ý: Tăng cường giám sát vào buổi tối (20:00-22:00)
            </p>
          </CardContent>
        </Card>

        {/* Risk Areas */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Vùng nguy hiểm cao</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {[
                { area: "Cạnh giường", count: 15, risk: "high" },
                { area: "Phòng tắm", count: 12, risk: "high" },
                { area: "Cầu thang", count: 8, risk: "medium" },
              ].map((item, i) => (
                <div key={i} className="flex items-center justify-between p-2 rounded-lg bg-gray-50">
                  <span className="text-sm font-medium">{item.area}</span>
                  <div className="flex items-center gap-2">
                    <Badge
                      variant={item.risk === "high" ? "destructive" : "warning"}
                      className="text-xs"
                    >
                      {item.risk === "high" ? "Cao" : "TB"}
                    </Badge>
                    <span className="text-sm text-gray-500">{item.count} lần</span>
                  </div>
                </div>
              ))}
            </div>
            <p className="text-xs text-gray-500 mt-4">
              ⚠️ Khuyến nghị: Lắp thêm tay vịn tại khu vực cạnh giường
            </p>
          </CardContent>
        </Card>

        {/* Weekly Trend */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Xu hướng tuần</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-end justify-between h-32 gap-2">
              {[
                { day: "T2", value: 2 },
                { day: "T3", value: 1 },
                { day: "T4", value: 3 },
                { day: "T5", value: 0 },
                { day: "T6", value: 2 },
                { day: "T7", value: 4 },
                { day: "CN", value: 3 },
              ].map((item, i) => (
                <div key={i} className="flex flex-col items-center flex-1">
                  <div
                    className="w-full bg-orange-500 rounded-t-md transition-all hover:bg-orange-600"
                    style={{ height: `${(item.value / 4) * 100}%`, minHeight: item.value > 0 ? "8px" : "2px" }}
                  />
                  <span className="text-xs text-gray-500 mt-2">{item.day}</span>
                </div>
              ))}
            </div>
            <p className="text-xs text-gray-500 mt-4">
              📊 Cuối tuần có tần suất ngã cao hơn ngày thường
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
