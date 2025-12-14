"use client";

import React from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export interface AlertEvent {
  id: string;
  timestamp: Date;
  camera: string;
  type: "fall" | "warning" | "info";
  confidence: number;
  snapshot?: string;
  acknowledged: boolean;
}

interface AlertHistoryProps {
  alerts: AlertEvent[];
  onAcknowledge: (id: string) => void;
  onPlayback: (id: string) => void;
}

export function AlertHistory({ alerts, onAcknowledge, onPlayback }: AlertHistoryProps) {
  const formatTime = (date: Date) => {
    return date.toLocaleTimeString("vi-VN", {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
  };

  const getTypeStyles = (type: string) => {
    switch (type) {
      case "fall":
        return {
          bg: "bg-red-50 border-red-200",
          badge: "destructive" as const,
          text: "Phát hiện ngã",
        };
      case "warning":
        return {
          bg: "bg-yellow-50 border-yellow-200",
          badge: "warning" as const,
          text: "Cảnh báo",
        };
      default:
        return {
          bg: "bg-blue-50 border-blue-200",
          badge: "secondary" as const,
          text: "Thông tin",
        };
    }
  };

  return (
    <Card className="h-full flex flex-col">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg">Lịch sử cảnh báo</CardTitle>
          <Badge variant="outline" className="text-xs">
            {alerts.filter((a) => !a.acknowledged).length} mới
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="flex-1 p-0 overflow-hidden">
        <ScrollArea className="h-full px-4 pb-4">
          <div className="space-y-3">
            {alerts.length === 0 ? (
              <div className="text-center py-8 text-gray-500">
                <svg
                  className="w-12 h-12 mx-auto mb-3 text-gray-300"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
                  />
                </svg>
                <p>Chưa có cảnh báo nào</p>
              </div>
            ) : (
              alerts.map((alert) => {
                const styles = getTypeStyles(alert.type);
                return (
                  <div
                    key={alert.id}
                    className={cn(
                      "rounded-lg border p-3 transition-all",
                      styles.bg,
                      !alert.acknowledged && alert.type === "fall" && "animate-pulse-alert"
                    )}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <Badge variant={styles.badge} className="text-xs">
                            {styles.text}
                          </Badge>
                          <span className="text-xs text-gray-500">
                            {formatTime(alert.timestamp)}
                          </span>
                        </div>
                        <p className="text-sm font-medium text-gray-900 truncate">
                          {alert.camera}
                        </p>
                        <p className="text-xs text-gray-500">
                          Độ tin cậy: {(alert.confidence * 100).toFixed(0)}%
                        </p>
                      </div>
                      
                      {alert.snapshot && (
                        <div className="w-16 h-12 rounded overflow-hidden bg-gray-200 flex-shrink-0">
                          <div className="w-full h-full bg-gradient-to-br from-gray-300 to-gray-400 flex items-center justify-center">
                            <svg
                              className="w-6 h-6 text-gray-500"
                              fill="none"
                              stroke="currentColor"
                              viewBox="0 0 24 24"
                            >
                              <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth={2}
                                d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
                              />
                            </svg>
                          </div>
                        </div>
                      )}
                    </div>
                    
                    <div className="flex gap-2 mt-2">
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-7 text-xs flex-1"
                        onClick={() => onPlayback(alert.id)}
                      >
                        <svg
                          className="w-3 h-3 mr-1"
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z"
                          />
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                          />
                        </svg>
                        Xem lại
                      </Button>
                      {!alert.acknowledged && (
                        <Button
                          size="sm"
                          variant="secondary"
                          className="h-7 text-xs"
                          onClick={() => onAcknowledge(alert.id)}
                        >
                          Xác nhận
                        </Button>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </ScrollArea>
      </CardContent>
    </Card>
  );
}
