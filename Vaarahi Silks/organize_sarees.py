import cv2
import numpy as np
from pyzbar.pyzbar import decode, ZBarSymbol
import os
import shutil
import time
import easyocr
import re

class SareeSorter:
    def __init__(self, base_dir):
        self.base_dir = base_dir
        self.input_dir = os.path.join(base_dir, "input")
        self.output_dir = os.path.join(base_dir, "output")
        self.failed_dir = os.path.join(base_dir, "failed")
        self.setup_directories()
        self.reader = None # Lazy load

    def get_reader(self):
        if self.reader is None:
            print("Initializing OCR Reader (this may take a moment)...")
            # verbose=False prevents encoding errors on Windows console
            self.reader = easyocr.Reader(['en'], verbose=False) 
        return self.reader

    def setup_directories(self):
        for d in [self.output_dir, self.failed_dir]:
            if not os.path.exists(d):
                os.makedirs(d)
                print(f"Created directory: {d}")

    def preprocess_image(self, image, method):
        if method == "original":
            return image
        
        gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
        
        if method == "grayscale":
            return gray
        
        if method == "sharpen":
            kernel = np.array([[-1,-1,-1], [-1,9,-1], [-1,-1,-1]])
            return cv2.filter2D(gray, -1, kernel)
        
        if method == "threshold_otsu":
            _, thresh = cv2.threshold(gray, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)
            return thresh
        
        if method == "adaptive_threshold":
            return cv2.adaptiveThreshold(gray, 255, cv2.ADAPTIVE_THRESH_GAUSSIAN_C, cv2.THRESH_BINARY, 11, 2)

        return gray

    def decode_frame(self, image):
        barcodes = decode(image)
        for barcode in barcodes:
            barcode_data = barcode.data.decode("utf-8")
            if barcode_data:
                return barcode_data
        return None

    def scan_ocr(self, image_path):
        try:
            reader = self.get_reader()
            original_img = cv2.imread(image_path)
            if original_img is None:
                return None
            
            # Preprocessing methods for OCR to handle noise/patterns
            methods = ["grayscale", "threshold_otsu", "original"]
            rotations = [0, 90, 180, 270]

            for method in methods:
                processed = self.preprocess_image(original_img, method)
                
                for angle in rotations:
                    # Rotate
                    if angle == 0:
                        img_to_scan = processed
                    elif angle == 90:
                        img_to_scan = cv2.rotate(processed, cv2.ROTATE_90_CLOCKWISE)
                    elif angle == 180:
                        img_to_scan = cv2.rotate(processed, cv2.ROTATE_180)
                    elif angle == 270:
                        img_to_scan = cv2.rotate(processed, cv2.ROTATE_90_COUNTERCLOCKWISE)

                    # Scan
                    results = reader.readtext(img_to_scan)
                    for (bbox, text, prob) in results:
                        # Clean text
                        clean = text.replace(" ", "").upper()
                        # Strict matching for VR followed by digits
                        if "VR" in clean:
                            match = re.search(r"VR\d+", clean)
                            if match:
                                print(f"Success: OCR Found {match.group(0)} with {method} at {angle} deg")
                                return match.group(0)
        except Exception as e:
            print(f"OCR specific error: {e}")
        return None

    def scan_barcode(self, image_path):
        """
        Attempts to scan a barcode checks:
        1. Fast Barcode Scan (various pre-processing)
        2. Slow OCR Scan (various pre-processing)
        """
        try:
            original_image = cv2.imread(image_path)
            if original_image is None:
                print(f"Error: Could not read image at {image_path}")
                return None
        except Exception as e:
            print(f"Exception reading {image_path}: {e}")
            return None

        # 1. Try Barcode Scan (Fast)
        methods = ["original", "grayscale", "sharpen", "threshold_otsu", "adaptive_threshold"]
        rotations = [0, 90, 180, 270]

        for method in methods:
            processed_img = self.preprocess_image(original_image, method)
            for angle in rotations:
                if angle == 0:
                    img_to_scan = processed_img
                else:
                    if angle == 90:
                        img_to_scan = cv2.rotate(processed_img, cv2.ROTATE_90_CLOCKWISE)
                    elif angle == 180:
                        img_to_scan = cv2.rotate(processed_img, cv2.ROTATE_180)
                    elif angle == 270:
                        img_to_scan = cv2.rotate(processed_img, cv2.ROTATE_90_COUNTERCLOCKWISE)
                
                result = self.decode_frame(img_to_scan)
                if result:
                    print(f"Success: Barcode Found {result} with method {method} at {angle} deg")
                    return result
        
        # 2. Try OCR (Slow but fallback)
        print("Barcode scan failed. Attempting OCR...")
        ocr_result = self.scan_ocr(image_path)
        if ocr_result:
            return ocr_result

        return None

    def standardize_filename(self, barcode_data):
        clean_data = barcode_data.strip()
        if not clean_data.upper().startswith("VR"):
            if clean_data.isdigit():
                 return f"VR{clean_data}"
        return clean_data.upper()

    def process_file(self, filename, source_folder, dest_folder, is_retry=False):
        source_path = os.path.join(source_folder, filename)
        if not os.path.isfile(source_path):
            return False

        ext = os.path.splitext(filename)[1].lower()
        if ext not in ['.jpg', '.jpeg', '.png']:
            return False

        print(f"Processing {'(Retry)' if is_retry else ''}: {filename}")
        barcode_data = self.scan_barcode(source_path)

        if barcode_data:
            final_name = self.standardize_filename(barcode_data) + ext
            final_path = os.path.join(self.output_dir, final_name)
            
            counter = 1
            while os.path.exists(final_path):
                # avoid overwriting if name conflict
                # But actually, if we re-run, we might overwrite same file if content is same?
                # User wants "output folder with VR89056.jpeg".
                # If we already have it, maybe we skip? 
                # But current logic is appending _1.
                name_part = self.standardize_filename(barcode_data)
                final_path = os.path.join(self.output_dir, f"{name_part}_{counter}{ext}")
                counter += 1

            shutil.copy2(source_path, final_path)
            if is_retry:
                # If it was in failed, we delete it from failed.
                try:
                    os.remove(source_path)
                except:
                    pass
            return True
        else:
            if not is_retry:
                # Only copy to failed if it wasn't already in failed
                # (If it was in input and failed)
                try:
                    shutil.copy2(source_path, os.path.join(self.failed_dir, filename))
                except:
                    pass
            return False

    def run(self):
        print("--- Starting Main Run ---")
        input_files = os.listdir(self.input_dir)
        for f in input_files:
            # Check if file is still there and valid
            if os.path.isfile(os.path.join(self.input_dir, f)):
                self.process_file(f, self.input_dir, self.output_dir)

        print("\n--- Checking Failed Folder for Retries ---")
        failed_files = os.listdir(self.failed_dir)
        if failed_files:
            print(f"Found {len(failed_files)} items in failed. Retrying...")
            for f in failed_files:
                success = self.process_file(f, self.failed_dir, self.output_dir, is_retry=True)
                if success:
                    print(f"Recovery successful for {f}")
                else:
                    print(f"Still failed for {f}")
        else:
            print("No failed items to retry.")

if __name__ == "__main__":
    sorter = SareeSorter(os.getcwd())
    sorter.run()