"use client";

import React, { useState, useCallback, useEffect } from "react";
import { VideoStream } from "@/components/dashboard/video-stream";
import { AlertHistory, AlertEvent } from "@/components/dashboard/alert-history";
import { StatsHeader } from "@/components/dashboard/stats-header";
import { SnapshotGallery, Snapshot } from "@/components/dashboard/snapshot-gallery";
import { API_BASE, apiUrl } from "@/lib/api";

export default function DashboardPage() {
  const [alerts, setAlerts] = useState<AlertEvent[]>([]);
  const [snapshots, setSnapshots] = useState<Snapshot[]>([]);

  useEffect(() => {
    // Fetch snapshots from backend
    const fetchSnapshots = async () => {
      try {
        const res = await fetch(apiUrl(`/api/snapshots?t=${Date.now()}`), {
          cache: 'no-store'
        });
        if (res.ok) {
          const data = await res.json();
          
          // Map to Snapshots
          const mappedSnapshots: Snapshot[] = data.map((d: any) => ({
            id: d.id.toString(),
            timestamp: new Date(d.timestamp),
            camera: "Camera 01", 
            confidence: d.confidence,
            imageData: `${API_BASE}${d.image_path}`, 
          }));
          setSnapshots(mappedSnapshots);

          // Map to Alerts
          const mappedAlerts: AlertEvent[] = data.map((d: any) => ({
            id: `alert-${d.id}`,
            timestamp: new Date(d.timestamp),
            camera: "Camera 01 - Phòng khách",
            type: "fall",
            confidence: d.confidence,
            snapshot: `${API_BASE}${d.image_path}`,
            acknowledged: true, // Backend stored detections are historical
          }));
          setAlerts(mappedAlerts);
        }
      } catch (error) {
        console.error("Failed to fetch snapshots:", error);
      }
    };

    fetchSnapshots();
    const interval = setInterval(fetchSnapshots, 5000); // Poll every 5s
    return () => clearInterval(interval);
  }, []);

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

  const handleDeleteSnapshot = useCallback(async (id: string) => {
    // 1. Filter locally first for better UX
    setSnapshots((prev) => prev.filter((s) => s.id !== id));

    // 2. If it's a backend ID (numeric), call delete API
    if (!id.startsWith('snap-')) {
      try {
        const res = await fetch(apiUrl(`/api/snapshots/${id}`), {
          method: 'DELETE',
        });
        if (!res.ok) {
          console.error("Failed to delete snapshot from backend");
          // Re-fetch to sync if failed
          // fetchSnapshots() would be better but it's inside useEffect
        }
      } catch (error) {
        console.error("Error deleting snapshot:", error);
      }
    }
  }, []);

  // Handle snapshot capture from video stream
  const handleSnapshotCapture = useCallback((imageData: string, detection: { confidence: number }) => {
    // Only add to local state if we want real-time feedback before the next poll
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
