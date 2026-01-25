"use client";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useEffect, useState } from "react";

interface Camera {
  id: string;
  name: string;
  url: string;
  type: "rtsp" | "webcam";
  status: "connected" | "disconnected";
}

export function SettingsPanel() {
  const [threshold, setThreshold] = useState([70]);

  // Load threshold from localStorage on mount
  useEffect(() => {
    const saved = localStorage.getItem("detection-threshold");
    if (saved) {
      setThreshold([parseInt(saved)]);
    }
  }, []);

  // Save threshold to localStorage when changed
  const handleThresholdChange = (value: number[]) => {
    setThreshold(value);
    localStorage.setItem("detection-threshold", value[0].toString());
  };
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [emailEnabled, setEmailEnabled] = useState(false);
  const [telegramEnabled, setTelegramEnabled] = useState(true);
  const [email, setEmail] = useState("");
  const [telegramId, setTelegramId] = useState("");
  const [activeTab, setActiveTab] = useState("detection");

  const [cameras, setCameras] = useState<Camera[]>([
    {
      id: "cam-1",
      name: "Camera Phòng khách",
      url: "rtsp://192.168.1.100:554/stream1",
      type: "rtsp",
      status: "connected",
    },
  ]);

  const [newCamera, setNewCamera] = useState({
    name: "",
    url: "",
    type: "rtsp" as const,
  });

  const addCamera = () => {
    if (newCamera.name && newCamera.url) {
      setCameras([
        ...cameras,
        {
          id: `cam-${Date.now()}`,
          ...newCamera,
          status: "disconnected",
        },
      ]);
      setNewCamera({ name: "", url: "", type: "rtsp" });
    }
  };

  const deleteCamera = (id: string) => {
    setCameras(cameras.filter((c) => c.id !== id));
  };

  return (
    <div className="space-y-6">
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="w-full justify-start">
          <TabsTrigger value="detection">Phát hiện</TabsTrigger>
          <TabsTrigger value="cameras">Camera</TabsTrigger>
          <TabsTrigger value="notifications">Thông báo</TabsTrigger>
          <TabsTrigger value="system">Hệ thống</TabsTrigger>
        </TabsList>

        {/* Detection Settings */}
        <TabsContent value="detection" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Ngưỡng phát hiện (Confidence Threshold)</CardTitle>
              <CardDescription>
                Chỉ báo động khi YOLO có độ tin cậy cao hơn ngưỡng này
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">Ngưỡng hiện tại</span>
                  <Badge variant="default" className="text-lg px-3">
                    {threshold[0]}%
                  </Badge>
                </div>
                <Slider
                  value={threshold}
                  onValueChange={handleThresholdChange}
                  min={50}
                  max={99}
                  step={1}
                  className="py-4"
                />
                <div className="flex justify-between text-xs text-gray-500">
                  <span>50% (Nhạy)</span>
                  <span>75% (Cân bằng)</span>
                  <span>99% (Chính xác)</span>
                </div>
              </div>

            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Vùng quan sát (ROI)</CardTitle>
              <CardDescription>
                Giới hạn vùng phát hiện trong khung hình
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="aspect-video bg-gray-100 rounded-lg border-2 border-dashed border-gray-300 flex items-center justify-center">
                <div className="text-center text-gray-500">
                  <svg
                    className="w-12 h-12 mx-auto mb-2"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M4 5a1 1 0 011-1h14a1 1 0 011 1v2a1 1 0 01-1 1H5a1 1 0 01-1-1V5zM4 13a1 1 0 011-1h6a1 1 0 011 1v6a1 1 0 01-1 1H5a1 1 0 01-1-1v-6zM16 13a1 1 0 011-1h2a1 1 0 011 1v6a1 1 0 01-1 1h-2a1 1 0 01-1-1v-6z"
                    />
                  </svg>
                  <p className="text-sm">Kéo để vẽ vùng quan sát</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Camera Settings */}
        <TabsContent value="cameras" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Quản lý Camera</CardTitle>
              <CardDescription>
                Thêm, sửa, xóa nguồn video từ camera RTSP hoặc Webcam
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Existing cameras */}
              <div className="space-y-3">
                {cameras.map((camera) => (
                  <div
                    key={camera.id}
                    className="flex items-center justify-between p-4 bg-gray-50 rounded-lg"
                  >
                    <div className="flex items-center gap-4">
                      <div
                        className={`w-3 h-3 rounded-full ${camera.status === "connected"
                          ? "bg-green-500"
                          : "bg-red-500"
                          }`}
                      />
                      <div>
                        <p className="font-medium">{camera.name}</p>
                        <p className="text-xs text-gray-500 font-mono">
                          {camera.url}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant={camera.type === "rtsp" ? "secondary" : "outline"}>
                        {camera.type.toUpperCase()}
                      </Badge>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => deleteCamera(camera.id)}
                      >
                        <svg
                          className="w-4 h-4 text-red-500"
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                          />
                        </svg>
                      </Button>
                    </div>
                  </div>
                ))}
              </div>

              {/* Add new camera */}
              <div className="pt-4 border-t">
                <h4 className="font-medium mb-3">Thêm Camera mới</h4>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  <Input
                    placeholder="Tên camera"
                    value={newCamera.name}
                    onChange={(e) =>
                      setNewCamera({ ...newCamera, name: e.target.value })
                    }
                  />
                  <Input
                    placeholder="URL (rtsp://... hoặc webcam:0)"
                    value={newCamera.url}
                    onChange={(e) =>
                      setNewCamera({ ...newCamera, url: e.target.value })
                    }
                  />
                  <Button onClick={addCamera}>
                    <svg
                      className="w-4 h-4 mr-2"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M12 4v16m8-8H4"
                      />
                    </svg>
                    Thêm
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Notification Settings */}
        <TabsContent value="notifications" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Cài đặt thông báo</CardTitle>
              <CardDescription>
                Cấu hình cách nhận cảnh báo khi phát hiện ngã
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Sound */}
              <div className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
                <div className="flex items-center gap-4">
                  <div className="p-2 bg-orange-100 rounded-lg">
                    <svg
                      className="w-6 h-6 text-orange-500"
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
                  <div>
                    <p className="font-medium">Âm thanh cảnh báo</p>
                    <p className="text-sm text-gray-500">
                      Phát âm thanh khi phát hiện ngã
                    </p>
                  </div>
                </div>
                <Switch
                  checked={soundEnabled}
                  onCheckedChange={setSoundEnabled}
                />
              </div>

              {/* Email */}
              <div className="p-4 bg-gray-50 rounded-lg space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <div className="p-2 bg-blue-100 rounded-lg">
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
                          d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
                        />
                      </svg>
                    </div>
                    <div>
                      <p className="font-medium">Thông báo Email</p>
                      <p className="text-sm text-gray-500">
                        Gửi email khi phát hiện ngã
                      </p>
                    </div>
                  </div>
                  <Switch
                    checked={emailEnabled}
                    onCheckedChange={setEmailEnabled}
                  />
                </div>
                {emailEnabled && (
                  <Input
                    type="email"
                    placeholder="your-email@example.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                  />
                )}
              </div>

              {/* Telegram */}
              <div className="p-4 bg-gray-50 rounded-lg space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <div className="p-2 bg-sky-100 rounded-lg">
                      <svg
                        className="w-6 h-6 text-sky-500"
                        viewBox="0 0 24 24"
                        fill="currentColor"
                      >
                        <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm4.64 6.8c-.15 1.58-.8 5.42-1.13 7.19-.14.75-.42 1-.68 1.03-.58.05-1.02-.38-1.58-.75-.88-.58-1.38-.94-2.23-1.5-.99-.65-.35-1.01.22-1.59.15-.15 2.71-2.48 2.76-2.69a.2.2 0 00-.05-.18c-.06-.05-.14-.03-.21-.02-.09.02-1.49.95-4.22 2.79-.4.27-.76.41-1.08.4-.36-.01-1.04-.2-1.55-.37-.63-.2-1.12-.31-1.08-.66.02-.18.27-.36.74-.55 2.92-1.27 4.86-2.11 5.83-2.51 2.78-1.16 3.35-1.36 3.73-1.36.08 0 .27.02.39.12.1.08.13.19.14.27-.01.06.01.24 0 .38z" />
                      </svg>
                    </div>
                    <div>
                      <p className="font-medium">Thông báo Telegram</p>
                      <p className="text-sm text-gray-500">
                        Gửi tin nhắn Telegram khi phát hiện ngã
                      </p>
                    </div>
                  </div>
                  <Switch
                    checked={telegramEnabled}
                    onCheckedChange={setTelegramEnabled}
                  />
                </div>
                {telegramEnabled && (
                  <Input
                    placeholder="Chat ID (ví dụ: 123456789)"
                    value={telegramId}
                    onChange={(e) => setTelegramId(e.target.value)}
                  />
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* System Settings */}
        <TabsContent value="system" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Thông tin hệ thống</CardTitle>
              <CardDescription>
                Xem thông tin và trạng thái của hệ thống
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="p-4 bg-gray-50 rounded-lg">
                  <p className="text-sm text-gray-500">Phiên bản YOLO</p>
                  <p className="font-medium">YOLOv8n (Custom trained)</p>
                </div>
                <div className="p-4 bg-gray-50 rounded-lg">
                  <p className="text-sm text-gray-500">Model size</p>
                  <p className="font-medium">6.3 MB</p>
                </div>
                <div className="p-4 bg-gray-50 rounded-lg">
                  <p className="text-sm text-gray-500">Inference device</p>
                  <p className="font-medium">CUDA (GPU)</p>
                </div>
                <div className="p-4 bg-gray-50 rounded-lg">
                  <p className="text-sm text-gray-500">FPS trung bình</p>
                  <p className="font-medium">30 FPS</p>
                </div>
              </div>

              <div className="mt-6 pt-4 border-t">
                <h4 className="font-medium mb-3">Hành động</h4>
                <div className="flex gap-3">
                  <Button variant="outline">
                    <svg
                      className="w-4 h-4 mr-2"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12"
                      />
                    </svg>
                    Export Logs
                  </Button>
                  <Button variant="outline">
                    <svg
                      className="w-4 h-4 mr-2"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                      />
                    </svg>
                    Restart System
                  </Button>
                  <Button variant="destructive">
                    <svg
                      className="w-4 h-4 mr-2"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                      />
                    </svg>
                    Clear Data
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs >
    </div >
  );
}
