"use client";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { wsUrl } from "@/lib/api";
import React, { useEffect, useRef, useState } from "react";

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

const CLASS_COLORS: Record<string, string> = {
  person: "#8b5cf6",
  standing: "#22c55e",
  sitting: "#3b82f6",
  fallen: "#ef4444",
  falling: "#f97316",
  default: "#6366f1",
};

export default function DetectionPage() {
  const [detections, setDetections] = useState<Detection[]>([]);
  const [isWebcamActive, setIsWebcamActive] = useState(false);
  const [isRealtimeMode, setIsRealtimeMode] = useState(false);
  const [isVideoMode, setIsVideoMode] = useState(false);
  const [uploadedVideoUrl, setUploadedVideoUrl] = useState<string | null>(null);
  const [fallDetected, setFallDetected] = useState(false);
  const [fallHistory] = useState<{ time: Date; confidence: number }[]>([]);
  const [isAudioEnabled, setIsAudioEnabled] = useState(true);

  // Audio ref for fall alert
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const [webcamPermission, setWebcamPermission] = useState<PermissionState>("prompt");
  const [showPermissionModal, setShowPermissionModal] = useState(false);
  const [showRealtimePermissionModal, setShowRealtimePermissionModal] = useState(false);

  // Refs
  const videoRef = useRef<HTMLVideoElement>(null);
  const realtimeCanvasRef = useRef<HTMLCanvasElement>(null);
  const captureCanvasRef = useRef<HTMLCanvasElement>(null);
  const videoFileInputRef = useRef<HTMLInputElement>(null);
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

  // WebSocket connection management (real-time webcam + uploaded video)
  useEffect(() => {
    if (isRealtimeMode || isVideoMode) {
      const wsEndpoint = wsUrl("/ws/predict");
      console.log("Connecting to WebSocket:", wsEndpoint);
      const ws = new WebSocket(wsEndpoint);

      ws.onopen = () => {
        console.log("WebSocket connected");
        isWaitingForResponse.current = false;

        // Send initial configuration
        const savedThreshold = localStorage.getItem("detection-threshold");
        let conf = savedThreshold ? parseInt(savedThreshold) / 100 : 0.70; // 0.70 default to match settings default
        // Uploaded videos are often wide CCTV shots with small, distant people,
        // so use a lower confidence to make sure they get detected.
        if (isVideoMode) conf = Math.min(conf, 0.3);
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ conf }));
        }
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

              // Update overall fall status
              const hasFall = newDetections.some(d => d.label.toLowerCase().includes("fall") || d.label.toLowerCase().includes("down"));
              if (!hasFall) {
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
  }, [isRealtimeMode, isVideoMode, isAudioEnabled]);

  // Handle webcam (live preview)
  const toggleWebcam = async () => {
    if (isWebcamActive) {
      // Stop webcam
      if (videoRef.current?.srcObject) {
        const tracks = (videoRef.current.srcObject as MediaStream).getTracks();
        tracks.forEach((track) => track.stop());
      }
      setIsWebcamActive(false);
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

    // Switching away from an uploaded video
    if (uploadedVideoUrl) {
      URL.revokeObjectURL(uploadedVideoUrl);
      setUploadedVideoUrl(null);
    }
    setIsVideoMode(false);

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

    // Switching away from an uploaded video
    if (uploadedVideoUrl) {
      URL.revokeObjectURL(uploadedVideoUrl);
      setUploadedVideoUrl(null);
    }
    setIsVideoMode(false);

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
    // Send stop signal to backend
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ action: "stop" }));
    }

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

  // ===== Fall detection on an uploaded video file =====

  const startVideoDetection = (file: File) => {
    if (!file.type.startsWith("video/")) {
      alert("Vui lòng chọn một tệp video hợp lệ.");
      return;
    }
    // Stop any active webcam/realtime stream first
    if (videoRef.current?.srcObject) {
      const tracks = (videoRef.current.srcObject as MediaStream).getTracks();
      tracks.forEach((track) => track.stop());
      videoRef.current.srcObject = null;
    }
    setIsWebcamActive(false);
    setIsRealtimeMode(false);

    if (uploadedVideoUrl) URL.revokeObjectURL(uploadedVideoUrl);
    const url = URL.createObjectURL(file);
    setUploadedVideoUrl(url);
    setIsVideoMode(true);
    setDetections([]);
    setFallDetected(false);
  };

  const handleVideoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) startVideoDetection(file);
    e.target.value = ""; // allow re-selecting the same file
  };

  const handleVideoDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files?.[0];
    if (file) startVideoDetection(file);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  // Stop video mode and release the object URL
  const stopVideoMode = () => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ action: "stop" }));
    }
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
    }
    if (uploadedVideoUrl) {
      URL.revokeObjectURL(uploadedVideoUrl);
      setUploadedVideoUrl(null);
    }
    setIsVideoMode(false);
    setDetections([]);
    setFallDetected(false);
  };

  // Load the uploaded video into the player when it becomes active
  useEffect(() => {
    if (isVideoMode && uploadedVideoUrl && videoRef.current) {
      videoRef.current.src = uploadedVideoUrl;
      videoRef.current.load();
      videoRef.current.play().catch((e) => console.log("Auto-play failed:", e));
    }
  }, [isVideoMode, uploadedVideoUrl]);

  // Detection loop -- webcam (mirrored) or uploaded video, streams to backend
  useEffect(() => {
    if ((!isRealtimeMode && !isVideoMode) || !videoRef.current) return;

    const canvas = realtimeCanvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const sendFrame = (source: HTMLCanvasElement) => {
      if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN && !isWaitingForResponse.current) {
        isWaitingForResponse.current = true;
        source.toBlob((blob) => {
          if (blob && wsRef.current?.readyState === WebSocket.OPEN) {
            wsRef.current.send(blob);
          } else {
            isWaitingForResponse.current = false;
          }
        }, 'image/jpeg', 0.8);
      }
    };

    const runDetection = () => {
      const video = videoRef.current;
      if (!video || (!isRealtimeMode && !isVideoMode)) return;

      // Set canvas size to match the video frame
      const vw = video.videoWidth || 640;
      const vh = video.videoHeight || 480;
      if (canvas.width !== vw) {
        canvas.width = vw;
        canvas.height = vh;
      }

      if (isRealtimeMode) {
        // Webcam: draw the mirrored feed onto the visible canvas, then stream it
        ctx.save();
        ctx.scale(-1, 1);
        ctx.drawImage(video, -canvas.width, 0, canvas.width, canvas.height);
        ctx.restore();
        sendFrame(canvas);
      } else {
        // Video: keep the overlay transparent (the native <video> shows through);
        // grab frames from a hidden canvas so the overlay doesn't cover the video.
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        // Keep analysing even when paused/ended so the held frame (e.g. the
        // moment of the fall at the end of a clip) is still detected.
        if (video.readyState >= 2) {
          const cap = captureCanvasRef.current;
          if (cap) {
            if (cap.width !== vw) {
              cap.width = vw;
              cap.height = vh;
            }
            const cctx = cap.getContext("2d");
            if (cctx) {
              cctx.drawImage(video, 0, 0, vw, vh);
              sendFrame(cap);
            }
          }
        }
      }

      // Draw detection boxes (from state)
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

      // Draw timestamp (live webcam only)
      if (isRealtimeMode) {
        ctx.fillStyle = "#ffffff";
        ctx.font = "12px monospace";
        const time = new Date().toLocaleTimeString("vi-VN");
        ctx.fillText(`LIVE | ${time}`, 10, canvas.height - 10);
      }

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
        <h1 className="text-2xl font-bold text-gray-900">Phát hiện Té ngã</h1>
        <p className="text-gray-500">Giám sát và phát hiện té ngã trực tiếp qua webcam</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        {/* Left Sidebar */}
        <div className="lg:col-span-1 space-y-4">
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

          {/* Upload a video for fall detection */}
          <Card>
            <CardContent className="pt-4">
              <p className="text-sm font-medium mb-2">Phát hiện ngã từ video</p>
              <div
                onDrop={handleVideoDrop}
                onDragOver={handleDragOver}
                className="border-2 border-dashed border-gray-300 rounded-lg p-5 text-center hover:border-emerald-400 transition-colors cursor-pointer"
                onClick={() => videoFileInputRef.current?.click()}
              >
                <svg className="w-7 h-7 mx-auto mb-2 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                </svg>
                <p className="text-xs text-gray-500 mb-3">Kéo thả video vào đây hoặc</p>
                <Button variant="outline" size="sm" className="gap-2">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                  </svg>
                  Chọn video
                </Button>
              </div>
              <input
                ref={videoFileInputRef}
                type="file"
                accept="video/*"
                onChange={handleVideoUpload}
                className="hidden"
              />
              {isVideoMode && (
                <Button
                  variant="outline"
                  size="sm"
                  className="w-full mt-2 border-red-300 text-red-600 hover:bg-red-50"
                  onClick={stopVideoMode}
                >
                  Dừng video
                </Button>
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
                <Button
                  size="sm"
                  variant={isVideoMode ? "default" : "outline"}
                  className={isVideoMode ? "bg-emerald-600 hover:bg-emerald-700" : ""}
                  onClick={() => videoFileInputRef.current?.click()}
                >
                  <svg className="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                  </svg>
                  Video
                </Button>
                {(isWebcamActive || isRealtimeMode || isVideoMode) && (
                  <Button
                    size="sm"
                    variant="destructive"
                    onClick={() => {
                      stopRealtimeDetection();
                      stopVideoMode();
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
                {/* Video element - webcam stream or uploaded video */}
                {(isWebcamActive || isRealtimeMode || isVideoMode) && (
                  <video
                    ref={videoRef}
                    autoPlay={!isVideoMode}
                    controls={isVideoMode}
                    playsInline
                    muted={!isVideoMode}
                    className={`absolute inset-0 w-full h-full object-contain ${isRealtimeMode ? "opacity-0 pointer-events-none" : "z-10"
                      }`}
                  />
                )}

                {/* Overlay canvas for detection boxes (webcam + video) */}
                {(isRealtimeMode || isVideoMode) && (
                  <canvas
                    ref={realtimeCanvasRef}
                    className="absolute inset-0 w-full h-full object-contain z-20 pointer-events-none"
                  />
                )}

                {/* Hidden canvas to grab frames from the uploaded video */}
                {isVideoMode && (
                  <canvas ref={captureCanvasRef} className="hidden" />
                )}

                {/* Fall Detection Mode Overlays (webcam + video) */}
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

                    {/* Floating stop control (webcam only -- video uses native controls) */}
                    {isRealtimeMode && (
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
                    )}

                    {/* Status bar */}
                    <div className="absolute top-4 left-4 flex gap-2 z-50">
                      <Badge className="bg-red-500 text-white animate-pulse">
                        {isVideoMode ? "🎬 VIDEO" : "🔴 LIVE"}
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

                {/* Empty state */}
                {!isWebcamActive && !isRealtimeMode && !isVideoMode && (
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
                        d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z"
                      />
                    </svg>
                    <p className="text-lg font-medium mb-2">Chưa bật camera</p>
                    <p className="text-sm mb-4">Bật camera để bắt đầu giám sát và phát hiện té ngã trực tiếp</p>
                    <div className="flex gap-3 justify-center">
                      <Button
                        className="gap-2 bg-gradient-to-r from-purple-600 to-orange-500 hover:from-purple-700 hover:to-orange-600 text-white"
                        onClick={startRealtimeDetection}
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                        </svg>
                        Bật Camera
                      </Button>
                      <Button
                        variant="outline"
                        className="gap-2 border-gray-500 text-gray-300 hover:bg-gray-800"
                        onClick={() => videoFileInputRef.current?.click()}
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                        </svg>
                        Tải video
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
