// popup.js - Simplified & Robust Controller

const toggleBtn = document.getElementById("toggle-btn");
const distanceReadout = document.getElementById("distance-readout");
const distanceUnitLabel = document.getElementById("distance-unit");
const statusText = document.getElementById("status-text");
const statusBadge = document.getElementById("status-badge");
const monitorCard = document.getElementById("monitor-card");

let isMonitoringState = false;

// Initial state sync with storage
if (chrome && chrome.storage && chrome.storage.local) {
    chrome.storage.local.get(['isMonitoring'], (res) => {
        if (res.isMonitoring) {
            isMonitoringState = true;
            updateToActiveUI();
        } else {
            updateToIdleUI();
        }
    });
}

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

        // Show distance if it's available
        if (distance !== null && distance !== undefined) {
            distanceReadout.innerText = distance;
            distanceUnitLabel.innerText = "cm to screen";
        }

        if (status === "SAFE") {
            statusText.innerText = "Good";
            statusBadge.className = "status-badge active";
            monitorCard.classList.remove("is-warning");
            distanceReadout.style.color = "#4ade80"; // Bright Green
        } else if (status.startsWith("WARNING")) {
            const timeLeft = status.split("|")[1] || "5";
            statusText.innerText = `Please move back (${timeLeft}s)`;
            statusBadge.className = "status-badge is-warning";
            monitorCard.classList.add("is-warning");
            distanceReadout.style.color = "#f43f5e"; // Rose Red
        } else if (status === "LOOKING") {
            statusText.innerText = "Scanning...";
            statusBadge.className = "status-badge active";
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
        // STOP MONITORING
        isMonitoringState = false;
        chrome.storage.local.set({ isMonitoring: false });
        chrome.runtime.sendMessage({ type: "STOP_MONITORING" });
        updateToIdleUI();
    } else {
        // START MONITORING
        try {
            // Quick permission check before launching offscreen
            const stream = await navigator.mediaDevices.getUserMedia({ video: true });
            stream.getTracks().forEach(t => t.stop()); // Stop immediately, offscreen will handle it

            isMonitoringState = true;
            chrome.storage.local.set({ isMonitoring: true });
            chrome.runtime.sendMessage({ type: "START_MONITORING" });
            updateToActiveUI();
        } catch (err) {
            console.error("Permission denied or camera busy:", err);
            // Open setup page if camera fails
            chrome.tabs.create({ url: 'setup.html' });
        }
    }
});
