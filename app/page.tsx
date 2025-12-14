"use client";

import React, { useState, useCallback } from "react";
import { VideoStream } from "@/components/dashboard/video-stream";
import { AlertHistory, AlertEvent } from "@/components/dashboard/alert-history";
import { StatsHeader } from "@/components/dashboard/stats-header";
import { SnapshotGallery, Snapshot } from "@/components/dashboard/snapshot-gallery";

export default function DashboardPage() {
  const [alerts, setAlerts] = useState<AlertEvent[]>([
    {
      id: "1",
      timestamp: new Date(Date.now() - 1000 * 60 * 5),
      camera: "Camera 01 - Phòng khách",
      type: "fall",
      confidence: 0.95,
      snapshot: "snapshot-1",
      acknowledged: true,
    },
    {
      id: "2",
      timestamp: new Date(Date.now() - 1000 * 60 * 30),
      camera: "Camera 01 - Phòng khách",
      type: "warning",
      confidence: 0.72,
      acknowledged: true,
    },
  ]);

  const [snapshots, setSnapshots] = useState<Snapshot[]>([
    {
      id: "snap-1",
      timestamp: new Date(Date.now() - 1000 * 60 * 5),
      camera: "Camera 01",
      confidence: 0.95,
    },
    {
      id: "snap-2",
      timestamp: new Date(Date.now() - 1000 * 60 * 60),
      camera: "Camera 01",
      confidence: 0.89,
    },
  ]);

  const [fallsToday, setFallsToday] = useState(2);
  const [alarmEnabled, setAlarmEnabled] = useState(true);
  const [showSkeleton, setShowSkeleton] = useState(false);

  const handleFallDetected = useCallback((detection: { id: string; confidence: number }) => {
    const newAlert: AlertEvent = {
      id: `alert-${Date.now()}`,
      timestamp: new Date(),
      camera: "Camera 01 - Phòng khách",
      type: "fall",
      confidence: detection.confidence,
      snapshot: `snapshot-${Date.now()}`,
      acknowledged: false,
    };
    
    setAlerts((prev) => [newAlert, ...prev.slice(0, 49)]);
    setFallsToday((prev) => prev + 1);
    
    // Add snapshot
    const newSnapshot: Snapshot = {
      id: `snap-${Date.now()}`,
      timestamp: new Date(),
      camera: "Camera 01",
      confidence: detection.confidence,
    };
    setSnapshots((prev) => [newSnapshot, ...prev.slice(0, 11)]);
  }, []);

  const handleAcknowledge = useCallback((id: string) => {
    setAlerts((prev) =>
      prev.map((a) => (a.id === id ? { ...a, acknowledged: true } : a))
    );
  }, []);

  const handlePlayback = useCallback((id: string) => {
    console.log("Playback for alert:", id);
    // TODO: Implement playback functionality
  }, []);

  const handleViewSnapshot = useCallback((id: string) => {
    console.log("View snapshot:", id);
    // TODO: Implement snapshot viewer
  }, []);

  const handleDeleteSnapshot = useCallback((id: string) => {
    setSnapshots((prev) => prev.filter((s) => s.id !== id));
  }, []);

  // Handle snapshot capture from video stream
  const handleSnapshotCapture = useCallback((imageData: string, detection: { confidence: number }) => {
    const newSnapshot: Snapshot = {
      id: `snap-${Date.now()}`,
      timestamp: new Date(),
      camera: "Camera 01",
      confidence: detection.confidence,
      imageData: imageData, // Store the actual image data
    };
    setSnapshots((prev) => [newSnapshot, ...prev.slice(0, 11)]);
  }, []);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
        <p className="text-gray-500">Giám sát và phát hiện ngã theo thời gian thực</p>
      </div>

      {/* Stats Header */}
      <StatsHeader
        fallsToday={fallsToday}
        isConnected={true}
        alarmEnabled={alarmEnabled}
        onAlarmToggle={setAlarmEnabled}
        showSkeleton={showSkeleton}
        onSkeletonToggle={setShowSkeleton}
      />

      {/* Main Content - Video Stream & Alert History */}
      <div className="grid grid-cols-1 lg:grid-cols-10 gap-6">
        {/* Video Stream - 70% */}
        <div className="lg:col-span-7 h-[500px]">
          <VideoStream
            showSkeleton={showSkeleton}
            onFallDetected={handleFallDetected}
            onSnapshotCapture={handleSnapshotCapture}
          />
        </div>

        {/* Alert History - 30% */}
        <div className="lg:col-span-3 h-[500px]">
          <AlertHistory
            alerts={alerts}
            onAcknowledge={handleAcknowledge}
            onPlayback={handlePlayback}
          />
        </div>
      </div>

      {/* Snapshot Gallery */}
      <SnapshotGallery
        snapshots={snapshots}
        onView={handleViewSnapshot}
        onDelete={handleDeleteSnapshot}
      />
    </div>
  );
}
