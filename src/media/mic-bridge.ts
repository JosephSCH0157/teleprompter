// src/media/mic-bridge.ts
// Thin bridge that lets both legacy sidebar buttons and Settings controls
// call the same mic request/release API exposed on window.__tpMic.

type MicAPI = {
  requestMic: (deviceId?: string) => Promise<MediaStream | void>;
  releaseMic: () => Promise<void> | void;
};

function getMicApi(): MicAPI | null {
  const m = (window as any).__tpMic;
  if (!m || typeof m.requestMic !== 'function' || typeof m.releaseMic !== 'function') return null;
  return m as MicAPI;
}

function getMicSelect(): HTMLSelectElement | null {
  return (
    (document.getElementById('settingsMicSel') as HTMLSelectElement | null) ||
    (document.getElementById('micDeviceSel') as HTMLSelectElement | null)
  );
}

export function bindMicUI() {
  const micBtn = document.getElementById('micBtn') as HTMLButtonElement | null;
  const releaseBtn = document.getElementById('releaseMicBtn') as HTMLButtonElement | null;

  if (micBtn) {
    micBtn.addEventListener('click', async () => {
      try {
        const api = getMicApi();
        const sel = getMicSelect();
        const chosen = sel?.value || undefined;
        if (api) {
          await api.requestMic(chosen);
        }
      } catch {}
    });
  }

  if (releaseBtn) {
    releaseBtn.addEventListener('click', async () => {
      try {
        const api = getMicApi();
        if (api) await api.releaseMic();
      } catch {}
    });
  }

  // Keep legacy hidden select and Settings select in sync for device choice.
  const settingsSel = document.getElementById('settingsMicSel') as HTMLSelectElement | null;
  const legacySel = document.getElementById('micDeviceSel') as HTMLSelectElement | null;

  if (settingsSel && legacySel) {
    const sync = (from: HTMLSelectElement, to: HTMLSelectElement) => {
      if (to.value !== from.value) to.value = from.value;
    };
    settingsSel.addEventListener('change', () => sync(settingsSel, legacySel));
    legacySel.addEventListener('change', () => sync(legacySel, settingsSel));
  }
}
