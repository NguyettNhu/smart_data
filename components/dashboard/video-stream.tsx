"use client";

import React, { useState, useEffect, useRef, useCallback } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/components/ui/toast";

interface Detection {
  id: string;
  type: "person" | "fall";
  confidence: number;
  x: number;
  y: number;
  width: number;
  height: number;
  skeleton?: { x: number; y: number }[];
}

interface VideoStreamProps {
  showSkeleton: boolean;
  onFallDetected: (detection: Detection) => void;
  onSnapshotCapture?: (imageData: string, detection: Detection) => void;
}

function generateSkeletonPoints(isFall: boolean, baseX: number, baseY: number): { x: number; y: number }[] {
  if (isFall) {
    // Lying down skeleton
    return [
      { x: baseX, y: baseY + 40 }, // head
      { x: baseX + 40, y: baseY + 40 }, // neck
      { x: baseX + 30, y: baseY + 20 }, // left shoulder
      { x: baseX + 30, y: baseY + 60 }, // right shoulder
      { x: baseX + 60, y: baseY + 10 }, // left elbow
      { x: baseX + 60, y: baseY + 70 }, // right elbow
      { x: baseX + 90, y: baseY + 5 }, // left hand
      { x: baseX + 90, y: baseY + 75 }, // right hand
      { x: baseX + 80, y: baseY + 40 }, // hip
      { x: baseX + 120, y: baseY + 25 }, // left knee
      { x: baseX + 120, y: baseY + 55 }, // right knee
      { x: baseX + 160, y: baseY + 20 }, // left foot
      { x: baseX + 160, y: baseY + 60 }, // right foot
    ];
  }
  
  // Standing skeleton
  return [
    { x: baseX + 40, y: baseY }, // head
    { x: baseX + 40, y: baseY + 30 }, // neck
    { x: baseX + 20, y: baseY + 40 }, // left shoulder
    { x: baseX + 60, y: baseY + 40 }, // right shoulder
    { x: baseX + 10, y: baseY + 70 }, // left elbow
    { x: baseX + 70, y: baseY + 70 }, // right elbow
    { x: baseX + 5, y: baseY + 100 }, // left hand
    { x: baseX + 75, y: baseY + 100 }, // right hand
    { x: baseX + 40, y: baseY + 90 }, // hip
    { x: baseX + 30, y: baseY + 130 }, // left knee
    { x: baseX + 50, y: baseY + 130 }, // right knee
    { x: baseX + 25, y: baseY + 170 }, // left foot
    { x: baseX + 55, y: baseY + 170 }, // right foot
  ];
}

const SKELETON_CONNECTIONS = [
  [0, 1], [1, 2], [1, 3], [2, 4], [3, 5], [4, 6], [5, 7],
  [1, 8], [8, 9], [8, 10], [9, 11], [10, 12],
];

// Interpolate between standing and fallen skeleton
function generateInterpolatedSkeleton(t: number, baseX: number, baseY: number): { x: number; y: number }[] {
  const standing = generateSkeletonPoints(false, baseX, baseY);
  const fallen = generateSkeletonPoints(true, baseX, baseY + 130);
  
  return standing.map((point, i) => ({
    x: point.x + (fallen[i].x - point.x) * t,
    y: point.y + (fallen[i].y - point.y) * t,
  }));
}

export function VideoStream({ showSkeleton, onFallDetected, onSnapshotCapture }: VideoStreamProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isConnected, setIsConnected] = useState(true);
  const [manualFallMode, setManualFallMode] = useState(false);
  const [fallTransition, setFallTransition] = useState(0); // 0 = standing, 1 = fallen
  const animationRef = useRef<number | null>(null);
  const lastFallTimeRef = useRef<number>(0);
  const manualFallTriggeredRef = useRef<boolean>(false);
  const { addToast } = useToast();

  // Trigger manual fall
  const triggerManualFall = useCallback(() => {
    if (manualFallMode) {
      // Reset to standing
      setManualFallMode(false);
      setFallTransition(0);
      manualFallTriggeredRef.current = false;
    } else {
      // Trigger fall
      setManualFallMode(true);
      manualFallTriggeredRef.current = true;
    }
  }, [manualFallMode]);

  // Animate fall transition
  useEffect(() => {
    if (manualFallMode && fallTransition < 1) {
      const timer = setTimeout(() => {
        setFallTransition(prev => Math.min(prev + 0.1, 1));
      }, 50);
      return () => clearTimeout(timer);
    }
  }, [manualFallMode, fallTransition]);

  // Simulate YOLO detections
  const generateDetections = useCallback((): Detection[] => {
    const now = Date.now();
    const shouldHaveFall = Math.random() < 0.02; // 2% chance of fall per frame
    
    const newDetections: Detection[] = [];
    
    // Manual controlled person (first person)
    if (manualFallMode || fallTransition > 0) {
      const isFullyFallen = fallTransition >= 1;
      const baseX = 300;
      
      const manualDetection: Detection = {
        id: "manual-person",
        type: isFullyFallen ? "fall" : "person",
        confidence: 0.95 + Math.random() * 0.04,
        x: baseX,
        y: isFullyFallen ? 280 : 150 + fallTransition * 80,
        width: isFullyFallen ? 180 : 80 + fallTransition * 50,
        height: isFullyFallen ? 80 : 180 - fallTransition * 100,
        skeleton: showSkeleton ? generateInterpolatedSkeleton(fallTransition, baseX, 150) : undefined,
      };
      
      // Trigger fall detection when fully fallen and not yet triggered
      if (isFullyFallen && manualFallTriggeredRef.current) {
        manualFallTriggeredRef.current = false;
        onFallDetected(manualDetection);
        
        // Capture snapshot
        if (canvasRef.current && onSnapshotCapture) {
          const imageData = canvasRef.current.toDataURL("image/png");
          onSnapshotCapture(imageData, manualDetection);
        }
        
        addToast({
          title: "⚠️ PHÁT HIỆN NGÃ!",
          description: `Camera 01 - Điều khiển thủ công - Độ tin cậy: ${(manualDetection.confidence * 100).toFixed(0)}%`,
          variant: "destructive",
          duration: 8000,
        });
      }
      
      newDetections.push(manualDetection);
    }
    
    // Additional random people (not the manual one)
    const additionalPeople = manualFallMode ? 1 : Math.floor(Math.random() * 2) + 1;
    for (let i = 0; i < additionalPeople; i++) {
      const isFall = !manualFallMode && shouldHaveFall && i === 0 && now - lastFallTimeRef.current > 10000;
      
      if (isFall) {
        lastFallTimeRef.current = now;
      }
      
      const xOffset = manualFallMode ? 500 : 100;
      const detection: Detection = {
        id: `det-${i}`,
        type: isFall ? "fall" : "person",
        confidence: 0.85 + Math.random() * 0.14,
        x: xOffset + (i * 200) + Math.sin(now / 1000 + i) * 30,
        y: isFall ? 280 + Math.random() * 20 : 150 + Math.sin(now / 800 + i) * 20,
        width: isFall ? 180 : 80,
        height: isFall ? 80 : 180,
        skeleton: showSkeleton ? generateSkeletonPoints(isFall, xOffset + (i * 200), isFall ? 280 : 150) : undefined,
      };
      
      if (isFall) {
        onFallDetected(detection);
        addToast({
          title: "⚠️ PHÁT HIỆN NGÃ!",
          description: `Camera 01 - Độ tin cậy: ${(detection.confidence * 100).toFixed(0)}%`,
          variant: "destructive",
          duration: 8000,
        });
      }
      
      newDetections.push(detection);
    }
    
    return newDetections;
  }, [showSkeleton, onFallDetected, addToast, manualFallMode, fallTransition, onSnapshotCapture]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const draw = () => {
      // Clear canvas
      ctx.fillStyle = "#1a1a2e";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      
      // Draw grid pattern for room simulation
      ctx.strokeStyle = "#2a2a4e";
      ctx.lineWidth = 1;
      for (let i = 0; i < canvas.width; i += 50) {
        ctx.beginPath();
        ctx.moveTo(i, 0);
        ctx.lineTo(i, canvas.height);
        ctx.stroke();
      }
      for (let i = 0; i < canvas.height; i += 50) {
        ctx.beginPath();
        ctx.moveTo(0, i);
        ctx.lineTo(canvas.width, i);
        ctx.stroke();
      }

      // Draw room elements
      ctx.fillStyle = "#3a3a5e";
      ctx.fillRect(50, 50, 150, 80); // Bed
      ctx.fillRect(600, 300, 100, 60); // Table

      // Get detections
      const currentDetections = generateDetections();

      // Draw detections
      currentDetections.forEach((det) => {
        const isFall = det.type === "fall";
        
        // Draw bounding box
        ctx.strokeStyle = isFall ? "#ef4444" : "#22c55e";
        ctx.lineWidth = isFall ? 4 : 2;
        
        if (isFall) {
          // Pulsing effect for fall detection
          const pulse = Math.sin(Date.now() / 100) * 0.3 + 0.7;
          ctx.globalAlpha = pulse;
        }
        
        ctx.strokeRect(det.x, det.y, det.width, det.height);
        ctx.globalAlpha = 1;
        
        // Draw label background
        const label = isFall 
          ? `FALL DETECTED ${(det.confidence * 100).toFixed(0)}%`
          : `Person ${(det.confidence * 100).toFixed(0)}%`;
        
        ctx.font = "bold 12px Arial";
        const textWidth = ctx.measureText(label).width;
        
        ctx.fillStyle = isFall ? "#ef4444" : "#22c55e";
        ctx.fillRect(det.x, det.y - 20, textWidth + 10, 18);
        
        ctx.fillStyle = "#ffffff";
        ctx.fillText(label, det.x + 5, det.y - 6);
        
        // Draw skeleton if enabled
        if (showSkeleton && det.skeleton) {
          ctx.strokeStyle = isFall ? "#fbbf24" : "#38bdf8";
          ctx.lineWidth = 2;
          
          // Draw connections
          SKELETON_CONNECTIONS.forEach(([i, j]) => {
            if (det.skeleton && det.skeleton[i] && det.skeleton[j]) {
              ctx.beginPath();
              ctx.moveTo(det.skeleton[i].x, det.skeleton[i].y);
              ctx.lineTo(det.skeleton[j].x, det.skeleton[j].y);
              ctx.stroke();
            }
          });
          
          // Draw joints
          ctx.fillStyle = isFall ? "#f97316" : "#60a5fa";
          det.skeleton.forEach((joint) => {
            ctx.beginPath();
            ctx.arc(joint.x, joint.y, 4, 0, Math.PI * 2);
            ctx.fill();
          });
        }
      });

      // Draw timestamp
      ctx.fillStyle = "#ffffff";
      ctx.font = "14px monospace";
      const time = new Date().toLocaleTimeString("vi-VN");
      ctx.fillText(`CAM-01 | ${time}`, 10, canvas.height - 10);

      // Draw status
      ctx.fillStyle = isConnected ? "#22c55e" : "#ef4444";
      ctx.beginPath();
      ctx.arc(canvas.width - 20, 20, 8, 0, Math.PI * 2);
      ctx.fill();

      animationRef.current = requestAnimationFrame(draw);
    };

    draw();

    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, [showSkeleton, generateDetections, isConnected]);

  return (
    <Card className="h-full">
      <CardContent className="p-0 h-full relative">
        <canvas
          ref={canvasRef}
          width={800}
          height={450}
          className="w-full h-full rounded-lg"
        />
        
        {/* Overlay controls */}
        <div className="absolute top-4 left-4 flex gap-2">
          <Badge variant="secondary" className="bg-black/50 text-white border-0">
            Camera 01
          </Badge>
          <Badge 
            variant={isConnected ? "success" : "destructive"}
            className="border-0"
          >
            {isConnected ? "LIVE" : "OFFLINE"}
          </Badge>
        </div>

        <div className="absolute bottom-4 right-4 flex gap-2">
          {/* Manual Fall Control Button */}
          <Button
            size="sm"
            variant={manualFallMode ? "destructive" : "default"}
            className={manualFallMode 
              ? "bg-red-500 hover:bg-red-600 text-white animate-pulse" 
              : "bg-orange-500 hover:bg-orange-600 text-white"
            }
            onClick={triggerManualFall}
          >
            {manualFallMode ? (
              <>
                <svg className="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 10l7-7m0 0l7 7m-7-7v18" />
                </svg>
                Đứng dậy
              </>
            ) : (
              <>
                <svg className="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 14l-7 7m0 0l-7-7m7 7V3" />
                </svg>
                Mô phỏng Ngã
              </>
            )}
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="bg-black/50 text-white border-white/30 hover:bg-black/70"
            onClick={() => setIsConnected(!isConnected)}
          >
            {isConnected ? "Pause" : "Resume"}
          </Button>
        </div>

        {/* Fall status indicator */}
        {manualFallMode && (
          <div className="absolute top-4 right-4">
            <Badge 
              variant="destructive" 
              className="animate-pulse text-sm px-3 py-1"
            >
              ⚠️ ĐANG NGÃ - {(fallTransition * 100).toFixed(0)}%
            </Badge>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
