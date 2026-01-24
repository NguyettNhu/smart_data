"use client";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import Image from "next/image";
import React, { useCallback, useEffect, useRef, useState } from "react";

type PermissionState = "prompt" | "granted" | "denied" | "requesting" | "unsupported";

interface Detection {
  id: number;
  label: string;
  confidence: number;
  x: number;
  y: number;
  width: number;
  height: number;
  color: string;
}

const SAMPLE_IMAGES = [
  { id: 1, src: "/samples/sample1.jpg", name: "Office" },
  { id: 2, src: "/samples/sample2.jpg", name: "Street" },
  { id: 3, src: "/samples/sample3.jpg", name: "Room" },
  { id: 4, src: "/samples/sample4.jpg", name: "Park" },
];

const CLASS_COLORS: Record<string, string> = {
  person: "#8b5cf6",
  laptop: "#3b82f6",
  chair: "#22c55e",
  phone: "#f97316",
  bag: "#ec4899",
  default: "#6366f1",
};

const CLASS_LABELS: Record<number, string> = {
  0: "person",
  1: "bicycle",
  2: "car",
  3: "laptop",
  4: "phone",
  5: "chair",
  6: "bag",
};

export default function DetectionPage() {
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [imageUrl, setImageUrl] = useState("");
  const [detections, setDetections] = useState<Detection[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isWebcamActive, setIsWebcamActive] = useState(false);
  const [isRealtimeMode, setIsRealtimeMode] = useState(false);
  const [fallDetected, setFallDetected] = useState(false);
  const [fallHistory, setFallHistory] = useState<{ time: Date; confidence: number }[]>([]);
  const [isAudioEnabled, setIsAudioEnabled] = useState(true);
  const [uploadedVideoUrl, setUploadedVideoUrl] = useState<string | null>(null);
  const [isVideoMode, setIsVideoMode] = useState(false);
  const [isVideoPlaying, setIsVideoPlaying] = useState(false);

  // Audio ref for fall alert
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const [webcamPermission, setWebcamPermission] = useState<PermissionState>("prompt");
  const [showPermissionModal, setShowPermissionModal] = useState(false);
  const [showRealtimePermissionModal, setShowRealtimePermissionModal] = useState(false);

  // Refs
  const fileInputRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const realtimeCanvasRef = useRef<HTMLCanvasElement>(null);
  const animationFrameRef = useRef<number | null>(null);
  const pendingStreamRef = useRef<MediaStream | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const isWaitingForResponse = useRef(false);

  // Check webcam permission on mount
  useEffect(() => {
    const checkPermission = async () => {
      try {
        // Check if mediaDevices is supported
        if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
          setWebcamPermission("unsupported");
          return;
        }

        // Try to query camera permission
        if (navigator.permissions && navigator.permissions.query) {
          try {
            const result = await navigator.permissions.query({ name: "camera" as PermissionName });
            setWebcamPermission(result.state as PermissionState);

            // Listen for permission changes
            result.onchange = () => {
              setWebcamPermission(result.state as PermissionState);
            };
          } catch {
            // Some browsers don't support querying camera permission
            setWebcamPermission("prompt");
          }
        }
      } catch (error) {
        console.error("Error checking webcam permission:", error);
        setWebcamPermission("prompt");
      }
    };

    checkPermission();
  }, []);

  // Apply pending stream to video element when it becomes available
  useEffect(() => {
    if ((isWebcamActive || isRealtimeMode) && videoRef.current && pendingStreamRef.current) {
      videoRef.current.srcObject = pendingStreamRef.current;
      pendingStreamRef.current = null; // Clear after applying
    }
  }, [isWebcamActive, isRealtimeMode]);

  // WebSocket connection management
  useEffect(() => {
    if (isRealtimeMode || isVideoMode) {
      const wsUrl = "ws://127.0.0.1:8000/ws/predict"; // Using 127.0.0.1 to avoid localhost resolution issues
      console.log("Connecting to WebSocket:", wsUrl);
      const ws = new WebSocket(wsUrl);

      ws.onopen = () => {
        console.log("WebSocket connected");
        isWaitingForResponse.current = false;
      };

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          if (data.detections) {
            // Map backend detections to frontend format
            // Backend sends: box: [x1, y1, x2, y2], confidence, class_id, class_name
            // We need to convert absolute coordinates to percentages relative to video size
            if (videoRef.current) {
              const videoW = videoRef.current.videoWidth;
              const videoH = videoRef.current.videoHeight;

              const newDetections: Detection[] = data.detections.map((d: any, index: number) => {
                const [x1, y1, x2, y2] = d.box;
                const w = x2 - x1;
                const h = y2 - y1;

                const label = d.class_name;
                // distinct color for fall
                const isFall = label.toLowerCase().includes("fall") || label.toLowerCase().includes("down");
                const color = isFall ? "#ef4444" : (CLASS_COLORS[label] || CLASS_COLORS.default);

                if (isFall) {
                  setFallDetected(true);
                  // Play audio alert
                  if (isAudioEnabled && audioRef.current) {
                    audioRef.current.play().catch(e => console.log("Audio play failed", e));
                  }
                }

                return {
                  id: index,
                  label: d.class_name,
                  confidence: d.confidence,
                  x: (x1 / videoW) * 100,
                  y: (y1 / videoH) * 100,
                  width: (w / videoW) * 100,
                  height: (h / videoH) * 100,
                  color: color
                };
              });

              setDetections(newDetections);

              // Handle fall history
              const hasFall = newDetections.some(d => d.label.toLowerCase().includes("fall") || d.label.toLowerCase().includes("down"));
              if (hasFall) {
                // Debounce history addition? 
                // For now, let's just add it if we haven't recently.
                // Actually this logic was inside render loop before.
                // We can simplify: just setFallDetected(true).
              } else {
                setFallDetected(false);
              }
            }
          }
        } catch (e) {
          console.error("Error parsing WS message:", e);
        } finally {
          isWaitingForResponse.current = false;
        }
      };

      ws.onerror = (e) => {
        console.error("WebSocket error:", e);
        isWaitingForResponse.current = false;
      };

      ws.onclose = () => {
        console.log("WebSocket disconnected");
      };

      wsRef.current = ws;

      return () => {
        ws.close();
        wsRef.current = null;
      };
    }
  }, [isRealtimeMode, isVideoMode]);

  // Simulate YOLO detection
  const simulateDetection = useCallback((imageSrc: string) => {
    setIsProcessing(true);
    setSelectedImage(imageSrc);
    setDetections([]);

    // Simulate processing delay
    setTimeout(() => {
      // Generate random detections
      const numDetections = Math.floor(Math.random() * 4) + 1;
      const newDetections: Detection[] = [];

      for (let i = 0; i < numDetections; i++) {
        const classId = Math.floor(Math.random() * 7);
        const label = CLASS_LABELS[classId] || "object";
        const color = CLASS_COLORS[label] || CLASS_COLORS.default;

        newDetections.push({
          id: i,
          label,
          confidence: 0.75 + Math.random() * 0.24,
          x: 10 + Math.random() * 40,
          y: 10 + Math.random() * 30,
          width: 15 + Math.random() * 25,
          height: 20 + Math.random() * 35,
          color,
        });
      }

      setDetections(newDetections);
      setIsProcessing(false);
    }, 1500);
  }, []);

  // Handle file upload
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.type.startsWith("video/")) {
        const url = URL.createObjectURL(file);
        setUploadedVideoUrl(url);
        setIsVideoMode(true);
        setIsWebcamActive(false);
        setIsRealtimeMode(false);
        setSelectedImage(null);
        setDetections([]);
      } else {
        const reader = new FileReader();
        reader.onload = (event) => {
          const imageSrc = event.target?.result as string;
          simulateDetection(imageSrc);
        };
        reader.readAsDataURL(file);
      }
    }
  };

  // Effect to load video when URL changes and mode is active
  useEffect(() => {
    if (isVideoMode && uploadedVideoUrl && videoRef.current) {
      videoRef.current.src = uploadedVideoUrl;
      videoRef.current.load();
      // Optional: Auto-play is handled by autoPlay prop or onCanPlay
      videoRef.current.play().catch(e => console.log("Auto-play failed:", e));
    }
  }, [isVideoMode, uploadedVideoUrl]);

  // Handle URL paste
  const handleUrlSubmit = () => {
    if (imageUrl.trim()) {
      simulateDetection(imageUrl);
    }
  };

  // Handle sample image click
  const handleSampleClick = (index: number) => {
    // Use placeholder for demo
    const placeholderUrl = `https://picsum.photos/seed/${index + 10}/800/600`;
    simulateDetection(placeholderUrl);
  };

  // Handle webcam
  const toggleWebcam = async () => {
    if (isWebcamActive) {
      // Stop webcam
      if (videoRef.current?.srcObject) {
        const tracks = (videoRef.current.srcObject as MediaStream).getTracks();
        tracks.forEach((track) => track.stop());
      }
      setIsWebcamActive(false);
      setSelectedImage(null);
    } else {
      // Check if unsupported
      if (webcamPermission === "unsupported") {
        alert("Trình duyệt của bạn không hỗ trợ truy cập webcam.");
        return;
      }

      // Show permission modal if not yet granted
      if (webcamPermission === "prompt" || webcamPermission === "denied") {
        setShowPermissionModal(true);
        return;
      }

      // Start webcam if permission already granted
      await startWebcam();
    }
  };

  // Start webcam stream
  const startWebcam = async () => {
    setWebcamPermission("requesting");
    setShowPermissionModal(false);

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          width: { ideal: 1280 },
          height: { ideal: 720 },
          facingMode: "user"
        }
      });

      // Store stream in ref for useEffect to pick up
      pendingStreamRef.current = stream;

      // Set state to trigger video element render
      setIsWebcamActive(true);
      setSelectedImage(null);
      setDetections([]);
      setWebcamPermission("granted");
    } catch (error) {
      console.error("Error accessing webcam:", error);

      if (error instanceof DOMException) {
        if (error.name === "NotAllowedError" || error.name === "PermissionDeniedError") {
          setWebcamPermission("denied");
        } else if (error.name === "NotFoundError" || error.name === "DevicesNotFoundError") {
          alert("Không tìm thấy webcam. Vui lòng kết nối camera.");
        } else {
          alert("Không thể truy cập webcam: " + error.message);
        }
      }
    }
  };

  // Start real-time fall detection mode
  const startRealtimeDetection = async () => {
    // Check permission first
    if (webcamPermission === "unsupported") {
      alert("Trình duyệt của bạn không hỗ trợ truy cập webcam.");
      return;
    }

    if (webcamPermission === "prompt" || webcamPermission === "denied") {
      setShowRealtimePermissionModal(true);
      return;
    }

    await startRealtimeWebcam();
  };

  // Start webcam for realtime mode
  const startRealtimeWebcam = async () => {
    setWebcamPermission("requesting");
    setShowRealtimePermissionModal(false);

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          width: { ideal: 1280 },
          height: { ideal: 720 },
          facingMode: "user"
        }
      });

      // Store stream in ref for useEffect to pick up
      pendingStreamRef.current = stream;

      // Set state to trigger video element render
      setIsRealtimeMode(true);
      setIsWebcamActive(true);
      setSelectedImage(null);
      setDetections([]);
      setWebcamPermission("granted");
      setFallDetected(false);
    } catch (error) {
      console.error("Error accessing webcam:", error);
      if (error instanceof DOMException) {
        if (error.name === "NotAllowedError" || error.name === "PermissionDeniedError") {
          setWebcamPermission("denied");
        }
      }
    }
  };

  // Stop real-time detection
  const stopRealtimeDetection = () => {
    if (videoRef.current?.srcObject) {
      const tracks = (videoRef.current.srcObject as MediaStream).getTracks();
      tracks.forEach((track) => track.stop());
    }
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
    }
    setIsRealtimeMode(false);
    setIsWebcamActive(false);
    setFallDetected(false);
  };

  // Simulate fall detection on each frame
  const detectFallInFrame = useCallback(() => {
    // Simulate detection - in real app, this would call YOLO model
    const hasPerson = Math.random() > 0.1; // 90% chance to detect person
    const isFall = Math.random() < 0.03; // 3% chance of fall per frame

    const newDetections: Detection[] = [];

    if (hasPerson) {
      const personDetection: Detection = {
        id: 0,
        label: isFall ? "FALL DETECTED" : "person",
        confidence: 0.85 + Math.random() * 0.14,
        x: 25 + Math.sin(Date.now() / 1000) * 10,
        y: isFall ? 50 : 15,
        width: isFall ? 35 : 20,
        height: isFall ? 20 : 45,
        color: isFall ? "#ef4444" : "#8b5cf6",
      };
      newDetections.push(personDetection);

      if (isFall && !fallDetected) {
        setFallDetected(true);
        setFallHistory(prev => [...prev, { time: new Date(), confidence: personDetection.confidence }]);

        // Reset fall detection after 3 seconds
        setTimeout(() => setFallDetected(false), 3000);
      }
    }

    return newDetections;
  }, [fallDetected]);

  // Real-time detection loop (Webcam or Video)
  useEffect(() => {
    if ((!isRealtimeMode && !isVideoMode) || !videoRef.current) return;

    const canvas = realtimeCanvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const runDetection = () => {
      if (!videoRef.current || (!isRealtimeMode && !isVideoMode)) return;

      // Ensure video is playing for video mode
      if (isVideoMode && videoRef.current.paused) {
        animationFrameRef.current = requestAnimationFrame(runDetection);
        return;
      }

      // Set canvas size to match video
      if (canvas.width !== videoRef.current.videoWidth) {
        canvas.width = videoRef.current.videoWidth || 640;
        canvas.height = videoRef.current.videoHeight || 480;
      }

      // Draw video frame
      ctx.save();
      ctx.scale(-1, 1);
      ctx.drawImage(videoRef.current, -canvas.width, 0, canvas.width, canvas.height);
      ctx.restore();

      // Send frame to WebSocket if ready
      if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN && !isWaitingForResponse.current) {
        isWaitingForResponse.current = true;
        canvas.toBlob((blob) => {
          if (blob && wsRef.current?.readyState === WebSocket.OPEN) {
            wsRef.current.send(blob);
          } else {
            isWaitingForResponse.current = false;
          }
        }, 'image/jpeg', 0.8);
      }

      // Draw detection boxes (from state)
      // currentDetections is now `detections` state
      detections.forEach((det) => {
        const x = (det.x / 100) * canvas.width;
        const y = (det.y / 100) * canvas.height;
        const w = (det.width / 100) * canvas.width;
        const h = (det.height / 100) * canvas.height;

        // Draw bounding box
        ctx.strokeStyle = det.color;
        ctx.lineWidth = det.label.toLowerCase().includes("fall") ? 4 : 2;
        ctx.strokeRect(x, y, w, h);

        // Pulsing effect for fall
        if (det.label.toLowerCase().includes("fall")) {
          const pulse = Math.sin(Date.now() / 100) * 0.3 + 0.7;
          ctx.globalAlpha = pulse;
          ctx.strokeRect(x - 2, y - 2, w + 4, h + 4);
          ctx.globalAlpha = 1;
        }

        // Draw label
        const label = `${det.label} ${(det.confidence * 100).toFixed(0)}%`;
        ctx.font = "bold 14px Arial";
        const textWidth = ctx.measureText(label).width;

        ctx.fillStyle = det.color;
        ctx.fillRect(x, y - 22, textWidth + 10, 20);

        ctx.fillStyle = "#ffffff";
        ctx.fillText(label, x + 5, y - 6);
      });

      // Draw timestamp
      ctx.fillStyle = "#ffffff";
      ctx.font = "12px monospace";
      const time = new Date().toLocaleTimeString("vi-VN");
      ctx.fillText(`LIVE | ${time}`, 10, canvas.height - 10);

      // Draw status indicator
      ctx.fillStyle = fallDetected ? "#ef4444" : "#22c55e";
      ctx.beginPath();
      ctx.arc(canvas.width - 15, 15, 8, 0, Math.PI * 2);
      ctx.fill();

      animationFrameRef.current = requestAnimationFrame(runDetection);
    };

    runDetection();

    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, [isRealtimeMode, isVideoMode, detections, fallDetected]);

  // Capture webcam frame
  const captureFrame = () => {
    if (videoRef.current && canvasRef.current) {
      const ctx = canvasRef.current.getContext("2d");
      if (ctx) {
        canvasRef.current.width = videoRef.current.videoWidth;
        canvasRef.current.height = videoRef.current.videoHeight;
        ctx.drawImage(videoRef.current, 0, 0);
        const imageSrc = canvasRef.current.toDataURL("image/png");
        simulateDetection(imageSrc);
        toggleWebcam();
      }
    }
  };

  // Handle drag and drop
  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file) {
      if (file.type.startsWith("video/")) {
        const url = URL.createObjectURL(file);
        setUploadedVideoUrl(url);
        setIsVideoMode(true);
        setIsWebcamActive(false);
        setIsRealtimeMode(false);
        setSelectedImage(null);
        setDetections([]);
      } else if (file.type.startsWith("image/")) {
        const reader = new FileReader();
        reader.onload = (event) => {
          const imageSrc = event.target?.result as string;
          simulateDetection(imageSrc);
        };
        reader.readAsDataURL(file);
      }
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  return (
    <div className="space-y-6">
      {/* Permission Modal */}
      {showPermissionModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <Card className="w-full max-w-md mx-4 shadow-2xl">
            <CardContent className="p-6">
              <div className="text-center">
                {/* Camera Icon */}
                <div className="w-20 h-20 mx-auto mb-4 rounded-full bg-purple-100 flex items-center justify-center">
                  <svg
                    className="w-10 h-10 text-purple-600"
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

                <h3 className="text-xl font-bold text-gray-900 mb-2">
                  Cho phép truy cập Camera
                </h3>

                {webcamPermission === "denied" ? (
                  <>
                    <p className="text-gray-600 mb-4">
                      Bạn đã từ chối quyền truy cập camera. Để sử dụng tính năng này,
                      vui lòng cấp quyền trong cài đặt trình duyệt.
                    </p>
                    <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3 mb-4">
                      <p className="text-sm text-yellow-800">
                        <strong>Hướng dẫn:</strong> Click vào biểu tượng 🔒 trên thanh địa chỉ
                        → Cho phép Camera → Tải lại trang
                      </p>
                    </div>
                  </>
                ) : (
                  <p className="text-gray-600 mb-6">
                    Ứng dụng cần quyền truy cập camera để phát hiện đối tượng trong thời gian thực.
                    Nhấn <strong>&quot;Cho phép&quot;</strong> khi trình duyệt yêu cầu.
                  </p>
                )}

                <div className="flex gap-3 justify-center">
                  <Button
                    variant="outline"
                    onClick={() => setShowPermissionModal(false)}
                  >
                    Hủy
                  </Button>
                  {webcamPermission !== "denied" ? (
                    <Button
                      className="bg-purple-600 hover:bg-purple-700 text-white gap-2"
                      onClick={startWebcam}
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                      </svg>
                      Cho phép
                    </Button>
                  ) : (
                    <Button
                      className="bg-purple-600 hover:bg-purple-700 text-white"
                      onClick={() => window.location.reload()}
                    >
                      Tải lại trang
                    </Button>
                  )}
                </div>

                {/* Permission requesting state */}
                {webcamPermission === "requesting" && (
                  <div className="mt-4 flex items-center justify-center gap-2 text-purple-600">
                    <div className="w-5 h-5 border-2 border-purple-600 border-t-transparent rounded-full animate-spin" />
                    <span>Đang yêu cầu quyền...</span>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Realtime Permission Modal */}
      {showRealtimePermissionModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <Card className="w-full max-w-md mx-4 shadow-2xl border-orange-200">
            <CardContent className="p-6">
              <div className="text-center">
                {/* Fall Detection Icon */}
                <div className="w-20 h-20 mx-auto mb-4 rounded-full bg-gradient-to-r from-purple-100 to-orange-100 flex items-center justify-center">
                  <svg
                    className="w-10 h-10 text-orange-600"
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

                <h3 className="text-xl font-bold text-gray-900 mb-2">
                  Phát hiện Ngã trực tiếp
                </h3>

                {webcamPermission === "denied" ? (
                  <>
                    <p className="text-gray-600 mb-4">
                      Bạn đã từ chối quyền truy cập camera. Để sử dụng tính năng này,
                      vui lòng cấp quyền trong cài đặt trình duyệt.
                    </p>
                    <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3 mb-4">
                      <p className="text-sm text-yellow-800">
                        <strong>Hướng dẫn:</strong> Click vào biểu tượng 🔒 trên thanh địa chỉ
                        → Cho phép Camera → Tải lại trang
                      </p>
                    </div>
                  </>
                ) : (
                  <>
                    <p className="text-gray-600 mb-4">
                      Chế độ này sẽ sử dụng camera để <strong>phân tích trực tiếp</strong> và
                      phát hiện khi có người bị ngã.
                    </p>
                    <div className="bg-purple-50 border border-purple-200 rounded-lg p-3 mb-4 text-left">
                      <p className="text-sm text-purple-800 font-medium mb-2">Tính năng:</p>
                      <ul className="text-sm text-purple-700 space-y-1">
                        <li>• Phát hiện người trong khung hình</li>
                        <li>• Cảnh báo ngay khi phát hiện ngã</li>
                        <li>• Lưu lịch sử phát hiện</li>
                      </ul>
                    </div>
                  </>
                )}

                <div className="flex gap-3 justify-center">
                  <Button
                    variant="outline"
                    onClick={() => setShowRealtimePermissionModal(false)}
                  >
                    Hủy
                  </Button>
                  {webcamPermission !== "denied" ? (
                    <Button
                      className="bg-gradient-to-r from-purple-600 to-orange-500 hover:from-purple-700 hover:to-orange-600 text-white gap-2"
                      onClick={startRealtimeWebcam}
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                      Bắt đầu
                    </Button>
                  ) : (
                    <Button
                      className="bg-purple-600 hover:bg-purple-700 text-white"
                      onClick={() => window.location.reload()}
                    >
                      Tải lại trang
                    </Button>
                  )}
                </div>

                {webcamPermission === "requesting" && (
                  <div className="mt-4 flex items-center justify-center gap-2 text-orange-600">
                    <div className="w-5 h-5 border-2 border-orange-600 border-t-transparent rounded-full animate-spin" />
                    <span>Đang khởi động camera...</span>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Phát hiện Đối tượng</h1>
        <p className="text-gray-500">Tải ảnh lên để phát hiện đối tượng với YOLO</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        {/* Left Sidebar */}
        <div className="lg:col-span-1 space-y-4">
          {/* Sample Images */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium">Ảnh mẫu</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="grid grid-cols-4 gap-2">
                {SAMPLE_IMAGES.map((sample, index) => (
                  <button
                    key={sample.id}
                    onClick={() => handleSampleClick(index)}
                    className="aspect-square rounded-lg overflow-hidden border-2 border-transparent hover:border-purple-500 transition-all relative bg-gray-100"
                  >
                    <Image
                      src={`https://picsum.photos/seed/${index + 10}/100/100`}
                      alt={sample.name}
                      fill
                      className="object-cover"
                      unoptimized
                    />
                  </button>
                ))}
              </div>
              <Button variant="ghost" className="w-full text-purple-600 hover:text-purple-700 text-sm">
                Xem tất cả ảnh mẫu →
              </Button>
            </CardContent>
          </Card>

          {/* Upload File */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium">Tải ảnh hoặc video</CardTitle>
            </CardHeader>
            <CardContent>
              <div
                onDrop={handleDrop}
                onDragOver={handleDragOver}
                className="border-2 border-dashed border-gray-300 rounded-lg p-6 text-center hover:border-purple-400 transition-colors cursor-pointer"
                onClick={() => fileInputRef.current?.click()}
              >
                <p className="text-sm text-gray-500 mb-3">Kéo thả file vào đây hoặc</p>
                <Button variant="outline" size="sm" className="gap-2">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                  </svg>
                  Chọn File
                </Button>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*,video/*"
                  onChange={handleFileUpload}
                  className="hidden"
                />
              </div>
            </CardContent>
          </Card>

          {/* Paste URL */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium">Dán URL ảnh</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <svg
                    className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
                  </svg>
                  <Input
                    type="url"
                    placeholder="Dán link ảnh..."
                    value={imageUrl}
                    onChange={(e) => setImageUrl(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && handleUrlSubmit()}
                    className="pl-9"
                  />
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Webcam */}
          <Card>
            <CardContent className="pt-4 space-y-2">
              <Button
                variant="outline"
                className={`w-full gap-2 ${webcamPermission === "denied"
                  ? "border-red-300 text-red-600 hover:bg-red-50"
                  : webcamPermission === "granted"
                    ? "border-green-300 text-green-600 hover:bg-green-50"
                    : ""
                  }`}
                onClick={toggleWebcam}
                disabled={webcamPermission === "unsupported" || webcamPermission === "requesting"}
              >
                {webcamPermission === "requesting" ? (
                  <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
                ) : (
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                  </svg>
                )}
                {isWebcamActive
                  ? "Tắt Webcam"
                  : webcamPermission === "denied"
                    ? "Quyền bị từ chối"
                    : webcamPermission === "unsupported"
                      ? "Không hỗ trợ"
                      : webcamPermission === "requesting"
                        ? "Đang yêu cầu..."
                        : "Sử dụng Webcam"
                }
              </Button>
              {/* Permission status indicator */}
              {webcamPermission === "granted" && !isWebcamActive && (
                <p className="text-xs text-center text-green-600 flex items-center justify-center gap-1">
                  <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                  </svg>
                  Camera đã được cấp quyền
                </p>
              )}
              {webcamPermission === "denied" && (
                <p className="text-xs text-center text-red-600">
                  Vui lòng cấp quyền trong cài đặt trình duyệt
                </p>
              )}
              <Button
                className={`w-full gap-2 text-white ${isRealtimeMode
                  ? "bg-red-500 hover:bg-red-600"
                  : "bg-gradient-to-r from-purple-600 to-orange-500 hover:from-purple-700 hover:to-orange-600"
                  }`}
                onClick={isRealtimeMode ? stopRealtimeDetection : startRealtimeDetection}
              >
                {isRealtimeMode ? (
                  <>
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 10a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1h-4a1 1 0 01-1-1v-4z" />
                    </svg>
                    Dừng phát hiện
                  </>
                ) : (
                  <>
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    Phát hiện Ngã trực tiếp
                  </>
                )}
              </Button>
              {isRealtimeMode && (
                <div className="flex flex-col items-center gap-2 mt-2">
                  <div className="text-xs text-center text-orange-600 animate-pulse">
                    🔴 Đang phân tích trực tiếp...
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-gray-600">Cảnh báo âm thanh:</span>
                    <Button
                      size="sm"
                      variant={isAudioEnabled ? "default" : "outline"}
                      className="h-7 text-xs"
                      onClick={() => setIsAudioEnabled(!isAudioEnabled)}
                    >
                      {isAudioEnabled ? "Bật" : "Tắt"}
                    </Button>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          <audio ref={audioRef} src="https://assets.mixkit.co/sfx/preview/mixkit-alarm-digital-clock-beep-989.mp3" />
        </div>

        {/* Main Detection Area */}
        <div className="lg:col-span-3">
          <Card className="h-full min-h-[600px]">
            <CardContent className="p-4 h-full flex flex-col">
              {/* Mode tabs */}
              <div className="flex gap-2 mb-3">
                <Button
                  size="sm"
                  variant={!isRealtimeMode && !isWebcamActive ? "default" : "outline"}
                  className={!isRealtimeMode && !isWebcamActive ? "bg-purple-600 hover:bg-purple-700" : ""}
                  onClick={() => {
                    stopRealtimeDetection();
                    if (videoRef.current?.srcObject) {
                      const tracks = (videoRef.current.srcObject as MediaStream).getTracks();
                      tracks.forEach((track) => track.stop());
                    }
                    setIsWebcamActive(false);
                  }}
                >
                  <svg className="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                  </svg>
                  Ảnh
                </Button>
                <Button
                  size="sm"
                  variant={isWebcamActive && !isRealtimeMode ? "default" : "outline"}
                  className={isWebcamActive && !isRealtimeMode ? "bg-blue-600 hover:bg-blue-700" : ""}
                  onClick={() => {
                    if (!isWebcamActive) {
                      toggleWebcam();
                    }
                  }}
                >
                  <svg className="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                  </svg>
                  Webcam
                </Button>
                <Button
                  size="sm"
                  variant={isRealtimeMode ? "default" : "outline"}
                  className={isRealtimeMode ? "bg-gradient-to-r from-purple-600 to-orange-500" : ""}
                  onClick={() => {
                    if (!isRealtimeMode) {
                      startRealtimeDetection();
                    }
                  }}
                >
                  <svg className="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                  </svg>
                  Phát hiện Ngã
                </Button>
                {(isWebcamActive || isRealtimeMode) && (
                  <Button
                    size="sm"
                    variant="destructive"
                    onClick={() => {
                      stopRealtimeDetection();
                      if (videoRef.current?.srcObject) {
                        const tracks = (videoRef.current.srcObject as MediaStream).getTracks();
                        tracks.forEach((track) => track.stop());
                      }
                      setIsWebcamActive(false);
                    }}
                  >
                    <svg className="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 10a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1h-4a1 1 0 01-1-1v-4z" />
                    </svg>
                    Dừng
                  </Button>
                )}
              </div>

              <div className="relative flex-1 bg-gray-900 rounded-lg overflow-hidden flex items-center justify-center">
                {/* Video Element - Rendered when webcam or realtime mode is active */}
                {(isWebcamActive || isRealtimeMode || isVideoMode) && (
                  <video
                    ref={videoRef}
                    autoPlay={!isVideoMode}
                    controls={isVideoMode}
                    playsInline
                    muted={isRealtimeMode && !isVideoMode} // Mute for webcam to avoid feedback, unzip for video
                    className={`absolute inset-0 w-full h-full object-contain ${(isRealtimeMode && !isVideoMode) ? "transform -scale-x-100 opacity-0 pointer-events-none" : ""
                      } ${
                      // If video mode, we want to see the video controls, so z-index needs to be high enough but under canvas
                      isVideoMode ? "z-10" : ""
                      } ${
                      // If webcam, video element is hidden in realtime mode (we draw on canvas?) 
                      // Wait, in previous code: isRealtimeMode ? "opacity-0..." : "z-10"
                      // Actually, in realtime mode we draw video to canvas?
                      // Line 451: ctx.drawImage(videoRef.current, ...)
                      // Yes, so we hide the video element in realtime webcam mode.
                      // But for Video Mode, we probably want to see the video element (native controls)
                      // And overlay the canvas on top.
                      (isRealtimeMode && !isVideoMode) ? "opacity-0 pointer-events-none" : "z-10"
                      }`}
                    onPlay={() => setIsVideoPlaying(true)}
                    onPause={() => setIsVideoPlaying(false)}
                  />
                )}

                {/* Canvas for Real-time Fall Detection - overlays video */}
                {(isRealtimeMode || isVideoMode) && (
                  <canvas
                    ref={realtimeCanvasRef}
                    className="absolute inset-0 w-full h-full object-contain z-20 pointer-events-none"
                  />
                )}

                {/* Real-time Fall Detection Mode Overlays */}
                {(isRealtimeMode || isVideoMode) && (
                  <>

                    {/* Fall Alert Overlay */}
                    {fallDetected && (
                      <div className="absolute inset-0 border-4 border-red-500 animate-pulse pointer-events-none z-50">
                        <div className="absolute top-4 left-1/2 -translate-x-1/2 bg-red-500 text-white px-6 py-3 rounded-lg text-xl font-bold animate-bounce">
                          ⚠️ PHÁT HIỆN NGÃ!
                        </div>
                      </div>
                    )}

                    {/* Controls */}
                    <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex gap-3 z-50">
                      <Button
                        onClick={stopRealtimeDetection}
                        className="bg-red-500 hover:bg-red-600 text-white gap-2"
                      >
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 10a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1h-4a1 1 0 01-1-1v-4z" />
                        </svg>
                        Dừng
                      </Button>
                    </div>

                    {/* Status bar */}
                    <div className="absolute top-4 left-4 flex gap-2 z-50">
                      <Badge className="bg-red-500 text-white animate-pulse">
                        🔴 LIVE
                      </Badge>
                      <Badge className={fallDetected ? "bg-red-500 text-white" : "bg-green-500 text-white"}>
                        {fallDetected ? "⚠️ NGÃ!" : "✓ Bình thường"}
                      </Badge>
                    </div>

                    {/* Fall history */}
                    {fallHistory.length > 0 && (
                      <div className="absolute top-4 right-4 bg-black/70 rounded-lg p-3 max-w-[200px] z-50">
                        <p className="text-white text-xs font-semibold mb-2">Lịch sử phát hiện:</p>
                        <div className="space-y-1 max-h-[120px] overflow-y-auto">
                          {fallHistory.slice(-5).reverse().map((fall, i) => (
                            <div key={i} className="text-xs text-gray-300">
                              {fall.time.toLocaleTimeString("vi-VN")} - {(fall.confidence * 100).toFixed(0)}%
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </>
                )}

                {/* Normal Webcam View Controls (not realtime mode) */}
                {isWebcamActive && !isRealtimeMode && (
                  <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-20">
                    <Button
                      onClick={captureFrame}
                      className="bg-red-500 hover:bg-red-600 text-white gap-2"
                    >
                      <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                        <circle cx="12" cy="12" r="10" />
                      </svg>
                      Chụp ảnh
                    </Button>
                  </div>
                )}

                {/* Selected Image with Detections */}
                {selectedImage && !isWebcamActive && (
                  <>
                    <div className="relative w-full h-full">
                      <Image
                        src={selectedImage}
                        alt="Detection target"
                        fill
                        className="object-contain"
                        unoptimized
                      />

                      {/* Processing overlay */}
                      {isProcessing && (
                        <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
                          <div className="text-center text-white">
                            <div className="w-12 h-12 border-4 border-white border-t-transparent rounded-full animate-spin mx-auto mb-3" />
                            <p>Đang phân tích...</p>
                          </div>
                        </div>
                      )}

                      {/* Detection Boxes */}
                      {!isProcessing && detections.map((det) => (
                        <div
                          key={det.id}
                          className="absolute border-2 pointer-events-none"
                          style={{
                            left: `${det.x}%`,
                            top: `${det.y}%`,
                            width: `${det.width}%`,
                            height: `${det.height}%`,
                            borderColor: det.color,
                          }}
                        >
                          {/* Label */}
                          <div
                            className="absolute -top-6 left-0 px-2 py-0.5 text-xs font-medium text-white rounded-sm whitespace-nowrap"
                            style={{ backgroundColor: det.color }}
                          >
                            {det.id} {det.label} {(det.confidence * 100).toFixed(0)}%
                          </div>
                        </div>
                      ))}
                    </div>

                    {/* Detection count badge */}
                    {!isProcessing && detections.length > 0 && (
                      <div className="absolute bottom-4 right-4">
                        <Badge className="bg-purple-600 text-white px-3 py-1 text-sm">
                          {detections.length} đối tượng phát hiện
                        </Badge>
                      </div>
                    )}
                  </>
                )}

                {/* Empty state */}
                {!selectedImage && !isWebcamActive && !isRealtimeMode && (
                  <div className="text-center text-gray-400">
                    <svg
                      className="w-20 h-20 mx-auto mb-4"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={1.5}
                        d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
                      />
                    </svg>
                    <p className="text-lg font-medium mb-2">Chưa có ảnh nào</p>
                    <p className="text-sm mb-4">Tải ảnh lên, dán URL, hoặc chọn ảnh mẫu để bắt đầu</p>
                    <div className="flex gap-3 justify-center">
                      <Button
                        variant="outline"
                        className="gap-2 border-gray-500 text-gray-300 hover:bg-gray-800"
                        onClick={() => fileInputRef.current?.click()}
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                        </svg>
                        Tải ảnh
                      </Button>
                      <Button
                        className="gap-2 bg-gradient-to-r from-purple-600 to-orange-500 hover:from-purple-700 hover:to-orange-600 text-white"
                        onClick={startRealtimeDetection}
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                        </svg>
                        Bật Camera
                      </Button>
                    </div>
                  </div>
                )}

                {/* Hidden canvas for webcam capture */}
                <canvas ref={canvasRef} className="hidden" />
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
