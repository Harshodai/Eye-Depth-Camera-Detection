const offscreen = window.EyeGuard.offscreen;

describe('EyeVision Guard Offscreen Logic', function () {
    let sendMessageSpy;
    let playBeepMock;
    let originalSendMessage;

    // Helper to create mock landmarks
    function createMockLandmarks(earValue) {
        // EAR = (p2-p6 + p3-p5) / (2 * p1-p4)
        // We need 6 points: 33, 160, 158, 133, 153, 144
        // Simplified: 
        // Horizontal: 33 (0) -> 133 (3)
        // Vertical 1: 160 (1) -> 144 (5)
        // Vertical 2: 158 (2) -> 153 (4)

        // Horizontal: 0 and 3
        const p0 = { x: 0, y: 0 };
        const p3 = { x: 100, y: 0 }; // Distance = 100

        // Initial State
        // IMPORTANT: Set height=width (640) to match Mock Landmark simple geometry (EAR math assumes square pixels)
        const video = { readyState: 4, videoWidth: 640, videoHeight: 640 };
        // Vertical 1: 1 and 5
        const p1 = { x: 50, y: 0 };
        const p5 = { x: 50, y: earValue * 100 }; // Distance = earValue * 100

        // Vertical 2: 2 and 4
        const p2 = { x: 50, y: 0 };
        const p4 = { x: 50, y: earValue * 100 }; // Distance = earValue * 100

        const landmarks = [];
        // Fill array with dummy objects
        for (let i = 0; i < 500; i++) landmarks.push({ x: 0, y: 0 });

        // Map indices
        // 33
        landmarks[33] = p0;
        // 133
        landmarks[133] = p3;
        // 160
        landmarks[160] = p1;
        // 144
        landmarks[144] = p5;
        // 158
        landmarks[158] = p2;
        // 153
        landmarks[153] = p4;

        // Iris for distance (Safe Distance > 76cm)
        // pxDist must be < 91px (for 640 width).
        // 0.1 * 640 = 64px. Dist = 108cm (Safe).
        landmarks[468] = { x: 0.45, y: 0 };
        landmarks[473] = { x: 0.55, y: 0 };

        return landmarks;
    }

    beforeEach(() => {
        // Reset state
        offscreen.setLastBlinkTime(Date.now());
        if (offscreen.setLastFaceDetectedTime) offscreen.setLastFaceDetectedTime(Date.now());
        // Should update lastBlinkTime to now
        const newBlink = offscreen.getLastBlinkTime();
        // It should be extremely close to "now" (delta < 100ms)
        // Using abs to be safe, though OLD link implies it should be newer
        expect(Math.abs(Date.now() - newBlink)).toBeLessThan(100);

        offscreen.setIsBlinkWarningActive(false);
        offscreen.updateBlinkThresholds(10);

        // Manual mock since framework doesn't support spyOn
        sendMessageSpy = jest.fn((msg) => {
            console.error('MOCK_SEND_MESSAGE:', JSON.stringify(msg));
        });
        if (!originalSendMessage && window.chrome.runtime.sendMessage) {
            originalSendMessage = window.chrome.runtime.sendMessage;
        }
        window.chrome.runtime.sendMessage = sendMessageSpy;

        // Mock playBeep
        window.playBeep = jest.fn();

        // Mock the FaceLandmarker
        offscreen.setFaceLandmarker({
            detectForVideo: (video, time) => {
                return { faceLandmarks: [window.mockLandmarks] };
            }
        });

        // Mock Video Element state
        const video = document.getElementById("webcam");
        Object.defineProperty(video, 'readyState', { value: 4, configurable: true });
        Object.defineProperty(video, 'videoWidth', { value: 640, configurable: true });
        Object.defineProperty(video, 'videoHeight', { value: 640, configurable: true });
        this.originalPlayBeep = window.playBeep;
        window.playBeep = jest.fn();
    });

    afterEach(() => {
        if (originalSendMessage) window.chrome.runtime.sendMessage = originalSendMessage;
        if (this.originalPlayBeep) window.playBeep = this.originalPlayBeep;
        window.mockLandmarks = null;
    });

    // --- TESTS ---

    it('calculateEAR: computes correct ratio', () => {
        // EAR of 0.3 means eyes open
        const landmarks = createMockLandmarks(0.3);
        const indices = [33, 160, 158, 133, 153, 144];
        const ear = offscreen.calculateEAR(landmarks, indices, 1, 1);
        expect(ear).toBeCloseTo(0.3, 0.001);
    });

    it('calculateEAR: handles zero width (division by zero)', () => {
        const landmarks = createMockLandmarks(0.3);
        landmarks[33] = { x: 0, y: 0 };
        landmarks[133] = { x: 0, y: 0 };
        const indices = [33, 160, 158, 133, 153, 144];
        const ear = offscreen.calculateEAR(landmarks, indices, 1, 1);
        expect(ear).toBe(0);
    });

    it('predictTick: updates thresholds properly', () => {
        offscreen.updateBlinkThresholds(5);
        expect(offscreen.getBlinkThreshold()).toBe(5);
        expect(offscreen.getWarnThreshold()).toBe(5000);
        expect(offscreen.getEnforceThreshold()).toBe(5000); // 5000 wait
    });

    it('predictTick: triggers blink reset when eyes closed', () => {
        window.mockLandmarks = createMockLandmarks(0.1);
        offscreen.setIsBlinkWarningActive(true);
        offscreen.predictTick();
        const calls = sendMessageSpy.mock.calls.filter(args => args[0].type === 'RESET_BLINK');
        expect(calls.length).toBe(1);
        expect(offscreen.getIsBlinkWarningActive()).toBe(false);
    });

    it('predictTick: triggers WARNING when timer exceeded', () => {
        window.mockLandmarks = createMockLandmarks(0.3);
        offscreen.setLastBlinkTime(Date.now() - 11000);
        offscreen.predictTick();
        const calls = sendMessageSpy.mock.calls.filter(args => args[0].type === 'WARN_BLINK');
        expect(calls.length).toBe(1);
        expect(offscreen.getIsBlinkWarningActive()).toBe(true);
    });

    it('predictTick: triggers ENFORCE when timer exceeded', () => {
        window.mockLandmarks = createMockLandmarks(0.3);
        offscreen.updateBlinkThresholds(2);
        // Set wait > Warn + 5s. If warn=2s, enforce=7s(?). Wait 15s to be safe.
        offscreen.setLastBlinkTime(Date.now() - 15000);
        offscreen.setIsBlinkWarningActive(true);
        offscreen.predictTick();
        const calls = sendMessageSpy.mock.calls.filter(args => args[0].type === 'ENFORCE_BLINK');
        expect(calls.length).toBe(1);
    });

    it('predictTick: triggers BREACH when too close', () => {
        window.mockLandmarks = createMockLandmarks(0.3);
        window.mockLandmarks[468] = { x: 0.4, y: 0.5 };
        window.mockLandmarks[473] = { x: 0.6, y: 0.5 };
        offscreen.setAlertDelay(0);
        offscreen.predictTick();
        const calls = sendMessageSpy.mock.calls.filter(args => args[0].type === 'MONITOR_UPDATE' && args[0].status === 'BREACH');
        expect(calls.length).toBe(1);
        expect(calls[0][0].distance).toBeLessThan(76);
    });

    it('predictTick: resets blink timer if face lost (Grace Period)', () => {
        offscreen.setFaceLandmarker({ detectForVideo: () => ({ faceLandmarks: [] }) });
        const oldLink = Date.now() - 11000;
        offscreen.setLastBlinkTime(oldLink);

        // Force face lost time to be > 1000ms ago
        if (offscreen.setLastFaceDetectedTime) offscreen.setLastFaceDetectedTime(Date.now() - 2000);

        offscreen.predictTick();
        const newBlink = offscreen.getLastBlinkTime();

        // Should have reset to "now"
        expect(Math.abs(Date.now() - newBlink)).toBeLessThan(100);
    });
});
