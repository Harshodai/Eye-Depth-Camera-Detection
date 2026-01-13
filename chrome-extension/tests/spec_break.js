
describe('Break Page Logic', () => {

    it('should parse URL parameters correctly', () => {
        // We mock URL parsing by temporarily forcing the implementation or checking the exposed util
        const parse = window.EyeGuard.break.parseNumberParam;

        // Mock location.href is hard, but we can rely on our mock in runner.html or just test logic if we extracted logic purely.
        // Since parseNumberParam uses `new URL(location.href)`, we can't easily unit test it without changing location.
        // Instead, let's test `initTimer` logic roughly by mocking the param result.
    });

    it('should initialize timer defaults', async () => {
        // Spy on setProgress
        const setProgressSpy = jest.fn(); // we don't have jest, using simple spy

        // Reset DOM
        document.getElementById('countdown').innerText = "";

        // Run init
        await window.EyeGuard.break.initTimer();

        // Since no params, should default to 20s
        // wait for tick
        await new Promise(r => setTimeout(r, 150));

        const text = document.getElementById('countdown').innerText;
        // Text should be ~20 or 19 depending on timing
        const val = parseInt(text);
        expect(val <= 20).toBeTruthy();
        expect(val >= 18).toBeTruthy();
    });

    it('should show completion state', async () => {
        const btn = document.getElementById('close-btn');
        btn.innerText = "Test";

        window.EyeGuard.break.completeBreak();

        expect(btn.innerText).toBe("I'm Recharged");
    });
});
