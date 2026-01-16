// offscreen.js - Reliable Background Monitor (Simplified)

// 1. SUPPRESS NOISY LOGS
const originalLog = console.log;
const originalWarn = console.warn;
const originalInfo = console.info;
const originalError = console.error;

const filter = (args, originalFn) => {
    const msg = args[0];
    if (typeof msg === 'string') {
        const lower = msg.toLowerCase();
        if (lower.includes('xnnpack') || lower.includes('opengl') ||
            lower.includes('tensorflow') || lower.includes('delegate') ||
            lower.includes('norm_rect') || msg.startsWith('INFO:')) {
            return;
        }
    }
    originalFn(...args);
};

console.log = (...args) => filter(args, originalLog);
console.warn = (...args) => filter(args, originalWarn);
console.info = (...args) => filter(args, originalInfo);
console.error = (...args) => filter(args, originalError);



let faceLandmarker;
const video = document.getElementById("webcam");
const INTERPUPILLARY_DISTANCE_CM = 6.3;
const FOCAL_LENGTH = 1100;
const SAFE_DISTANCE_CM = 76; // 2.5 Feet

let alertDelaySeconds = 5;
let closeDistanceStartTime = null;
let lastFaceDetectedTime = 0;
const FACE_LOST_GRACE_MS = 1000;

// --- AUDIO HELPER (Global Scope) ---
const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
let playBeep = function () {
    if (audioCtx.state === 'suspended') audioCtx.resume();
    const oscillator = audioCtx.createOscillator();
    const gainNode = audioCtx.createGain();
    oscillator.connect(gainNode);
    gainNode.connect(audioCtx.destination);
    oscillator.type = 'sine';
    oscillator.frequency.setValueAtTime(440, audioCtx.currentTime); // A4
    gainNode.gain.setValueAtTime(0.1, audioCtx.currentTime);
    oscillator.start();
    setTimeout(() => oscillator.stop(), 500); // 0.5s beep
};

(async () => {
    // 1. IMMEDIATE STARTUP ACTIONS
    // Notify Popup immediately to clear "Connecting..."
    chrome.runtime.sendMessage({ type: "MONITOR_UPDATE", status: "LOOKING" });

    // Register Direct Message Listener for Slider

    // Alert Sound Handling
    // (playBeep is now global)

    chrome.runtime.onMessage.addListener((msg) => {
        if (msg.type === "UPDATE_DELAY") {
            const val = parseInt(msg.value);
            if (!isNaN(val)) {
                alertDelaySeconds = val;
                originalLog("Slider Update:", val);
            }
        } else if (msg.type === "PLAY_ALERT_SOUND") {
            playBeep();
        } else if (msg.type === "UPDATE_BLINK_SETTINGS") {
            const val = parseInt(msg.value);
            if (!isNaN(val)) {
                updateBlinkThresholds(val);
                originalLog("Blink Threshold Updated:", val);
            }
        }
    });

    // 2. WAIT FOR STORAGE API
    const waitForStorage = async (retries = 20) => {
        for (let i = 0; i < retries; i++) {
            try {
                if (chrome && chrome.storage && chrome.storage.local) {
                    await new Promise((resolve) => chrome.storage.local.get(null, resolve));
                    return true;
                }
            } catch (e) { }
            await new Promise(r => setTimeout(r, 100));
        }
        return false;
    };

    if (await waitForStorage()) {
        const res = await new Promise(r => chrome.storage.local.get(['alertDelay', 'blinkTimeout'], r));

        if (res.alertDelay) {
            alertDelaySeconds = parseInt(res.alertDelay) || 5;
        }
        if (res.blinkTimeout) {
            updateBlinkThresholds(parseInt(res.blinkTimeout) || 10);
        } else {
            updateBlinkThresholds(10); // Default 10s
        }
    }

    // chrome.storage.onChanged removed to prevent 'undefined' errors.
    // We rely on chrome.runtime.onMessage for real-time updates.

    // 3. LOAD AI ENGINE & CAMERA
    try {

        const vision = await import(chrome.runtime.getURL("lib/vision.js"));
        const filesetResolver = await vision.FilesetResolver.forVisionTasks(chrome.runtime.getURL("lib/wasm"));

        faceLandmarker = await vision.FaceLandmarker.createFromOptions(filesetResolver, {
            baseOptions: {
                modelAssetPath: chrome.runtime.getURL("face_landmarker.task"),
                delegate: "GPU"
            },
            outputFaceBlendshapes: false,
            runningMode: "VIDEO",
            numFaces: 1,
            minFaceDetectionConfidence: 0.5,
            minFacePresenceConfidence: 0.5,
            minTrackingConfidence: 0.5
        });

        const stream = await navigator.mediaDevices.getUserMedia({
            video: {
                width: { ideal: 640 },
                height: { ideal: 480 }
            }
        });
        video.srcObject = stream;

        // Force play and poll for valid frames
        video.play().catch(e => originalLog("Play error", e));

        const startInterval = setInterval(() => {
            if (video.readyState >= 2 && video.videoWidth > 0) {
                originalLog("EyeVision Guard: System Active.");
                clearInterval(startInterval);
                // Optimized Speed: Check every 50ms (20fps) instead of 100ms (10fps)
                setInterval(predictTick, 50);
                predictTick();
            }
        }, 100); // Poll camera status faster too (100ms)

        // Fail-safe reset if everything stalls
        setTimeout(() => {
            if (video.readyState < 2) {
                chrome.runtime.sendMessage({ type: "MONITOR_ERROR", error: "Camera timeout after 15s" });
            }
        }, 15000);

    } catch (err) {
        originalLog("Startup Fail:", err);
        chrome.runtime.sendMessage({ type: "MONITOR_ERROR", error: "Init failed: " + err.message });
    }
})();

// --- BLINK DETECTION HELPERS ---
const BLINK_THRESHOLD_EAR = 0.25;
let blinkThresholdSeconds = 10; // Default 10s as requested

// We will dynamically calculate these
// If user says "10s", we warn at 10s and enforce immediately or shortly after?
// User said: "make the blink and beep at 10 secs only"
// This implies NO separation. At 10s -> BEEP + POPUP.
let WARN_THRESHOLD_MS = 10000;
let ENFORCE_THRESHOLD_MS = 10000;

function updateBlinkThresholds(seconds) {
    blinkThresholdSeconds = seconds;
    // Set both to the same value to trigger simultaneous Beep + Popup
    WARN_THRESHOLD_MS = seconds * 1000;
    ENFORCE_THRESHOLD_MS = seconds * 1000;
}

let lastBlinkTime = Date.now();
let lastEnforceTime = 0;
let isBlinkWarningActive = false;

// MediaPipe Landmark Indices
// Left Eye: 33, 160, 158, 133, 153, 144
// Right Eye: 362, 385, 387, 263, 373, 380
const LEFT_EYE = [33, 160, 158, 133, 153, 144];
const RIGHT_EYE = [362, 385, 387, 263, 373, 380];

function calculateEAR(landmarks, indices, width, height) {
    const coords = indices.map(i => ({
        x: landmarks[i].x * width,
        y: landmarks[i].y * height
    }));

    // Vertical distances
    const dv1 = Math.hypot(coords[1].x - coords[5].x, coords[1].y - coords[5].y);
    const dv2 = Math.hypot(coords[2].x - coords[4].x, coords[2].y - coords[4].y);

    // Horizontal distance
    const dh = Math.hypot(coords[0].x - coords[3].x, coords[0].y - coords[3].y);

    if (dh === 0) return 0;
    return (dv1 + dv2) / (2 * dh);
}

function predictTick() {
    // In test mode, we might not have a real video stream, so bypass readyState/videoWidth checks if needed
    const isTest = (typeof window !== 'undefined' && window.__TEST_MODE__);
    if (!faceLandmarker || (!isTest && (video.readyState < 2 || video.videoWidth === 0))) return;

    try {
        const results = faceLandmarker.detectForVideo(video, Date.now());
        let status = "ACTIVE";
        let distance = null;
        const now = Date.now();

        if (results.faceLandmarks && results.faceLandmarks.length > 0) {
            lastFaceDetectedTime = now;
            const landmarks = results.faceLandmarks[0];
            const w = video.videoWidth;
            const h = video.videoHeight;

            // --- DISTANCE LOGIC ---
            const leftIris = landmarks[468];
            const rightIris = landmarks[473];

            if (leftIris && rightIris) {
                const pxDist = Math.sqrt(
                    Math.pow((leftIris.x - rightIris.x) * w, 2) +
                    Math.pow((leftIris.y - rightIris.y) * h, 2)
                );
                const distanceCm = (INTERPUPILLARY_DISTANCE_CM * FOCAL_LENGTH) / pxDist;
                distance = Math.round(distanceCm);

                if (distanceCm < SAFE_DISTANCE_CM) {
                    if (!closeDistanceStartTime) closeDistanceStartTime = now;
                    const secondsClose = (now - closeDistanceStartTime) / 1000;

                    if (secondsClose >= alertDelaySeconds) {
                        status = "BREACH";
                        chrome.runtime.sendMessage({
                            type: "MONITOR_UPDATE",
                            status: "BREACH",
                            distance: distance
                        });
                        chrome.runtime.sendMessage({ type: "MINIMIZE_WINDOW" });
                        closeDistanceStartTime = null;
                        return;
                    } else {
                        status = "WARNING|" + Math.ceil(alertDelaySeconds - secondsClose);
                    }
                } else {
                    closeDistanceStartTime = null;
                    status = "SAFE";
                }
            }

            // --- BLINK LOGIC ---
            const leftEAR = calculateEAR(landmarks, LEFT_EYE, w, h);
            const rightEAR = calculateEAR(landmarks, RIGHT_EYE, w, h);
            const avgEAR = (leftEAR + rightEAR) / 2.0;

            if (avgEAR < BLINK_THRESHOLD_EAR) {
                // Blink detected!
                lastBlinkTime = now;
                if (isBlinkWarningActive) {
                    isBlinkWarningActive = false;
                    chrome.runtime.sendMessage({ type: "RESET_BLINK" });
                }
            } else {
                // Eyes open
                const timeOpen = now - lastBlinkTime;

                // Phase 1: Warn (Independent Check)
                if (window.__TEST_MODE__) console.log("TimeOpen:", timeOpen, "WarnThresh:", WARN_THRESHOLD_MS, "Active:", isBlinkWarningActive);
                if (timeOpen > WARN_THRESHOLD_MS) {
                    if (!isBlinkWarningActive) {
                        if (window.__TEST_MODE__) console.log("Sending WARN_BLINK");
                        isBlinkWarningActive = true;
                        try { playBeep(); } catch (e) { if (window.__TEST_MODE__) console.error("Audio Fail", e); }
                        chrome.runtime.sendMessage({ type: "WARN_BLINK" });
                    }
                }

                // Phase 2: Enforce
                if (timeOpen > ENFORCE_THRESHOLD_MS) {
                    // Trigger every 1 second to ensure window stays focused/open
                    if (now - lastEnforceTime > 1000) {
                        chrome.runtime.sendMessage({ type: "ENFORCE_BLINK" });
                        lastEnforceTime = now;
                    }
                }
            }

        } else {
            status = "LOOKING";
            // Grace period for blinking or fast movement
            if (now - lastFaceDetectedTime > FACE_LOST_GRACE_MS) {
                closeDistanceStartTime = null;
                // If face lost, do we reset blink timer?
                // Yes, assuming they walked away or turned head.
                lastBlinkTime = now;
                if (isBlinkWarningActive) {
                    isBlinkWarningActive = false;
                    chrome.runtime.sendMessage({ type: "RESET_BLINK" });
                }
            }
        }

        chrome.runtime.sendMessage({
            type: "MONITOR_UPDATE",
            status: status,
            distance: distance
        });
    } catch (e) {
        if (window.__TEST_MODE__) console.error("PredictTick Error:", e.message, e.stack);
    }
}

// --- EXPORT FOR TESTING ---
if (typeof window !== 'undefined') {    // Expose for testing
    if (window.__TEST_MODE__) {
        window.EyeGuard = window.EyeGuard || {};
        window.EyeGuard.offscreen = {
            calculateEAR,
            updateBlinkThresholds,
            predictTick,
            setLastBlinkTime: (t) => { lastBlinkTime = t; },
            getLastBlinkTime: () => lastBlinkTime,
            setIsBlinkWarningActive: (b) => { isBlinkWarningActive = b; },
            getIsBlinkWarningActive: () => isBlinkWarningActive,
            getBlinkThreshold: () => blinkThresholdSeconds, // Correct: returns seconds
            getWarnThreshold: () => WARN_THRESHOLD_MS,
            getEnforceThreshold: () => ENFORCE_THRESHOLD_MS,
            setAlertDelay: (d) => { alertDelaySeconds = d; },
            getAlertDelay: () => alertDelaySeconds,
            setFaceLandmarker: (fl) => { faceLandmarker = fl; },
            setLastFaceDetectedTime: (t) => { lastFaceDetectedTime = t; },
            setPlayBeep: (fn) => { playBeep = fn; }
        };
    }
}
