// popup.js - Controller with Alert Delay

const toggleBtn = document.getElementById("toggle-btn");
const distanceReadout = document.getElementById("distance-readout");
const distanceUnitLabel = document.getElementById("distance-unit");
const statusText = document.getElementById("status-text");
const statusBadge = document.getElementById("status-badge");
const monitorCard = document.getElementById("monitor-card");
const alertSlider = document.getElementById("alert-slider");
const sliderValDisplay = document.getElementById("slider-val");

let isMonitoringState = false;

// Initial state sync - Immediate & Persistent
function syncInitialState() {
    if (chrome && chrome.storage && chrome.storage.local) {
        chrome.storage.local.get(['isMonitoring', 'alertDelay'], (res) => {
            if (res.isMonitoring) {
                isMonitoringState = true;
                updateToActiveUI();
            } else {
                updateToIdleUI();
            }

            if (res.alertDelay) {
                const val = parseInt(res.alertDelay);
                alertSlider.value = val;
                sliderValDisplay.innerText = val;
            }
        });
    }
}

// Run sync immediately
syncInitialState();

// Slider update logic
alertSlider.addEventListener("input", (e) => {
    const val = e.target.value;
    sliderValDisplay.innerText = val;
    chrome.storage.local.set({ alertDelay: val });
});

function updateToActiveUI() {
    toggleBtn.innerText = "Stop Protection";
    toggleBtn.classList.add("active");
    statusBadge.classList.add("active");
    statusText.innerText = "Connecting...";
}

function updateToIdleUI() {
    toggleBtn.innerText = "Start Protection";
    toggleBtn.classList.remove("active");
    statusBadge.classList.remove("active");
    statusBadge.classList.remove("is-warning");
    statusText.innerText = "System IDLE";
    distanceReadout.innerText = "--";
    distanceUnitLabel.innerText = "Monitoring Off";
    distanceReadout.style.color = "inherit";
}

// Global listener for monitoring updates
chrome.runtime.onMessage.addListener((msg) => {
    if (!isMonitoringState) return;

    if (msg.type === "MONITOR_UPDATE") {
        const { status, distance } = msg;

        if (distance !== null && distance !== undefined) {
            distanceReadout.innerText = distance;
            distanceUnitLabel.innerText = "cm to screen";
        }

        if (status === "SAFE") {
            statusText.innerText = "Good";
            statusBadge.className = "status-badge active";
            monitorCard.classList.remove("is-warning");
            monitorCard.classList.add("active-safe");
            distanceReadout.style.color = "#4ade80";
        } else if (status.startsWith("WARNING")) {
            const timeLeft = status.split("|")[1] || alertSlider.value;
            statusText.innerText = `Please move back (${timeLeft}s)`;
            statusBadge.className = "status-badge is-warning";
            monitorCard.classList.add("is-warning");
            monitorCard.classList.remove("active-safe");
            distanceReadout.style.color = "#f43f5e";
        } else if (status === "BREACH") {
            statusText.innerText = "Breach! Minimizing...";
            statusBadge.className = "status-badge is-warning";
            monitorCard.classList.add("is-warning");
            monitorCard.classList.remove("active-safe");
            distanceReadout.style.color = "#f43f5e";
        } else if (status === "LOOKING") {
            statusText.innerText = "Scanning...";
            statusBadge.className = "status-badge active";
            monitorCard.classList.remove("active-safe");
            distanceReadout.innerText = "--";
            distanceUnitLabel.innerText = "Finding face";
            distanceReadout.style.color = "inherit";
        }
    } else if (msg.type === "MONITOR_ERROR") {
        statusText.innerText = "Camera Error";
        statusBadge.className = "status-badge is-warning";
        isMonitoringState = false;
        chrome.storage.local.set({ isMonitoring: false });
        updateToIdleUI();
    }
});

toggleBtn.addEventListener("click", async () => {
    if (isMonitoringState) {
        isMonitoringState = false;
        chrome.storage.local.set({ isMonitoring: false });
        chrome.runtime.sendMessage({ type: "STOP_MONITORING" });
        updateToIdleUI();
    } else {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ video: true });
            stream.getTracks().forEach(t => t.stop());

            isMonitoringState = true;
            chrome.storage.local.set({ isMonitoring: true });
            chrome.runtime.sendMessage({ type: "START_MONITORING" });
            updateToActiveUI();

            // Safety fallback: if still connecting after 15s, reset
            setTimeout(() => {
                if (isMonitoringState && statusText.innerText === "Connecting...") {
                    statusText.innerText = "Connection Timed Out";
                    setTimeout(updateToIdleUI, 2000);
                }
            }, 15000);
        } catch (err) {
            chrome.tabs.create({ url: 'setup.html' });
        }
    }
});
