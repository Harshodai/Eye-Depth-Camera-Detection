# Eye Distance Monitor

A real-time Python application that uses your webcam to monitor the distance between your eyes and the screen. It alerts you if you get too close (less than 2.5 feet / 76 cm) to help prevent eye strain.

## Features
- **Real-time Detection**: Uses MediaPipe for high-accuracy face and iris tracking.
- **Distance Estimation**: Calculates distance using the focal length method.
- **Privacy First**: All processing is done locally on your device.
- **Visual Alerts**: Provides friendly on-screen warnings when you are too close.
- **Auto-Lock**: Locks your computer (Windows+L) if you remain too close for a set duration (default 10s).
- **Configurable**: Fully tweakable settings via `config.ini`.

## Requirements
- Python 3.9+
- Webcam
- Windows OS (for Screen Lock feature)

## Configuration
You can modify `config.ini` to change the settings:
```ini
[Settings]
safe_distance_feet = 2.5
lock_time_seconds = 10
monitoring_enabled = true
```

## Installation

1. Clone the repository:
   ```bash
   git clone <your-repo-url>
   cd <repo-name>
   ```

2. Install dependencies:
   ```bash
   pip install -r requirements.txt
   ```
   *(Note: If errors occur on Windows, try `py -m pip install -r requirements.txt`)*

3. **Important**: Ensure the AI model file is present.
   - The script requires `face_landmarker.task`.
   - You can download it by running: `py download_model.py` (if included) or manually from [Google MediaPipe Models](https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task).

## Usage

Run the main script:
```bash
python main.py
```
(or `py main.py` on Windows)

Press `q` to quit the application.

## Integration & Workflow Guide

Want to use this eye-tracking technology in your own app (e.g., a concentration timer, a posture corrector, or a game)? Follow these steps:

### Step 1: Copy Necessary Files
Copy these two files into your project directory:
1.  `distance_estimator.py` (The core logic class)
2.  `face_landmarker.task` (The AI model)

### Step 2: Install Dependencies
Ensure your environment deals with the computer vision libraries:
```bash
pip install opencv-python mediapipe numpy
```

### Step 3: Minimal Code Example
Here is the bare minimum code to get distance readings in your own script:

```python
import cv2
from distance_estimator import DistanceEstimator

# 1. Initialize the estimator
# Increase focal_length if distance seems too small, decrease if too large.
estimator = DistanceEstimator(
    model_path='face_landmarker.task',
    focal_length=1100
)

cap = cv2.VideoCapture(0)

while cap.isOpened():
    success, frame = cap.read()
    if not success: break

    # 2. Get the distance
    distance_cm, left_eye, right_eye = estimator.get_distance(frame)

    if distance_cm:
        print(f"Distance: {distance_cm:.1f} cm")
        
        # Example Logic: Trigger an action if too close
        if distance_cm < 50:
             print("Too Close!")
    
    # Optional: Display the frame
    cv2.imshow("My App", frame)
    if cv2.waitKey(1) == ord('q'): break

cap.release()
cv2.destroyAllWindows()
```

### Step 5: Adding Screen Lock & Config (Advanced)
To add the auto-lock feature and configuration to your own app, follow this pattern:

1.  **Create a `config.ini`**:
    ```ini
    [Settings]
    safe_distance_feet = 2.5
    lock_time_seconds = 10
    ```

2.  **Update your Python script**:
    ```python
    import configparser
    import ctypes
    import time
    
    # ... (Load Config)
    config = configparser.ConfigParser()
    config.read('config.ini')
    SAFE_DIST_FT = config.getfloat("Settings", "safe_distance_feet", fallback=2.5)
    LOCK_TIME = config.getfloat("Settings", "lock_time_seconds", fallback=10)
    
    violation_start = None
    
    # ... (Inside your loop)
    if distance_cm < (SAFE_DIST_FT * 30.48):
        if violation_start is None:
            violation_start = time.time()
        
        # Check if time exceeded
        if (time.time() - violation_start) > LOCK_TIME:
            print("Locking...")
            ctypes.windll.user32.LockWorkStation()
            violation_start = None # Reset
    else:
        violation_start = None # Safe
    ```

### Step 6: Customization
You can tweak the `DistanceEstimator` initialization:
- `target_width`: Change this if you want to track an object with a different known width (default is 6.3cm for eyes).
- `focal_length`: If you use a different camera (e.g., 4K webcam vs Laptop webcam), you might need to adjust this value. 
  - *Calibration Tip*: Sit exactly 50cm away. Tweak `focal_length` until the code prints "50 cm".

## How it Works
### 1. Face & Iris Tracking
We use **MediaPipe's Face Landmarker** (via the modern `mp.tasks` API) to detect 478 3D facial landmarks. This model is robust to lighting changes and head pose.
- **Why `face_landmarker.task`?**: This file contains the pre-trained machine learning model weights. We use the Tasks API instead of the older `mp.solutions` because it is more efficient, supports the latest models, and avoids compatibility issues with newer Python versions (like Python 3.13).

### 2. Distance Estimation Algorithm
We use the **Triangle Similarity Principle** (Monocular Depth Estimation).
- **Reference**: The average human Interpupillary Distance (IPD) is approximately **6.3 cm**. variables:
    - $W$: Real width (6.3 cm)
    - $P$: Pixel width (measured distance between eyes on screen)
    - $F$: Focal Length (a constant factor depending on the camera)
- **Formula**:
  $$ D = \frac{W \times F}{P} $$
- **Process**:
    1. The app detects the center of the left and right irises.
    2. It calculates the distance between them in pixels ($P$).
    3. It applies the formula to estimate the real-world distance ($D$).

### 3. Visual Feedback
- If $D < 76$ cm (2.5 feet), the text turns **Orange/Red** and warns you.
- Otherwise, it shows **Green** text indicating a safe distance.
