// blink.js

// Notify background that we are open (optional, but good for state sync)
chrome.runtime.sendMessage({ type: "BLINK_PAGE_OPENED" });

// Listen for close command directly (redundant if background closes window, but safe)
chrome.runtime.onMessage.addListener((msg) => {
    if (msg.type === "CLOSE_BLINK_PAGE") {
        window.close();
    }
});
