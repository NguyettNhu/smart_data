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
from email.message import EmailMessage
from typing import Optional, Dict, Any

import uvicorn
from fastapi import FastAPI, File, UploadFile, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from PIL import Image
from ultralytics import YOLO
from dotenv import load_dotenv
import numpy as np

# ==================== CONFIGURATION ====================

load_dotenv()

DB_NAME = "stats.db"
EMAIL_SENDER = os.getenv("EMAIL_SENDER")
EMAIL_PASSWORD = os.getenv("EMAIL_PASSWORD")
EMAIL_RECEIVER = os.getenv("EMAIL_RECEIVER")
COOLDOWN_SECONDS = 60

# YOLOv8 Pose model - Keypoints allow analyzing body structure
MODEL_PATH = "yolov8n-pose.pt"

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

def save_detection(detection_type: str, confidence: float, image: Optional[Image.Image] = None):
    try:
        image_path = None
        if image:
            timestamp = datetime.datetime.now().strftime("%Y%m%d_%H%M%S_%f")
            filename = f"fall_{timestamp}.jpg"
            file_path = os.path.join(SNAPSHOTS_DIR, filename)
            image.save(file_path, quality=85)
            image_path = f"/snapshots/{filename}"
        
        conn = sqlite3.connect(DB_NAME)
        cursor = conn.cursor()
        now_local = datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        cursor.execute(
            "INSERT INTO detections (type, confidence, image_path, timestamp) VALUES (?, ?, ?, ?)",
            (detection_type, confidence, image_path, now_local)
        )
        conn.commit()
        conn.close()
    except Exception as e:
        print(f"Error saving detection: {e}")

# ==================== NOTIFICATION LAYER ====================

last_alert_time = 0

def send_email_alert(confidence: float):
    try:
        if not all([EMAIL_SENDER, EMAIL_PASSWORD, EMAIL_RECEIVER]):
            return
        
        msg = EmailMessage()
        msg.set_content(
            f"⚠️ CẢNH BÁO PHÁT HIỆN NGÃ\n\n"
            f"Độ tin cậy: {confidence*100:.1f}%\n"
            f"Thời gian: {datetime.datetime.now().strftime('%Y-%m-%d %H:%M:%S')}"
        )
        msg['Subject'] = '⚠️ CẢNH BÁO PHÁT HIỆN NGÃ'
        msg['From'] = EMAIL_SENDER
        msg['To'] = EMAIL_RECEIVER
        
        context = ssl.create_default_context()
        with smtplib.SMTP_SSL("smtp.gmail.com", 465, context=context) as server:
            server.login(EMAIL_SENDER, EMAIL_PASSWORD)
            server.send_message(msg)
        print(f"Email alert sent to {EMAIL_RECEIVER}")
    except Exception as e:
        print(f"Failed to send email: {e}")

def send_alert_async(confidence: float):
    thread = threading.Thread(target=send_email_alert, args=(confidence,))
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

# ==================== TEMPORAL FALL TRACKING ====================

class FallTracker:
    """Adds temporal robustness on top of the per-frame pose geometry.

    A fall is an ACTION, not just a posture. Two temporal signals catch the
    cases the single-frame geometry misses (e.g. a person curled up on the
    ground in distant CCTV, whose compact box reads as "standing"):

      * Height collapse: when a person's bounding-box height suddenly drops
        well below their recent standing height, they have gone to the floor.
      * Latch: once a fall is detected we keep it active for a few seconds so
        the person lying still (or briefly lost by the detector) stays
        flagged instead of flickering back to "Normal".
    """

    WINDOW_S = 2.0          # short window -> only a SUDDEN height drop counts
                            # (a person walking away shrinks gradually, no trigger)
    LATCH_S = 8.0           # how long a detected fall stays active
    COLLAPSE_RATIO = 0.55   # "much shorter than standing" threshold
    MIN_BASELINE = 60       # ignore tiny boxes (px) to avoid noise
    CONFIRM_FRAMES = 2      # consecutive fall-ish frames needed to confirm

    def __init__(self):
        self.history = []       # (time, height)
        self.fall_frames = 0
        self.fallen_until = 0.0

    def update(self, box, geom_is_fall, now):
        """box: dominant person xyxy (or None). geom_is_fall: bool from pose
        geometry. now: seconds. Returns (confirmed_fallen, collapse, baseline)."""
        collapse = False
        baseline = 0.0
        if box is not None:
            h = box[3] - box[1]
            self.history.append((now, h))
            self.history = [(t, hh) for (t, hh) in self.history if now - t <= self.WINDOW_S]
            baseline = max(hh for (t, hh) in self.history)
            if baseline >= self.MIN_BASELINE and h < self.COLLAPSE_RATIO * baseline:
                collapse = True

        if geom_is_fall or collapse:
            self.fall_frames += 1
        else:
            self.fall_frames = 0

        # The static-geometry fix already prevents standing false positives,
        # so a short streak is enough to confirm a real fall.
        if self.fall_frames >= self.CONFIRM_FRAMES:
            self.fallen_until = now + self.LATCH_S

        return (now < self.fallen_until), collapse, baseline

# ==================== MODEL LAYER ====================

print(f"Loading YOLO Pose model: {MODEL_PATH}")
model = YOLO(MODEL_PATH)
print("Model loaded successfully")

def run_inference(image: Image.Image, conf_threshold: float = 0.25):
    # Retrieve pose keypoints
    results = model(image, conf=conf_threshold, verbose=False) 
    return results[0]

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
            
            # Get keypoints for this person
            kpts = None
            if result.keypoints is not None and i < len(result.keypoints):
                kpts = result.keypoints[i].data[0].cpu().numpy()
            
            fall_result = detect_fall_from_pose(kpts, xyxy, confidence)
            
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

    # Temporal fall tracking: detects the fall as an action (sudden height
    # collapse) and latches it so a person lying still on the ground stays
    # flagged instead of flickering back to "normal".
    tracker = FallTracker()

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

                        # Get keypoints
                        kpts = None
                        if result.keypoints is not None and i < len(result.keypoints):
                            kpts = result.keypoints[i].data[0].cpu().numpy()

                        fall_result = detect_fall_from_pose(kpts, xyxy, confidence)
                        raw.append((xyxy, confidence, fall_result))

                        area = (xyxy[2] - xyxy[0]) * (xyxy[3] - xyxy[1])
                        if area > dom_area:
                            dom_area = area
                            dom_idx = len(raw) - 1

                    # Temporal decision (height-collapse + latch) on the main person
                    dom_box = raw[dom_idx][0] if dom_idx >= 0 else None
                    dom_is_fall = raw[dom_idx][2]["is_fall"] if dom_idx >= 0 else False
                    fall_confirmed, _, _ = tracker.update(dom_box, dom_is_fall, time.time())

                    # Build payload: while a fall is confirmed the dominant person
                    # is flagged "fallen" even if this frame's pose reads "standing"
                    # (they may be lying curled up on the ground).
                    detections = []
                    best_fall_conf = 0.0
                    for j, (xyxy, confidence, fall_result) in enumerate(raw):
                        is_fall = fall_confirmed and (j == dom_idx)
                        if is_fall:
                            status = "fallen"
                            fc = max(fall_result["fall_confidence"], 0.85)
                        else:
                            status = fall_result["status"]
                            fc = fall_result["fall_confidence"]
                            # don't flash an unconfirmed single-frame fall
                            if fall_result["is_fall"]:
                                status = "standing"
                                fc = 0.0
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
            # need to convert to local path
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

@app.get("/api/stats")
async def get_statistics():
    try:
        conn = sqlite3.connect(DB_NAME)
        cursor = conn.cursor()
        
        # Total falls all time
        cursor.execute("SELECT COUNT(*) FROM detections WHERE type = 'fall'")
        total_falls_res = cursor.fetchone()
        total_falls = total_falls_res[0] if total_falls_res else 0
        
        # Falls this week
        seven_days_ago = datetime.datetime.now() - datetime.timedelta(days=7)
        cursor.execute(
            "SELECT COUNT(*) FROM detections WHERE type = 'fall' AND timestamp > ?",
            (seven_days_ago.strftime("%Y-%m-%d %H:%M:%S"),)
        )
        weekly_falls_res = cursor.fetchone()
        weekly_falls = weekly_falls_res[0] if weekly_falls_res else 0
        
        # Falls previous week (for comparison)
        fourteen_days_ago = datetime.datetime.now() - datetime.timedelta(days=14)
        cursor.execute(
            "SELECT COUNT(*) FROM detections WHERE type = 'fall' AND timestamp > ? AND timestamp <= ?",
            (fourteen_days_ago.strftime("%Y-%m-%d %H:%M:%S"), seven_days_ago.strftime("%Y-%m-%d %H:%M:%S"))
        )
        prev_weekly_falls_res = cursor.fetchone()
        prev_weekly_falls = prev_weekly_falls_res[0] if prev_weekly_falls_res else 0
        
        # Weekly change percentage
        if prev_weekly_falls > 0:
            weekly_change = ((weekly_falls - prev_weekly_falls) / prev_weekly_falls) * 100
        else:
            weekly_change = 0 if weekly_falls == 0 else 100
        
        # Average confidence (accuracy)
        cursor.execute("SELECT AVG(confidence) FROM detections WHERE type = 'fall'")
        result = cursor.fetchone()[0]
        accuracy = result if result else 0.0
        
        # Hourly fall distribution (for chart)
        cursor.execute("""
            SELECT strftime('%H', timestamp) as hour, COUNT(*) as count 
            FROM detections 
            WHERE type = 'fall' AND timestamp > ? 
            GROUP BY hour 
            ORDER BY hour
        """, (seven_days_ago.strftime("%Y-%m-%d %H:%M:%S"),))
        hourly_rows = cursor.fetchall()
        
        # Build hourly data
        hourly_dict = {row[0]: row[1] for row in hourly_rows}
        hourly_data = []
        for h in range(0, 24, 2):
            hour_str = f"{h:02d}"
            next_hour = f"{h+1:02d}"
            count = hourly_dict.get(hour_str, 0) + hourly_dict.get(next_hour, 0)
            hourly_data.append({"hour": f"{h:02d}:00", "falls": count})
        
        conn.close()
        
        return {
            "total_falls": total_falls,
            "weekly_falls": weekly_falls,
            "weekly_change": round(weekly_change, 1),
            "accuracy": accuracy,
            "response_time": 2.3,
            "hourly_data": hourly_data
        }
    except Exception as e:
        print(f"Stats error: {e}")
        return {
            "total_falls": 0, 
            "weekly_falls": 0, 
            "weekly_change": 0,
            "accuracy": 0.0,
            "response_time": 0,
            "hourly_data": []
        }

@app.get("/api/system/info")
async def get_system_info():
    return {
        "yolo_version": "YOLOv8n-Pose",
        "model_path": MODEL_PATH,
        "detection_method": "Body Spread Analysis (Top-down & Side View)",
        "features": ["Pose Keypoints", "Horizontal Spread", "Box Occupation"]
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

# ==================== STARTUP ====================

init_database()

if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8000)
