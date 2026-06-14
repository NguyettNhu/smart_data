"use client";
import * as React from "react";
import { motion, AnimatePresence } from "motion/react";
import {
  Video,
  Upload,
  Square,
  Eye,
  EyeOff,
  Droplet,
  AlertTriangle,
  Users,
  Activity,
  Gauge,
  Timer,
  Wifi,
  WifiOff,
} from "lucide-react";
import { wsUrl } from "@/lib/api";
import type { LiveDetection } from "@/lib/types";
import { cn, formatDuration } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { LiveDot } from "@/components/common/live-dot";

type Privacy = "full" | "blur" | "private";
type Mode = "idle" | "webcam" | "video";

const STATUS_COLOR: Record<string, string> = {
  standing: "#10b981",
  sitting: "#3b82f6",
  falling: "#e0552a",
  fallen: "#dc2626",
  unknown: "#8493a0",
};

export function LiveMonitor() {
  const videoRef = React.useRef<HTMLVideoElement>(null);
  const overlayRef = React.useRef<HTMLCanvasElement>(null);
  const captureRef = React.useRef<HTMLCanvasElement>(null);
  const frameRef = React.useRef<HTMLCanvasElement>(null);
  const wsRef = React.useRef<WebSocket | null>(null);
  const streamRef = React.useRef<MediaStream | null>(null);
  const rafRef = React.useRef<number>(0);
  const pendingRef = React.useRef(false);
  const detsRef = React.useRef<LiveDetection[]>([]);
  const lastDetAtRef = React.useRef(0);
  const fallSinceRef = React.useRef<number | null>(null);
  const fileUrlRef = React.useRef<string | null>(null);
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  const [mode, setMode] = React.useState<Mode>("idle");
  const [connected, setConnected] = React.useState(false);
  const [privacy, setPrivacy] = React.useState<Privacy>("full");
  const [fall, setFall] = React.useState(false);
  const [people, setPeople] = React.useState(0);
  const [topStatus, setTopStatus] = React.useState("—");
  const [fallConf, setFallConf] = React.useState(0);
  const [longLie, setLongLie] = React.useState(0);
  const [permError, setPermError] = React.useState<string | null>(null);

  // Effective confidence for live inference. Trained detection models fire at
  // lower confidence than the pose model, so we keep this modest and cap the
  // (high) Settings threshold rather than letting it suppress every detection.
  const threshold = React.useRef(0.35);
  React.useEffect(() => {
    const t = Number(localStorage.getItem("detection-threshold"));
    if (t) threshold.current = Math.min(0.6, t / 100);
  }, []);

  // long-lie ticking
  React.useEffect(() => {
    const t = setInterval(() => {
      if (fallSinceRef.current) setLongLie((Date.now() - fallSinceRef.current) / 1000);
      else setLongLie(0);
    }, 250);
    return () => clearInterval(t);
  }, []);

  const drawOverlay = React.useCallback(() => {
    const canvas = overlayRef.current;
    const frame = frameRef.current;
    if (!canvas) return;
    const vw = frame?.width || videoRef.current?.videoWidth || 1280;
    const vh = frame?.height || videoRef.current?.videoHeight || 720;
    if (canvas.width !== vw) canvas.width = vw;
    if (canvas.height !== vh) canvas.height = vh;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, vw, vh);

    if (privacy === "private") {
      // Private: hide the raw frame behind a dark grid; show avatar glyphs only.
      ctx.fillStyle = "#0f1822";
      ctx.fillRect(0, 0, vw, vh);
      ctx.strokeStyle = "rgba(255,255,255,0.05)";
      ctx.lineWidth = 1;
      for (let x = 0; x < vw; x += 40) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, vh); ctx.stroke(); }
      for (let y = 0; y < vh; y += 40) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(vw, y); ctx.stroke(); }
    } else if (frame && frame.width) {
      // Draw the EXACT frame the model analysed so boxes always align with it
      // (decouples the fast video playback from the slower inference rate).
      if (privacy === "blur") ctx.filter = "blur(14px)";
      ctx.drawImage(frame, 0, 0, vw, vh);
      ctx.filter = "none";
    }

    const pulse = Math.sin(Date.now() / 140) * 0.3 + 0.7;
    for (const d of detsRef.current) {
      const [x1, y1, x2, y2] = d.box;
      const w = x2 - x1;
      const h = y2 - y1;
      const color = STATUS_COLOR[d.class_name] || STATUS_COLOR.unknown;

      if (privacy === "private") {
        drawAvatar(ctx, x1, y1, w, h, color);
      }

      ctx.lineWidth = d.is_fall ? 4 : 3;
      ctx.strokeStyle = color;
      if (d.is_fall) ctx.globalAlpha = pulse;
      roundRect(ctx, x1, y1, w, h, 10);
      ctx.stroke();
      ctx.globalAlpha = 1;

      // label
      const label = `${d.class_name} ${(d.confidence * 100).toFixed(0)}%`;
      ctx.font = "600 22px ui-sans-serif, system-ui";
      const tw = ctx.measureText(label).width;
      ctx.fillStyle = color;
      roundRect(ctx, x1, Math.max(0, y1 - 30), tw + 18, 28, 6);
      ctx.fill();
      ctx.fillStyle = "#fff";
      ctx.fillText(label, x1 + 9, Math.max(20, y1 - 9));
    }
  }, [privacy]);

  const loopRef = React.useRef<() => void>(() => {});
  const loop = React.useCallback(() => {
    const video = videoRef.current;
    const ws = wsRef.current;
    const cap = captureRef.current;
    if (video && cap && ws && ws.readyState === WebSocket.OPEN && !pendingRef.current && video.videoWidth) {
      cap.width = video.videoWidth;
      cap.height = video.videoHeight;
      const cctx = cap.getContext("2d");
      if (cctx) {
        cctx.drawImage(video, 0, 0, cap.width, cap.height);
        cap.toBlob(
          (blob) => {
            if (blob && wsRef.current?.readyState === WebSocket.OPEN) {
              pendingRef.current = true;
              wsRef.current.send(blob);
            }
          },
          "image/jpeg",
          0.6
        );
      }
    }
    drawOverlay();
    rafRef.current = requestAnimationFrame(() => loopRef.current());
  }, [drawOverlay]);
  React.useEffect(() => {
    loopRef.current = loop;
  }, [loop]);

  const connectWS = React.useCallback(() => {
    const ws = new WebSocket(wsUrl("/ws/predict"));
    ws.binaryType = "arraybuffer";
    wsRef.current = ws;
    ws.onopen = () => {
      setConnected(true);
      ws.send(JSON.stringify({ conf: threshold.current }));
    };
    ws.onclose = () => setConnected(false);
    ws.onerror = () => setConnected(false);
    ws.onmessage = (e) => {
      pendingRef.current = false;
      // Snapshot the just-analysed frame so the displayed image and the boxes
      // belong to the SAME frame (no lag between fast video and slow inference).
      const cap = captureRef.current;
      const fr = frameRef.current;
      const syncFrame = () => {
        if (cap && fr && cap.width) {
          if (fr.width !== cap.width) fr.width = cap.width;
          if (fr.height !== cap.height) fr.height = cap.height;
          fr.getContext("2d")?.drawImage(cap, 0, 0);
        }
      };
      try {
        const data = JSON.parse(e.data);
        const dets: LiveDetection[] = data.detections || [];
        if (dets.length > 0) {
          detsRef.current = dets;
          lastDetAtRef.current = Date.now();
          syncFrame();
          setPeople(dets.length);
          const dom = [...dets].sort(
            (a: LiveDetection, b: LiveDetection) =>
              (b.box[2] - b.box[0]) * (b.box[3] - b.box[1]) - (a.box[2] - a.box[0]) * (a.box[3] - a.box[1])
          )[0];
          setTopStatus(dom ? dom.class_name : "—");
        } else if (Date.now() - lastDetAtRef.current > 1200) {
          // No detection for a while: clear boxes and refresh to the live frame.
          // (Sparse models skip frames, so we hold the last result ~1.2s to keep
          // the box visible and steady instead of flickering off.)
          detsRef.current = [];
          syncFrame();
          setPeople(0);
          setTopStatus("—");
        }
        // else: briefly keep the last frame + boxes frozen together (aligned).
        const isFall = !!data.fall_detected;
        setFall(isFall);
        if (isFall) {
          if (!fallSinceRef.current) fallSinceRef.current = Date.now();
          const maxFc = Math.max(0, ...data.detections.map((d: LiveDetection) => d.fall_confidence || 0));
          setFallConf(maxFc);
        } else {
          fallSinceRef.current = null;
          setFallConf(0);
        }
      } catch {
        /* ignore */
      }
    };
  }, []);

  const stopAll = React.useCallback(() => {
    cancelAnimationFrame(rafRef.current);
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      try { wsRef.current.send(JSON.stringify({ action: "stop" })); } catch {}
      wsRef.current.close();
    }
    wsRef.current = null;
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    if (fileUrlRef.current) { URL.revokeObjectURL(fileUrlRef.current); fileUrlRef.current = null; }
    detsRef.current = [];
    fallSinceRef.current = null;
    pendingRef.current = false;
    setMode("idle");
    setConnected(false);
    setFall(false);
    setPeople(0);
    setTopStatus("—");
    const v = videoRef.current;
    if (v) { v.srcObject = null; v.removeAttribute("src"); v.load?.(); }
    const c = overlayRef.current?.getContext("2d");
    if (c && overlayRef.current) c.clearRect(0, 0, overlayRef.current.width, overlayRef.current.height);
  }, []);

  const startWebcam = React.useCallback(async () => {
    setPermError(null);
    stopAll();
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { width: 1280, height: 720 }, audio: false });
      streamRef.current = stream;
      const v = videoRef.current!;
      v.srcObject = stream;
      await v.play();
      setMode("webcam");
      connectWS();
      rafRef.current = requestAnimationFrame(() => loopRef.current());
    } catch {
      setPermError("Không truy cập được camera. Kiểm tra quyền trình duyệt, hoặc tải video lên để thử.");
    }
  }, [connectWS, stopAll]);

  const startVideo = React.useCallback(
    (file: File) => {
      setPermError(null);
      stopAll();
      const url = URL.createObjectURL(file);
      fileUrlRef.current = url;
      const v = videoRef.current!;
      v.srcObject = null;
      v.src = url;
      v.loop = true;
      v.muted = true;
      v.onloadeddata = async () => {
        await v.play();
        setMode("video");
        threshold.current = Math.min(threshold.current, 0.25); // wide-angle / distant clips → lower conf
        connectWS();
        rafRef.current = requestAnimationFrame(() => loopRef.current());
      };
    },
    [connectWS, stopAll]
  );

  React.useEffect(() => () => stopAll(), [stopAll]);

  const running = mode !== "idle";

  return (
    <div className="grid grid-cols-1 gap-4 xl:grid-cols-12">
      {/* Stage */}
      <div className="xl:col-span-8">
        <Card className="overflow-hidden">
          <div className="relative aspect-video w-full bg-[#0b121a]">
            <div className="absolute inset-0 grid-bg opacity-20" />
            <video
              ref={videoRef}
              playsInline
              muted
              className={cn(
                "absolute inset-0 h-full w-full object-contain transition-all",
                privacy === "blur" && "blur-2xl scale-110",
                privacy === "private" && "opacity-0"
              )}
            />
            <canvas ref={overlayRef} className="absolute inset-0 h-full w-full object-contain" />
            <canvas ref={captureRef} className="hidden" />
            <canvas ref={frameRef} className="hidden" />

            {/* idle state */}
            {!running && (
              <div className="absolute inset-0 grid place-items-center text-center">
                <div>
                  <div className="mx-auto grid size-14 place-items-center rounded-2xl bg-white/5 text-white/40">
                    <Video className="size-7" />
                  </div>
                  <p className="mt-3 text-sm font-medium text-white/70">Camera chưa bật</p>
                  <p className="text-[12px] text-white/40">Bật webcam hoặc tải video lên để bắt đầu phát hiện</p>
                </div>
              </div>
            )}

            {/* top bar */}
            <div className="absolute left-3 top-3 flex items-center gap-2">
              <Badge variant="solid" className="gap-1.5 bg-black/55 backdrop-blur">
                {running ? <LiveDot color="critical" className="size-1.5" /> : <span className="size-1.5 rounded-full bg-white/40" />}
                {mode === "webcam" ? "CAM-01" : mode === "video" ? "VIDEO" : "TẮT"}
              </Badge>
              {running && (
                <Badge variant="solid" className="gap-1 bg-black/55 backdrop-blur">
                  {connected ? <Wifi className="size-3" /> : <WifiOff className="size-3" />}
                  {connected ? "Đã kết nối AI" : "đang kết nối…"}
                </Badge>
              )}
            </div>

            {/* fall banner */}
            <AnimatePresence>
              {fall && (
                <>
                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="pointer-events-none absolute inset-0 ring-4 ring-inset ring-critical"
                  />
                  <motion.div
                    initial={{ y: -40, opacity: 0 }}
                    animate={{ y: 0, opacity: 1 }}
                    exit={{ y: -40, opacity: 0 }}
                    className="absolute left-1/2 top-4 flex -translate-x-1/2 items-center gap-2 rounded-full bg-critical px-4 py-2 text-sm font-semibold text-white shadow-lg"
                  >
                    <AlertTriangle className="size-4" /> PHÁT HIỆN NGÃ
                    {longLie > 2 && <span className="font-mono tabular-nums">· {formatDuration(longLie)}</span>}
                  </motion.div>
                </>
              )}
            </AnimatePresence>
          </div>

          {/* controls */}
          <CardContent className="flex flex-wrap items-center gap-2 py-3">
            {!running ? (
              <>
                <Button onClick={startWebcam}>
                  <Video className="size-4" /> Bật webcam
                </Button>
                <Button
                  variant="outline"
                  onClick={() => {
                    const inp = fileInputRef.current;
                    if (inp) {
                      inp.value = ""; // reset so picking the SAME file still fires onChange
                      inp.click();
                    }
                  }}
                >
                  <Upload className="size-4" /> Tải video lên
                </Button>
              </>
            ) : (
              <Button variant="danger" onClick={stopAll}>
                <Square className="size-4" /> Dừng
              </Button>
            )}
            <input
              ref={fileInputRef}
              type="file"
              accept="video/*"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                e.currentTarget.value = ""; // allow re-selecting the same file next time
                if (f) startVideo(f);
              }}
            />

            <div className="ml-auto flex items-center gap-1 rounded-lg border border-line bg-surface-2 p-0.5">
              <PrivacyBtn active={privacy === "full"} onClick={() => setPrivacy("full")} icon={Eye} label="Đầy đủ" />
              <PrivacyBtn active={privacy === "blur"} onClick={() => setPrivacy("blur")} icon={Droplet} label="Làm mờ" />
              <PrivacyBtn active={privacy === "private"} onClick={() => setPrivacy("private")} icon={EyeOff} label="Riêng tư" />
            </div>
          </CardContent>
        </Card>

        {permError && (
          <div className="mt-3 rounded-xl border border-warning-line/60 bg-warning-soft px-4 py-3 text-[13px] text-warning">
            {permError}
          </div>
        )}
      </div>

      {/* Status panel */}
      <div className="space-y-4 xl:col-span-4">
        <Card className={cn("transition-shadow", fall && "border-critical-line shadow-[0_0_0_3px_rgba(224,85,42,0.12)]")}>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Activity className="size-4 text-ink-3" /> Trạng thái trực tiếp
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <StatRow icon={Users} label="Số người trong khung" value={String(people)} />
            <StatRow icon={Activity} label="Tư thế chính" value={topStatus} valueClass="capitalize" />
            <StatRow icon={Gauge} label="Độ tin cậy ngã" value={fall ? `${(fallConf * 100).toFixed(0)}%` : "—"} />
            <StatRow icon={Timer} label="Bất động" value={fall ? formatDuration(longLie) : "—"} />
            <div
              className={cn(
                "mt-1 flex items-center justify-center gap-2 rounded-lg py-2.5 text-sm font-semibold",
                fall ? "bg-critical-soft text-critical" : running ? "bg-success-soft text-success" : "bg-surface-2 text-ink-3"
              )}
            >
              {fall ? <AlertTriangle className="size-4" /> : <LiveDot color={running ? "success" : "accent"} pulse={running} />}
              {fall ? "Đang xảy ra ngã" : running ? "Đang giám sát — bình thường" : "Chờ"}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Chú giải tư thế</CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-2 gap-2.5">
            {Object.entries(STATUS_COLOR).map(([k, c]) => (
              <div key={k} className="flex items-center gap-2 text-[13px] text-ink-2">
                <span className="size-3 rounded" style={{ background: c }} /> {
                  k === "standing" ? "Đứng" :
                  k === "sitting" ? "Ngồi" :
                  k === "falling" ? "Đang ngã" :
                  k === "fallen" ? "Đã ngã" :
                  "Không rõ"
                }
              </div>
            ))}
          </CardContent>
        </Card>

        <div className="rounded-xl border border-line bg-surface-2/50 p-3.5 text-[12px] leading-relaxed text-ink-3">
          <strong className="text-ink-2">Mẹo:</strong> không có webcam? Tải lên clip mẫu đi kèm
          (<span className="font-mono">video demo người ngã.mp4</span>) — bộ theo dõi thời gian sẽ xác nhận ngã và kích hoạt cảnh báo.
        </div>
      </div>
    </div>
  );
}

function PrivacyBtn({ active, onClick, icon: Icon, label }: { active: boolean; onClick: () => void; icon: React.ElementType; label: string }) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-[12px] font-medium transition-colors",
        active ? "bg-surface text-ink shadow-sm" : "text-ink-3 hover:text-ink"
      )}
    >
      <Icon className="size-3.5" /> {label}
    </button>
  );
}

function StatRow({ icon: Icon, label, value, valueClass }: { icon: React.ElementType; label: string; value: string; valueClass?: string }) {
  return (
    <div className="flex items-center gap-2.5">
      <div className="grid size-8 place-items-center rounded-lg bg-surface-2 text-ink-3">
        <Icon className="size-4" />
      </div>
      <span className="text-[13px] text-ink-2">{label}</span>
      <span className={cn("ml-auto font-semibold tabular-nums text-ink", valueClass)}>{value}</span>
    </div>
  );
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

// A neutral privacy "avatar" inside the box (not real keypoints — purely a privacy glyph).
function drawAvatar(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, color: string) {
  const cx = x + w / 2;
  const headR = Math.max(6, Math.min(w, h) * 0.12);
  const headY = y + headR + h * 0.05;
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineWidth = Math.max(2, w * 0.04);
  ctx.lineCap = "round";
  // head
  ctx.beginPath();
  ctx.arc(cx, headY, headR, 0, Math.PI * 2);
  ctx.fill();
  // spine
  const spineTop = headY + headR;
  const hipY = y + h * 0.62;
  ctx.beginPath();
  ctx.moveTo(cx, spineTop);
  ctx.lineTo(cx, hipY);
  ctx.stroke();
  // arms
  const armY = spineTop + (hipY - spineTop) * 0.25;
  ctx.beginPath();
  ctx.moveTo(cx - w * 0.22, armY + h * 0.06);
  ctx.lineTo(cx, armY);
  ctx.lineTo(cx + w * 0.22, armY + h * 0.06);
  ctx.stroke();
  // legs
  ctx.beginPath();
  ctx.moveTo(cx - w * 0.18, y + h * 0.95);
  ctx.lineTo(cx, hipY);
  ctx.lineTo(cx + w * 0.18, y + h * 0.95);
  ctx.stroke();
}
