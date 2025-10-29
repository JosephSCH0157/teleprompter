import { runCalibration } from '../../asr/calibration';
import { getAsrState, setActiveProfile, upsertProfile } from '../../asr/store';

let current: Awaited<ReturnType<typeof runCalibration>> | null = null;

function $(id: string) { return document.getElementById(id); }

function toast(msg: string) {
  try { (window as any).tpToast?.ok?.(msg); } catch {}
  try { (window as any).tpToast?.show?.(msg); } catch {}
  try { console.log('[ASR]', msg); } catch {}
}

// Populate microphone select and grant labels helpers
async function populateMicSelect() {
  try {
    const sel = $('asrDevice') as HTMLSelectElement | null;
    if (!sel || !navigator.mediaDevices?.enumerateDevices) return;
    const devs = await navigator.mediaDevices.enumerateDevices();
    const mics = devs.filter(d => d.kind === 'audioinput');
    sel.innerHTML = '';
    mics.forEach((d, i) => {
      const o = document.createElement('option');
      o.value = d.deviceId || '';
      o.textContent = d.label || `Microphone ${i + 1}`;
      sel.appendChild(o);
    });
    // Preselect active profile's device if present
    try {
      const s = getAsrState();
      const devId = s.activeProfileId ? s.profiles[s.activeProfileId]?.capture.deviceId : undefined;
      if (devId) sel.value = devId;
    } catch {}
  } catch {}
}

async function grantMicLabels() {
  try {
    await navigator.mediaDevices.getUserMedia({ audio: true });
    toast('Mic access granted — device names unlocked.');
  } catch { toast('Mic access denied. You can still calibrate with generic names.'); }
  await populateMicSelect();
}

function mapDbToPct(db: number) {
  const clamped = Math.max(-80, Math.min(0, db));
  return ((clamped + 80) / 80) * 100; // -80..0 → 0..100
}

function setMeterMarker(db: number, ton?: number, toff?: number, gate?: boolean) {
  const meter = $('asrMeter');
  if (!meter) return;
  const pct = mapDbToPct(db);
  (meter as HTMLElement).style.setProperty('--asr-level', pct.toFixed(1) + '%');
  (meter as HTMLElement).dataset.gate = gate ? '1' : '0';
  if (typeof ton === 'number') (meter as HTMLElement).style.setProperty('--asr-ton', mapDbToPct(ton).toFixed(1) + '%');
  if (typeof toff === 'number') (meter as HTMLElement).style.setProperty('--asr-toff', mapDbToPct(toff).toFixed(1) + '%');
}

export function updateMeter(rmsDbfs: number, ton?: number, toff?: number, gate?: boolean) {
  setMeterMarker(rmsDbfs, ton, toff, gate);
  const noiseEl = $('asrNoise');
  const speechEl = $('asrSpeech');
  const snrEl = $('asrSnr');
  // These get set when we have a profile (derived values)
  try { if (snrEl && typeof (snrEl as any).textContent === 'string' && typeof ton === 'number' && typeof toff === 'number') {
    const p = current?.profile;
    if (p) {
      (noiseEl as HTMLElement).textContent = `${p.cal.noiseRmsDbfs.toFixed(1)} dBFS`;
      (speechEl as HTMLElement).textContent = `${p.cal.speechRmsDbfs.toFixed(1)} dBFS`;
      (snrEl as HTMLElement).textContent = `${p.cal.snrDb.toFixed(1)} dB`;
    }
  } } catch {}
}

export function renderDerived(profile: any) {
  try {
    const noiseEl = $('asrNoise');
    const speechEl = $('asrSpeech');
    const snrEl = $('asrSnr');
    if (noiseEl) noiseEl.textContent = `${profile.cal.noiseRmsDbfs.toFixed(1)} dBFS`;
    if (speechEl) speechEl.textContent = `${profile.cal.speechRmsDbfs.toFixed(1)} dBFS`;
    if (snrEl) snrEl.textContent = `${profile.cal.snrDb.toFixed(1)} dB`;
    // Bad SNR warning
    if (profile.cal.snrDb < 15) toast('Increase mic gain or move closer. (SNR < 15 dB)');
  } catch {}
}

export async function startAsrWizard() {
  try {
    const deviceId = ( $('asrDevice') as HTMLSelectElement | null )?.value || '';
    const label = ( $('asrLabel') as HTMLInputElement | null )?.value || 'Desk • default';
    const flags = {
      echoCancellation: !!( $('asrAEC') as HTMLInputElement | null )?.checked,
      noiseSuppression: !!( $('asrNS') as HTMLInputElement | null )?.checked,
      autoGainControl: !!( $('asrAGC') as HTMLInputElement | null )?.checked,
    };
    current = await runCalibration({ deviceId, label, flags });
    renderDerived(current.profile);
  } catch (e) {
    console.warn('[ASR] startAsrWizard failed', e);
  }
}

function wire() {
  try {
    const startBtn = $('asrStartBtn');
    startBtn?.addEventListener('click', () => startAsrWizard());
    $('asrPreviewBtn')?.addEventListener('click', () => current?.preview());
    $('asrPreviewStop')?.addEventListener('click', () => current?.preview(true));
    $('asrSaveBtn')?.addEventListener('click', () => {
      try {
        if (!current) return;
        upsertProfile(current.profile);
        setActiveProfile(current.profile.id);
        toast('ASR profile saved and activated.');
      } catch {}
    });
    // Device list helpers if present
    $('asrRefreshDevs')?.addEventListener('click', () => { populateMicSelect(); });
    $('asrGrantPerm')?.addEventListener('click', () => { grantMicLabels(); });
  } catch {}
}

// Live meter update (event from calibration preview)
try {
  window.addEventListener('tp:asrPreview', (e: any) => {
    try {
      const { rmsDbfs, gate, ton, toff } = e.detail || {};
      updateMeter(rmsDbfs, ton, toff, gate);
    } catch {}
  });
} catch {}

try { (window as any).startAsrWizard = startAsrWizard; } catch {}

try { if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', wire, { once: true }); else wire(); } catch {}

// Exported init for Settings mount flow
export async function initAsrSettingsUI() {
  try {
    await populateMicSelect();
    // Sensible defaults for flags (unchecked by default)
    try { ( $('asrAEC') as HTMLInputElement | null )?.removeAttribute('checked'); } catch {}
    try { ( $('asrNS')  as HTMLInputElement | null )?.removeAttribute('checked'); } catch {}
    try { ( $('asrAGC') as HTMLInputElement | null )?.removeAttribute('checked'); } catch {}
  } catch {}
}
