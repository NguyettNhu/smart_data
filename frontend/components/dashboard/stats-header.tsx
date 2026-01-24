"use client";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";

interface StatsHeaderProps {
  fallsToday: number;
  isConnected: boolean;
  alarmEnabled: boolean;
  onAlarmToggle: (enabled: boolean) => void;
  showSkeleton: boolean;
  onSkeletonToggle: (enabled: boolean) => void;
}

export function StatsHeader({
  fallsToday,
  isConnected,
  alarmEnabled,
  onAlarmToggle,
  showSkeleton,
  onSkeletonToggle,
}: StatsHeaderProps) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
      {/* Falls Today */}
      <Card>
        <CardContent className="p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-500">Số lần ngã hôm nay</p>
              <p className="text-3xl font-bold text-gray-900">{fallsToday}</p>
            </div>
            <div className={cn(
              "p-3 rounded-full",
              fallsToday > 0 ? "bg-red-100" : "bg-green-100"
            )}>
              <svg
                className={cn(
                  "w-6 h-6",
                  fallsToday > 0 ? "text-red-500" : "text-green-500"
                )}
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
                />
              </svg>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* System Status */}
      <Card>
        <CardContent className="p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-500">Trạng thái hệ thống</p>
              <div className="flex items-center gap-2 mt-1">
                <Badge variant={isConnected ? "success" : "destructive"}>
                  {isConnected ? "Đang kết nối" : "Mất kết nối"}
                </Badge>
              </div>
            </div>
            <div className={cn(
              "p-3 rounded-full",
              isConnected ? "bg-green-100" : "bg-red-100"
            )}>
              <svg
                className={cn(
                  "w-6 h-6",
                  isConnected ? "text-green-500" : "text-red-500"
                )}
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M8.111 16.404a5.5 5.5 0 017.778 0M12 20h.01m-7.08-7.071c3.904-3.905 10.236-3.905 14.141 0M1.394 9.393c5.857-5.857 15.355-5.857 21.213 0"
                />
              </svg>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Cameras Active */}
      <Card>
        <CardContent className="p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-500">Camera hoạt động</p>
              <p className="text-3xl font-bold text-gray-900">1/1</p>
            </div>
            <div className="p-3 rounded-full bg-blue-100">
              <svg
                className="w-6 h-6 text-blue-500"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z"
                />
              </svg>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Alarm Toggle */}
      <Card>
        <CardContent className="p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-500">Còi báo động</p>
              <div className="flex items-center gap-2 mt-2">
                <Switch
                  checked={alarmEnabled}
                  onCheckedChange={onAlarmToggle}
                />
                <span className="text-sm font-medium">
                  {alarmEnabled ? "Bật" : "Tắt"}
                </span>
              </div>
            </div>
            <div className={cn(
              "p-3 rounded-full",
              alarmEnabled ? "bg-orange-100" : "bg-gray-100"
            )}>
              <svg
                className={cn(
                  "w-6 h-6",
                  alarmEnabled ? "text-orange-500" : "text-gray-400"
                )}
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M15.536 8.464a5 5 0 010 7.072m2.828-9.9a9 9 0 010 12.728M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z"
                />
              </svg>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Skeleton View Toggle */}
      <Card>
        <CardContent className="p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-500">Chế độ Skeleton</p>
              <div className="flex items-center gap-2 mt-2">
                <Switch
                  checked={showSkeleton}
                  onCheckedChange={onSkeletonToggle}
                />
                <span className="text-sm font-medium">
                  {showSkeleton ? "Bật" : "Tắt"}
                </span>
              </div>
            </div>
            <div className={cn(
              "p-3 rounded-full",
              showSkeleton ? "bg-purple-100" : "bg-gray-100"
            )}>
              <svg
                className={cn(
                  "w-6 h-6",
                  showSkeleton ? "text-purple-500" : "text-gray-400"
                )}
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"
                />
              </svg>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
