
// Minimal Test Framework
window.tests = [];
window.results = { passed: 0, failed: 0 };

let currentBeforeEach = null;
let currentAfterEach = null;

function beforeEach(fn) { currentBeforeEach = fn; }
function afterEach(fn) { currentAfterEach = fn; }

function describe(name, fn) {
    currentBeforeEach = null;
    currentAfterEach = null;
    console.log(`%c${name}`, 'font-weight: bold; font-size: 14px; color: #38bdf8;');
    fn();
}

function it(name, fn) {
    const setup = currentBeforeEach;
    const teardown = currentAfterEach;
    window.tests.push({
        name,
        fn: async () => {
            if (setup) await setup();
            await fn();
            if (teardown) await teardown();
        }
    });
}

function expect(actual) {
    return {
        toBe: (expected) => {
            if (actual !== expected) throw new Error(`Expected ${expected} but got ${actual}`);
        },
        toEqual: (expected) => {
            if (JSON.stringify(actual) !== JSON.stringify(expected)) throw new Error(`Expected ${JSON.stringify(expected)} but got ${JSON.stringify(actual)}`);
        },
        toBeTruthy: () => {
            if (!actual) throw new Error(`Expected truthy but got ${actual}`);
        },
        toBeCloseTo: (expected, delta = 100) => {
            if (Math.abs(actual - expected) > delta) throw new Error(`Expected ${expected} +/- ${delta} but got ${actual}`);
        },
        toBeLessThan: (limit) => {
            if (!(actual < limit)) throw new Error(`Expected ${actual} to be less than ${limit}`);
        },
        toBeGreaterThan: (limit) => {
            if (!(actual > limit)) throw new Error(`Expected ${actual} to be greater than ${limit}`);
        }
    };
}

async function runTests() {
    const list = document.getElementById('test-list');

    for (const test of window.tests) {
        const item = document.createElement('li');
        item.className = 'test-item';

        try {
            await test.fn();
            item.classList.add('pass');
            item.innerHTML = `✅ ${test.name}`;
            window.results.passed++;
        } catch (e) {
            item.classList.add('fail');
            item.innerHTML = `❌ ${test.name} <div style="font-size:0.8em; color:#f87171; margin-top:4px;">${e.message}</div>`;
            window.results.failed++;
            console.error(e);
        }

        list.appendChild(item);
    }

    document.getElementById('summary').innerText =
        `Tests: ${window.results.passed + window.results.failed} | Passed: ${window.results.passed} | Failed: ${window.results.failed}`;

    if (window.results.failed === 0) {
        document.getElementById('summary').style.color = '#4ade80';
    } else {
        document.getElementById('summary').style.color = '#f87171';
    }
}
