# model_v8 — trained fall-detection models (from Fall-Detecton)

Đặt 3 file model (tác giả repo Fall-Detecton gửi) vào đây:

| File | Kích thước | Vai trò |
|---|---|---|
| `best_model.tflite` | ~257 KB | Model TCN đã train (bản TFLite — ưu tiên suy luận) |
| `best_model.keras`  | ~2.55 MB | Model TCN bản Keras (dự phòng nếu không có TFLite) |
| `pose_landmarker_full.task` | ~8.96 MB | MediaPipe Pose (trích khung xương) |

## Kích hoạt
1. Đặt 3 file vào `backend/model_v8/`.
2. Cài deps: `pip install -r backend/requirements-mediapipe.txt` (trên Colab chỉ cần `pip install mediapipe`).
3. Chạy backend với biến môi trường **`FALL_ENGINE=mediapipe`** (hoặc thêm vào `backend/.env`).

> Để deploy lên Colab (clone repo từ GitHub), 3 file này **nên được commit** — tổng ~12 MB, dưới giới hạn 100 MB của GitHub.
