import cv2
import time
from distance_estimator import DistanceEstimator

import configparser
import ctypes

def load_config():
    config = configparser.ConfigParser()
    # Defaults
    defaults = {
        "safe_distance_feet": "2.5",
        "lock_time_seconds": "10",
        "target_width_cm": "6.3",
        "focal_length": "1100",
        "monitoring_enabled": "true"
    }
    
    try:
        if not config.read('config.ini'):
            print("config.ini not found. Using defaults.")
            return defaults
        
        # Return a dictionary mimicking the structure we had, but parsing types is needed later
        # However, to keep it simple, let's return a dict with parsed values
        return {
            "safe_distance_feet": config.getfloat("Settings", "safe_distance_feet", fallback=2.5),
            "lock_time_seconds": config.getfloat("Settings", "lock_time_seconds", fallback=10),
            "target_width_cm": config.getfloat("Settings", "target_width_cm", fallback=6.3),
            "focal_length": config.getfloat("Settings", "focal_length", fallback=1100),
            "monitoring_enabled": config.getboolean("Settings", "monitoring_enabled", fallback=True),
            "blink_check_enabled": config.getboolean("Settings", "blink_check_enabled", fallback=True),
            "blink_threshold_ear": config.getfloat("Settings", "blink_threshold_ear", fallback=0.25),
            "max_blink_interval": config.getfloat("Settings", "max_blink_interval", fallback=15.0)
        }
    except Exception as e:
        print(f"Error reading config: {e}. Using defaults.")
        # Ensure 'blink_check_enabled' and others have defaults if error occurs
        defaults.update({
            "blink_check_enabled": True, 
            "blink_threshold_ear": 0.25, 
            "max_blink_interval": 15.0
        })
        return {k: float(v) if k not in ["monitoring_enabled", "blink_check_enabled"] else True for k, v in defaults.items()}

def lock_screen():
    print("Locking screen due to proximity violation...")
    ctypes.windll.user32.LockWorkStation()

def calculate_ear(landmarks, eye_indices, w, h):
    """
    Calculate Eye Aspect Ratio (EAR) for a given eye.
    EAR = (||p2-p6|| + ||p3-p5||) / (2 * ||p1-p4||)
    """
    # Extract coordinates
    coords = []
    for idx in eye_indices:
        # Landmarks are normalized [0,1], convert to pixel
        coords.append(np.array([landmarks[idx].x * w, landmarks[idx].y * h]))
    
    # Vertical distances
    # p2 (1) - p6 (5)
    d_v1 = np.linalg.norm(coords[1] - coords[5])
    # p3 (2) - p5 (4)
    d_v2 = np.linalg.norm(coords[2] - coords[4])
    
    # Horizontal distance
    # p1 (0) - p4 (3)
    d_h = np.linalg.norm(coords[0] - coords[3])
    
    if d_h == 0: return 0.0
    
    ear = (d_v1 + d_v2) / (2.0 * d_h)
    return ear

def main():
    config = load_config()
    
    cap = cv2.VideoCapture(0)
    
    # Initialize with params from config
    estimator = DistanceEstimator(
        model_path='face_landmarker.task', 
        focal_length=config.get("focal_length", 1100), 
        target_width=config.get("target_width_cm", 6.3)
    )
    
    # Config values
    safe_distance_feet = config.get("safe_distance_feet", 2.5)
    SAFE_DISTANCE_CM = safe_distance_feet * 30.48
    LOCK_TIME_SECONDS = config.get("lock_time_seconds", 10)
    
    # Blink Config
    BLINK_CHECK = config.get("blink_check_enabled", True)
    EAR_THRESHOLD = config.get("blink_threshold_ear", 0.25)
    MAX_BLINK_INTERVAL = config.get("max_blink_interval", 15.0)
    
    last_distances = []
    SMOOTHING_WINDOW = 5
    
    # Timer variables
    violation_start_time = None
    last_blink_time = time.time()
    
    # Eye Landmarks (MediaPipe 468 indices)
    # Right Eye (viewer's left? No, subject's right. MediaPipe mirrors?)
    # Let's map robust logic: 
    # Left Eye (Subject's Left): 33, 160, 158, 133, 153, 144
    # Right Eye (Subject's Right): 362, 385, 387, 263, 373, 380
    LEFT_EYE_IDXS = [33, 160, 158, 133, 153, 144] 
    RIGHT_EYE_IDXS = [362, 385, 387, 263, 373, 380]

    print("Starting Eye Distance Monitor...")
    print(f"Safe Distance: {safe_distance_feet} ft")
    if BLINK_CHECK:
        print(f"Blink Monitor: ON (Alert every {MAX_BLINK_INTERVAL}s)")
    print("Press 'q' to quit.")

    while cap.isOpened():
        success, image = cap.read()
        if not success:
            print("Ignoring empty camera frame.")
            continue
            
        h, w, _ = image.shape

        distance, left_eye, right_eye, landmarks = estimator.get_distance(image)

        if distance:
            # Simple moving average for smoothing
            last_distances.append(distance)
            if len(last_distances) > SMOOTHING_WINDOW:
                last_distances.pop(0)
            avg_distance = sum(last_distances) / len(last_distances)
            
            # Convert to feet for display
            dist_ft = avg_distance / 30.48
            
            # Status check
            is_too_close = avg_distance < SAFE_DISTANCE_CM
            
            if is_too_close:
                if violation_start_time is None:
                    violation_start_time = time.time()
                
                elapsed_time = time.time() - violation_start_time
                remaining_time = max(0, LOCK_TIME_SECONDS - elapsed_time)
                
                color = (0, 0, 255) # Red
                status_text = f"TOO CLOSE! Locking in {remaining_time:.1f}s"
                
                # Lock Logic
                if elapsed_time > LOCK_TIME_SECONDS:
                    lock_screen()
                    # Reset timer and maybe pause to avoid immediate re-lock loop
                    violation_start_time = None 
                    time.sleep(2) 
            else:
                # Reset timer if back in safe zone
                violation_start_time = None
                color = (0, 255, 0) # Green
                status_text = "Good distance"
            
            # Blink Detection Logic
            blink_color = (255, 255, 255)
            blink_text = ""
            
            if BLINK_CHECK and landmarks:
                # Calculate EAR
                left_ear = calculate_ear(landmarks, LEFT_EYE_IDXS, w, h)
                right_ear = calculate_ear(landmarks, RIGHT_EYE_IDXS, w, h)
                avg_ear = (left_ear + right_ear) / 2.0
                
                # Check for blink
                if avg_ear < EAR_THRESHOLD:
                    last_blink_time = time.time() # Reset timer
                    blink_color = (0, 255, 0) # Green flash indicating blink registered
                
                # Check for dry eye (no blink)
                time_since_blink = time.time() - last_blink_time
                if time_since_blink > MAX_BLINK_INTERVAL:
                    blink_text = "BLINK NOW!"
                    cv2.putText(image, blink_text, (w//2 - 100, h//2), 
                                cv2.FONT_HERSHEY_SIMPLEX, 1.5, (0, 165, 255), 3) # Orange
                    cv2.rectangle(image, (0,0), (w,h), (0, 165, 255), 10) # Orange Border
                
                # Debug info (optional, helps user trust the system)
                # cv2.putText(image, f"EAR: {avg_ear:.2f}", (30, 150), cv2.FONT_HERSHEY_SIMPLEX, 0.5, (255,255,0), 1)

            # Overlay info
            cv2.putText(image, f"Distance: {avg_distance:.1f} cm ({dist_ft:.1f} ft)", (30, 50), 
                        cv2.FONT_HERSHEY_SIMPLEX, 0.8, color, 2)
            
            if is_too_close:
                 cv2.putText(image, status_text, (30, 90), 
                        cv2.FONT_HERSHEY_SIMPLEX, 0.8, color, 2)
            
            if BLINK_CHECK:
                 time_since_last = time.time() - last_blink_time
                 cv2.putText(image, f"Last Blink: {time_since_last:.1f}s", (30, 120), 
                        cv2.FONT_HERSHEY_SIMPLEX, 0.6, (200, 200, 200), 1)

        else:
            # If face lost, reset timer? Or keep it? 
            # Safer to reset to avoid locking if user leaves desk.
            violation_start_time = None
            cv2.putText(image, "Face not detected", (50, 50), 
                        cv2.FONT_HERSHEY_SIMPLEX, 1, (0, 255, 255), 2)

        cv2.imshow('Eye Distance Monitor', image)
        
        if cv2.waitKey(5) & 0xFF == ord('q'):
            break
            
    cap.release()
    cv2.destroyAllWindows()

if __name__ == "__main__":
    main()
