// offscreen.js - Reliable Background Monitor (Simplified)

// 1. SUPPRESS NOISY LOGS
const originalLog = console.log;
const originalWarn = console.warn;
const originalInfo = console.info;

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

let faceLandmarker;
const video = document.getElementById("webcam");
const INTERPUPILLARY_DISTANCE_CM = 6.3;
const FOCAL_LENGTH = 1100;
const SAFE_DISTANCE_CM = 76; // 2.5 Feet

let alertDelaySeconds = 5;
let closeDistanceStartTime = null;
let lastFaceDetectedTime = 0;
const FACE_LOST_GRACE_MS = 1000;

(async () => {
    // 1. IMMEDIATE STARTUP ACTIONS
    // Notify Popup immediately to clear "Connecting..."
    chrome.runtime.sendMessage({ type: "MONITOR_UPDATE", status: "LOOKING" });

    // Register Direct Message Listener for Slider

    // Alert Sound Handling
    // Actually, I should check if I have a sound file. If not, I can generate a beep or use a placeholder.
    // For now, let's assume I need to create a simple beep using Web Audio API to avoid external dependencies.

    const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    function playBeep() {
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
    }

    chrome.runtime.onMessage.addListener((msg) => {
        if (msg.type === "UPDATE_DELAY") {
            const val = parseInt(msg.value);
            if (!isNaN(val)) {
                alertDelaySeconds = val;
                originalLog("Slider Update:", val);
            }
        } else if (msg.type === "PLAY_ALERT_SOUND") {
            playBeep();
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
        const res = await new Promise(r => chrome.storage.local.get(['alertDelay'], r));
        if (res && res.alertDelay !== undefined) {
            const parsed = parseInt(res.alertDelay);
            alertDelaySeconds = isNaN(parsed) ? 5 : parsed;
            originalLog("EyeVision Guard: Initial delay loaded", alertDelaySeconds);
        }

        // chrome.storage.onChanged removed to prevent 'undefined' errors.
        // We rely on chrome.runtime.onMessage for real-time updates.
    }

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

function predictTick() {
    if (!faceLandmarker || video.readyState < 2 || video.videoWidth === 0) return;

    try {
        const results = faceLandmarker.detectForVideo(video, Date.now());
        let status = "ACTIVE";
        let distance = null;
        const now = Date.now();

        if (results.faceLandmarks && results.faceLandmarks.length > 0) {
            lastFaceDetectedTime = now;
            const landmarks = results.faceLandmarks[0];
            const leftIris = landmarks[468];
            const rightIris = landmarks[473];

            if (leftIris && rightIris) {
                const pxDist = Math.sqrt(
                    Math.pow((leftIris.x - rightIris.x) * video.videoWidth, 2) +
                    Math.pow((leftIris.y - rightIris.y) * video.videoHeight, 2)
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
        } else {
            status = "LOOKING";
            // Grace period for blinking or fast movement
            if (now - lastFaceDetectedTime > FACE_LOST_GRACE_MS) {
                closeDistanceStartTime = null;
            }
        }

        chrome.runtime.sendMessage({
            type: "MONITOR_UPDATE",
            status: status,
            distance: distance
        });
    } catch (e) { }
}
