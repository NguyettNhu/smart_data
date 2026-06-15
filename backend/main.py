"""
Fall Detection System - Backend API
Using YOLOv8 Pose for robust fall detection (Top-down & Side views)
"""

import io
import json
import os
import time
import threading
import sqlite3
import datetime
import glob
import ssl
import smtplib
import math
import random
import statistics
from email.message import EmailMessage
from typing import Optional, Dict, Any, List

import uvicorn
from fastapi import FastAPI, File, UploadFile, WebSocket, WebSocketDisconnect, Body
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from PIL import Image
from ultralytics import YOLO
from dotenv import load_dotenv
import numpy as np

# ==================== CONFIGURATION ====================

load_dotenv()

# Fixed timezone so detection times / peak-hour stats are correct regardless of
# where the backend runs (Colab servers run in UTC -> a 19:00 fall would
# otherwise be recorded as 12:00). Override with the TZ env var if needed.
os.environ.setdefault("TZ", os.getenv("APP_TZ", "Asia/Ho_Chi_Minh"))
if hasattr(time, "tzset"):
    time.tzset()  # Unix only (Colab); on Windows datetime.now() already uses local time

DB_NAME = "stats.db"
EMAIL_SENDER = os.getenv("EMAIL_SENDER")
EMAIL_PASSWORD = os.getenv("EMAIL_PASSWORD")
EMAIL_RECEIVER = os.getenv("EMAIL_RECEIVER") or EMAIL_SENDER
COOLDOWN_SECONDS = 60

# YOLO model path. Override via .env MODEL_PATH to load a model you trained in
# Colab (e.g. models/fall_yolo.pt). Defaults to the pose model.
MODEL_PATH = os.getenv("MODEL_PATH", "yolov8n-pose.pt")

# Generic zone names for a command-center fall detection product
ZONES = [
    "Main Floor",
    "Entrance",
    "Corridor A",
    "Stairwell",
    "Parking",
    "Common Room",
    "Warehouse Bay",
]

# ==================== APPLICATION SETUP ====================

app = FastAPI(
    title="Fall Detection API",
    description="Real-time fall detection using YOLOv8 Pose",
    version="3.0.0"
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

SNAPSHOTS_DIR = "snapshots"
if not os.path.exists(SNAPSHOTS_DIR):
    os.makedirs(SNAPSHOTS_DIR)
app.mount("/snapshots", StaticFiles(directory=SNAPSHOTS_DIR), name="snapshots")

# ==================== DATABASE LAYER ====================

def init_database():
    conn = sqlite3.connect(DB_NAME)
    cursor = conn.cursor()
    try:
        cursor.execute("SELECT image_path FROM detections LIMIT 1")
    except sqlite3.OperationalError:
        cursor.execute("DROP TABLE IF EXISTS detections")

    cursor.execute('''
        CREATE TABLE IF NOT EXISTS detections (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            type TEXT NOT NULL,
            confidence REAL NOT NULL,
            image_path TEXT,
            timestamp DATETIME DEFAULT (datetime('now', 'localtime'))
        )
    ''')
    conn.commit()
    conn.close()


def migrate_db():
    """Add new columns to detections table if they don't already exist.
    Uses try/except per column since SQLite has no ALTER TABLE ADD COLUMN IF NOT EXISTS."""
    new_columns = [
        ("severity", "TEXT"),
        ("status", "TEXT DEFAULT 'active'"),
        ("zone", "TEXT"),
        ("camera", "TEXT"),
        ("response_time", "REAL"),
        ("immobile_seconds", "REAL DEFAULT 0"),
        ("narrative", "TEXT"),
        ("outcome", "TEXT"),
        ("acknowledged_at", "TEXT"),
        ("resolved_at", "TEXT"),
    ]
    conn = sqlite3.connect(DB_NAME)
    cursor = conn.cursor()
    for col_name, col_def in new_columns:
        try:
            cursor.execute(f"ALTER TABLE detections ADD COLUMN {col_name} {col_def}")
            conn.commit()
        except sqlite3.OperationalError:
            # Column already exists
            pass
    conn.close()


def _compute_severity(confidence: float) -> str:
    """Derive severity label from detection confidence."""
    if confidence >= 0.9:
        return "critical"
    elif confidence >= 0.8:
        return "high"
    elif confidence >= 0.6:
        return "medium"
    return "low"


def save_detection(
    detection_type: str,
    confidence: float,
    image: Optional[Image.Image] = None,
    zone: str = "Main Floor",
    camera: str = "CAM-01",
):
    try:
        image_path = None
        if image:
            timestamp = datetime.datetime.now().strftime("%Y%m%d_%H%M%S_%f")
            filename = f"fall_{timestamp}.jpg"
            file_path = os.path.join(SNAPSHOTS_DIR, filename)
            image.save(file_path, quality=85)
            image_path = f"/snapshots/{filename}"

        severity = _compute_severity(confidence)
        now_local = datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        narrative = (
            f"Fall detected at {zone} on {camera} with "
            f"{confidence * 100:.0f}% confidence at {now_local}."
        )

        conn = sqlite3.connect(DB_NAME)
        cursor = conn.cursor()
        cursor.execute(
            """INSERT INTO detections
               (type, confidence, image_path, timestamp,
                severity, status, zone, camera, immobile_seconds, narrative)
               VALUES (?, ?, ?, ?, ?, 'active', ?, ?, 0, ?)""",
            (detection_type, confidence, image_path, now_local,
             severity, zone, camera, narrative),
        )
        conn.commit()
        conn.close()
    except Exception as e:
        print(f"Error saving detection: {e}")

# ==================== NOTIFICATION LAYER ====================

last_alert_time = 0

def email_configured() -> bool:
    return bool(EMAIL_SENDER and EMAIL_PASSWORD and EMAIL_RECEIVER)


def _send_email(subject: str, body: str):
    """Send a plain-text email via Gmail SMTP. Returns (ok, message)."""
    if not email_configured():
        return False, "Email chưa được cấu hình (thiếu biến trong .env)."
    try:
        msg = EmailMessage()
        msg.set_content(body)
        msg["Subject"] = subject
        msg["From"] = EMAIL_SENDER
        msg["To"] = EMAIL_RECEIVER
        context = ssl.create_default_context()
        with smtplib.SMTP_SSL("smtp.gmail.com", 465, context=context) as server:
            server.login(EMAIL_SENDER, EMAIL_PASSWORD)
            server.send_message(msg)
        print(f"Email sent to {EMAIL_RECEIVER}")
        return True, f"Đã gửi email tới {EMAIL_RECEIVER}"
    except Exception as e:
        print(f"Failed to send email: {e}")
        return False, str(e)


def send_email_alert(confidence: float, zone: str = "Main Floor", camera: str = "CAM-01"):
    body = (
        f"⚠️ CẢNH BÁO PHÁT HIỆN NGÃ\n\n"
        f"Khu vực: {zone} ({camera})\n"
        f"Độ tin cậy: {confidence*100:.1f}%\n"
        f"Thời gian: {datetime.datetime.now().strftime('%Y-%m-%d %H:%M:%S')}\n\n"
        f"— Hệ thống giám sát Aegis"
    )
    _send_email("⚠️ CẢNH BÁO PHÁT HIỆN NGÃ", body)


def send_alert_async(confidence: float, zone: str = "Main Floor", camera: str = "CAM-01"):
    thread = threading.Thread(target=send_email_alert, args=(confidence, zone, camera))
    thread.daemon = True
    thread.start()

# ==================== FALL DETECTION LOGIC ====================

def _kp(keypoints, idx, thr=0.3):
    """Return (x, y) of a COCO keypoint if confident enough, else None."""
    if idx < len(keypoints) and keypoints[idx][2] > thr:
        return np.array(keypoints[idx][:2], dtype=float)
    return None


def detect_fall_from_pose(keypoints, box, confidence) -> Dict[str, Any]:
    """
    Robust fall detection.

    Primary signal is the orientation of the torso axis (shoulders -> hips):
    a standing person has a near-vertical torso, a fallen person a near-
    horizontal one. This is tolerant to the camera angle.

    Critical guard: if only the upper body is visible (no hips AND no ankles,
    e.g. someone sitting close to a webcam) we do NOT have enough information
    to judge a fall, so we report "standing" instead of guessing from the
    keypoint spread. The old spread-ratio rule mistook a wide-shoulder /
    short-height upper-body crop for a person lying down, which caused the
    false alarms while simply standing in front of the camera.
    """
    if keypoints is None or len(keypoints) < 17:
        return {"is_fall": False, "status": "unknown", "fall_confidence": 0, "reasons": []}

    # COCO keypoints: 0 nose, 5/6 shoulders, 11/12 hips, 15/16 ankles
    nose = _kp(keypoints, 0)
    shoulders = [p for p in (_kp(keypoints, 5), _kp(keypoints, 6)) if p is not None]
    hips = [p for p in (_kp(keypoints, 11), _kp(keypoints, 12)) if p is not None]
    ankles = [p for p in (_kp(keypoints, 15), _kp(keypoints, 16)) if p is not None]

    valid_points = [keypoints[i][:2] for i in range(len(keypoints)) if keypoints[i][2] > 0.3]

    # Too few points detected -> rely on bbox aspect ratio fallback
    if len(valid_points) < 5:
        return _fallback_bbox_logic(box, confidence)

    # Can we actually see enough of the body to judge posture?
    lower_body_visible = len(hips) > 0 or len(ankles) > 0

    fall_score = 0.0
    reasons = []

    # RULE 1 (PRIMARY): torso axis orientation (shoulders -> hips)
    if len(shoulders) > 0 and len(hips) > 0:
        shoulder_c = np.mean(shoulders, axis=0)
        hip_c = np.mean(hips, axis=0)
        dx = abs(shoulder_c[0] - hip_c[0])
        dy = abs(shoulder_c[1] - hip_c[1])
        tilt = np.degrees(np.arctan2(dx, dy + 1e-6))  # 0 deg = perfectly upright
        if tilt > 60:           # torso almost horizontal -> lying down
            fall_score += 0.7
            reasons.append(f"torso_horizontal({tilt:.0f}deg)")
        elif tilt > 45:         # strongly tilted -> probably falling
            fall_score += 0.4
            reasons.append(f"torso_tilted({tilt:.0f}deg)")
        # near-vertical torso adds nothing: this is a standing person

    # RULE 2: Head-to-Feet horizontal orientation (good for side views)
    if nose is not None and len(ankles) > 0:
        feet_c = np.mean(ankles, axis=0)
        body_dx = abs(feet_c[0] - nose[0])
        body_dy = abs(feet_c[1] - nose[1])
        if body_dx > body_dy:   # head and feet roughly on the same level
            fall_score += 0.5
            reasons.append("head_feet_horizontal")

    # RULE 3: Keypoint spread ratio -- ONLY trustworthy when the lower body is
    # in frame. Skipped for upper-body-only crops to avoid the false alarm.
    if lower_body_visible:
        pts = np.array(valid_points, dtype=float)
        x_spread = np.max(pts[:, 0]) - np.min(pts[:, 0])
        y_spread = np.max(pts[:, 1]) - np.min(pts[:, 1])
        spread_ratio = x_spread / y_spread if y_spread > 0 else 0
        if spread_ratio > 1.2:
            fall_score += 0.5
            reasons.append("high_spread_ratio")
        elif spread_ratio > 0.85:
            fall_score += 0.3
            reasons.append("medium_spread_ratio")

    # Decision
    if fall_score >= 0.6:
        return {
            "is_fall": True,
            "status": "fallen",
            "fall_confidence": min(0.95, confidence * (0.6 + fall_score)),
            "reasons": reasons
        }
    elif fall_score >= 0.4:
        return {
            "is_fall": True,
            "status": "falling",
            "fall_confidence": min(0.75, confidence * (0.5 + fall_score)),
            "reasons": reasons
        }
    else:
        return {
            "is_fall": False,
            "status": "standing",
            "fall_confidence": 0,
            "reasons": reasons
        }

def _fallback_bbox_logic(box, confidence):
    # Used when keypoints are unreliable (e.g. small / distant people in CCTV
    # footage). A fallen person's bounding box is typically wider than tall.
    x1, y1, x2, y2 = box
    width = x2 - x1
    height = y2 - y1
    if height <= 0:
        return {"is_fall": False, "status": "unknown", "fall_confidence": 0, "reasons": []}

    aspect_ratio = width / height
    if aspect_ratio > 1.3:
        return {"is_fall": True, "status": "fallen",
                "fall_confidence": min(0.9, confidence * 0.9), "reasons": ["wide_bbox_fallback"]}
    return {"is_fall": False, "status": "standing", "fall_confidence": 0, "reasons": []}

# ==================== TEMPORAL FALL SCORER ====================
# Upgraded temporal logic adapted from doan-hoang-215/Fall-Detecton
# (MediaPipe + rule-based ensemble + Bayesian smoothing). That project relies
# on a trained TCN and MediaPipe 3D landmarks; here we port the *runtime* ideas
# to YOLO COCO-17 keypoints (2D): fall DYNAMICS (velocity / acceleration / jerk
# of hip & head + floor impact), NEGATIVE GATES that suppress non-falls
# (sitting, standing up, fast sit-down), POSITIVE RULES for real falls,
# asymmetric BAYESIAN smoothing, and post-fall STILLNESS confirmation.


class BayesianSmoother:
    """Asymmetric EMA: reacts fast when the fall probability rises, decays
    slowly when it drops (so a brief detector miss does not clear the alert)."""

    def __init__(self, alpha_rise=0.60, alpha_fall=0.35):
        self.alpha_rise = alpha_rise
        self.alpha_fall = alpha_fall
        self.smooth = 0.0

    def update(self, raw_prob: float) -> float:
        alpha = self.alpha_rise if raw_prob > self.smooth else self.alpha_fall
        self.smooth = alpha * raw_prob + (1.0 - alpha) * self.smooth
        return self.smooth


def pose_features_2d(keypoints, box, img_w, img_h):
    """COCO-17 keypoints (pixels) -> normalised 2D pose features (0..1 space).
    Returns None when the torso (shoulders + hips) is not visible -- the same
    "upper-body-only -> don't guess" guard used by detect_fall_from_pose."""
    if keypoints is None or len(keypoints) < 17 or img_w <= 0 or img_h <= 0:
        return None

    def P(i):
        if i < len(keypoints) and keypoints[i][2] > 0.3:
            return np.array([keypoints[i][0] / img_w, keypoints[i][1] / img_h], dtype=float)
        return None

    nose = P(0)
    sh = [p for p in (P(5), P(6)) if p is not None]
    hip = [p for p in (P(11), P(12)) if p is not None]
    kn = [p for p in (P(13), P(14)) if p is not None]
    an = [p for p in (P(15), P(16)) if p is not None]
    if not sh or not hip:
        return None  # need torso to judge posture

    mid_sh = np.mean(sh, axis=0)
    mid_hip = np.mean(hip, axis=0)
    spine = mid_hip - mid_sh
    # 0 = vertical torso (standing), 1 = horizontal torso (lying)
    spine_horiz = float(np.clip(abs(spine[0]) / (abs(spine[1]) + 1e-6) / 3.0, 0, 1))

    x1, y1, x2, y2 = box
    bw = (x2 - x1) / img_w + 1e-6
    bh = (y2 - y1) / img_h + 1e-6
    bbox_ar = float(np.clip(bw / bh, 0, 5))

    sh_tilt = float(abs(sh[0][1] - sh[1][1])) if len(sh) == 2 else 0.0
    hip_tilt = float(abs(hip[0][1] - hip[1][1])) if len(hip) == 2 else 0.0
    head_hip_dy = float(abs(nose[1] - mid_hip[1]) / bh) if nose is not None else 1.0

    def _knee(h, k, a):
        v1 = h - k; v2 = a - k
        n1 = np.linalg.norm(v1); n2 = np.linalg.norm(v2)
        if n1 < 1e-6 or n2 < 1e-6:
            return 0.5
        return float(np.clip(np.arccos(np.clip(np.dot(v1, v2) / (n1 * n2), -1, 1)) / np.pi, 0, 1))

    knee_avg = 0.7
    if hip and kn and an:
        knee_avg = _knee(mid_hip, np.mean(kn, axis=0), np.mean(an, axis=0))

    return {
        "hip_y": float(mid_hip[1]), "nose_y": float(nose[1]) if nose is not None else float(mid_sh[1]),
        "spine_horiz": spine_horiz, "bbox_ar": bbox_ar,
        "sh_tilt": sh_tilt, "hip_tilt": hip_tilt,
        "head_hip_dy": head_hip_dy, "knee_avg": knee_avg,
    }


class FallScorer:
    """Per-connection temporal fall scorer for the dominant person.

    Pose model  -> rich rule ensemble (gates + rules) on a feature buffer.
    Detect model -> smooth the model's own per-frame fall confidence.
    Either way the raw probability is Bayesian-smoothed and latched, and a
    confirmed fall additionally requires post-fall stillness when possible.
    """

    FALL_THR = 0.55     # smoothed probability needed to confirm a fall
    LATCH_S = 8.0       # keep the alert active this long after confirmation
    BUF = 60            # frames of feature history to keep

    def __init__(self):
        self.buf = []
        self.smoother = BayesianSmoother()
        self.fallen_until = 0.0

    # ---- rule ensemble on the 2D feature buffer (adapted from reference) ----
    def _rule_score(self):
        buf = self.buf
        if len(buf) < 8:
            return 0.0
        cur = buf[-1]
        v_hip = [f["v_hip"] for f in buf[-15:]]

        # --- NEGATIVE GATES (suppress non-falls) ---
        gate = 0.0
        if len(buf) >= 20:                                   # G1 controlled/slow sit-down
            v20 = [f["v_hip"] for f in buf[-20:]]
            j20 = [abs(f["j_hip"]) for f in buf[-20:]]
            if (np.std(v20) < 0.012 and max(v20) < 0.04 and max(j20) < 0.03
                    and np.mean(v20[-8:]) > 0.002 and cur["sh_tilt"] < 0.05):
                gate = max(gate, 0.70)
        if len(buf) >= 30:                                   # G2 prolonged descent
            v30 = [f["v_hip"] for f in buf[-30:]]
            if sum(1 for v in v30 if v > 0.004) >= 22:
                gate = max(gate, 0.75)
        if len(v_hip) >= 8:                                  # G3 recovery (standing back up)
            pk = int(np.argmax(v_hip))
            if pk <= len(v_hip) - 4 and np.mean(v_hip[pk:]) < -0.004:
                gate = max(gate, 0.85)
        if len(buf) >= 15:                                   # G7 fast sit-down (knees bend, torso upright)
            v15 = [f["v_hip"] for f in buf[-15:]]
            kn15 = [f["knee_avg"] for f in buf[-15:]]
            spine_end = np.mean([f["spine_horiz"] for f in buf[-4:]])
            if max(v15) > 0.04 and (np.mean(kn15[:4]) - np.mean(kn15[-4:])) > 0.10 and spine_end > 0.55:
                gate = max(gate, 0.78)
        if gate >= 0.85:
            return 0.0

        # --- POSITIVE RULES (detect real falls) ---
        scores = []
        if cur["bbox_ar"] > 1.2 and cur["spine_horiz"] < 0.35:                       # R1 horizontal body
            scores.append(min(1.0, (cur["bbox_ar"] - 1.2) * 2 + (0.35 - cur["spine_horiz"]) * 2))
        sum_v = sum(v for v in v_hip if v > 0); max_v = max(v_hip)
        if sum_v > 0.08 and max_v > 0.03:                                            # R2 rapid drop + velocity spike
            scores.append(min(1.0, sum_v * 6))
        if cur["spine_horiz"] < 0.30 and cur["knee_avg"] > 0.80 and cur["sh_tilt"] > 0.02:  # R3 lying + straight knees
            scores.append(min(1.0, 0.65 + (0.30 - cur["spine_horiz"]) * 1.5))
        if cur["head_hip_dy"] < 0.15:                                                # R4 head at hip level
            scores.append(min(1.0, (0.15 - cur["head_hip_dy"]) * 10))
        if cur["v_nose"] > 0.02 and cur["a_nose"] > 0:                               # R5 head free-fall
            scores.append(min(1.0, cur["v_nose"] * 15))
        tilt_avg = (cur["sh_tilt"] + cur["hip_tilt"]) / 2
        if tilt_avg > 0.04 and abs(cur["j_hip"]) > 0.03:                             # R9 asymmetric impact
            scores.append(min(1.0, tilt_avg * 6 + abs(cur["j_hip"]) * 8))
        if len(buf) >= 10:                                                           # impact: jerk peak after velocity peak
            v10 = [f["v_hip"] for f in buf[-10:]]; j10 = [abs(f["j_hip"]) for f in buf[-10:]]
            pk = int(np.argmax(v10))
            if pk < len(j10) - 1 and max(j10[pk:]) > 0.04:
                scores.append(min(1.0, max(j10[pk:]) * 12))

        if not scores:
            return 0.0
        pos = min(1.0, (sum(scores) / len(scores)) * 1.2)
        return float(np.clip(pos * (1.0 - gate), 0, 1))

    def _stillness_ok(self):
        """Post-fall confirmation: the person stays roughly still."""
        if len(self.buf) < 6:
            return True  # not enough history -> don't block
        recent = self.buf[-10:]
        return float(np.mean([abs(f["v_hip"]) + abs(f["v_nose"]) for f in recent])) < 0.05

    def update(self, keypoints, box, img_w, img_h, geom, now):
        """Returns (confirmed_fallen, smoothed_prob)."""
        feats = pose_features_2d(keypoints, box, img_w, img_h) if MODEL_IS_POSE else None

        if feats is not None:
            prev = self.buf[-1] if self.buf else None
            feats["v_hip"] = (feats["hip_y"] - prev["hip_y"]) if prev else 0.0
            feats["v_nose"] = (feats["nose_y"] - prev["nose_y"]) if prev else 0.0
            feats["a_hip"] = (feats["v_hip"] - prev["v_hip"]) if prev else 0.0
            feats["a_nose"] = (feats["v_nose"] - prev.get("v_nose", 0.0)) if prev else 0.0
            feats["j_hip"] = (feats["a_hip"] - prev.get("a_hip", 0.0)) if prev else 0.0
            self.buf.append(feats)
            if len(self.buf) > self.BUF:
                self.buf.pop(0)
            raw = self._rule_score()
        else:
            # Detection model (no keypoints) OR upper-body-only: trust the
            # per-frame signal (model class label / geometry) and smooth it.
            raw = float(geom.get("fall_confidence", 0.0)) if geom.get("is_fall") else 0.0

        prob = self.smoother.update(raw)
        if prob >= self.FALL_THR and (feats is None or self._stillness_ok()):
            self.fallen_until = now + self.LATCH_S
        return (now < self.fallen_until), prob

# ==================== MODEL LAYER ====================

print(f"Loading YOLO model: {MODEL_PATH}")
model = YOLO(MODEL_PATH)
# Auto-detect the model kind so a model trained in Colab (3 classes:
# Fall Detected / Walking / Sitting) works without any code change, while the
# default pose model keeps using keypoint geometry.
MODEL_TASK = getattr(model, "task", "pose")
MODEL_IS_POSE = MODEL_TASK == "pose" or "pose" in MODEL_PATH.lower()
MODEL_NAMES = getattr(model, "names", {}) or {}
print(f"Model loaded. task={MODEL_TASK} | pose_mode={MODEL_IS_POSE} | classes={list(MODEL_NAMES.values())[:6]}")

# Optional trained engine: MediaPipe Pose + TCN (adapted from Fall-Detecton).
# Enable with FALL_ENGINE=mediapipe and the model files in backend/model_v8/.
FALL_ENGINE = os.getenv("FALL_ENGINE", "yolo").lower()
MP_ENGINE = None
if FALL_ENGINE == "mediapipe":
    try:
        from fall_mediapipe import MediaPipeFallEngine, models_available
        if models_available():
            MP_ENGINE = MediaPipeFallEngine
            print("Fall engine: MediaPipe + trained model (backend/model_v8)")
        else:
            print("FALL_ENGINE=mediapipe but model_v8 files are missing -> falling back to YOLO")
    except Exception as e:
        print(f"MediaPipe engine unavailable ({e}) -> falling back to YOLO")


def run_inference(image: Image.Image, conf_threshold: float = 0.25):
    results = model(image, conf=conf_threshold, verbose=False)
    return results[0]


def analyze_detection(result, i, xyxy, confidence) -> Dict[str, Any]:
    """Per-person fall analysis that works for BOTH model kinds.

    * Pose model   -> torso / keypoint geometry (detect_fall_from_pose).
    * Detect model -> use the predicted class label (a 'Fall*' class => fallen).
    The temporal FallScorer is applied on top of either signal downstream.
    """
    if MODEL_IS_POSE:
        kpts = None
        if result.keypoints is not None and i < len(result.keypoints):
            kpts = result.keypoints[i].data[0].cpu().numpy()
        return detect_fall_from_pose(kpts, xyxy, confidence)

    # Trained detection model: classify from the predicted class name.
    try:
        cls_id = int(result.boxes[i].cls[0])
    except Exception:
        cls_id = 0
    name = str(MODEL_NAMES.get(cls_id, cls_id)).lower()
    if "fall" in name:
        return {"is_fall": True, "status": "fallen",
                "fall_confidence": min(0.95, confidence), "reasons": [f"model:{name}"]}
    status = "sitting" if "sit" in name else "standing"
    return {"is_fall": False, "status": status, "fall_confidence": 0, "reasons": [f"model:{name}"]}

# ==================== HELPER: DB QUERY UTILITIES ====================

def _get_events_14d(conn: sqlite3.Connection) -> List[Dict]:
    """Fetch all fall events from the last 14 days with NULL-coalesced fields."""
    since = (datetime.datetime.now() - datetime.timedelta(days=14)).strftime("%Y-%m-%d %H:%M:%S")
    cursor = conn.cursor()
    cursor.execute(
        """SELECT id, type, confidence, image_path, timestamp,
                  severity, status, zone, camera, response_time,
                  immobile_seconds, narrative, outcome, acknowledged_at, resolved_at
           FROM detections
           WHERE type='fall' AND timestamp > ?
           ORDER BY timestamp DESC""",
        (since,)
    )
    rows = cursor.fetchall()
    cols = [d[0] for d in cursor.description]
    events = []
    for row in rows:
        ev = dict(zip(cols, row))
        # Coalesce NULL legacy columns
        if not ev.get("severity"):
            ev["severity"] = _compute_severity(ev.get("confidence", 0))
        if not ev.get("status"):
            ev["status"] = "resolved"
        if not ev.get("zone"):
            ev["zone"] = "Main Floor"
        if not ev.get("camera"):
            ev["camera"] = "CAM-01"
        ev["immobile_seconds"] = ev.get("immobile_seconds") or 0.0
        events.append(ev)
    return events


def _zone_risk(zone_count: int, total: int, high_sev: int, avg_rt: float) -> int:
    """Compute a 0-100 risk score for a zone.
    Weighted: frequency 40%, severity_mix 35%, response_time 25%."""
    # Frequency component (normalised to max 100)
    freq_norm = min(100, (zone_count / max(total, 1)) * 300)

    # Severity mix component
    sev_norm = min(100, (high_sev / max(zone_count, 1)) * 100)

    # Response time component: >300s = 100, 0s = 0
    rt_norm = min(100, (avg_rt / 300) * 100) if avg_rt else 0

    score = freq_norm * 0.40 + sev_norm * 0.35 + rt_norm * 0.25
    return int(round(score))

# ==================== API ENDPOINTS ====================

@app.get("/")
def health_check():
    return {"status": "running", "model": MODEL_PATH, "method": "pose_spread_analysis"}

@app.post("/predict")
async def predict_single(file: UploadFile = File(...), conf: float = 0.25):
    try:
        contents = await file.read()
        image = Image.open(io.BytesIO(contents))
        result = run_inference(image, conf)

        detections = []

        for i, box in enumerate(result.boxes):
            xyxy = box.xyxy[0].tolist()
            confidence = float(box.conf[0])

            fall_result = analyze_detection(result, i, xyxy, confidence)

            detections.append({
                "box": xyxy,
                "confidence": confidence,
                "class_id": 0,
                "class_name": fall_result["status"],
                "is_fall": fall_result["is_fall"],
                "fall_confidence": fall_result["fall_confidence"],
                "reasons": fall_result.get("reasons", [])
            })

        return {"detections": detections}
    except Exception as e:
        print(f"Predict error: {e}")
        return {"error": str(e)}

@app.websocket("/ws/predict")
async def websocket_predict(websocket: WebSocket):
    await websocket.accept()
    print("WebSocket client connected")

    conf_threshold = 0.25
    global last_alert_time

    # Temporal fall scorer: per-frame dynamics (velocity/accel/jerk + impact),
    # negative gates (sit / stand-up / fast sit-down), positive fall rules,
    # asymmetric Bayesian smoothing and post-fall stillness. Adapted from
    # doan-hoang-215/Fall-Detecton to YOLO COCO-17 keypoints.
    scorer = FallScorer()
    mp_engine = MP_ENGINE() if MP_ENGINE is not None else None

    try:
        while True:
            data = await websocket.receive()

            if "text" in data:
                try:
                    config = json.loads(data["text"])
                    if config.get("action") == "stop":
                        break
                    if "conf" in config:
                        conf_threshold = max(0.1, float(config["conf"]))
                    continue
                except:
                    continue

            if "bytes" in data:
                try:
                    image_data = data["bytes"]

                    # ── Trained MediaPipe + TCN engine ──────────────────────
                    if mp_engine is not None:
                        import cv2
                        frame = cv2.imdecode(np.frombuffer(image_data, np.uint8), cv2.IMREAD_COLOR)
                        h, w = frame.shape[:2]
                        r = mp_engine.process(frame, time.time())
                        dets = []
                        if r["box"] is not None:
                            bx1, by1, bx2, by2 = r["box"]
                            dets.append({
                                "box": [bx1 * w, by1 * h, bx2 * w, by2 * h],
                                "confidence": r["prob"],
                                "class_id": 0,
                                "class_name": r["status"],
                                "is_fall": r["fall"],
                                "fall_confidence": r["prob"] if r["fall"] else 0.0,
                            })
                        if r["fall"]:
                            current_time = time.time()
                            if current_time - last_alert_time > COOLDOWN_SECONDS:
                                print("🚨 FALL DETECTED! (MediaPipe+TCN)")
                                snap = Image.fromarray(frame[:, :, ::-1])
                                save_detection("fall", r["prob"] or 0.9, snap)
                                send_alert_async(r["prob"] or 0.9)
                                last_alert_time = current_time
                        await websocket.send_json({"detections": dets, "fall_detected": bool(r["fall"])})
                        continue

                    image = Image.open(io.BytesIO(image_data))
                    result = run_inference(image, conf_threshold)

                    # First pass: pose geometry for every person; find the
                    # dominant (largest) person to drive the temporal tracker.
                    raw = []
                    dom_idx = -1
                    dom_area = 0.0
                    for i, box in enumerate(result.boxes):
                        xyxy = box.xyxy[0].tolist()
                        confidence = float(box.conf[0])

                        fall_result = analyze_detection(result, i, xyxy, confidence)
                        raw.append((xyxy, confidence, fall_result))

                        area = (xyxy[2] - xyxy[0]) * (xyxy[3] - xyxy[1])
                        if area > dom_area:
                            dom_area = area
                            dom_idx = len(raw) - 1

                    # Temporal decision on the dominant person (FallScorer)
                    dom_box = raw[dom_idx][0] if dom_idx >= 0 else None
                    dom_geom = raw[dom_idx][2] if dom_idx >= 0 else {}
                    dom_kpts = None
                    if (dom_idx >= 0 and result.keypoints is not None
                            and dom_idx < len(result.keypoints)):
                        dom_kpts = result.keypoints[dom_idx].data[0].cpu().numpy()
                    fall_confirmed, _ = scorer.update(
                        dom_kpts, dom_box, image.width, image.height, dom_geom, time.time())

                    # Build payload: while a fall is confirmed the dominant person
                    # is flagged "fallen" even if this frame's pose reads "standing"
                    # (they may be lying curled up on the ground).
                    detections = []
                    best_fall_conf = 0.0
                    for j, (xyxy, confidence, fall_result) in enumerate(raw):
                        # Show the model's ACTUAL per-frame classification so a real
                        # detection is visible immediately (don't relabel to 'standing').
                        status = fall_result["status"]
                        is_fall = fall_result["is_fall"]
                        fc = fall_result["fall_confidence"]
                        # Temporal confirmation pins the dominant person as 'fallen'
                        # even if a single frame flickers (e.g. curled up on the floor).
                        if fall_confirmed and j == dom_idx:
                            status = "fallen"
                            is_fall = True
                            fc = max(fc, 0.85)
                        detections.append({
                            "box": xyxy,
                            "confidence": confidence,
                            "class_id": 0,
                            "class_name": status,
                            "is_fall": is_fall,
                            "fall_confidence": fc
                        })
                        if is_fall and fc > best_fall_conf:
                            best_fall_conf = fc

                    fall_detected = fall_confirmed

                    # Trigger alert only on a confirmed fall (respecting cooldown)
                    if fall_detected:
                        current_time = time.time()
                        if current_time - last_alert_time > COOLDOWN_SECONDS:
                            print("🚨 FALL DETECTED! (confirmed)")
                            save_detection("fall", best_fall_conf or 0.9, image)
                            send_alert_async(best_fall_conf or 0.9)
                            last_alert_time = current_time

                    await websocket.send_json({
                        "detections": detections,
                        "fall_detected": fall_detected
                    })

                except Exception as e:
                    print(f"Error processing frame: {e}")
                    await websocket.send_json({"error": str(e)})

    except WebSocketDisconnect:
        print("WebSocket client disconnected")
    except Exception as e:
        print(f"WebSocket error: {e}")

@app.get("/api/snapshots")
async def get_snapshots():
    try:
        conn = sqlite3.connect(DB_NAME)
        conn.row_factory = sqlite3.Row
        cursor = conn.cursor()
        cursor.execute(
            "SELECT * FROM detections WHERE image_path IS NOT NULL "
            "ORDER BY timestamp DESC LIMIT 20"
        )
        rows = cursor.fetchall()
        conn.close()
        return [dict(row) for row in rows]
    except:
        return []

@app.delete("/api/snapshots/{detection_id}")
async def delete_snapshot(detection_id: int):
    try:
        conn = sqlite3.connect(DB_NAME)
        conn.row_factory = sqlite3.Row
        cursor = conn.cursor()

        # 1. Get image path
        cursor.execute("SELECT image_path FROM detections WHERE id = ?", (detection_id,))
        row = cursor.fetchone()

        if not row:
            conn.close()
            return {"status": "error", "message": "Snapshot not found"}

        image_path = row["image_path"]

        # 2. Delete file if exists
        if image_path:
            # image_path is like "/snapshots/filename.jpg"
            filename = os.path.basename(image_path)
            local_path = os.path.join(SNAPSHOTS_DIR, filename)
            if os.path.exists(local_path):
                os.remove(local_path)

        # 3. Delete from database
        cursor.execute("DELETE FROM detections WHERE id = ?", (detection_id,))
        conn.commit()
        conn.close()

        return {"status": "success", "message": f"Snapshot {detection_id} deleted"}
    except Exception as e:
        print(f"Delete snapshot error: {e}")
        return {"status": "error", "message": str(e)}

# ==================== STATS ENDPOINT (enhanced) ====================

@app.get("/api/stats")
async def get_statistics():
    try:
        conn = sqlite3.connect(DB_NAME)
        cursor = conn.cursor()
        now = datetime.datetime.now()
        today_start = now.strftime("%Y-%m-%d 00:00:00")
        seven_days_ago = (now - datetime.timedelta(days=7)).strftime("%Y-%m-%d %H:%M:%S")
        fourteen_days_ago = (now - datetime.timedelta(days=14)).strftime("%Y-%m-%d %H:%M:%S")

        # Total falls all time
        cursor.execute("SELECT COUNT(*) FROM detections WHERE type='fall'")
        total_falls = cursor.fetchone()[0] or 0

        # Today
        cursor.execute(
            "SELECT COUNT(*) FROM detections WHERE type='fall' AND timestamp >= ?",
            (today_start,)
        )
        today_falls = cursor.fetchone()[0] or 0

        # This week
        cursor.execute(
            "SELECT COUNT(*) FROM detections WHERE type='fall' AND timestamp > ?",
            (seven_days_ago,)
        )
        weekly_falls = cursor.fetchone()[0] or 0

        # Previous week (for weekly_change)
        cursor.execute(
            "SELECT COUNT(*) FROM detections WHERE type='fall' AND timestamp > ? AND timestamp <= ?",
            (fourteen_days_ago, seven_days_ago)
        )
        prev_weekly_falls = cursor.fetchone()[0] or 0

        if prev_weekly_falls > 0:
            weekly_change = ((weekly_falls - prev_weekly_falls) / prev_weekly_falls) * 100
        else:
            weekly_change = 0 if weekly_falls == 0 else 100

        # Active incidents
        cursor.execute(
            "SELECT COUNT(*) FROM detections WHERE type='fall' AND status='active'"
        )
        active_incidents = cursor.fetchone()[0] or 0

        # Average confidence (accuracy)
        cursor.execute("SELECT AVG(confidence) FROM detections WHERE type='fall'")
        accuracy = cursor.fetchone()[0] or 0.0

        # Average response time
        cursor.execute(
            "SELECT AVG(response_time) FROM detections WHERE type='fall' AND response_time IS NOT NULL"
        )
        avg_rt = cursor.fetchone()[0] or 0.0

        # Resolved rate
        cursor.execute("SELECT COUNT(*) FROM detections WHERE type='fall' AND status='resolved'")
        resolved_count = cursor.fetchone()[0] or 0
        resolved_rate = (resolved_count / total_falls) if total_falls > 0 else 0.0

        # Hourly distribution (last 7 days), bucketed every 2h
        cursor.execute(
            """SELECT strftime('%H', timestamp) as hour, COUNT(*) as count
               FROM detections
               WHERE type='fall' AND timestamp > ?
               GROUP BY hour ORDER BY hour""",
            (seven_days_ago,)
        )
        hourly_rows = cursor.fetchall()
        hourly_dict = {row[0]: row[1] for row in hourly_rows}
        hourly_data = []
        for h in range(0, 24, 2):
            hour_str = f"{h:02d}"
            next_hour = f"{h+1:02d}"
            count = hourly_dict.get(hour_str, 0) + hourly_dict.get(next_hour, 0)
            hourly_data.append({"hour": f"{h:02d}:00", "falls": count})

        # Daily data — last 14 days, chronological
        daily_data = []
        for i in range(13, -1, -1):
            day = now - datetime.timedelta(days=i)
            day_start = day.strftime("%Y-%m-%d 00:00:00")
            day_end = day.strftime("%Y-%m-%d 23:59:59")
            cursor.execute(
                "SELECT COUNT(*) FROM detections WHERE type='fall' AND timestamp BETWEEN ? AND ?",
                (day_start, day_end)
            )
            cnt = cursor.fetchone()[0] or 0
            daily_data.append({
                "date": day.strftime("%Y-%m-%d"),
                "label": day.strftime("%b %d"),
                "falls": cnt,
            })

        # Severity breakdown — always all 4 levels
        cursor.execute(
            """SELECT COALESCE(severity, CASE
                   WHEN confidence>=0.9 THEN 'critical'
                   WHEN confidence>=0.8 THEN 'high'
                   WHEN confidence>=0.6 THEN 'medium'
                   ELSE 'low' END) as sev, COUNT(*) as cnt
               FROM detections WHERE type='fall'
               GROUP BY sev"""
        )
        sev_dict = {row[0]: row[1] for row in cursor.fetchall()}
        severity_breakdown = [
            {"severity": s, "count": sev_dict.get(s, 0)}
            for s in ("critical", "high", "medium", "low")
        ]

        # Zone breakdown with risk
        cursor.execute(
            """SELECT COALESCE(zone,'Main Floor') as z, COUNT(*) as cnt,
                      AVG(CASE WHEN status IN ('resolved','acknowledged','responding')
                               THEN response_time ELSE NULL END) as avg_rt,
                      SUM(CASE WHEN severity IN ('high','critical') THEN 1 ELSE 0 END) as high_sev
               FROM detections WHERE type='fall'
               GROUP BY z ORDER BY cnt DESC"""
        )
        zone_rows = cursor.fetchall()
        total_for_zone = sum(r[1] for r in zone_rows) or 1
        zone_breakdown = [
            {
                "zone": r[0],
                "count": r[1],
                "risk": _zone_risk(r[1], total_for_zone, r[3] or 0, r[2] or 0.0),
            }
            for r in zone_rows
        ]

        # Status breakdown — always all 4
        cursor.execute(
            """SELECT COALESCE(status,'active') as st, COUNT(*) as cnt
               FROM detections WHERE type='fall'
               GROUP BY st"""
        )
        status_dict = {row[0]: row[1] for row in cursor.fetchall()}
        status_breakdown = [
            {"status": s, "count": status_dict.get(s, 0)}
            for s in ("active", "acknowledged", "responding", "resolved")
        ]

        conn.close()

        return {
            "total_falls": total_falls,
            "today_falls": today_falls,
            "weekly_falls": weekly_falls,
            "weekly_change": round(weekly_change, 1),
            "active_incidents": active_incidents,
            "accuracy": accuracy,
            "avg_response_time": round(avg_rt, 1),
            "resolved_rate": round(resolved_rate, 4),
            "uptime": 0.999,
            "hourly_data": hourly_data,
            "daily_data": daily_data,
            "severity_breakdown": severity_breakdown,
            "zone_breakdown": zone_breakdown,
            "status_breakdown": status_breakdown,
        }
    except Exception as e:
        print(f"Stats error: {e}")
        return {
            "total_falls": 0, "today_falls": 0, "weekly_falls": 0, "weekly_change": 0,
            "active_incidents": 0, "accuracy": 0.0, "avg_response_time": 0.0,
            "resolved_rate": 0.0, "uptime": 0.999,
            "hourly_data": [], "daily_data": [], "severity_breakdown": [],
            "zone_breakdown": [], "status_breakdown": [],
        }

# ==================== EVENTS ENDPOINT ====================

@app.get("/api/events")
async def get_events(
    limit: int = 50,
    severity: Optional[str] = None,
    zone: Optional[str] = None,
    status: Optional[str] = None,
    q: Optional[str] = None,
):
    limit = min(limit, 200)
    try:
        conn = sqlite3.connect(DB_NAME)
        cursor = conn.cursor()

        sql = """SELECT id, type, confidence, image_path, timestamp,
                        severity, status, zone, camera, response_time,
                        immobile_seconds, narrative, outcome
                 FROM detections WHERE type='fall'"""
        params: List[Any] = []

        if severity:
            sql += " AND COALESCE(severity, CASE WHEN confidence>=0.9 THEN 'critical' WHEN confidence>=0.8 THEN 'high' WHEN confidence>=0.6 THEN 'medium' ELSE 'low' END) = ?"
            params.append(severity)
        if zone:
            sql += " AND COALESCE(zone,'Main Floor') = ?"
            params.append(zone)
        if status:
            sql += " AND COALESCE(status,'resolved') = ?"
            params.append(status)
        if q:
            like = f"%{q}%"
            sql += (" AND (COALESCE(zone,'') LIKE ? OR COALESCE(camera,'') LIKE ?"
                    " OR COALESCE(severity,'') LIKE ? OR COALESCE(narrative,'') LIKE ?)")
            params.extend([like, like, like, like])

        sql += " ORDER BY timestamp DESC LIMIT ?"
        params.append(limit)

        cursor.execute(sql, params)
        rows = cursor.fetchall()
        conn.close()

        result = []
        for row in rows:
            (rid, rtype, conf, img_path, ts,
             sev, stat, zone_val, cam, rt,
             immobile, narr, outcome) = row

            sev = sev or _compute_severity(conf)
            stat = stat or "resolved"
            zone_val = zone_val or "Main Floor"
            cam = cam or "CAM-01"

            result.append({
                "id": rid,
                "type": "fall",
                "confidence": conf,
                "severity": sev,
                "status": stat,
                "zone": zone_val,
                "camera": cam,
                "image_path": img_path,
                "image_url": img_path,
                "timestamp": ts,
                "response_time": rt,
                "immobile_seconds": immobile or 0.0,
                "reasons": [],
                "narrative": narr,
                "outcome": outcome,
            })
        return result
    except Exception as e:
        print(f"Events error: {e}")
        return []

# ==================== EVENT ACTION ENDPOINTS ====================

@app.post("/api/events/{event_id}/ack")
async def acknowledge_event(event_id: int):
    try:
        conn = sqlite3.connect(DB_NAME)
        cursor = conn.cursor()
        cursor.execute("SELECT timestamp, response_time FROM detections WHERE id=?", (event_id,))
        row = cursor.fetchone()
        if not row:
            conn.close()
            return {"status": "error", "message": "Event not found"}

        ts_str, existing_rt = row
        now = datetime.datetime.now()
        ack_at = now.strftime("%Y-%m-%d %H:%M:%S")

        # Compute response_time if not already set
        rt = existing_rt
        if rt is None:
            try:
                event_dt = datetime.datetime.strptime(ts_str, "%Y-%m-%d %H:%M:%S")
                rt = min((now - event_dt).total_seconds(), 86400)  # cap at 24h
            except Exception:
                rt = None

        cursor.execute(
            "UPDATE detections SET status='acknowledged', acknowledged_at=?, response_time=? WHERE id=?",
            (ack_at, rt, event_id)
        )
        conn.commit()
        conn.close()
        return {"status": "success"}
    except Exception as e:
        print(f"Ack error: {e}")
        return {"status": "error", "message": str(e)}


@app.post("/api/events/{event_id}/respond")
async def respond_event(event_id: int):
    try:
        conn = sqlite3.connect(DB_NAME)
        cursor = conn.cursor()
        cursor.execute("UPDATE detections SET status='responding' WHERE id=?", (event_id,))
        conn.commit()
        conn.close()
        return {"status": "success"}
    except Exception as e:
        print(f"Respond error: {e}")
        return {"status": "error", "message": str(e)}


@app.post("/api/events/{event_id}/resolve")
async def resolve_event(event_id: int, body: Dict[str, Any] = Body(default={})):
    try:
        outcome = body.get("outcome", "resolved")
        resolved_at = datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        conn = sqlite3.connect(DB_NAME)
        cursor = conn.cursor()
        cursor.execute(
            "UPDATE detections SET status='resolved', resolved_at=?, outcome=? WHERE id=?",
            (resolved_at, outcome, event_id)
        )
        conn.commit()
        conn.close()
        return {"status": "success"}
    except Exception as e:
        print(f"Resolve error: {e}")
        return {"status": "error", "message": str(e)}

# ==================== INSIGHTS ENGINE (rule-based) ====================

def _linear_slope(values: List[float]) -> float:
    """Return least-squares slope of a series (index as x)."""
    n = len(values)
    if n < 2:
        return 0.0
    x_mean = (n - 1) / 2
    y_mean = sum(values) / n
    num = sum((i - x_mean) * (v - y_mean) for i, v in enumerate(values))
    den = sum((i - x_mean) ** 2 for i in range(n))
    return num / den if den else 0.0


def _z_scores(values: List[float]):
    """Return z-scores for a list of floats."""
    if len(values) < 2:
        return [0.0] * len(values)
    mean = sum(values) / len(values)
    try:
        std = statistics.stdev(values)
    except Exception:
        std = 0.0
    if std == 0:
        return [0.0] * len(values)
    return [(v - mean) / std for v in values]


@app.get("/api/insights")
async def get_insights():
    generated_at = datetime.datetime.now().isoformat()
    insights = []

    try:
        conn = sqlite3.connect(DB_NAME)
        events = _get_events_14d(conn)

        now = datetime.datetime.now()
        total_14d = len(events)
        active_count = sum(1 for e in events if e.get("status") == "active")
        rt_vals = [e["response_time"] for e in events if e.get("response_time") is not None]
        avg_rt = sum(rt_vals) / len(rt_vals) if rt_vals else 0.0

        # --- INSIGHT: summary (always present) ---
        if total_14d == 0:
            insights.append({
                "id": "summary-clear",
                "kind": "summary",
                "severity": "success",
                "title": "Hệ thống giám sát — không có sự cố",
                "body": (
                    "Không có sự kiện ngã nào được ghi nhận trong 14 ngày qua. "
                    "Tất cả camera đang hoạt động bình thường và hệ thống đang giám sát liên tục."
                ),
                "metric": None,
                "citation": None,
                "suggested_prompt": "Hiển thị tổng quan hệ thống",
            })
            conn.close()
            return {"insights": insights, "mode": "rule_based", "generated_at": generated_at}

        avg_rt_str = f"{avg_rt:.0f}s" if avg_rt else "N/A"
        insights.append({
            "id": "summary",
            "kind": "summary",
            "severity": "info",
            "title": f"{total_14d} sự kiện ngã trong 14 ngày qua",
            "body": (
                f"Hệ thống đã ghi nhận {total_14d} sự kiện ngã trong 14 ngày qua. "
                f"Hiện có {active_count} sự cố đang mở cần xử lý. "
                f"Thời gian phản hồi trung bình: {avg_rt_str}."
            ),
            "metric": str(total_14d),
            "citation": f"Dựa trên {total_14d} sự kiện trong 14 ngày qua",
            "suggested_prompt": "Hiển thị báo cáo tổng quan đầy đủ",
        })

        # --- INSIGHT: peak_hour ---
        hourly_counts = [0] * 24
        for e in events:
            try:
                h = int(e["timestamp"][11:13])
                hourly_counts[h] += 1
            except Exception:
                pass
        zs = _z_scores([float(c) for c in hourly_counts])
        peak_h = max(range(24), key=lambda i: hourly_counts[i])
        if zs[peak_h] > 1.5 and hourly_counts[peak_h] > 0:
            insights.append({
                "id": "peak_hour",
                "kind": "peak_hour",
                "severity": "warning",
                "title": f"Phát hiện đỉnh ngã quanh {peak_h:02d}:00",
                "body": (
                    f"Giờ {peak_h:02d}:00 ghi nhận {hourly_counts[peak_h]} ca ngã "
                    f"(z-score {zs[peak_h]:.1f}), cao hơn đáng kể so với trung bình theo giờ là "
                    f"{sum(hourly_counts)/24:.1f}. Khuyến nghị tăng cường giám sát trong khung giờ này."
                ),
                "metric": f"{hourly_counts[peak_h]} ca ngã",
                "citation": f"Phân tích theo giờ từ {total_14d} sự kiện",
                "suggested_prompt": f"Tại sao ca ngã tăng đột biến quanh {peak_h:02d}:00?",
            })

        # --- INSIGHT: trend ---
        daily_counts = []
        for i in range(13, -1, -1):
            day = now - datetime.timedelta(days=i)
            ds = day.strftime("%Y-%m-%d")
            cnt = sum(1 for e in events if e["timestamp"].startswith(ds))
            daily_counts.append(float(cnt))
        slope = _linear_slope(daily_counts)
        if slope > 0.3:
            sev = "critical" if slope > 1.0 else "warning"
            insights.append({
                "id": "trend-up",
                "kind": "trend",
                "severity": sev,
                "title": f"Xu hướng ngã đang tăng ({slope:+.2f} ca/ngày)",
                "body": (
                    f"Số ca ngã theo ngày đã tăng với tốc độ {slope:.2f} ca/ngày "
                    f"trong 14 ngày qua. Cần kiểm tra ngay các khu vực có rủi ro cao."
                ),
                "metric": f"{slope:+.2f}/ngày",
                "citation": "Hồi quy tuyến tính 14 ngày trên số ca ngã hàng ngày",
                "suggested_prompt": "Hiển thị xu hướng ngã trong hai tuần qua",
            })
        elif slope < -0.3:
            insights.append({
                "id": "trend-down",
                "kind": "trend",
                "severity": "success",
                "title": f"Xu hướng ngã đang giảm ({slope:+.2f} ca/ngày)",
                "body": (
                    f"Số ca ngã theo ngày đang giảm với tốc độ {abs(slope):.2f} ca/ngày "
                    f"trong 14 ngày qua. Các biện pháp an toàn hiện tại có vẻ hiệu quả."
                ),
                "metric": f"{slope:+.2f}/ngày",
                "citation": "Hồi quy tuyến tính 14 ngày trên số ca ngã hàng ngày",
                "suggested_prompt": "Hiển thị xu hướng ngã trong hai tuần qua",
            })

        # --- INSIGHT: risk_zone ---
        zone_counts: Dict[str, int] = {}
        zone_high_sev: Dict[str, int] = {}
        zone_rt: Dict[str, List[float]] = {}
        for e in events:
            z = e.get("zone") or "Main Floor"
            zone_counts[z] = zone_counts.get(z, 0) + 1
            if e.get("severity") in ("high", "critical"):
                zone_high_sev[z] = zone_high_sev.get(z, 0) + 1
            if e.get("response_time") is not None:
                zone_rt.setdefault(z, []).append(e["response_time"])

        if zone_counts:
            for z, cnt in zone_counts.items():
                avg_z_rt = sum(zone_rt.get(z, [0])) / max(len(zone_rt.get(z, [1])), 1)
                risk = _zone_risk(cnt, total_14d, zone_high_sev.get(z, 0), avg_z_rt)
                if risk > 70:
                    factors = []
                    if cnt / total_14d > 0.3:
                        factors.append(f"tần suất sự cố cao ({cnt} sự kiện)")
                    hs = zone_high_sev.get(z, 0)
                    if hs > 0:
                        factors.append(f"{hs} sự kiện mức độ cao/nghiêm trọng")
                    if avg_z_rt > 180:
                        factors.append(f"phản hồi trung bình chậm ({avg_z_rt:.0f}s)")
                    factor_str = "; ".join(factors) if factors else "nhiều yếu tố rủi ro"
                    insights.append({
                        "id": f"risk_zone_{z.replace(' ', '_').lower()}",
                        "kind": "risk_zone",
                        "severity": "critical",
                        "title": f"Khu vực rủi ro cao: {z} (điểm {risk}/100)",
                        "body": (
                            f"{z} có điểm rủi ro {risk}/100 dựa trên: {factor_str}. "
                            f"Khuyến nghị tăng cường giám sát và triển khai các biện pháp phòng ngừa."
                        ),
                        "metric": f"Rủi ro {risk}/100",
                        "citation": f"Phân tích khu vực từ {total_14d} sự kiện",
                        "suggested_prompt": f"Đánh giá rủi ro cho {z}",
                    })

        # --- INSIGHT: response_time ---
        if avg_rt > 180:
            insights.append({
                "id": "response_time_slow",
                "kind": "response_time",
                "severity": "warning",
                "title": f"Thời gian phản hồi trung bình vượt 3 phút ({avg_rt:.0f}s)",
                "body": (
                    f"Thời gian phản hồi trung bình là {avg_rt:.0f}s trên {len(rt_vals)} sự kiện đã xử lý. "
                    f"Mục tiêu là dưới 120s. Hãy rà soát nhân sự và quy trình cảnh báo để giảm độ trễ."
                ),
                "metric": f"{avg_rt:.0f}s trung bình",
                "citation": f"Dữ liệu thời gian phản hồi từ {len(rt_vals)} sự kiện",
                "suggested_prompt": "Làm thế nào để cải thiện thời gian phản hồi?",
            })

        conn.close()
    except Exception as e:
        print(f"Insights error: {e}")
        if not insights:
            insights.append({
                "id": "summary-error",
                "kind": "summary",
                "severity": "info",
                "title": "Hệ thống giám sát đang hoạt động",
                "body": "Phân tích thông tin gặp sự cố. Hệ thống phát hiện ngã vẫn đang hoạt động bình thường.",
                "metric": None,
                "citation": None,
                "suggested_prompt": None,
            })

    return {"insights": insights, "mode": "rule_based", "generated_at": generated_at}

# ==================== RISK ASSESSMENT ENDPOINT ====================

@app.get("/api/risk")
async def get_risk(type: str = "zone", id: Optional[str] = None):
    target_type = type
    target_id = id or "Main Floor"

    try:
        conn = sqlite3.connect(DB_NAME)
        cursor = conn.cursor()

        if target_type == "zone":
            cursor.execute(
                """SELECT COUNT(*) as cnt,
                          AVG(response_time) as avg_rt,
                          SUM(CASE WHEN severity IN ('high','critical') THEN 1 ELSE 0 END) as high_sev,
                          SUM(CASE WHEN severity='critical' THEN 1 ELSE 0 END) as crit_sev
                   FROM detections
                   WHERE type='fall' AND COALESCE(zone,'Main Floor')=?""",
                (target_id,)
            )
            row = cursor.fetchone()
            total_falls = row[0] or 0
            avg_rt = row[1] or 0.0
            high_sev = row[2] or 0
            crit_sev = row[3] or 0

            # Reference total for freq normalisation
            cursor.execute("SELECT COUNT(*) FROM detections WHERE type='fall'")
            grand_total = cursor.fetchone()[0] or 1

        else:  # system-wide
            cursor.execute(
                """SELECT COUNT(*) as cnt,
                          AVG(response_time) as avg_rt,
                          SUM(CASE WHEN severity IN ('high','critical') THEN 1 ELSE 0 END) as high_sev,
                          SUM(CASE WHEN severity='critical' THEN 1 ELSE 0 END) as crit_sev
                   FROM detections WHERE type='fall'"""
            )
            row = cursor.fetchone()
            total_falls = row[0] or 0
            avg_rt = row[1] or 0.0
            high_sev = row[2] or 0
            crit_sev = row[3] or 0
            grand_total = total_falls or 1

        conn.close()

        # Component scores (0-100 each)
        freq_score = min(100, (total_falls / max(grand_total, 1)) * 300)
        sev_score = min(100, (high_sev / max(total_falls, 1)) * 100)
        rt_score = min(100, (avg_rt / 300) * 100)

        score = int(round(freq_score * 0.40 + sev_score * 0.35 + rt_score * 0.25))

        if score < 30:
            level = "low"
        elif score < 55:
            level = "moderate"
        elif score < 75:
            level = "elevated"
        else:
            level = "high"

        factors = [
            {"label": f"Fall frequency ({total_falls} events)", "weight": int(round(freq_score * 0.40))},
            {"label": f"Severity mix ({high_sev} high/critical)", "weight": int(round(sev_score * 0.35))},
            {"label": f"Avg response time ({avg_rt:.0f}s)", "weight": int(round(rt_score * 0.25))},
        ]

        recommendations = []
        if freq_score > 50:
            label = target_id if target_type == "zone" else "high-frequency areas"
            recommendations.append(f"Increase monitoring frequency in {label} during peak hours")
        if sev_score > 50:
            recommendations.append("Review lighting and floor conditions to reduce fall severity")
        if rt_score > 50 or avg_rt > 120:
            recommendations.append("Reduce average response time below 2 minutes through workflow optimisation")
        if not recommendations:
            recommendations.append("Maintain current safety protocols and review monthly")
            recommendations.append("Ensure all staff are trained on emergency response procedures")

        return {
            "target_type": target_type,
            "target_id": target_id,
            "score": score,
            "level": level,
            "factors": factors,
            "recommendations": recommendations,
        }
    except Exception as e:
        print(f"Risk error: {e}")
        return {
            "target_type": target_type,
            "target_id": target_id,
            "score": 0,
            "level": "low",
            "factors": [],
            "recommendations": ["Unable to compute risk — insufficient data"],
        }

# ==================== AGENT QUERY ENDPOINT (grounded, no LLM required) ====================

def _grounded_agent_answer(question: str, stats: Dict, events: List[Dict]) -> Dict:
    """Parse intent from question keywords and return a data-grounded answer."""
    q = question.lower()
    now_iso = datetime.datetime.now().isoformat()

    tools_used = []
    chart = None
    table = None
    citations = []
    suggestions = [
        "Giờ cao điểm cho ca ngã là khi nào?",
        "Khu vực nào có rủi ro cao nhất?",
        "Hiển thị xu hướng trong hai tuần qua",
    ]

    total = stats.get("total_falls", 0)
    hourly_data = stats.get("hourly_data", [])
    daily_data = stats.get("daily_data", [])
    zone_breakdown = stats.get("zone_breakdown", [])
    severity_breakdown = stats.get("severity_breakdown", [])
    avg_rt = stats.get("avg_response_time", 0)

    # Compute daily slope for trend
    daily_vals = [d["falls"] for d in daily_data]
    slope = _linear_slope(daily_vals) if daily_vals else 0.0

    def _top_zone():
        if zone_breakdown:
            return max(zone_breakdown, key=lambda z: z["count"])
        return {"zone": "N/A", "count": 0}

    def _peak_hour_entry():
        if hourly_data:
            return max(hourly_data, key=lambda h: h["falls"])
        return {"hour": "N/A", "falls": 0}

    # ---- Intent: trend ----
    if any(kw in q for kw in ["trend", "over time", "increasing", "decreasing", "daily",
                               "xu hướng", "theo thời gian", "tăng", "giảm", "diễn biến"]):
        tools_used = [{"name": "get_daily_data", "summary": "Đã truy vấn số ca ngã theo ngày trong 14 ngày"}]
        direction = "tăng" if slope > 0.1 else ("giảm" if slope < -0.1 else "ổn định")
        pct = abs(slope / max(daily_vals[0], 1) * 100) if daily_vals and daily_vals[0] else 0
        answer = (
            f"**Xu hướng ngã trong 14 ngày qua:** Xu hướng đang **{direction}** "
            f"(độ dốc {slope:+.2f} ca/ngày). "
        )
        if slope > 0.3:
            answer += "Xu hướng tăng đòi hỏi tăng cường cảnh giác và điều phối nguồn lực."
        elif slope < -0.3:
            answer += "Xu hướng giảm cho thấy các biện pháp an toàn hiện tại đang phát huy hiệu quả."
        else:
            answer += "Số ca ngã tương đối ổn định từ ngày này sang ngày khác."
        chart = {"kind": "area", "x_key": "label", "y_key": "falls", "data": daily_data, "label": "Ca ngã theo ngày (14 ngày)"}
        citations = [f"Dựa trên {total} sự kiện trong 14 ngày"]
        suggestions = [
            "Giờ cao điểm cho ca ngã là khi nào?",
            "Khu vực nào có rủi ro cao nhất?",
            "Tóm tắt 14 ngày qua",
        ]

    # ---- Intent: peak / hour ----
    elif any(kw in q for kw in ["peak", "hour", "time of day", "when", "busiest",
                                 "giờ cao điểm", "khi nào", "thời điểm", "mấy giờ", "cao điểm"]):
        tools_used = [{"name": "get_hourly_data", "summary": "Đã truy vấn phân bố ca ngã theo giờ (7 ngày qua)"}]
        ph = _peak_hour_entry()
        answer = (
            f"**Giờ cao điểm ca ngã:** {ph['hour']} với **{ph['falls']} ca ngã** được ghi nhận "
            f"(dựa trên dữ liệu 7 ngày gần nhất). "
            f"Khuyến nghị bố trí thêm nhân viên giám sát trong khung giờ này."
        )
        chart = {"kind": "bar", "x_key": "hour", "y_key": "falls", "data": hourly_data, "label": "Ca ngã theo giờ"}
        citations = [f"Phân tích theo giờ từ các sự kiện trong 7 ngày qua"]
        suggestions = [
            "Nguyên nhân gây ra đỉnh điểm là gì?",
            "Hiển thị xu hướng trong 14 ngày",
            "Khu vực nào có nhiều ca ngã nhất?",
        ]

    # ---- Intent: zone / location / risk ----
    elif any(kw in q for kw in ["zone", "where", "location", "area", "dangerous", "risk",
                                 "khu vực", "ở đâu", "nguy hiểm", "rủi ro", "vùng", "đánh giá"]):
        tools_used = [
            {"name": "get_zone_breakdown", "summary": "Đã truy vấn số ca ngã và điểm rủi ro theo khu vực"},
        ]
        tz = _top_zone()
        sorted_zones = sorted(zone_breakdown, key=lambda z: z["count"], reverse=True)
        answer = (
            f"**Khu vực rủi ro nhất: {tz['zone']}** với {tz['count']} ca ngã. "
            f"Điểm rủi ro: {tz.get('risk', 0)}/100.\n\n"
            f"Tất cả khu vực xếp hạng theo số sự cố:\n"
        )
        for z in sorted_zones[:5]:
            answer += f"- **{z['zone']}**: {z['count']} ca ngã (rủi ro {z.get('risk', 0)}/100)\n"
        chart = {"kind": "bar", "x_key": "zone", "y_key": "count", "data": sorted_zones, "label": "Ca ngã theo khu vực"}
        citations = [f"Phân tích khu vực từ tổng cộng {total} sự kiện ngã"]
        suggestions = [
            f"Đánh giá rủi ro cho {tz['zone']}",
            "Hiển thị giờ cao điểm",
            "Xu hướng tổng thể là gì?",
        ]

    # ---- Intent: severity ----
    elif any(kw in q for kw in ["severity", "how bad", "critical", "serious",
                                 "mức độ", "nghiêm trọng", "nặng"]):
        tools_used = [{"name": "get_severity_breakdown", "summary": "Đã truy vấn phân bố mức độ nghiêm trọng"}]
        crit = next((s["count"] for s in severity_breakdown if s["severity"] == "critical"), 0)
        high = next((s["count"] for s in severity_breakdown if s["severity"] == "high"), 0)
        answer = (
            f"**Phân bố mức độ** trong {total} sự kiện ngã:\n"
        )
        for s in severity_breakdown:
            pct = (s["count"] / max(total, 1)) * 100
            answer += f"- **{s['severity'].capitalize()}**: {s['count']} ({pct:.0f}%)\n"
        if crit + high > total * 0.3:
            answer += "\n⚠️ Hơn 30% sự kiện ở mức độ cao/nghiêm trọng — cần xem xét ngay."
        chart = {"kind": "donut", "x_key": "severity", "y_key": "count", "data": severity_breakdown, "label": "Phân bố mức độ nghiêm trọng"}
        citations = [f"Dữ liệu mức độ từ {total} sự kiện ngã"]
        suggestions = [
            "Khu vực nào có nhiều ca ngã nghiêm trọng nhất?",
            "Xu hướng là gì?",
            "Hiển thị thống kê thời gian phản hồi",
        ]

    # ---- Intent: response time ----
    elif any(kw in q for kw in ["response", "how fast", "acknowledge",
                                 "phản hồi", "nhanh", "tiếp nhận"]):
        tools_used = [{"name": "get_stats", "summary": "Đã truy vấn thống kê trung bình và phân bố thời gian phản hồi"}]
        rt_label = f"{avg_rt:.0f}s" if avg_rt else "N/A"
        answer = (
            f"**Thời gian phản hồi trung bình: {rt_label}**.\n"
        )
        if avg_rt > 180:
            answer += "Vượt mục tiêu khuyến nghị 2 phút. Hãy rà soát quy trình cảnh báo và nhân sự."
        elif avg_rt > 0:
            answer += "Thời gian phản hồi đang trong phạm vi chấp nhận được."
        else:
            answer += "Chưa có dữ liệu thời gian phản hồi (có thể tất cả sự kiện đang ở trạng thái hoạt động)."
        citations = [f"Thống kê thời gian phản hồi từ {total} sự kiện"]
        suggestions = [
            "Khu vực nào có thời gian phản hồi chậm nhất?",
            "Hiển thị các sự cố đang mở",
            "Điểm rủi ro tổng thể là bao nhiêu?",
        ]

    # ---- Intent: summary / overview / report ----
    elif any(kw in q for kw in ["summary", "summarize", "overview", "report", "last night", "today", "week", "all",
                                 "tóm tắt", "tổng quan", "báo cáo", "hôm nay", "tuần", "đêm qua"]):
        tools_used = [
            {"name": "get_stats", "summary": "Đã truy vấn thống kê 14 ngày"},
            {"name": "get_events", "summary": "Đã lấy 5 sự kiện gần nhất"},
        ]
        ph = _peak_hour_entry()
        tz = _top_zone()
        trend_dir = "↑ tăng" if slope > 0.1 else ("↓ giảm" if slope < -0.1 else "→ ổn định")
        answer = (
            f"## Tóm tắt phát hiện ngã 14 ngày qua\n\n"
            f"- **Tổng số ca ngã:** {total}\n"
            f"- **Sự cố đang mở:** {stats.get('active_incidents', 0)}\n"
            f"- **Giờ cao điểm:** {ph['hour']} ({ph['falls']} ca ngã)\n"
            f"- **Khu vực rủi ro nhất:** {tz['zone']} ({tz['count']} sự kiện, rủi ro {tz.get('risk', 0)}/100)\n"
            f"- **Xu hướng:** {trend_dir} ({slope:+.2f}/ngày)\n"
            f"- **Thời gian phản hồi trung bình:** {avg_rt:.0f}s\n"
            f"- **Độ chính xác phát hiện:** {stats.get('accuracy', 0)*100:.1f}%\n"
        )
        recent = events[:5]
        table = [
            {
                "id": e["id"],
                "timestamp": e["timestamp"],
                "zone": e.get("zone", "Main Floor"),
                "severity": e.get("severity", "low"),
                "status": e.get("status", "resolved"),
            }
            for e in recent
        ]
        citations = [f"Dựa trên {total} sự kiện trong 14 ngày"]
        suggestions = [
            "Khu vực nào cần chú ý nhất?",
            "Hiển thị phân bố theo giờ",
            "Xu hướng ngã là gì?",
        ]

    # ---- Intent: count / total / how many ----
    elif any(kw in q for kw in ["how many", "total", "count", "number",
                                 "bao nhiêu", "tổng số", "số lượng", "đếm"]):
        tools_used = [{"name": "get_stats", "summary": "Đã truy vấn tổng số và số liệu theo kỳ"}]
        answer = (
            f"**Số lượng ca ngã:**\n"
            f"- Tổng tất cả thời gian: **{total}**\n"
            f"- Hôm nay: **{stats.get('today_falls', 0)}**\n"
            f"- Tuần này: **{stats.get('weekly_falls', 0)}**\n"
            f"- Thay đổi so với tuần trước: **{stats.get('weekly_change', 0):+.1f}%**\n"
        )
        citations = [f"Dữ liệu số lượng từ cơ sở dữ liệu phát hiện"]
        suggestions = [
            "Phân tích theo khu vực",
            "Hiển thị phân bố mức độ",
            "Xu hướng là gì?",
        ]

    # ---- Fallback: helpful overview ----
    else:
        tools_used = [{"name": "get_stats", "summary": "Đã truy vấn thống kê tổng quan"}]
        ph = _peak_hour_entry()
        tz = _top_zone()
        answer = (
            f"Đây là tổng quan nhanh về hệ thống phát hiện ngã:\n\n"
            f"- **{total}** tổng số sự kiện ngã đã ghi nhận\n"
            f"- **{stats.get('active_incidents', 0)}** sự cố đang hoạt động\n"
            f"- Giờ cao điểm: **{ph['hour']}**\n"
            f"- Khu vực rủi ro nhất: **{tz['zone']}**\n\n"
            f"Hãy thử hỏi về xu hướng, rủi ro khu vực, thời gian phản hồi hoặc phân bố mức độ nghiêm trọng."
        )
        citations = [f"Tổng quan từ {total} sự kiện ngã"]

    return {
        "answer": answer,
        "mode": "grounded",
        "tools_used": tools_used,
        "chart": chart,
        "table": table,
        "citations": citations,
        "suggestions": suggestions,
    }


@app.post("/api/agent/query")
async def agent_query(body: Dict[str, Any] = Body(...)):
    question = body.get("question", "").strip()
    if not question:
        return {
            "answer": "Please provide a question.",
            "mode": "grounded",
            "tools_used": [],
            "chart": None,
            "table": None,
            "citations": [],
            "suggestions": ["Show me a summary", "What is the peak hour?", "Which zone is riskiest?"],
        }

    # Optionally try LLM if key available (lazy import, no hard dependency)
    llm_key = os.getenv("ANTHROPIC_API_KEY") or os.getenv("OPENAI_API_KEY")
    if llm_key:
        # LLM branch can be added here in future; fall through to grounded for now
        pass

    try:
        conn = sqlite3.connect(DB_NAME)
        stats_resp = await get_statistics()
        events = _get_events_14d(conn)
        conn.close()
        return _grounded_agent_answer(question, stats_resp, events)
    except Exception as e:
        print(f"Agent query error: {e}")
        return {
            "answer": f"I encountered an error processing your question: {e}",
            "mode": "grounded",
            "tools_used": [],
            "chart": None,
            "table": None,
            "citations": [],
            "suggestions": ["Try a different question", "Show me a summary"],
        }

# ==================== SEED ENDPOINT ====================

@app.post("/api/seed")
async def seed_data(body: Dict[str, Any] = Body(default={})):
    n = int(body.get("n", 220))
    n = max(1, min(n, 2000))

    cameras = [f"CAM-{i:02d}" for i in range(1, 9)]
    # Zone weights: Stairwell and Warehouse Bay are riskier
    zone_weights = [20, 12, 14, 20, 10, 12, 20]  # sum ~108, roughly proportional

    status_choices = ["resolved", "resolved", "resolved", "resolved",
                      "acknowledged", "acknowledged", "responding", "active"]

    now = datetime.datetime.now()
    inserted = 0

    try:
        conn = sqlite3.connect(DB_NAME)
        cursor = conn.cursor()

        for _ in range(n):
            # Random time in the last 14 days; weight toward evenings (18-22h)
            day_offset = random.uniform(0, 14)
            hour = random.choices(
                list(range(24)),
                weights=[1, 1, 1, 1, 1, 1, 2, 3, 4, 4, 4, 4,
                         4, 4, 4, 5, 5, 6, 8, 8, 7, 6, 4, 2],
                k=1
            )[0]
            minute = random.randint(0, 59)
            second = random.randint(0, 59)
            dt = now - datetime.timedelta(days=day_offset)
            dt = dt.replace(hour=hour, minute=minute, second=second, microsecond=0)
            ts = dt.strftime("%Y-%m-%d %H:%M:%S")

            zone = random.choices(ZONES, weights=zone_weights, k=1)[0]
            camera = random.choice(cameras)
            confidence = round(random.uniform(0.60, 0.97), 3)
            severity = _compute_severity(confidence)
            status = random.choice(status_choices)
            immobile_s = round(random.uniform(0, 120), 1)

            response_time = None
            if status != "active":
                response_time = round(random.uniform(20, 400), 1)

            narrative = (
                f"Fall detected at {zone} on {camera} with "
                f"{confidence*100:.0f}% confidence at {ts}."
            )

            cursor.execute(
                """INSERT INTO detections
                   (type, confidence, image_path, timestamp,
                    severity, status, zone, camera,
                    response_time, immobile_seconds, narrative)
                   VALUES (?, ?, NULL, ?, ?, ?, ?, ?, ?, ?, ?)""",
                ("fall", confidence, ts, severity, status, zone, camera,
                 response_time, immobile_s, narrative)
            )
            inserted += 1

        conn.commit()
        conn.close()
        return {"status": "success", "inserted": inserted}
    except Exception as e:
        print(f"Seed error: {e}")
        return {"status": "error", "message": str(e), "inserted": inserted}

# ==================== SYSTEM INFO (enhanced) ====================

@app.get("/api/system/info")
async def get_system_info():
    device = "CPU"
    try:
        import torch
        if torch.cuda.is_available():
            device = "GPU"
    except Exception:
        pass

    llm_enabled = bool(os.getenv("OPENAI_API_KEY") or os.getenv("ANTHROPIC_API_KEY"))

    is_pose = "pose" in MODEL_PATH.lower()
    return {
        "yolo_version": "YOLOv8n-Pose" if is_pose else "YOLO (đã huấn luyện)",
        "model_path": MODEL_PATH,
        "detection_method": (
            "Phân tích tư thế cơ thể (góc trên & góc ngang)"
            if is_pose else "Mô hình phát hiện đã huấn luyện trên tập dữ liệu ngã"
        ),
        "features": (
            ["Điểm khớp tư thế", "Trải ngang cơ thể", "Theo dõi thời gian"]
            if is_pose else ["Phát hiện bằng khung bao", "3 lớp: Ngã/Đi/Ngồi"]
        ),
        "device": device,
        "llm_enabled": llm_enabled,
        "email_enabled": email_configured(),
    }

@app.get("/api/system/logs")
async def download_logs():
    if os.path.exists(DB_NAME):
        return FileResponse(DB_NAME, filename="fall_detection_logs.db")
    return {"error": "No logs"}

@app.post("/api/system/clear-data")
async def clear_all_data():
    try:
        conn = sqlite3.connect(DB_NAME)
        conn.execute("DELETE FROM detections")
        conn.commit()
        conn.close()

        for f in glob.glob(f"{SNAPSHOTS_DIR}/*"):
            os.remove(f)

        return {"status": "success"}
    except Exception as e:
        return {"status": "error", "message": str(e)}

# ==================== NOTIFICATION ENDPOINTS ====================

def _mask_email(addr: Optional[str]) -> Optional[str]:
    if not addr or "@" not in addr:
        return None
    user, domain = addr.split("@", 1)
    masked_user = (user[:2] + "***") if len(user) > 2 else "***"
    return f"{masked_user}@{domain}"


@app.get("/api/system/notification-status")
async def notification_status():
    """Report whether email alerting is configured (never returns the password)."""
    return {
        "email_enabled": email_configured(),
        "sender": _mask_email(EMAIL_SENDER),
        "receiver": _mask_email(EMAIL_RECEIVER),
        "channel": "Gmail SMTP",
    }


@app.post("/api/system/test-notification")
async def test_notification():
    """Send a test alert email so the operator can verify the channel works."""
    body = (
        "✅ Đây là email kiểm tra từ hệ thống giám sát phát hiện ngã Aegis.\n\n"
        f"Thời gian: {datetime.datetime.now().strftime('%Y-%m-%d %H:%M:%S')}\n"
        "Nếu bạn nhận được email này, kênh cảnh báo đã hoạt động bình thường.\n\n"
        "— Aegis"
    )
    ok, message = _send_email("✅ Aegis — Kiểm tra thông báo", body)
    return {"status": "success" if ok else "error", "message": message}

# ==================== STARTUP ====================

init_database()
migrate_db()

if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8000)
