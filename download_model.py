import urllib.request
import os

url = "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task"
filename = "face_landmarker.task"

print(f"Downloading {filename} from {url}...")
try:
    urllib.request.urlretrieve(url, filename)
    print("Download complete!")
    print(f"File size: {os.path.getsize(filename)} bytes")
except Exception as e:
    print(f"Error downloading file: {e}")
