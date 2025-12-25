# Saree Barcode & OCR Auto-Sorter

Automates the organization of saree images by detecting barcodes (starting with "VR") or using OCR to read the ID directly from the image.

## Features
- **Dual Detection**: First tries fast barcode scanning; falls back to advanced OCR (Optical Character Recognition) if the barcode is unreadable.
- **Auto-Repair**: Images that fail the first pass are moved to a `failed` folder and automatically retried with heavier image processing (rotation, thresholding).
- **Organization**: Renames files to `VRxxxxx.jpeg` and moves them to the `output` directory.

## Prerequisites
- Python 3.8+
- [Visual C++ Redistributable](https://learn.microsoft.com/en-us/cpp/windows/latest-supported-vc-redist) (Required for some computer vision libraries on Windows)

## Installation

1.  **Clone or Download** this repository.
2.  **Install Dependencies**:
    ```bash
    pip install -r requirements.txt
    ```
    *Note: `easyocr` detects `torch`, which is large (~1GB). Please allow time for installation.*

## Usage

1.  **Prepare Folders**:
    The script expects an `input` folder in the same directory. If it doesn't exist, create it and put your images there.
    ```
    Vaarahi Silks/
    ├── organize_sarees.py
    ├── input/          <-- Put raw images here
    ├── output/         <-- Script saves renamed images here
    └── failed/         <-- Temporary holding for errors
    ```

2.  **Run the Script**:
    ```bash
    python organize_sarees.py
    ```

3.  **Check Results**:
    - Successfully identified images will be in `output/` (e.g., `VR89056.jpg`).
    - If any fail after retries, they will remain in `failed/`.

## Troubleshooting
- **"ImportError: DLL load failed"**: Install the Visual C++ Redistributable linked above.
- **Slow First Run**: The first time you run the script, EasyOCR downloads detection models. This is normal.





Comparision between:
1. organize_sarees.py (Current Production Version)
State: Cleaned up sequential version.
Imports: Removed concurrent.futures and threading.
Logic: Directly calls process_file in a simple loop.
Methods: Removed the helper wrapper process_file_safe (since we don't need exception catching wrapper for threads).
Initialization: Removed self.reader_lock (not needed for single thread).
2. saree_sequential_trigger.py (Snapshot of Trigger Code)
State: Hybrid. It runs sequentially, but keeps the leftover code from the parallel attempt.
Imports: Still has import concurrent.futures and import threading.
Logic: Uses a loop to append results to a list: results.append(self.process_file_safe(...)).
Methods: Keeps process_file_safe wrapper method.
Initialization: Keeps self.reader_lock.
Conclusion: organize_sarees.py is the cleaner, finalized version. saree_sequential_trigger.py logic is identical in behavior (sequential) but carries unnecessary "boilerplate" code from the multi-threading attempt.