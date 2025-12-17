import { getAutoRecordEnabled, setAutoRecordEnabled } from '../../state/auto-record-ssot';
import {
  getSettings as getRecorderSettings,
  setMode as setRecorderMode,
  setSelected as setRecorderSelected,
} from '../../../recorders';
import type { AppStore } from '../../state/app-store';

const DATASET_SETTINGS_WIRED = 'tpSettingsWired';
const DATASET_CHANGE_WIRED = 'tpChangeWired';
const DATASET_CARD_WIRED = 'wired';

function onStoreReady(preferred: AppStore | null, cb: (store: AppStore) => void, { delayMs = 50, maxAttempts = 200 } = {}) {
  let attempts = 0;
  const wait = () => {
    try {
      const s = preferred || ((window as any).__tpStore as AppStore | null);
      if (s && typeof s.subscribe === 'function' && typeof s.set === 'function') {
        cb(s);
        return;
      }
    } catch {}
    if (attempts++ >= maxAttempts) return;
    setTimeout(wait, delayMs);
  };
  wait();
}

function wireSettingsTabs(root: HTMLElement, store?: AppStore | null): void {
  try {
    const tabButtons = Array.from(
      root.querySelectorAll<HTMLButtonElement>('[data-settings-tab]'),
    );
    const panels = Array.from(
      root.querySelectorAll<HTMLElement>('[data-settings-panel]'),
    );

    if (!tabButtons.length || !panels.length) return;

    const setActive = (id: string) => {
      tabButtons.forEach((btn) => {
        const active = btn.dataset.settingsTab === id;
        btn.classList.toggle('active', active);
        btn.setAttribute('aria-pressed', active ? 'true' : 'false');
        btn.setAttribute('aria-selected', active ? 'true' : 'false');
        btn.tabIndex = active ? 0 : -1;
      });
      panels.forEach((panel) => {
        const active = panel.dataset.settingsPanel === id;
        panel.hidden = !active;
        if (active) {
          panel.classList.add('is-active');
          panel.removeAttribute('hidden');
        } else {
          panel.classList.remove('is-active');
          panel.setAttribute('hidden', '');
        }
      });
      try { store?.set?.('settingsTab', id); } catch {}
    };

    tabButtons.forEach((btn) => {
      btn.addEventListener('click', (ev) => {
        try {
          ev.preventDefault();
          const id = btn.dataset.settingsTab;
          if (id) setActive(id);
        } catch {}
      });
    });

    const fromStore = (() => {
      try { return (store?.get?.('settingsTab') as string | null) || null; } catch { return null; }
    })();
    const initial = (fromStore ?? tabButtons[0]?.dataset.settingsTab) ?? 'general';
    setActive(initial);
  } catch {}
}

async function wireAutoRecord(rootEl: HTMLElement, store?: AppStore | null) {
  const chk = rootEl.querySelector('#settingsAutoRecord') as HTMLInputElement | null;
  const nameEl = rootEl.querySelector('#autoRecordFolderName') as HTMLElement | null;
  const pickBtn = rootEl.querySelector('#autoRecordPickBtn') as HTMLButtonElement | null;
  const clearBtn = rootEl.querySelector('#autoRecordClearBtn') as HTMLButtonElement | null;

  async function ensureRecDirReady() {
    try {
    await import('../../fs/recording-dir');
    } catch {}
    try {
      await (window as any).__tpRecDir?.init?.();
    } catch {}
  }

  async function renderFolder() {
    try {
      await ensureRecDirReady();
      const dir = (window as any).__tpRecDir?.get?.() || null;
      if (!nameEl) return;
      if (dir) {
        nameEl.textContent = dir.name || 'Selected';
        return;
      }
      let mock = false;
      try {
        mock = new URLSearchParams(location.search || '').has('mockFolder');
      } catch {}
      nameEl.textContent = mock ? 'MockRecordings' : 'Not set';
      try {
        const wrap = nameEl.closest('[data-test-id="rec-folder-label"]');
        if (wrap && mock) (wrap as HTMLElement).dataset.mockApplied = '1';
      } catch {}
    } catch {}
  }

async function pickFolder({ force }: { force?: boolean } = {}) {
    await ensureRecDirReady();
    const api = (window as any).__tpRecDir;
    if (!api?.supported?.()) {
      (window as any).toast?.('This browser will download recordings instead of saving to a folder.', {
        type: 'warn',
      });
      return true;
    }
    const existing = api.get?.();
    if (existing && !force) return true;
    const dir = await api.pick?.();
    if (!dir) {
      (window as any).toast?.('Auto-save canceled — no folder selected.', { type: 'warn' });
      return false;
    }
    await renderFolder();
    return true;
  }

  const apply = (on: boolean) => {
    setAutoRecordEnabled(on);
    try {
      store?.set?.('autoRecord', on);
    } catch {}
  };

  if (chk && !chk.dataset[DATASET_CARD_WIRED]) {
    chk.dataset[DATASET_CARD_WIRED] = '1';
    try {
      chk.checked = !!getAutoRecordEnabled();
    } catch {}
    chk.addEventListener('change', async () => {
      const on = !!chk.checked;
      apply(on);
      if (on) {
        const ok = await pickFolder();
        if (!ok) {
          chk.checked = false;
          apply(false);
        }
      }
    });
  }

  onStoreReady(store || null, (s) => {
    if (!s || typeof s.subscribe !== 'function') return;
    s.subscribe('autoRecord', (v: unknown) => {
      try {
        const on = typeof v === 'boolean' ? v : getAutoRecordEnabled();
        if (chk && chk.checked !== !!on) chk.checked = !!on;
      } catch {}
    });
  });

  if (pickBtn && !pickBtn.dataset[DATASET_CARD_WIRED]) {
    pickBtn.dataset[DATASET_CARD_WIRED] = '1';
    pickBtn.addEventListener('click', () => {
      pickFolder({ force: true });
    });
  }
  if (clearBtn && !clearBtn.dataset[DATASET_CARD_WIRED]) {
    clearBtn.dataset[DATASET_CARD_WIRED] = '1';
    clearBtn.addEventListener('click', async () => {
      try {
        await ensureRecDirReady();
        await (window as any).__tpRecDir?.clear?.();
        await renderFolder();
      } catch {}
    });
  }

  await renderFolder();
}

function wireRecorderAdapters(rootEl: HTMLElement) {
  const coreCb = rootEl.querySelector('#recAdapterCore') as HTMLInputElement | null;
  const obsCb = rootEl.querySelector('#recAdapterObs') as HTMLInputElement | null;
  const modeCb = rootEl.querySelector('#recModeSingle') as HTMLInputElement | null;
  const refreshBtn = rootEl.querySelector('#recAdaptersRefresh') as HTMLButtonElement | null;

  const syncFromSettings = () => {
    try {
      const cfg = getRecorderSettings();
      const selected: string[] = Array.isArray((cfg as any)?.selected) ? [...(cfg as any).selected] : [];
      const single = (cfg as any)?.mode === 'single';
      if (modeCb) modeCb.checked = !!single;
      if (coreCb) coreCb.checked = selected.includes('core') || selected.length === 0;
      if (obsCb) obsCb.checked = selected.includes('obs');
    } catch {}
  };

  const applySelection = () => {
    try {
      const ids: string[] = [];
      if (coreCb?.checked !== false) ids.push('core');
      if (obsCb?.checked) ids.push('obs');
      setRecorderSelected(ids);
      setRecorderMode(modeCb?.checked ? 'single' : 'multi');
    } catch (err) {
      try {
        console.warn('[settings] recorder selection failed', err);
      } catch {}
    }
  };

  if (coreCb && !coreCb.dataset[DATASET_CARD_WIRED]) {
    coreCb.dataset[DATASET_CARD_WIRED] = '1';
    coreCb.addEventListener('change', applySelection);
  }
  if (obsCb && !obsCb.dataset[DATASET_CARD_WIRED]) {
    obsCb.dataset[DATASET_CARD_WIRED] = '1';
    obsCb.addEventListener('change', applySelection);
  }
  if (modeCb && !modeCb.dataset[DATASET_CARD_WIRED]) {
    modeCb.dataset[DATASET_CARD_WIRED] = '1';
    modeCb.addEventListener('change', applySelection);
  }
  if (refreshBtn && !refreshBtn.dataset[DATASET_CARD_WIRED]) {
    refreshBtn.dataset[DATASET_CARD_WIRED] = '1';
    refreshBtn.addEventListener('click', syncFromSettings);
  }

  syncFromSettings();
}

export function wireSettingsDynamic(rootEl: HTMLElement | null, store?: AppStore | null) {
  if (!rootEl) return;
  if ((window as any).__TP_DEV) {
    try { console.count('wireSettingsDynamic'); } catch {}
  }
  try {
    if (rootEl.dataset[DATASET_SETTINGS_WIRED] === '1') return;
    rootEl.dataset[DATASET_SETTINGS_WIRED] = '1';
  } catch {}
  try { wireSettingsTabs(rootEl, store); } catch {}
  // attach a minimal mutation observer to demonstrate wiring
  try {
    const obs = new MutationObserver(() => {});
    obs.observe(rootEl, { childList: true, subtree: true, attributes: true });
  } catch {}

  // Wire media controls to TS mic API if available
  try {
    const micApi = (window as any).__tpMic;
    const handleMicDeviceChange = async (deviceId?: string) => {
      if (!micApi) return;
      const normalized = deviceId || undefined;
      const directMethods = ['selectDevice', 'setDevice', 'changeDevice'];
      for (const method of directMethods) {
        try {
          const fn = micApi[method];
          if (typeof fn === 'function') {
            await fn.call(micApi, normalized);
            return;
          }
        } catch (err) {
          console.warn(`[settings] mic ${method} failed`, err);
        }
      }
      const requestFn = micApi.requestMic;
      if (typeof requestFn === 'function') {
        try {
          await requestFn.call(micApi, { deviceId: normalized });
          return;
        } catch (err) {
          console.warn('[settings] mic requestMic({ deviceId }) failed', err);
        }
        try {
          await requestFn.call(micApi, normalized);
          return;
        } catch (err) {
          console.warn('[settings] mic requestMic(id) failed', err);
        }
      }
      try {
        console.warn('[settings] mic device change has no supported handler');
      } catch {}
    };
    const handleCameraDeviceChange = async (deviceId?: string) => {
      if (!deviceId) return;
      const camApi = (window as any).__tpCamera;
      if (!camApi) return;
      const trySwitch = async () => {
        if (typeof camApi.switchCamera !== 'function') return false;
        try {
          await camApi.switchCamera(deviceId);
          return true;
        } catch (err) {
          console.warn('[settings] camera switchCamera failed', err);
          return false;
        }
      };
      const tryStart = async () => {
        if (typeof camApi.startCamera !== 'function') return false;
        try {
          await camApi.startCamera(deviceId);
          return true;
        } catch (err) {
          console.warn('[settings] camera startCamera(id) failed', err);
        }
        try {
          await camApi.startCamera({ deviceId });
          return true;
        } catch (err) {
          console.warn('[settings] camera startCamera({ deviceId }) failed', err);
        }
        return false;
      };
      const previewState = (() => {
        try {
          const camVideo = document.getElementById('camVideo') as HTMLVideoElement | null;
          const hasVideo = !!camVideo;
          const videoLive =
            hasVideo &&
            camVideo?.srcObject instanceof MediaStream &&
            camVideo.readyState >= 2 &&
            !camVideo.paused;
          const apiActive = typeof camApi.isActive === 'function' ? !!camApi.isActive() : false;
          const apiRunning = typeof camApi.isRunning === 'function' ? !!camApi.isRunning() : false;
          const previewActive = videoLive || (hasVideo && (apiActive || apiRunning));
          return { videoLive, previewActive };
        } catch {
          return { videoLive: false, previewActive: false };
        }
      })();
      if (previewState.previewActive) {
        if (await trySwitch()) return;
        if (await tryStart()) return;
        try {
          console.warn('[settings] camera switch failed, start fallback ran');
        } catch {}
        return;
      }
      if (await tryStart()) return;
      if (await trySwitch()) return;
      try {
        console.warn('[settings] camera device change has no supported handler');
      } catch {}
    };
    // Populate devices on open
    try {
      if (typeof micApi?.populateDevices === 'function') micApi.populateDevices();
    } catch {}

    const reqBtn = document.getElementById('settingsRequestMicBtn');
    const relBtn = document.getElementById('settingsReleaseMicBtn');
    const startDb = document.getElementById('settingsStartDbBtn');
    const stopDb = document.getElementById('settingsStopDbBtn');
    const micSel = document.getElementById('settingsMicSel') as HTMLSelectElement | null;
    const camSel =
      (window as any).$id?.('settingsCamSel') ?? document.getElementById('settingsCamSel');

    if (reqBtn)
      reqBtn.addEventListener('click', async () => {
        try {
          if (micApi && typeof micApi.requestMic === 'function') await micApi.requestMic();
        } catch (e) {
          console.warn(e);
        }
      });
    if (relBtn)
      relBtn.addEventListener('click', () => {
        try {
          if (micApi && typeof micApi.releaseMic === 'function') micApi.releaseMic();
        } catch (e) {
          console.warn(e);
        }
      });
    if (startDb)
      startDb.addEventListener('click', () => {
        try {
          const api = (window as any).__tpMic;
          if (api && typeof api.startDbMeter === 'function') {
            const s = (api as any).__lastStream as MediaStream | undefined;
            if (s) api.startDbMeter(s);
            else console.warn('no known stream to start dB meter');
          }
        } catch (e) {
          console.warn(e);
        }
      });
    if (stopDb)
      stopDb.addEventListener('click', () => {
        try {
          const api = (window as any).__tpMic;
          if (api && typeof api.clearBars === 'function') api.clearBars(document.getElementById('dbMeterTop'));
        } catch (e) {
          console.warn(e);
        }
      });

    if (micSel && micSel.dataset[DATASET_CHANGE_WIRED] !== '1') {
      micSel.dataset[DATASET_CHANGE_WIRED] = '1';
      micSel.addEventListener('change', () => {
        try {
          const chosen = micSel.value || undefined;
          void handleMicDeviceChange(chosen);
        } catch (err) {
          console.warn('[settings] mic switch failed', err);
        }
      });
    }

    if (camSel && camSel.dataset[DATASET_CHANGE_WIRED] !== '1') {
      camSel.dataset[DATASET_CHANGE_WIRED] = '1';
      camSel.addEventListener('change', async () => {
        try {
          const id = (camSel as HTMLSelectElement).value;
          await handleCameraDeviceChange(id);
        } catch (err) {
          console.warn('[settings] camera switch failed', err);
        }
      });
    }

  } catch {}

  try {
    wireRecorderAdapters(rootEl);
  } catch {}
  try {
    wireAutoRecord(rootEl, store);
  } catch {}
}

export { };
