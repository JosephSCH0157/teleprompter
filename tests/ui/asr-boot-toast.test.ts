/** @jest-environment jsdom */

jest.mock('../../src/ui/toasts', () => {
  const actual = jest.requireActual('../../src/ui/toasts');
  return { ...actual, showToast: jest.fn() };
});

describe('ASR gate does not toast on boot apply', () => {
  beforeAll(() => {
    (global as any).__TP_SKIP_BOOT = true;
  });

  beforeEach(() => {
    localStorage.clear();
    jest.resetModules();
  });

  test('persisted ASR with not-ready mic reverts without toast when applied as boot', () => {
    localStorage.setItem('scrollMode', 'asr');
    // Import after setting skip boot so init code is suppressed
    const { applyUiScrollMode, appStore } = require('../../src/index') as typeof import('../../src/index');
    const { showToast } = require('../../src/ui/toasts') as typeof import('../../src/ui/toasts');

    // Mic not ready
    appStore.set('micGranted', false as any);
    appStore.set('scrollMode', 'asr' as any);

    applyUiScrollMode('asr', { skipStore: false, allowToast: false, source: 'boot' });

    expect(showToast).not.toHaveBeenCalled();
    expect(appStore.get('scrollMode')).toBe('hybrid');
  });
});
