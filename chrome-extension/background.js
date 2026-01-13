// background.js - Manages the offscreen document for persistent monitoring

let isOffscreenCreated = false;

// --- ROBUST MESSAGE HANDLING (Consolidated) ---
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (!request || !request.type) return;

    if (request.type === "START_MONITORING") {
        setupOffscreenDocument();
    } else if (request.type === "STOP_MONITORING") {
        closeOffscreenDocument();
    } else if (request.type === "MINIMIZE_WINDOW") {
        // Target the last focused window
        chrome.windows.getLastFocused({ windowTypes: ['normal'] }, (win) => {
            if (win && win.state !== "minimized") {
                chrome.windows.update(win.id, { state: "minimized" });
            }
        });
    } else if (request.type === "UPDATE_BREAK_SETTINGS") {
        handleBreakSettingsUpdate(request.settings);
    } else if (request.type === "CLOSE_BREAK_PAGE") {
        // Robust closing logic
        handleCloseBreakPage(sender, sendResponse);
        return true; // Keep channel open for async response
    }
});

// --- WINDOW MANAGEMENT & PERSISTENCE ---

function persistBreakState({ windowId, target, duration }) {
    const data = {};
    if (typeof windowId !== 'undefined') data.breakWindowId = windowId;
    if (typeof target !== 'undefined') data.breakTarget = target;
    if (typeof duration !== 'undefined') data.breakDuration = duration;
    chrome.storage.local.set(data);
}

// Clean up storage when window is removed manually
chrome.windows.onRemoved.addListener((id) => {
    chrome.storage.local.get('breakWindowId', (res) => {
        if (res.breakWindowId === id) {
            chrome.storage.local.remove(['breakWindowId', 'breakTarget']);
        }
    });
});

async function openBreakPage() {
    // Query if break page already exists (tab or stored window)
    chrome.storage.local.get(['breakWindowId'], (res) => {
        const storedWin = res && res.breakWindowId;
        if (storedWin) {
            // Check that the window still exists
            chrome.windows.get(storedWin, (w) => {
                if (!chrome.runtime.lastError && w) {
                    // Window exists: focus it
                    chrome.windows.update(storedWin, { focused: true });
                    return;
                }
                // else fall through to create new
                createAndStoreBreak();
            });
        } else {
            // No stored window; also check for any existing tab as fallback:
            chrome.tabs.query({ url: chrome.runtime.getURL("break.html") }, (tabs) => {
                if (tabs && tabs.length) {
                    const t = tabs[0];
                    chrome.windows.update(t.windowId, { focused: true });
                    chrome.tabs.update(t.id, { active: true });
                } else {
                    createAndStoreBreak();
                }
            });
        }
    });

    function createAndStoreBreak() {
        // read duration from storage (fallback to 20)
        chrome.storage.local.get(['breakDuration'], (res) => {
            const duration = Number(res.breakDuration) || 20;
            const target = Date.now() + duration * 1000;
            const url = chrome.runtime.getURL(`break.html?target=${target}&duration=${duration}`);

            // create as popup so it can be reliably closed by windows.remove
            chrome.windows.create({
                url,
                type: 'popup',
                focused: true,
                width: 540,
                height: 760
            }, (win) => {
                if (chrome.runtime.lastError) {
                    console.error("Failed to create break popup", chrome.runtime.lastError);
                    return;
                }
                const windowId = win && win.id;
                persistBreakState({ windowId, target, duration });
            });
        });
    }
}

function handleCloseBreakPage(sender, sendResponse) {
    // Try persisted window id
    chrome.storage.local.get(['breakWindowId'], (res) => {
        const winId = res && res.breakWindowId;
        if (winId) {
            chrome.windows.remove(winId, () => {
                if (chrome.runtime.lastError) {
                    // Fallback to sender tab
                    tryFallbackClose(sender);
                    return;
                }
                // Clear stored id
                chrome.storage.local.remove(['breakWindowId', 'breakTarget']);
                if (sendResponse) sendResponse({ closed: true });
            });
            return;
        }
        // No stored window id: try to remove the sender tab (if available)
        tryFallbackClose(sender);
        if (sendResponse) sendResponse({ closed: true }); // optimistic
    });
}

function tryFallbackClose(sender) {
    // 1) if sender.tab.id exists, remove that tab
    if (sender && sender.tab && Number.isFinite(sender.tab.id)) {
        chrome.tabs.remove(sender.tab.id, () => {
            chrome.storage.local.remove(['breakWindowId', 'breakTarget']);
        });
        return;
    }
    // 2) query for break.html tabs and close them
    chrome.tabs.query({ url: chrome.runtime.getURL("break.html") }, (tabs) => {
        if (tabs && tabs.length) {
            tabs.forEach(t => {
                chrome.tabs.remove(t.id, () => { /* silent */ });
            });
            chrome.storage.local.remove(['breakWindowId', 'breakTarget']);
        }
    });
}

// --- OFFSCREEN DOCUMENT (Keep existing logic) ---

async function setupOffscreenDocument() {
    if (isOffscreenCreated) return;
    const contexts = await chrome.runtime.getContexts({ contextTypes: ['OFFSCREEN_DOCUMENT'] });
    if (contexts.length > 0) {
        isOffscreenCreated = true;
        return;
    }
    await chrome.offscreen.createDocument({
        url: 'offscreen.html',
        reasons: ['USER_MEDIA'],
        justification: 'Real-time eye distance monitoring in the background'
    });
    isOffscreenCreated = true;
}

async function closeOffscreenDocument() {
    if (!isOffscreenCreated) return;
    await chrome.offscreen.closeDocument();
    isOffscreenCreated = false;
}

// --- 20-20-20 Rule Implementation ---

chrome.runtime.onInstalled.addListener(() => {
    chrome.storage.local.get(['breakInterval', 'breakDuration', 'breakEnabled', 'alertSound', 'alertNotify', 'alertBlink'], (res) => {
        if (!res.breakInterval) chrome.storage.local.set({ breakInterval: 10 });
        if (!res.breakDuration) chrome.storage.local.set({ breakDuration: 20 });
        if (typeof res.breakEnabled === 'undefined') chrome.storage.local.set({ breakEnabled: true });
        if (typeof res.alertNotify === 'undefined') chrome.storage.local.set({ alertNotify: true });
        if (typeof res.alertSound === 'undefined') chrome.storage.local.set({ alertSound: true });
        if (typeof res.alertBlink === 'undefined') chrome.storage.local.set({ alertBlink: true });
    });
});

chrome.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name === "breakTimer") {
        triggerBreak();
    }
});

function triggerBreak() {
    chrome.storage.local.get(['breakDuration', 'alertNotify', 'alertSound', 'alertBlink'], (res) => {
        const duration = res.breakDuration || 20;

        if (res.alertNotify) {
            chrome.notifications.create('break-time', {
                type: 'basic',
                iconUrl: 'icon128.png',
                title: 'Time for a Break!',
                message: `Look away for ${duration} seconds to rest your eyes.`,
                buttons: [{ title: 'Show Details' }],
                priority: 2
            });
        }

        if (res.alertBlink) {
            startIconBlink(duration);
        }

        // AUTO-OPEN the break page immediately
        openBreakPage();
    });
}

chrome.notifications.onClicked.addListener((notificationId) => {
    if (notificationId === 'break-time') {
        openBreakPage();
    }
});

chrome.notifications.onButtonClicked.addListener((notificationId, buttonIndex) => {
    if (notificationId === 'break-time' && buttonIndex === 0) {
        openBreakPage();
    }
});

function startIconBlink(durationSecs) {
    let toggled = false;
    const interval = setInterval(() => {
        if (toggled) {
            chrome.action.setBadgeText({ text: "" });
        } else {
            chrome.action.setBadgeText({ text: "REST" });
            chrome.action.setBadgeBackgroundColor({ color: "#f43f5e" });
        }
        toggled = !toggled;
    }, 500);

    setTimeout(() => {
        clearInterval(interval);
        chrome.action.setBadgeText({ text: "" });
    }, durationSecs * 1000);
}

function handleBreakSettingsUpdate(settings) {
    chrome.alarms.clear("breakTimer");

    if (settings.enabled) {
        const intervalSeconds = parseInt(settings.interval);
        chrome.alarms.create("breakTimer", {
            delayInMinutes: intervalSeconds / 60,
            periodInMinutes: intervalSeconds / 60
        });
        console.log(`Break Timer: Scheduled every ${intervalSeconds} seconds via chrome.alarms`);
    }
}

function restoreTimerState() {
    chrome.storage.local.get(['breakEnabled', 'breakInterval'], (res) => {
        const isEnabled = (res.breakEnabled !== false);
        if (isEnabled) {
            handleBreakSettingsUpdate({
                enabled: true,
                interval: res.breakInterval || 10
            });
        }
    });
}

restoreTimerState();
