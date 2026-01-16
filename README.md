# EyeVision Guard 🛡️

EyeVision Guard is a suite of AI-powered tools designed to protect your vision by monitoring the distance between your eyes and the screen. It alerts you if you get too close (less than 2.5 feet / 76 cm) to help prevent eye strain and CVS (Computer Vision Syndrome).

The project includes:
1.  **🚀 EyeVision Guard (Chrome Extension)**: A lightweight, privacy-focused extension for background monitoring.
2.  **💻 Desktop Monitor (Python)**: A robust desktop application for deep tracking and system-level alerts.

---

## 🚀 EyeVision Guard (Chrome Extension)

The most popular way to use EyeVision Guard. It runs entirely in your browser using local AI.

### Features
- **Smart Galaxy Break Timer**: Implements the 20-20-20 rule with a breathing "Cosmic Drift" galaxy animation to help you relax.
- **Blink Monitor**: Analyzes your blink rate using AI and reminds you to blink if you stare too long (preventing dry eyes).
- **Privacy First**: "No Data is Stored anywhere" - All AI processing happens locally on your device.
- **Background Protection**: Continues monitoring even when the popup is closed.
- **Customizable Delay**: Set an alert delay from 5s to 15s using a compact horizontal slider.
- **Auto-Minimize**: Automatically minimizes the browser if you stay too close for too long.

### Installation
1. Open Chrome and go to `chrome://extensions/`.
2. Enable **Developer Mode** (top right).
3. Click **Load Unpacked** and select the `chrome-extension` folder from this repository.

---

## 💻 Desktop Monitor (Python)

A real-time desktop application for system-wide protection.

### Features
- **Auto-Minimize**: Automatically minimizes the browser if you stay too close for too long.
- **Configurable**: Fully tweakable settings via `config.ini`.
- **MediaPipe Engine**: Uses the same high-accuracy iris tracking engine.

### Quick Start
1. `pip install -r requirements.txt`
2. `python main.py`

---

## 🧪 Testing & Verification Guide

Follow these manual test cases to verify the system is working perfectly.

### Test Case 1: UI & Privacy Verification
- **Step**: Open the EyeVision Guard extension popup.
- **Check**: The privacy banner should read "**No Data is Stored anywhere**" in green. The UI should be compact with a horizontal 5-15s slider.

### Test Case 2: Initialization & Stability (Race Condition Test)
- **Step**: Close and re-open the popup.
- **Check**: The slider and distance monitor should initialize correctly after 1.5 seconds without any layout flickering or "jumping" values.

### Test Case 3: Live Proximity Tracking
- **Step**: Click **Start Protection** and look at your screen.
- **Check**: The status should switch to "**Good**" (Green) and show your real-time distance in centimeters.

### Test Case 4: Alert Sync (Distance)
- **Step**: Set slider to **5s**. Lean in close (< 76cm).
- **Check**: Text changes to "**Please move back (5s)**" and counts down. Move back; it should reset to "**Good**" immediately.

### Test Case 5: Blink Detection
- **Step**: Set Blink Timeout to **5s** in the popup.
- **Step**: Stare at the camera without blinking for > 5 seconds.
- **Check**: A "Blink Now!" popup appears with a visual eye animation and an audio queue.

### Test Case 6: Breach & Action
- **Step**: Stay at a close distance until the countdown reaches **0s**.
- **Check**: The Chrome window (Extension) or PC (Python) should automatically perform the protection action (Minimize/Lock).

### Test Case 7: 20-20-20 Break & Galaxy Timer
- **Step**: Wait for the 20-minute timer (or manually trigger via Developer Console).
- **Check**: A full-screen "Time to Rest" page opens with a rotating 3D Milky Way background.
- **Step**: Wait for the 20-second breathing countdown.
- **Check**: The text changes to "I'm Recharged" with a checkmark. Click it to resume.

---

## 🛠️ How it Works

### 1. AI Engine
We use **MediaPipe's Face Landmarker** to detect 478 3D landmarks. specifically tracking the irises for millimeter-accurate positioning.

### 2. Distance Algorithm
We use the **Triangle Similarity Principle**:
$$ D = \frac{W \times F}{P} $$
- $W$: Interpupillary Distance (6.3 cm)
- $P$: Pixel width between eyes
- $F$: Camera Focal Length (1100)

---

## 🛡️ Privacy Policy
**100% Local**. No images are captured. No data is stored. No biometric info is sent to any server. Your camera feed is used strictly for real-time calculation and discarded instantly.
 
---

## ??? Developer & Testing

We enforce a strict **Regression Testing Policy** to prevent bugs.

### How to Commit Changes
Use the included safeguard.bat script instead of standard git commands.

1.  **Double-click** safeguard.bat in the project folder.
2.  It will automatically open the **Regression Test Suite** in your browser.
3.  **Verify** 14/14 tests are GREEN ✅.
4.  Type y in the terminal to confirm.
5.  Enter your commit message when prompted.
6.  The script will automatically commit and push your changes.

### Running Tests Manually
Open chrome-extension/tests/runner.html in your browser at any time to check the health of the extension.
