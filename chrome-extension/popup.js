import {
    FaceLandmarker,
    FilesetResolver
} from "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.0";

const video = document.getElementById("webcam");
const canvasElement = document.getElementById("output_canvas");
const canvasCtx = canvasElement.getContext("2d");
const toggleBtn = document.getElementById("toggle-btn");
const distanceReadout = document.getElementById("distance-readout");
const statusText = document.getElementById("status-text");
const videoContainer = document.getElementById("video-container");

let faceLandmarker;
let runningMode = "VIDEO";
let lastVideoTime = -1;
let isMonitoring = false;

// Constants from Python port
const INTERPUPILLARY_DISTANCE_CM = 6.3;
const FOCAL_LENGTH = 1100; // Calibrated for average webcam
const SAFE_DISTANCE_CM = 76; // 2.5 feet

async function initializeFaceLandmarker() {
    statusText.innerText = "Checking local resources...";

    // Check if the model is already in the extension folder (fastest)
    const modelUrl = chrome.runtime.getURL("face_landmarker.task");
    let modelPath = modelUrl;

    try {
        const response = await fetch(modelUrl, { method: 'HEAD' });
        if (!response.ok) {
            statusText.innerText = "Downloading AI Model (One-time)...";
            modelPath = "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task";
        }
    } catch (e) {
        modelPath = "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task";
    }

    const filesetResolver = await FilesetResolver.forVisionTasks(
        "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.0/wasm"
    );

    faceLandmarker = await FaceLandmarker.createFromOptions(filesetResolver, {
        baseOptions: {
            modelAssetPath: modelPath,
            delegate: "GPU"
        },
        outputFaceBlendshapes: true,
        runningMode: runningMode,
        numFaces: 1
    });

    statusText.innerText = "AI Model Ready";
}

async function predictWebcam() {
    if (!isMonitoring) return;

    if (video.currentTime !== lastVideoTime) {
        lastVideoTime = video.currentTime;
        const results = faceLandmarker.detectForVideo(video, Date.now());

        if (results.faceLandmarks) {
            for (const landmarks of results.faceLandmarks) {
                // Indices for irises in Face Landmarker (approximate for pixel distance)
                // Left iris: 468, Right iris: 473
                const leftIris = landmarks[468];
                const rightIris = landmarks[473];

                if (leftIris && rightIris) {
                    // Calculate pixel distance
                    const pxDist = Math.sqrt(
                        Math.pow((leftIris.x - rightIris.x) * video.videoWidth, 2) +
                        Math.pow((leftIris.y - rightIris.y) * video.videoHeight, 2)
                    );

                    // Triangle Similarity: D = (W * F) / P
                    const distanceCm = (INTERPUPILLARY_DISTANCE_CM * FOCAL_LENGTH) / pxDist;

                    updateUI(distanceCm);
                }
            }
        }
    }
    window.requestAnimationFrame(predictWebcam);
}

function updateUI(distanceCm) {
    distanceReadout.innerText = `${distanceCm.toFixed(1)} cm`;

    if (distanceCm < SAFE_DISTANCE_CM) {
        distanceReadout.classList.add("warning");
        statusText.innerText = "TOO CLOSE!";
        statusText.style.color = "#ef4444";
    } else {
        distanceReadout.classList.remove("warning");
        statusText.innerText = "Safe Distance";
        statusText.style.color = "#22c55e";
    }
}

toggleBtn.addEventListener("click", async () => {
    if (isMonitoring) {
        isMonitoring = false;
        toggleBtn.innerText = "Start Monitoring";
        videoContainer.style.display = "none";
        const stream = video.srcObject;
        const tracks = stream.getTracks();
        tracks.forEach(track => track.stop());
    } else {
        if (!faceLandmarker) {
            statusText.innerText = "Loading AI Model...";
            await initializeFaceLandmarker();
        }

        navigator.mediaDevices.getUserMedia({ video: true }).then((stream) => {
            video.srcObject = stream;
            video.addEventListener("loadeddata", () => {
                isMonitoring = true;
                toggleBtn.innerText = "Stop Monitoring";
                videoContainer.style.display = "block";
                predictWebcam();
            });
        });
    }
});
