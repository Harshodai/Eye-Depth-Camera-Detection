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

            if (res.blinkTimeout) {
                const val = parseInt(res.blinkTimeout);
                blinkSlider.value = val;
                blinkValDisplay.innerText = val;
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
    chrome.runtime.sendMessage({ type: "UPDATE_DELAY", value: val });
});

// Blink Slider logic
const blinkSlider = document.getElementById("blink-slider");
const blinkValDisplay = document.getElementById("blink-val");

blinkSlider.addEventListener("input", (e) => {
    const val = e.target.value;
    blinkValDisplay.innerText = val;
    chrome.storage.local.set({ blinkTimeout: val });
    chrome.runtime.sendMessage({ type: "UPDATE_BLINK_SETTINGS", value: val });
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

            // CONFIG HANDSHAKE: Ensure backend has the correct slider value immediately
            const currentVal = alertSlider.value;
            chrome.runtime.sendMessage({ type: "UPDATE_DELAY", value: currentVal });
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

// --- 20-20-20 Break Settings Logic ---
const breakToggle = document.getElementById("break-toggle");
const breakSettingsDiv = document.getElementById("break-settings");
const breakInterval = document.getElementById("break-interval");
const breakDuration = document.getElementById("break-duration");
const valInterval = document.getElementById("val-interval");
const valDuration = document.getElementById("val-duration");
const checkNotify = document.getElementById("check-notify");
const checkBlink = document.getElementById("check-blink");
const breakCountdown = document.getElementById("break-countdown");

function syncBreakSettings() {
    chrome.storage.local.get(['breakEnabled', 'breakInterval', 'breakDuration', 'alertNotify', 'alertBlink'], (res) => {
        breakToggle.checked = res.breakEnabled || false;
        breakSettingsDiv.style.display = res.breakEnabled ? "flex" : "none";

        const interval = res.breakInterval || 20;
        const duration = res.breakDuration || 20;

        breakInterval.value = interval;
        breakDuration.value = duration;

        // Update labels
        valInterval.innerText = interval;
        valDuration.innerText = duration;

        checkNotify.checked = res.alertNotify !== false;
        checkBlink.checked = res.alertBlink !== false;

        updateCountdown();

        // KICKSTART: Force background to acknowledge settings immediately
        // This ensures nextBreakTime is set even if background was sleeping
        if (breakToggle.checked) {
            chrome.runtime.sendMessage({
                type: "UPDATE_BREAK_SETTINGS",
                settings: {
                    enabled: true,
                    interval: parseInt(breakInterval.value),
                    duration: parseInt(breakDuration.value),
                    notify: checkNotify.checked,
                    blink: checkBlink.checked
                }
            });
        }
    });
}

function saveBreakSettings() {
    const settings = {
        enabled: breakToggle.checked,
        interval: parseInt(breakInterval.value),
        duration: parseInt(breakDuration.value),
        notify: checkNotify.checked,
        blink: checkBlink.checked
    };

    // Update labels immediately
    valInterval.innerText = settings.interval;
    valDuration.innerText = settings.duration;

    chrome.storage.local.set({
        breakEnabled: settings.enabled,
        breakInterval: settings.interval,
        breakDuration: settings.duration,
        alertNotify: settings.notify,
        alertBlink: settings.blink
    });

    breakSettingsDiv.style.display = settings.enabled ? "flex" : "none";
    chrome.runtime.sendMessage({ type: "UPDATE_BREAK_SETTINGS", settings: settings });
    updateCountdown();
}

breakToggle.addEventListener("change", saveBreakSettings);
breakInterval.addEventListener("input", saveBreakSettings); // Use 'input' for real-time slider updates
breakDuration.addEventListener("input", saveBreakSettings);
checkNotify.addEventListener("change", saveBreakSettings);
checkBlink.addEventListener("change", saveBreakSettings);

function updateCountdown() {
    if (!breakToggle.checked) {
        breakCountdown.innerText = "Next break: --:--";
        return;
    }

    chrome.alarms.get("breakTimer", (alarm) => {
        if (alarm) {
            const now = Date.now();
            const msLeft = alarm.scheduledTime - now;
            displayCountdown(msLeft);
        } else {
            // Fallback: Check for manual timeout (for sub-minute testing)
            chrome.storage.local.get('nextBreakTime', (res) => {
                if (res.nextBreakTime) {
                    const msLeft = res.nextBreakTime - Date.now();
                    displayCountdown(msLeft);
                } else {
                    breakCountdown.innerText = "Next break: --:--";
                }
            });
        }
    });
}

function displayCountdown(msLeft) {
    if (msLeft > 0) {
        const mins = Math.floor(msLeft / 60000);
        const secs = Math.floor((msLeft % 60000) / 1000);
        breakCountdown.innerText = `Next break: ${mins}:${secs.toString().padStart(2, '0')}`;
    } else {
        breakCountdown.innerText = "Next break: Due soon";
    }
}

// Update countdown every second if popup is open
setInterval(updateCountdown, 1000);

syncBreakSettings();
