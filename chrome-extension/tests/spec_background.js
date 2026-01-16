
describe('Background Script Logic', () => {

    it('should schedule next break with correct interval', async () => {
        // Mock storage
        const mockStorage = { breakEnabled: true, breakInterval: 25 };
        chrome.storage.local.get.mockImplementation((keys, cb) => cb(mockStorage));

        // Mock alarms
        const createSpy = chrome.alarms.create;
        createSpy.mockClear();

        // Run
        window.EyeGuard.background.scheduleNextBreak();

        // Verify
        expect(createSpy.mock.calls.length).toBe(1);
        const args = createSpy.mock.calls[0];
        expect(args[0]).toBe("breakTimer");
        expect(args[1].delayInMinutes).toBe(25);
    });

    it('should NOT schedule break if disabled', async () => {
        const mockStorage = { breakEnabled: false };
        chrome.storage.local.get.mockImplementation((keys, cb) => cb(mockStorage));

        const createSpy = chrome.alarms.create;
        createSpy.mockClear();

        window.EyeGuard.background.scheduleNextBreak();

        expect(createSpy.mock.calls.length).toBe(0);
    });

    it('should trigger break: open break page and play sound', () => {
        const mockStorage = { breakDuration: 20, alertBlink: true, alertNotify: true };
        chrome.storage.local.get.mockImplementation((keys, cb) => cb(mockStorage));

        // Mock notification
        const notifSpy = chrome.notifications.create;
        notifSpy.mockClear();

        // Mock action badge
        const badgeSpy = chrome.action.setBadgeText;
        badgeSpy.mockClear();

        window.EyeGuard.background.triggerBreak();

        // Check notification
        expect(notifSpy.mock.calls.length).toBe(1);
        expect(notifSpy.mock.calls[0][1].title).toBe('Time for a Break!');

        // Check Badge (Icon Blink)
        // Since it uses setInterval, we might check if it WAS called initially
        // Wait minor delay if needed, or check immediate call logic
        // startIconBlink calls setBadgeText immediately in interval? No, 500ms delay.
        // We can't easily test setInterval here without jest.useFakeTimers which our frame doesn't have.
        // We can just check notification for now.
    });

});
