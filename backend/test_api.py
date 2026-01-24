import requests
import sys

def test_api(image_path):
    url = "http://localhost:8000/predict"
    try:
        with open(image_path, "rb") as f:
            files = {"file": f}
            print(f"Sending request to {url} with image {image_path}...")
            response = requests.post(url, files=files)
            
        if response.status_code == 200:
            print("Response received:")
            print(response.json())
        else:
            print(f"Error: Status code {response.status_code}")
            print(response.text)
            
    except Exception as e:
        print(f"An error occurred: {e}")

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: python test_api.py <path_to_image>")
    else:
        test_api(sys.argv[1])
