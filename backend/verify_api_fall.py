import requests
import json
import time

API_URL = "http://localhost:8000/predict"
IMAGE_PATH = r"C:\Users\X1 Carbon 9th\.gemini\antigravity\brain\0dc96bb2-c075-40cc-94ff-de859a4fb807\fall_test_image_1769368105161.png"

print(f"Testing API: {API_URL}")
print(f"Image: {IMAGE_PATH}")

try:
    with open(IMAGE_PATH, "rb") as f:
        files = {"file": f}
        # conf=0.25 matched the test script logic
        response = requests.post(API_URL, files=files, params={"conf": 0.25})
    
    if response.status_code == 200:
        data = response.json()
        print("\nAPI Response:")
        print(json.dumps(data, indent=2))
        
        detections = data.get("detections", [])
        if any(d.get("status") == "fallen" or d.get("class_name") == "fallen" for d in detections):
            print("\n✅ SUCCESS: Fall detected via API!")
        else:
            print("\n❌ FAILURE: No fall detected via API.")
    else:
        print(f"\n❌ Error: Status code {response.status_code}")
        print(response.text)

except Exception as e:
    print(f"\n❌ Exception: {e}")
