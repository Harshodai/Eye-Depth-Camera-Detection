import cv2
import mediapipe as mp
import numpy as np
import os

class DistanceEstimator:
    """
    A reusable class for estimating distance using MediaPipe Face Landmarker.
    
    Args:
        model_path (str): Path to the .task model file.
        focal_length (float): Camera focal length (default 1100).
        target_width (float): Real-world width of the object in cm (default 6.3cm for IPD).
    """
    def __init__(self, model_path='face_landmarker.task', focal_length=1100, target_width=6.3):
        BaseOptions = mp.tasks.BaseOptions
        FaceLandmarker = mp.tasks.vision.FaceLandmarker
        FaceLandmarkerOptions = mp.tasks.vision.FaceLandmarkerOptions
        VisionRunningMode = mp.tasks.vision.RunningMode

        self.model_path = model_path
        
        # Check if model exists
        if not os.path.exists(self.model_path):
            raise FileNotFoundError(f"Model file {self.model_path} not found. Please download it or provide a correct path.")

        options = FaceLandmarkerOptions(
            base_options=BaseOptions(model_asset_path=self.model_path),
            running_mode=VisionRunningMode.IMAGE,
            num_faces=1,
            min_face_detection_confidence=0.5,
            min_face_presence_confidence=0.5,
            min_tracking_confidence=0.5)
            
        self.landmarker = FaceLandmarker.create_from_options(options)
        
        self.known_width = target_width
        self.focal_length = focal_length

    def get_distance(self, frame):
        """
        Processes a frame and returns distance and eye coordinates.

        Args:
            frame (np.array): BGR image frame from OpenCV.

        Returns:
            tuple: (distance_cm, left_eye_tuple, right_eye_tuple)
                   Returns (None, None, None) if no face detected.
        """
        h, w, _ = frame.shape
        rgb_frame = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
        mp_image = mp.Image(image_format=mp.ImageFormat.SRGB, data=rgb_frame)
        
        results = self.landmarker.detect(mp_image)

        if results.face_landmarks:
            face_landmarks = results.face_landmarks[0]
            
            # Iris landmarks
            left_iris = face_landmarks[468]
            right_iris = face_landmarks[473]
            
            # Convert to pixel coordinates
            left_pt = np.array([left_iris.x * w, left_iris.y * h])
            right_pt = np.array([right_iris.x * w, right_iris.y * h])
            
            # Calculate pixel distance
            pixel_distance = np.linalg.norm(left_pt - right_pt)
            
            # Calculate depth
            distance_cm = (self.known_width * self.focal_length) / pixel_distance
            
            return distance_cm, (int(left_pt[0]), int(left_pt[1])), (int(right_pt[0]), int(right_pt[1]))
                
        return None, None, None
