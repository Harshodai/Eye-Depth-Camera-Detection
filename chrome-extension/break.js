const countdownEl = document.getElementById('countdown');
const progressCircle = document.getElementById('progress-circle');
const closeBtn = document.getElementById('close-btn');
const circumference = 2 * Math.PI * 80; // circle radius is 80

progressCircle.style.strokeDasharray = `${circumference}`;

let timerHandle = null;

function setProgress(percent) {
    const clamped = Math.max(0, Math.min(100, percent));
    const offset = (1 - clamped / 100) * circumference;
    progressCircle.style.strokeDashoffset = offset;
}

function parseNumberParam(name) {
    try {
        const url = new URL(location.href);
        const v = url.searchParams.get(name);
        if (!v) return null;
        const n = Number(v);
        return Number.isFinite(n) ? n : null;
    } catch (e) {
        return null;
    }
}

async function getTargetFromStorage() {
    return new Promise((resolve) => {
        // Timeout logic to prevent hanging
        const timeout = setTimeout(() => {
            resolve(null);
        }, 500); // 500ms timeout

        if (typeof chrome === 'undefined' || !chrome.storage) {
            clearTimeout(timeout);
            return resolve(null);
        }

        try {
            chrome.storage.local.get(['breakTarget', 'breakDuration'], (res) => {
                clearTimeout(timeout);
                if (chrome.runtime.lastError) return resolve(null);
                const t = res.breakTarget ? Number(res.breakTarget) : null;
                const d = res.breakDuration ? Number(res.breakDuration) : null;
                resolve({ target: t, duration: d });
            });
        } catch (e) {
            clearTimeout(timeout);
            resolve(null);
        }
    });
}

async function initTimer() {
    // 1) Prefer URL params
    let target = parseNumberParam('target');
    let duration = parseNumberParam('duration');

    // 2) Fallback to persisted values if no URL param
    if (!target) {
        try {
            const stored = await getTargetFromStorage();
            if (stored && stored.target) {
                if (stored.target > Date.now()) {
                    target = stored.target;
                    duration = duration || stored.duration;
                } else {
                    target = null;
                }
            }
        } catch (e) {
            console.error("Storage access error", e);
        }
    }

    // 3) Final fallback: start a new timer
    if (!target || !Number.isFinite(target)) {
        const fallbackDuration = (duration && Number.isFinite(duration)) ? duration : 20;
        duration = fallbackDuration;
        target = Date.now() + fallbackDuration * 1000;
    } else {
        if (!duration) {
            duration = 20;
        }
    }

    duration = Math.max(1, duration);
    const totalMs = duration * 1000;

    if (timerHandle) clearInterval(timerHandle);

    function tick() {
        const now = Date.now();
        const msLeft = Math.max(0, target - now);
        const secLeft = Math.ceil(msLeft / 1000);

        // UI
        countdownEl.innerText = msLeft > 0 ? secLeft : '✓';

        let percent = (msLeft / totalMs) * 100;
        percent = Math.min(100, Math.max(0, percent));

        setProgress(percent);

        if (msLeft <= 0) {
            clearInterval(timerHandle);
            timerHandle = null;
            completeBreak();
        }
    }

    tick();
    timerHandle = setInterval(tick, 100);
}

function closeWindow() {
    try {
        window.close();
    } catch (e) { }

    if (typeof chrome !== 'undefined' && chrome.runtime) {
        chrome.runtime.sendMessage({ type: "CLOSE_BREAK_PAGE" });
    }
}

function completeBreak() {
    closeBtn.innerText = "I'm Recharged";
    closeBtn.style.background = "#fff";
    closeBtn.style.color = "#0ea5e9";
    closeBtn.animate([
        { transform: 'scale(1)' },
        { transform: 'scale(1.05)' },
        { transform: 'scale(1)' }
    ], {
        duration: 1000,
        iterations: Infinity
    });

    // Auto-close after 3 seconds
    setTimeout(() => {
        closeWindow();
    }, 3000);
}

// Close logic
closeBtn.addEventListener('click', closeWindow);

// Start
initTimer();
