/** @jest-environment jsdom */

describe('preroll ASR arming', () => {
  beforeEach(() => {
    jest.resetModules();
    localStorage.clear();
    document.body.innerHTML = '';
  });

  test('keeps explicit ASR arm through preroll snapshot', async () => {
    const { appStore } = await import('../../src/state/app-store');
    const { initSession, setSessionPhase } = await import('../../src/state/session');
    const { initPrerollSession } = await import('../../src/features/preroll-session');

    initSession();
    initPrerollSession();

    appStore.set('scrollMode', 'asr' as any);
    appStore.set('prerollSeconds', 0 as any);
    appStore.set('micGranted', false as any);
    appStore.set('micDevice', '' as any);
    appStore.set('session.asrArmed', true as any);

    setSessionPhase('preroll');
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(appStore.get('session.asrArmed')).toBe(true);
    expect(appStore.get('session.asrReady')).toBe(true);
  });
});

