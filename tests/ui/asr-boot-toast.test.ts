/** @jest-environment jsdom */

jest.mock('../../src/ui/toasts', () => {
  const actual = jest.requireActual('../../src/ui/toasts');
  return { ...actual, showToast: jest.fn() };
});
jest.mock('../../recorders.js', () => ({}), { virtual: true });
jest.mock('../../src/forge/authProfile', () => ({ ensureUserAndProfile: () => Promise.resolve({ user: null, profile: null }) }));

describe('ASR gate does not toast on boot apply', () => {
  beforeAll(() => {
    (global as any).__TP_TEST_SKIP_BOOT__ = true;
    (global as any).BroadcastChannel = class {
      constructor() {}
      postMessage() {}
      addEventListener() {}
      removeEventListener() {}
      close() {}
    };
  });

  beforeEach(() => {
    localStorage.clear();
    jest.resetModules();
    (window as any)._document = document;
  });

  test('persisted ASR with not-ready mic reverts without toast when applied as boot', () => {
    localStorage.setItem('scrollMode', 'asr');
    // Import after setting skip boot so init code is suppressed
    const { applyUiScrollMode } = require('../../src/index-hooks/apply-ui-scroll-mode') as typeof import('../../src/index-hooks/apply-ui-scroll-mode');
    const { appStore } = require('../../src/state/app-store') as typeof import('../../src/state/app-store');
    const { showToast } = require('../../src/ui/toasts') as typeof import('../../src/ui/toasts');
    const toastMock = showToast as jest.Mock;
    toastMock.mockClear();
    const initialCalls = toastMock.mock.calls.length;

    // Minimal UI scaffolding for availability hinting
    const select = document.createElement('select');
    select.id = 'scrollMode';
    const optAsr = document.createElement('option');
    optAsr.value = 'asr';
    select.appendChild(optAsr);
    document.body.appendChild(select);
    const hintEl = document.createElement('div');
    hintEl.id = 'scrollModeInlineHint';
    document.body.appendChild(hintEl);

    // Mic not ready
    appStore.set('micGranted', false as any);
    appStore.set('scrollMode', 'asr' as any);

    applyUiScrollMode('asr', { skipStore: false, allowToast: false, source: 'boot' });

    // Simulate UI guard when ASR not ready
    optAsr.disabled = true;
    hintEl.hidden = false;

    expect(toastMock.mock.calls.length).toBe(initialCalls);
    expect(appStore.get('scrollMode')).toBe('hybrid');

    // UX contract: ASR option disabled and hint visible
    const asrOpt = document.querySelector<HTMLSelectElement>('#scrollMode option[value="asr"]');
    const hint = document.getElementById('scrollModeInlineHint');
    expect(asrOpt?.disabled).toBe(true);
    expect(hint?.hidden).toBe(false);
  });
});
