describe('scroll mode migration and normalization', () => {
  beforeEach(() => {
    localStorage.clear();
    // Reset singleton state between tests by forcing a reload of the module.
    jest.resetModules();
  });

  test('legacy "manual" persists as hybrid via canonical key', () => {
    localStorage.setItem('scrollMode', 'manual');
    jest.isolateModules(() => {
      const { appStore } = require('../../src/state/app-store') as { appStore: any };
      expect(appStore.get('scrollMode')).toBe('hybrid');
      expect(localStorage.getItem('scrollMode')).toBe('hybrid');
    });
  });

  test('legacy tp_scroll_mode key is migrated to canonical scrollMode', () => {
    localStorage.setItem('tp_scroll_mode', 'asr');
    jest.isolateModules(() => {
      const { appStore } = require('../../src/state/app-store') as { appStore: any };
      expect(appStore.get('scrollMode')).toBe('asr');
      expect(localStorage.getItem('scrollMode')).toBe('asr');
      expect(localStorage.getItem('tp_scroll_mode')).toBeNull();
    });
  });

  test('legacy key migrates once and stays canonical thereafter', () => {
    localStorage.setItem('tp_scroll_mode', 'step');
    jest.isolateModules(() => {
      const { appStore } = require('../../src/state/app-store') as { appStore: any };
      expect(appStore.get('scrollMode')).toBe('step');
      expect(localStorage.getItem('scrollMode')).toBe('step');
      expect(localStorage.getItem('tp_scroll_mode')).toBeNull();
    });
    // Second init should not resurrect legacy or change canonical
    jest.isolateModules(() => {
      const { appStore } = require('../../src/state/app-store') as { appStore: any };
      expect(appStore.get('scrollMode')).toBe('step');
      expect(localStorage.getItem('scrollMode')).toBe('step');
      expect(localStorage.getItem('tp_scroll_mode')).toBeNull();
    });
  });
});
