# Privacy Policy for EyeVision Guard

**Effective Date:** December 29, 2024

## 1. Introduction
EyeVision Guard ("we", "our", or "us") is committed to protecting your privacy. This Privacy Policy explains how our Chrome Extension handles your data.

**Summary:** We do not collect, store, share, or transmit any of your personal data. EyeVision Guard works entirely offline and locally on your device.

## 2. Information We Keep Local (No Collection)
The extension processes the following data exclusively within your browser's memory (Client-Side):
*   **Camera Stream:** Your webcam feed is analyzed in real-time by the MediaPipe AI model running locally in your browser to detect face landmarks. This video stream is **never** recorded, saved to disk, or transmitted to any server.
*   **Distance Metrics:** The calculated distance between your eyes and the screen is used instantly to trigger alerts and is then discarded.

## 3. Data Storage (Local Only)
We use the Chrome Storage API (`chrome.storage.local`) solely to save your configuration preferences:
*   **Alert Delay:** The timer preference (e.g., 5 seconds, 15 seconds).
*   **Monitoring State:** Whether the extension is currently ON or OFF.

This data stays on your machine and is not synced to your Google Account or our servers.

## 4. Third-Party Services
EyeVision Guard does not use any third-party analytics, tracking scripts, or advertising services. The AI model (MediaPipe) is bundled with the extension and runs offline.

## 5. Permissions Justification
*   **Camera:** Required solely to measure distance in real-time.
*   **Offscreen Document:** Required to run the AI model in the background.
*   **Windows:** Required to minimize the browser window when a proximity breach occurs.

## 6. Contact Us
If you have any questions about this Privacy Policy, please contact us at: kharshaengineer@gmail.com with Subject: EyeVision Guard Policy
