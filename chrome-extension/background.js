// background.js - Manages the offscreen document for persistent monitoring

let isOffscreenCreated = false;

// Listen for messages from popup or offscreen
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.type === "START_MONITORING") {
        setupOffscreenDocument();
    } else if (request.type === "STOP_MONITORING") {
        closeOffscreenDocument();
    } else if (request.type === "MINIMIZE_WINDOW") {
        // More robust: target the last focused window or current
        chrome.windows.getLastFocused({ windowTypes: ['normal'] }, (win) => {
            if (win && win.state !== "minimized") {
                chrome.windows.update(win.id, { state: "minimized" });
            }
        });
    }
});

async function setupOffscreenDocument() {
    if (isOffscreenCreated) return;

    // Check if offscreen exists
    const contexts = await chrome.runtime.getContexts({
        contextTypes: ['OFFSCREEN_DOCUMENT']
    });

    if (contexts.length > 0) {
        isOffscreenCreated = true;
        return;
    }

    await chrome.offscreen.createDocument({
        url: 'offscreen.html',
        reasons: ['USER_MEDIA'], // For camera access
        justification: 'Real-time eye distance monitoring in the background'
    });

    isOffscreenCreated = true;
}

async function closeOffscreenDocument() {
    if (!isOffscreenCreated) return;

    await chrome.offscreen.closeDocument();
    isOffscreenCreated = false;
}
