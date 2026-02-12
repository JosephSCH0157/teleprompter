/** @jest-environment jsdom */

describe('speech start arming', () => {
  beforeEach(() => {
    jest.resetModules();
    localStorage.clear();
    document.body.innerHTML = '<button id="recBtn" type="button">Start speech sync</button>';
  });

  test('clicking Start speech sync in ASR mode arms session ASR', async () => {
    const { appStore } = await import('../../src/state/app-store');
    const { initSession } = await import('../../src/state/session');
    const { installSpeech } = await import('../../src/features/speech-loader');

    initSession();
    (window as any).__tpStore = appStore;
    appStore.set('scrollMode', 'asr' as any);

    installSpeech();
    const recBtn = document.getElementById('recBtn') as HTMLButtonElement | null;
    expect(recBtn).toBeTruthy();
    recBtn?.click();
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(appStore.get('session.asrDesired')).toBe(true);
    expect(appStore.get('session.asrArmed')).toBe(true);
    expect(appStore.get('session.asrReady')).toBe(true);
  });
});
