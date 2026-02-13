import { initScrollStripHud } from '../../src/hud/scroll-strip';

describe('scroll strip HUD', () => {
  test('updates ASR indicators from router mode snapshots and guard events', () => {
    const root = document.createElement('div');
    document.body.appendChild(root);

    const api = initScrollStripHud({ root });

    window.dispatchEvent(new CustomEvent('tp:scroll:mode', {
      detail: {
        mode: 'asr',
        phase: 'live',
        autoRunning: false,
        userEnabled: true,
        sessionIntentOn: true,
      },
    }));

    const modeEl = root.querySelector<HTMLElement>('[data-hud-scroll-mode]');
    const stateEl = root.querySelector<HTMLElement>('[data-hud-scroll-state]');
    expect(modeEl?.textContent).toContain('ASR lock');
    expect(stateEl?.textContent).toContain('Running');

    window.dispatchEvent(new CustomEvent('tp:asr:guard', {
      detail: {
        key: 'stall',
        text: 'ASR stalled',
        reasonSummary: 'forward evidence',
      },
    }));

    const stallEl = root.querySelector<HTMLElement>('[data-hud-asr-stall]');
    const resyncBtn = root.querySelector<HTMLButtonElement>('[data-hud-asr-resync]');
    expect(stallEl?.style.display).toBe('');
    expect(resyncBtn?.style.display).toBe('');

    window.dispatchEvent(new CustomEvent('asr:advance', { detail: { index: 1 } }));
    expect(stallEl?.style.display).toBe('none');
    expect(resyncBtn?.style.display).toBe('none');

    api.destroy();
  });
});
