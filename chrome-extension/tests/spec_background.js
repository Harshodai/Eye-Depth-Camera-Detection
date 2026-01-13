
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

});
