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
            "monitoring_enabled": config.getboolean("Settings", "monitoring_enabled", fallback=True)
        }
    except Exception as e:
        print(f"Error reading config: {e}. Using defaults.")
        return {k: float(v) if k != "monitoring_enabled" else True for k, v in defaults.items()}

def lock_screen():
    print("Locking screen due to proximity violation...")
    ctypes.windll.user32.LockWorkStation()

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
    
    last_distances = []
    SMOOTHING_WINDOW = 5
    
    # Timer variables
    violation_start_time = None

    print("Starting Eye Distance Monitor...")
    print(f"Safe Distance: {safe_distance_feet} ft")
    print(f"Lock Timeout: {LOCK_TIME_SECONDS} seconds")
    print("Press 'q' to quit.")

    while cap.isOpened():
        success, image = cap.read()
        if not success:
            print("Ignoring empty camera frame.")
            continue

        distance, left_eye, right_eye = estimator.get_distance(image)

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
            
            # Overlay info
            cv2.putText(image, f"Distance: {avg_distance:.1f} cm ({dist_ft:.1f} ft)", (30, 50), 
                        cv2.FONT_HERSHEY_SIMPLEX, 0.8, color, 2)
            
            if is_too_close:
                 cv2.putText(image, status_text, (30, 90), 
                        cv2.FONT_HERSHEY_SIMPLEX, 0.8, color, 2)

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
