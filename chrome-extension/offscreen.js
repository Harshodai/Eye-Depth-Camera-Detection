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

// Hardcoded for stability
const ALERT_DELAY_SECONDS = 5;
let closeDistanceStartTime = null;
let lastFaceDetectedTime = 0;
const FACE_LOST_GRACE_MS = 1000;

(async () => {
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
            numFaces: 1
        });

        const stream = await navigator.mediaDevices.getUserMedia({ video: true });
        video.srcObject = stream;
        video.onloadeddata = () => {
            // Small beat to let video dimensions stabilize
            setTimeout(() => {
                setInterval(predictTick, 100);
            }, 500);
        };
    } catch (err) {
        chrome.runtime.sendMessage({ type: "MONITOR_ERROR", error: err.message });
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

                    if (secondsClose >= ALERT_DELAY_SECONDS) {
                        status = "BREACH";
                        chrome.runtime.sendMessage({ type: "MINIMIZE_WINDOW" });
                        closeDistanceStartTime = null; // Reset after one minimize
                    } else {
                        status = "WARNING|" + Math.ceil(ALERT_DELAY_SECONDS - secondsClose);
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
