import io
import json
import os

import uvicorn
from fastapi import FastAPI, File, UploadFile, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from huggingface_hub import hf_hub_download
from PIL import Image
from ultralytics import YOLO

app = FastAPI()

# CORS configuration
origins = [
    "*",  # Adjust this in production
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Model configuration
REPO_ID = "melihuzunoglu/human-fall-detection"
FILENAME = "falldetect-11x.pt"
MODEL_DIR = "models"
MODEL_PATH = os.path.join(MODEL_DIR, FILENAME)


model_path = hf_hub_download(repo_id=REPO_ID, filename="best.pt")

model = YOLO(model_path)


@app.get("/")
def read_root():
    return {"message": "Fall Detection API is running"}


@app.post("/predict")
async def predict(file: UploadFile = File(...), conf: float = 0.5):
    if model is None:
        return {"error": "Model not loaded"}

    # Read the image
    contents = await file.read()
    image = Image.open(io.BytesIO(contents))

    # Run inference
    results = model(image, conf=conf)

    # Process results
    # YOLO results are a list (one for each image in the batch)
    result = results[0]

    detections = []
    for box in result.boxes:
        xyxy = box.xyxy[0].tolist()
        confidence = float(box.conf[0])
        class_id = int(box.cls[0])
        class_name = result.names[class_id]

        detections.append(
            {
                "box": xyxy,
                "confidence": confidence,
                "class_id": class_id,
                "class_name": class_name,
            }
        )

    return {"detections": detections}


@app.websocket("/ws/predict")
async def websocket_predict(websocket: WebSocket):
    await websocket.accept()
    print("WebSocket client connected")

    # Default config
    conf = 0.5

    if model is None:
        await websocket.close(code=1011, reason="Model not loaded")
        return

    try:
        while True:
            # Receive data
            data = await websocket.receive()

            if "text" in data:
                # Handle config update
                try:
                    config = json.loads(data["text"])
                    if "conf" in config:
                        conf = float(config["conf"])
                        print(f"Updated confidence threshold to: {conf}")
                    continue
                except Exception as e:
                    print(f"Error parsing config: {e}")
                    continue

            if "bytes" in data:
                # Process image
                try:
                    image_data = data["bytes"]
                    image = Image.open(io.BytesIO(image_data))

                    # Run inference
                    # verbose=False to reduce logs
                    results = model(image, conf=conf, verbose=False)
                    result = results[0]

                    detections = []
                    for box in result.boxes:
                        xyxy = box.xyxy[0].tolist()
                        confidence = float(box.conf[0])
                        class_id = int(box.cls[0])

                        detections.append(
                            {
                                "box": xyxy,
                                "confidence": confidence,
                                "class_id": class_id,
                                "class_name": result.names[class_id],
                            }
                        )

                    # Send results back as JSON
                    await websocket.send_json({"detections": detections})

                except Exception as e:
                    print(f"Error processing frame: {e}")
                    await websocket.send_json({"error": str(e)})

    except WebSocketDisconnect:
        print("WebSocket client disconnected")
    except Exception as e:
        print(f"WebSocket error: {e}")


if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8000)
