"use client";

import React from "react";
import { SettingsPanel } from "@/components/settings/settings-panel";

export default function SettingsPage() {
  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Cấu hình</h1>
        <p className="text-gray-500">Quản lý cài đặt hệ thống phát hiện ngã</p>
      </div>

      {/* Settings Panel */}
      <SettingsPanel />
    </div>
  );
}
