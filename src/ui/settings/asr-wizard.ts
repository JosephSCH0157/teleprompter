// src/ui/settings/asr-wizard.ts
import { runCalibration } from '../../asr/calibration';
import { getAsrState, onAsr, setActiveProfile, upsertProfile } from '../../asr/store';
import type { AsrProfile as SchemaAsrProfile, AsrProfileId } from '../../asr/schema';
import { showToast, type ToastOptions } from '../toasts';

export type AsrProfile = SchemaAsrProfile;

type CalibrationSession = {
  profile: AsrProfile;
  preview: (stop?: boolean) => void;
};

let current: CalibrationSession | null = null;
let previewListenerWired = false;
let calibrating = false;

function $(id: string): HTMLElement | null {
  return document.getElementById(id);
}

function toast(msg: string, opts?: ToastOptions): void {
  try {
    showToast(msg, opts);
  } catch {
    try {
      console.log('[ASR]', msg);
    } catch {
      // ignore
    }
  }
}

function setCalStatus(text: string): void {
  try {
    const el =
      document.querySelector<HTMLElement>('[data-calibration-status]') ||
      $('asrCalStatus');
    if (!el) return;
    el.textContent = text || '';
    el.hidden = !text;
  } catch {
    // ignore
  }
}

// --- Mic select / device handling ------------------------------------------

async function populateMicSelect(): Promise<void> {
  try {
    const sel = $('asrDevice') as HTMLSelectElement | null;
    if (!sel || !navigator.mediaDevices?.enumerateDevices) return;

    const devs = await navigator.mediaDevices.enumerateDevices();
    const mics = devs.filter((d) => d.kind === 'audioinput');

    sel.innerHTML = '';

    mics.forEach((d, i) => {
      const o = document.createElement('option');
      o.value = d.deviceId || '';
      o.textContent = d.label || `Microphone ${i + 1}`;
      sel.appendChild(o);
    });

    try {
      const s = getAsrState();
      const devId = s.activeProfileId
        ? s.profiles[s.activeProfileId]?.capture.deviceId
        : undefined;
      if (devId) sel.value = devId;
    } catch {
      // ignore
    }
  } catch {
    // ignore
  }
}

async function grantMicLabels(): Promise<void> {
  try {
    if (!navigator.mediaDevices?.getUserMedia) {
      toast('This browser does not support direct microphone access.');
      return;
    }
    await navigator.mediaDevices.getUserMedia({ audio: true });
    toast('Mic access granted — device names unlocked.');
  } catch {
    toast('Mic access denied. You can still calibrate with generic names.');
  }
  await populateMicSelect();
}

// --- Meter + derived values -----------------------------------------------

function mapDbToPct(db: number): number {
  const clamped = Math.max(-80, Math.min(0, db));
  return ((clamped + 80) / 80) * 100;
}

function setMeterMarker(
  db: number,
  ton?: number,
  toff?: number,
  gate?: boolean,
): void {
  const meter = $('asrMeter') as HTMLElement | null;
  if (!meter) return;

  const pct = mapDbToPct(db);
  meter.style.setProperty('--asr-level', pct.toFixed(1) + '%');
  (meter.dataset as any).gate = gate ? '1' : '0';

  if (typeof ton === 'number') {
    meter.style.setProperty('--asr-ton', mapDbToPct(ton).toFixed(1) + '%');
  }
  if (typeof toff === 'number') {
    meter.style.setProperty('--asr-toff', mapDbToPct(toff).toFixed(1) + '%');
  }
}

export function updateMeter(
  rmsDbfs: number,
  ton?: number,
  toff?: number,
  gate?: boolean,
): void {
  setMeterMarker(rmsDbfs, ton, toff, gate);

  const noiseEl = $('asrNoise');
  const speechEl = $('asrSpeech');
  const snrEl = $('asrSnr');

  try {
    if (
      snrEl &&
      typeof snrEl.textContent === 'string' &&
      typeof ton === 'number' &&
      typeof toff === 'number'
    ) {
      const p = current?.profile;
      if (p) {
        if (noiseEl)
          noiseEl.textContent = `${p.cal.noiseRmsDbfs.toFixed(1)} dBFS`;
        if (speechEl)
          speechEl.textContent = `${p.cal.speechRmsDbfs.toFixed(1)} dBFS`;
        if (snrEl) snrEl.textContent = `${p.cal.snrDb.toFixed(1)} dB`;
      }
    }
  } catch {
    // ignore
  }
}

function renderDerived(profile: AsrProfile): void {
  try {
    const noiseEl = $('asrNoise');
    const speechEl = $('asrSpeech');
    const snrEl = $('asrSnr');

    if (noiseEl)
      noiseEl.textContent = `${profile.cal.noiseRmsDbfs.toFixed(1)} dBFS`;
    if (speechEl)
      speechEl.textContent = `${profile.cal.speechRmsDbfs.toFixed(1)} dBFS`;
    if (snrEl) snrEl.textContent = `${profile.cal.snrDb.toFixed(1)} dB`;

    if (profile.cal.snrDb < 15) {
      toast('Increase mic gain or move closer. (SNR < 15 dB)');
    }
  } catch {
    // ignore
  }
}

let profileSelectorWired = false;

function getProfileSelect(): HTMLSelectElement | null {
  return document.getElementById('asrProfileSelect') as HTMLSelectElement | null;
}

function renderProfileOptions(): void {
  try {
    const select = getProfileSelect();
    if (!select) return;
    const state = getAsrState();
    const entries = Object.entries(state.profiles || {}) as Array<[AsrProfileId, AsrProfile]>;
    select.innerHTML = '';
    const placeholder = document.createElement('option');
    placeholder.value = '';
    placeholder.textContent = entries.length ? 'Default settings (no profile)' : 'No saved profiles yet';
    select.appendChild(placeholder);
    entries
      .sort((a, b) => (b[1].updatedAt || 0) - (a[1].updatedAt || 0))
      .forEach(([id, profile]) => {
        const opt = document.createElement('option');
        opt.value = id;
        opt.textContent = profile.label || id;
        select.appendChild(opt);
      });
    const active = state.activeProfileId;
    select.value = active && entries.some(([id]) => id === active) ? active : '';
  } catch {
    // ignore
  }
}

function wireProfileSelector(): void {
  if (profileSelectorWired) return;
  profileSelectorWired = true;
  try {
    const select = getProfileSelect();
    if (!select) return;
    select.addEventListener('change', () => {
      const id = select.value;
      if (!id) return;
      try {
        setActiveProfile(id as AsrProfileId);
        toast('ASR profile selected', { type: 'info' });
      } catch {}
      renderProfileOptions();
    });
    onAsr(() => renderProfileOptions());
  } catch {
    // ignore
  }
}

type AsrPreviewDetail = {
  rmsDbfs?: number;
  gate?: boolean;
  ton?: number;
  toff?: number;
};

function wirePreviewListener(): void {
  if (previewListenerWired) return;
  previewListenerWired = true;
  try {
    window.addEventListener(
      'tp:asrPreview',
      (e: Event) => {
        try {
          const detail = (e as CustomEvent<AsrPreviewDetail>).detail || {};
          const { rmsDbfs = -80, gate, ton, toff } = detail;
          updateMeter(rmsDbfs, ton, toff, gate);
        } catch {
          // ignore
        }
      },
      { passive: true },
    );
  } catch {
    // ignore
  }
}

// --- Wizard actions --------------------------------------------------------

export async function startAsrWizard(): Promise<void> {
  try {
    if (calibrating) return;
    calibrating = true;
    setCalStatus('Calibrating: first stay quiet for a few seconds, then speak in your normal podcast voice and keep talking until this banner changes to "Calibration done.".');
    const startBtn = $('asrStartBtn') as HTMLButtonElement | null;
    if (startBtn) startBtn.disabled = true;

    const deviceSel = $('asrDevice') as HTMLSelectElement | null;
    const labelInput = $('asrLabel') as HTMLInputElement | null;

    const deviceId = deviceSel?.value || '';
    const label = labelInput?.value || 'Desk - default';

    const flags = {
      echoCancellation: !!( $('asrAEC') as HTMLInputElement | null )?.checked,
      noiseSuppression: !!( $('asrNS') as HTMLInputElement | null )?.checked,
      autoGainControl: !!( $('asrAGC') as HTMLInputElement | null )?.checked,
    };

    current = await runCalibration({ deviceId, label, flags });
    renderDerived(current.profile);
  } catch (e) {
    console.warn('[ASR] startAsrWizard failed', e);
    setCalStatus('Calibration failed. Check mic and try again.');
  } finally {
    if (current) {
      const summary =
        "Calibration done. Noise " +
        current.profile.cal.noiseRmsDbfs.toFixed(1) +
        " dBFS, speech " +
        current.profile.cal.speechRmsDbfs.toFixed(1) +
        " dBFS, SNR " +
        current.profile.cal.snrDb.toFixed(1) +
        " dB.";
      setTimeout(() => {
        try {
          setCalStatus(summary);
        } catch {
          // ignore
        }
      }, 1500);
    } else {
      setCalStatus("");
    }
    calibrating = false;
    try {
      const startBtn = $('asrStartBtn') as HTMLButtonElement | null;
      if (startBtn) startBtn.disabled = false;
    } catch {
      // ignore
    }
  }
}

// --- Wiring into the Settings UI ------------------------------------------

function wire(): void {
  try {
    const attachStart = (id: string) => {
      const btn = $(id);
      btn?.addEventListener('click', () => startAsrWizard());
    };
    attachStart('asrStartBtn');
    attachStart('asrCalibBtn');

    $('asrPreviewBtn')?.addEventListener('click', () => current?.preview());
    $('asrPreviewStop')?.addEventListener('click', () => current?.preview(true));

    $('asrSaveBtn')?.addEventListener('click', () => {
      try {
        if (!current) return;
        upsertProfile(current.profile);
        setActiveProfile(current.profile.id);
        toast('ASR profile saved and activated.');
        renderProfileOptions();
      } catch {
        // ignore
      }
    });

    const updateFlagsBadge = () => {
      try {
        const badge = $('asrFlagsBadge') as HTMLElement | null;
        if (!badge) return;

        const ns = !!( $('asrNS') as HTMLInputElement | null )?.checked;
        const ag = !!( $('asrAGC') as HTMLInputElement | null )?.checked;

        if (ns || ag) {
          badge.style.display = 'inline-block';
          const parts = [ns && 'NS', ag && 'AGC']
            .filter(Boolean)
            .join(' + ');
          badge.textContent = `Timing may vary: ${parts}`;
        } else {
          badge.style.display = 'none';
        }
      } catch {
        // ignore
      }
    };

    ['asrNS', 'asrAGC'].forEach((id) => {
      try {
        ($(id) as HTMLInputElement | null)?.addEventListener(
          'change',
          updateFlagsBadge,
        );
      } catch {
        // ignore
      }
    });

    updateFlagsBadge();
    renderProfileOptions();
    wireProfileSelector();

    $('asrRefreshDevs')?.addEventListener('click', () => { void populateMicSelect(); });
    $('asrGrantPerm')?.addEventListener('click', () => { void grantMicLabels(); });
  } catch {
    // ignore
  }
}

export async function initAsrSettingsUI(): Promise<void> {
  try {
    await populateMicSelect();

    try {
      $('asrAEC')?.removeAttribute('checked');
    } catch {
      // ignore
    }
    try {
      $('asrNS')?.removeAttribute('checked');
    } catch {
      // ignore
    }
    try {
      $('asrAGC')?.removeAttribute('checked');
    } catch {
      // ignore
    }

    wire();
    wirePreviewListener();
  } catch {
    // ignore
  }
}


// Make the wizard available to global callers (mic pill / legacy hooks).
try {
  (window as any).startAsrWizard = startAsrWizard;
} catch {
  // ignore - e.g., non-browser env
}
