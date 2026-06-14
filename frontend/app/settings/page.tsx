"use client";

import * as React from "react";
import {
  Settings2,
  Camera,
  MapPin,
  Bell,
  Cpu,
  Trash2,
  Plus,
  Download,
  Zap,
  Eye,
  Shield,
  Mail,
  Smartphone,
  Send,
  Server,
  BrainCircuit,
  ScanLine,
  Layers,
} from "lucide-react";
import { api, apiUrl } from "@/lib/api";
import type { SystemInfo } from "@/lib/types";
import { cn } from "@/lib/utils";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { LiveDot } from "@/components/common/live-dot";
import { useToast } from "@/components/ui/toast";

// ─── Types ────────────────────────────────────────────────────────────────────

type CameraType = "rtsp" | "webcam";
type CameraStatus = "online" | "offline";

interface CameraEntry {
  id: string;
  name: string;
  url: string;
  type: CameraType;
  status: CameraStatus;
}

interface ZoneEntry {
  id: string;
  name: string;
  sensitivity: number;
  active: boolean;
}

// ─── Seed data ────────────────────────────────────────────────────────────────

const INITIAL_CAMERAS: CameraEntry[] = [
  {
    id: "cam-1",
    name: "Main Floor",
    url: "rtsp://192.168.1.50:554/stream1",
    type: "rtsp",
    status: "online",
  },
  {
    id: "cam-2",
    name: "Entrance",
    url: "rtsp://192.168.1.51:554/entrance",
    type: "rtsp",
    status: "online",
  },
  {
    id: "cam-3",
    name: "Stairwell",
    url: "rtsp://192.168.1.52:554/stairs",
    type: "rtsp",
    status: "offline",
  },
];

const INITIAL_ZONES: ZoneEntry[] = [
  { id: "z1", name: "Main Floor", sensitivity: 70, active: true },
  { id: "z2", name: "Entrance", sensitivity: 60, active: true },
  { id: "z3", name: "Corridor A", sensitivity: 55, active: true },
  { id: "z4", name: "Stairwell", sensitivity: 85, active: true },
  { id: "z5", name: "Parking", sensitivity: 40, active: false },
  { id: "z6", name: "Common Room", sensitivity: 65, active: true },
  { id: "z7", name: "Warehouse Bay", sensitivity: 50, active: false },
];

// ─── Small helpers ─────────────────────────────────────────────────────────────

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-[11.5px] font-semibold uppercase tracking-widest text-ink-3">
      {children}
    </p>
  );
}

function SettingRow({
  icon: Icon,
  label,
  description,
  children,
  className,
}: {
  icon?: React.ElementType;
  label: string;
  description?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex items-start justify-between gap-4", className)}>
      <div className="flex min-w-0 flex-1 items-start gap-3">
        {Icon && (
          <div className="mt-0.5 grid size-8 shrink-0 place-items-center rounded-lg bg-surface-2 text-ink-3">
            <Icon className="size-4" />
          </div>
        )}
        <div className="min-w-0 flex-1">
          <div className="text-sm font-medium text-ink">{label}</div>
          {description && (
            <div className="mt-0.5 text-[12.5px] leading-relaxed text-ink-3">
              {description}
            </div>
          )}
        </div>
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  );
}

// ─── Tab 1 — Detection ────────────────────────────────────────────────────────

function DetectionTab() {
  const [threshold, setThreshold] = React.useState<number>(() => {
    if (typeof window === "undefined") return 70;
    const stored = localStorage.getItem("detection-threshold");
    return stored ? parseInt(stored, 10) : 70;
  });

  const [privacyMode, setPrivacyMode] = React.useState<string>(() => {
    if (typeof window === "undefined") return "full";
    return localStorage.getItem("privacy-mode") ?? "full";
  });

  const [lieTimer, setLieTimer] = React.useState<number>(30);
  const [multiPerson, setMultiPerson] = React.useState<boolean>(true);
  const [frameVoting, setFrameVoting] = React.useState<boolean>(true);

  const handleThreshold = (val: number[]) => {
    const v = val[0];
    setThreshold(v);
    localStorage.setItem("detection-threshold", String(v));
  };

  const handlePrivacy = (val: string) => {
    setPrivacyMode(val);
    localStorage.setItem("privacy-mode", val);
  };

  return (
    <div className="space-y-4">
      {/* Confidence */}
      <Card className="rounded-xl">
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Ngưỡng tin cậy</CardTitle>
          <CardDescription>
            Các phát hiện dưới điểm này sẽ bị loại bỏ. Giá trị cao hơn
            giảm báo động giả nhưng có thể bỏ sót các trường hợp ngã không rõ ràng.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="flex items-center justify-between gap-4">
            <span className="text-[12.5px] text-ink-3">50%</span>
            <Slider
              value={[threshold]}
              onValueChange={handleThreshold}
              min={50}
              max={99}
              step={1}
              className="flex-1"
            />
            <span className="text-[12.5px] text-ink-3">99%</span>
            <Badge variant="accent" className="min-w-[52px] justify-center text-sm font-bold tabular-nums">
              {threshold}%
            </Badge>
          </div>
          <p className="text-[12px] text-ink-4">
            Phạm vi khuyến nghị: 65–80% cho camera trong nhà.
          </p>
        </CardContent>
      </Card>

      {/* Privacy mode */}
      <Card className="rounded-xl">
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Chế độ riêng tư</CardTitle>
          <CardDescription>
            Kiểm soát cách lưu trữ và truyền khung hình video sau khi phát hiện.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Select value={privacyMode} onValueChange={handlePrivacy}>
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="full">Video đầy đủ — Giữ nguyên khung hình</SelectItem>
              <SelectItem value="skeleton">Chỉ khung xương — Điểm khớp, không lưu pixel</SelectItem>
              <SelectItem value="blur">Bóng mờ — Làm mờ mặt &amp; thân trước khi lưu</SelectItem>
            </SelectContent>
          </Select>
          <div className="rounded-lg border border-line bg-surface-2 px-3.5 py-3 text-[12.5px] leading-relaxed text-ink-3">
            {privacyMode === "full" && (
              <>
                <strong className="text-ink">Video đầy đủ</strong> — Khung hình gốc được lưu
                vào kho ảnh chụp. Tốt nhất để xem lại sau sự cố; yêu cầu lưu trữ tuân thủ.
              </>
            )}
            {privacyMode === "skeleton" && (
              <>
                <strong className="text-ink">Chỉ khung xương</strong> — Chỉ ghi lại các điểm khớp tư thế
                (17 mốc). Không có pixel nhận dạng nào được lưu, tối đa hóa tuân thủ GDPR.
              </>
            )}
            {privacyMode === "blur" && (
              <>
                <strong className="text-ink">Bóng mờ</strong> — Khuôn mặt và đường viền cơ thể
                được làm mờ theo thời gian thực trước khi ghi vào đĩa. Cân bằng bối cảnh và quyền riêng tư.
              </>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Timer & switches */}
      <Card className="rounded-xl">
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Hành vi cảnh báo</CardTitle>
          <CardDescription>
            Tinh chỉnh cách Aegis leo thang và loại trùng lặp các phát hiện.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="space-y-2">
            <SectionLabel>Hẹn giờ leo thang khi nằm lâu</SectionLabel>
            <div className="flex items-center gap-3">
              <Input
                type="number"
                min={5}
                max={300}
                value={lieTimer}
                onChange={(e) => setLieTimer(Number(e.target.value))}
                className="w-28 tabular-nums"
              />
              <span className="text-[13px] text-ink-3">giây</span>
            </div>
            <p className="text-[12px] text-ink-4">
              Tăng mức độ nếu người nằm lâu hơn thời gian này.
            </p>
          </div>

          <Separator />

          <div className="space-y-4">
            <SectionLabel>Tùy chọn phát hiện</SectionLabel>

            <SettingRow
              icon={Layers}
              label="Theo dõi nhiều người"
              description="Theo dõi từng người độc lập qua các khung hình. Tắt trên thiết bị công suất thấp."
            >
              <Switch checked={multiPerson} onCheckedChange={setMultiPerson} />
            </SettingRow>

            <SettingRow
              icon={Shield}
              label="Lọc báo động giả (bỏ phiếu khung hình)"
              description="Yêu cầu xác nhận ngã qua N khung hình liên tiếp trước khi kích hoạt cảnh báo."
            >
              <Switch checked={frameVoting} onCheckedChange={setFrameVoting} />
            </SettingRow>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// ─── Tab 2 — Cameras ─────────────────────────────────────────────────────────

function CamerasTab() {
  const [cameras, setCameras] = React.useState<CameraEntry[]>(INITIAL_CAMERAS);
  const [newName, setNewName] = React.useState("");
  const [newUrl, setNewUrl] = React.useState("");

  const addCamera = () => {
    const trimName = newName.trim();
    const trimUrl = newUrl.trim();
    if (!trimName || !trimUrl) return;
    setCameras((prev) => [
      ...prev,
      {
        id: `cam-${Date.now()}`,
        name: trimName,
        url: trimUrl,
        type: trimUrl.startsWith("rtsp") ? "rtsp" : "webcam",
        status: "online",
      },
    ]);
    setNewName("");
    setNewUrl("");
  };

  const removeCamera = (id: string) => {
    setCameras((prev) => prev.filter((c) => c.id !== id));
  };

  return (
    <div className="space-y-4">
      <Card className="rounded-xl">
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Camera đã kết nối</CardTitle>
          <CardDescription>
            Quản lý luồng RTSP và webcam cục bộ cung cấp dữ liệu cho đường ống phát hiện.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {cameras.length === 0 && (
            <p className="py-4 text-center text-[13px] text-ink-4">
              Chưa cấu hình camera nào. Thêm một camera bên dưới.
            </p>
          )}
          {cameras.map((cam) => (
            <div
              key={cam.id}
              className="flex items-center gap-3 rounded-xl border border-line bg-surface-2 px-4 py-3"
            >
              <LiveDot color={cam.status === "online" ? "success" : "danger"} />
              <div className="min-w-0 flex-1">
                <div className="text-sm font-medium text-ink">{cam.name}</div>
                <div className="truncate font-mono text-[11.5px] text-ink-4">{cam.url}</div>
              </div>
              <Badge variant="outline" className="shrink-0 uppercase text-[10.5px] tracking-wide">
                {cam.type}
              </Badge>
              <Badge
                variant={cam.status === "online" ? "success" : "danger"}
                className="shrink-0"
              >
                {cam.status === "online" ? "Trực tuyến" : "Ngoại tuyến"}
              </Badge>
              <Button
                variant="ghost"
                size="icon"
                className="shrink-0 text-ink-4 hover:text-danger"
                onClick={() => removeCamera(cam.id)}
              >
                <Trash2 className="size-4" />
              </Button>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card className="rounded-xl">
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Thêm camera</CardTitle>
          <CardDescription>
            Hỗ trợ luồng RTSP (camera IP, NVR) và chỉ số thiết bị cục bộ
            (ví dụ: <code className="font-mono text-accent">webcam://0</code>).
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <label className="text-[12.5px] font-medium text-ink-2">Tên camera</label>
              <Input
                placeholder="ví dụ: Khu vực lễ tân"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-[12.5px] font-medium text-ink-2">Đường dẫn luồng</label>
              <Input
                placeholder="rtsp://192.168.1.x:554/stream"
                value={newUrl}
                onChange={(e) => setNewUrl(e.target.value)}
              />
            </div>
          </div>
        </CardContent>
        <CardFooter>
          <Button
            onClick={addCamera}
            disabled={!newName.trim() || !newUrl.trim()}
            className="gap-2"
          >
            <Plus className="size-4" />
            Thêm camera
          </Button>
        </CardFooter>
      </Card>
    </div>
  );
}

// ─── Tab 3 — Zones ────────────────────────────────────────────────────────────

function ZonesTab() {
  const [zones, setZones] = React.useState<ZoneEntry[]>(INITIAL_ZONES);

  const updateZone = (id: string, patch: Partial<ZoneEntry>) => {
    setZones((prev) =>
      prev.map((z) => (z.id === id ? { ...z, ...patch } : z))
    );
  };

  return (
    <div className="space-y-4">
      <Card className="rounded-xl">
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Khu vực phát hiện</CardTitle>
          <CardDescription>
            Các khu vực tương ứng với vùng quan tâm (ROI) của camera. Độ nhạy kiểm soát
            mức độ mô hình đánh dấu chuyển động trong từng khu vực.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {zones.map((zone, idx) => (
            <React.Fragment key={zone.id}>
              {idx > 0 && <Separator />}
              <div className="space-y-3 pt-1">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <MapPin className="size-4 text-ink-3" />
                    <span
                      className={cn(
                        "text-sm font-medium",
                        zone.active ? "text-ink" : "text-ink-4"
                      )}
                    >
                      {zone.name}
                    </span>
                    {!zone.active && (
                      <Badge variant="outline" className="text-[10.5px]">
                        Không kích hoạt
                      </Badge>
                    )}
                  </div>
                  <Switch
                    checked={zone.active}
                    onCheckedChange={(v) => updateZone(zone.id, { active: v })}
                  />
                </div>
                <div className="flex items-center gap-3 pl-6">
                  <span className="w-24 text-[12px] text-ink-3">Độ nhạy</span>
                  <Slider
                    value={[zone.sensitivity]}
                    onValueChange={(v) =>
                      updateZone(zone.id, { sensitivity: v[0] })
                    }
                    min={0}
                    max={100}
                    step={5}
                    disabled={!zone.active}
                    className="flex-1"
                  />
                  <Badge
                    variant={
                      zone.sensitivity >= 80
                        ? "warning"
                        : zone.sensitivity >= 50
                        ? "accent"
                        : "outline"
                    }
                    className="min-w-[44px] justify-center tabular-nums"
                  >
                    {zone.sensitivity}
                  </Badge>
                </div>
              </div>
            </React.Fragment>
          ))}
        </CardContent>
      </Card>

      <div className="rounded-xl border border-line bg-surface-2 px-4 py-3 text-[12.5px] text-ink-3">
        <span className="font-semibold text-ink">Lưu ý:</span> Các vùng ROI được
        vẽ trực tiếp trong giao diện cấu hình camera hoặc qua tệp cấu hình backend.
        Giá trị độ nhạy ở đây được gửi làm tham số phát hiện cho từng khu vực.
      </div>
    </div>
  );
}

// ─── Tab 4 — Notifications ────────────────────────────────────────────────────

interface NotifChannel {
  key: string;
  icon: React.ElementType;
  label: string;
  description: string;
  enabled: boolean;
  inputLabel: string;
  inputPlaceholder: string;
  value: string;
}

function NotificationsTab() {
  const [channels, setChannels] = React.useState<NotifChannel[]>([
    {
      key: "email",
      icon: Mail,
      label: "Cảnh báo Email",
      description: "Nhận thông báo sự cố qua email cho các trường hợp ngã nghiêm trọng và mức cao.",
      enabled: false,
      inputLabel: "Địa chỉ email",
      inputPlaceholder: "ops-team@hospital.org",
      value: "",
    },
    {
      key: "sms",
      icon: Smartphone,
      label: "SMS / Tin nhắn văn bản",
      description: "Nhận SMS ngay lập tức khi phát hiện ngã và chưa được xác nhận sau 60 giây.",
      enabled: false,
      inputLabel: "Số điện thoại",
      inputPlaceholder: "+84 xxx xxx xxxx",
      value: "",
    },
    {
      key: "push",
      icon: Bell,
      label: "Thông báo đẩy",
      description: "Đẩy thông báo qua trình duyệt hoặc thiết bị di động qua ứng dụng Aegis.",
      enabled: true,
      inputLabel: "",
      inputPlaceholder: "",
      value: "",
    },
    {
      key: "telegram",
      icon: Send,
      label: "Bot Telegram",
      description: "Chuyển tiếp cảnh báo đến nhóm hoặc kênh Telegram qua bot.",
      enabled: false,
      inputLabel: "Chat ID",
      inputPlaceholder: "-100123456789",
      value: "",
    },
  ]);

  const toggle = (key: string) => {
    setChannels((prev) =>
      prev.map((c) => (c.key === key ? { ...c, enabled: !c.enabled } : c))
    );
  };

  const setValue = (key: string, val: string) => {
    setChannels((prev) =>
      prev.map((c) => (c.key === key ? { ...c, value: val } : c))
    );
  };

  return (
    <div className="space-y-4">
      <Card className="rounded-xl">
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Kênh cảnh báo</CardTitle>
          <CardDescription>
            Cấu hình nơi Aegis gửi cảnh báo phát hiện ngã. Nhiều kênh
            có thể hoạt động đồng thời.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          {channels.map((ch, idx) => (
            <React.Fragment key={ch.key}>
              {idx > 0 && <Separator />}
              <div className="space-y-3 pt-1">
                <SettingRow
                  icon={ch.icon}
                  label={ch.label}
                  description={ch.description}
                >
                  <Switch
                    checked={ch.enabled}
                    onCheckedChange={() => toggle(ch.key)}
                  />
                </SettingRow>
                {ch.enabled && ch.inputLabel && (
                  <div className="ml-11 space-y-1.5">
                    <label className="text-[12.5px] font-medium text-ink-2">
                      {ch.inputLabel}
                    </label>
                    <Input
                      placeholder={ch.inputPlaceholder}
                      value={ch.value}
                      onChange={(e) => setValue(ch.key, e.target.value)}
                      className="max-w-sm"
                    />
                  </div>
                )}
              </div>
            </React.Fragment>
          ))}
        </CardContent>
      </Card>

      <Card className="rounded-xl">
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Giới hạn tần suất cảnh báo</CardTitle>
          <CardDescription>
            Ngăn bão thông báo từ các phát hiện lặp lại trong cùng
            một khu vực.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-3">
            <span className="text-[12.5px] text-ink-3">Thời gian chờ</span>
            <Input
              type="number"
              min={0}
              max={600}
              defaultValue={120}
              className="w-28 tabular-nums"
            />
            <span className="text-[12.5px] text-ink-3">giây giữa các cảnh báo lặp lại</span>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// ─── Tab 5 — System ───────────────────────────────────────────────────────────

function SystemTab() {
  const [info, setInfo] = React.useState<SystemInfo | null>(null);
  const [seeding, setSeeding] = React.useState(false);
  const [clearing, setClearing] = React.useState(false);
  const { toast } = useToast();

  React.useEffect(() => {
    api.systemInfo().then(setInfo);
  }, []);

  const handleSeed = async () => {
    setSeeding(true);
    toast({ title: "Đang tạo dữ liệu mẫu…", description: "Đang tạo 240 sự cố thực tế." });
    try {
      const r = await api.seed(240);
      toast({
        title: r.status === "success" ? "Dữ liệu mẫu đã sẵn sàng" : "Tạo dữ liệu thất bại",
        description:
          r.status === "success"
            ? `Đã chèn ${r.inserted} sự cố trong 14 ngày.`
            : "Backend có thể không truy cập được. Kiểm tra cổng 8000.",
        variant: r.status === "success" ? "success" : "critical",
      });
    } finally {
      setSeeding(false);
    }
  };

  const handleClear = async () => {
    const ok = window.confirm(
      "Thao tác này sẽ xóa vĩnh viễn TẤT CẢ sự kiện ngã và ảnh chụp. Không thể hoàn tác. Tiếp tục?"
    );
    if (!ok) return;
    setClearing(true);
    try {
      const r = await api.clearData();
      toast({
        title: r.status === "success" ? "Đã xóa dữ liệu" : "Xóa thất bại",
        description:
          r.status === "success"
            ? "Tất cả hồ sơ sự cố đã được xóa."
            : "Không thể kết nối backend.",
        variant: r.status === "success" ? "warning" : "critical",
      });
    } finally {
      setClearing(false);
    }
  };

  const stat = (label: string, value: string | undefined, icon: React.ElementType) => {
    const Icon = icon;
    return (
      <div className="flex items-start gap-3 rounded-xl border border-line bg-surface-2 p-4">
        <div className="mt-0.5 grid size-8 shrink-0 place-items-center rounded-lg bg-surface-3 text-ink-3">
          <Icon className="size-4" />
        </div>
        <div className="min-w-0">
          <div className="text-[11.5px] font-semibold uppercase tracking-wider text-ink-4">
            {label}
          </div>
          <div
            className="mt-0.5 truncate font-mono text-[13px] font-medium text-ink"
            title={value}
          >
            {value ?? "—"}
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-4">
      {/* Stats grid */}
      <Card className="rounded-xl">
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Thông tin thời gian chạy</CardTitle>
          <CardDescription>
            Phản ánh trạng thái hiện tại của backend phát hiện Aegis.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {stat("Đường dẫn mô hình", info?.model_path, ScanLine)}
            {stat("Phương pháp phát hiện", info?.detection_method, Zap)}
            {stat("Thiết bị suy luận", info?.device ?? "CPU", Cpu)}
            {stat(
              "Trợ lý AI",
              info?.llm_enabled ? "Đã bật LLM" : "Dựa trên luật (ngoại tuyến)",
              BrainCircuit
            )}
          </div>

          {info?.features && info.features.length > 0 && (
            <div className="space-y-2">
              <SectionLabel>Tính năng đang hoạt động</SectionLabel>
              <div className="flex flex-wrap gap-2">
                {info.features.map((f) => (
                  <Badge key={f} variant="accent" className="text-[11.5px]">
                    {f}
                  </Badge>
                ))}
              </div>
            </div>
          )}

          {info && (
            <div className="rounded-lg border border-line bg-surface-2 px-3.5 py-2.5">
              <div className="flex items-center gap-2">
                <LiveDot color="success" />
                <span className="text-[12.5px] text-ink-3">
                  Phiên bản YOLO:{" "}
                  <span className="font-mono font-semibold text-ink">
                    {info.yolo_version}
                  </span>
                </span>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Actions */}
      <Card className="rounded-xl">
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Thao tác</CardTitle>
          <CardDescription>
            Xuất nhật ký, điền dữ liệu mẫu thực tế vào hệ thống, hoặc đặt lại
            cơ sở dữ liệu sự cố.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap gap-3">
            <Button
              variant="outline"
              onClick={() => window.open(apiUrl("/api/system/logs"), "_blank")}
              className="gap-2"
            >
              <Download className="size-4" />
              Xuất nhật ký
            </Button>
            <Button
              variant="secondary"
              onClick={handleSeed}
              disabled={seeding}
              className="gap-2"
            >
              <Server className="size-4" />
              {seeding ? "Đang tạo…" : "Tạo dữ liệu mẫu"}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Danger zone */}
      <Card className="rounded-xl border-danger/30 bg-danger/[0.03]">
        <CardHeader className="pb-2">
          <div className="flex items-center gap-2">
            <div className="grid size-7 place-items-center rounded-lg bg-danger/10 text-danger">
              <Trash2 className="size-4" />
            </div>
            <div>
              <CardTitle className="text-base text-danger">Vùng nguy hiểm</CardTitle>
              <CardDescription>Các thao tác này không thể hoàn tác.</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="flex items-start justify-between gap-4 rounded-xl border border-danger/20 bg-danger/[0.04] p-4">
            <div>
              <div className="text-sm font-semibold text-ink">Xóa toàn bộ dữ liệu</div>
              <div className="mt-0.5 text-[12.5px] text-ink-3">
                Xóa vĩnh viễn mọi sự kiện ngã, ảnh chụp và hồ sơ sự cố
                khỏi cơ sở dữ liệu. Không thể hoàn tác.
              </div>
            </div>
            <Button
              variant="danger"
              size="sm"
              onClick={handleClear}
              disabled={clearing}
              className="shrink-0 gap-2"
            >
              <Trash2 className="size-4" />
              {clearing ? "Đang xóa…" : "Xóa toàn bộ dữ liệu"}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

const TABS = [
  { value: "detection", label: "Phát hiện", icon: Eye },
  { value: "cameras", label: "Camera", icon: Camera },
  { value: "zones", label: "Khu vực", icon: MapPin },
  { value: "notifications", label: "Thông báo", icon: Bell },
  { value: "system", label: "Hệ thống", icon: Cpu },
] as const;

type TabValue = (typeof TABS)[number]["value"];

export default function SettingsPage() {
  const [tab, setTab] = React.useState<TabValue>("detection");

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div className="space-y-1.5">
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="gap-1.5">
            <Settings2 className="size-3" />
            Cấu hình
          </Badge>
        </div>
        <h1 className="text-[26px] font-bold tracking-tight text-ink">Cấu hình</h1>
        <p className="text-[13.5px] text-ink-3">
          Cấu hình phát hiện, camera, khu vực, cảnh báo và bộ máy AI.
        </p>
      </div>

      {/* Tabs */}
      <Tabs
        value={tab}
        onValueChange={(v) => setTab(v as TabValue)}
        className="flex flex-col gap-4 md:flex-row md:items-start"
      >
        {/* Left sidebar nav */}
        <div className="w-full md:w-52 shrink-0">
          <TabsList className="flex w-full flex-row flex-wrap gap-1 rounded-xl bg-surface-2 p-1.5 md:flex-col">
            {TABS.map(({ value, label, icon: Icon }) => (
              <TabsTrigger
                key={value}
                value={value}
                className={cn(
                  "flex flex-1 items-center justify-start gap-2 rounded-lg px-3 py-2 text-sm font-medium text-ink-3 transition-colors",
                  "data-[state=active]:bg-surface data-[state=active]:text-ink data-[state=active]:shadow-sm"
                )}
              >
                <Icon className="size-4 shrink-0" />
                <span className="hidden sm:inline md:inline">{label}</span>
              </TabsTrigger>
            ))}
          </TabsList>
        </div>

        {/* Right content panel */}
        <div className="min-w-0 flex-1">
          <TabsContent value="detection" className="mt-0">
            <DetectionTab />
          </TabsContent>
          <TabsContent value="cameras" className="mt-0">
            <CamerasTab />
          </TabsContent>
          <TabsContent value="zones" className="mt-0">
            <ZonesTab />
          </TabsContent>
          <TabsContent value="notifications" className="mt-0">
            <NotificationsTab />
          </TabsContent>
          <TabsContent value="system" className="mt-0">
            <SystemTab />
          </TabsContent>
        </div>
      </Tabs>
    </div>
  );
}
