// UI helper for scroll mode select + auto/WPM/step controls.
import { appStore } from '../state/app-store';
type ScrollMode = 'timed' | 'wpm' | 'hybrid' | 'asr' | 'step' | 'rehearsal';

function findAutoControls(root: ParentNode) {
  const autoSpeed = root.querySelector<HTMLInputElement>('#autoSpeed');
  const autoSpeedLabel = autoSpeed?.closest('label') as HTMLLabelElement | null;
  const autoToggle = root.querySelector<HTMLButtonElement>('#autoToggle');
  const wpmRow = root.querySelector<HTMLElement>('#wpmRow');
  const stepRow = root.querySelector<HTMLElement>('#stepControlsRow');
  return { autoSpeed, autoSpeedLabel, autoToggle, wpmRow, stepRow };
}

function setRowVisibility(row: HTMLElement | null, visible: boolean) {
  if (!row) return;
  row.classList.toggle('visually-hidden', !visible);
  row.setAttribute('aria-hidden', visible ? 'false' : 'true');
}

export function applyScrollModeUI(mode: ScrollMode, root: Document | HTMLElement = document): void {
  const { autoSpeed, autoSpeedLabel, autoToggle, wpmRow, stepRow } = findAutoControls(root);

  try {
    const rootEl = root instanceof Document ? root.documentElement : root.ownerDocument?.documentElement || document.documentElement;
    rootEl.classList.toggle('tp-mode-rehearsal', mode === 'rehearsal');
  } catch {}

  // Default reset
  if (autoSpeed) autoSpeed.disabled = false;
  if (autoSpeedLabel) autoSpeedLabel.textContent = 'Auto-scroll (px/s)';
  if (autoToggle) {
    autoToggle.disabled = false;
    autoToggle.textContent = 'Auto-scroll: Off';
  }
  const asrLive = !!appStore.get?.('asrLive');
  setRowVisibility(wpmRow as HTMLElement | null, false);
  setRowVisibility(stepRow as HTMLElement | null, false);

  switch (mode) {
    case 'timed':
      // Baseline px/s
      break;
    case 'wpm':
      if (autoSpeedLabel) autoSpeedLabel.textContent = 'Auto-scroll (WPM)';
      if (!asrLive) setRowVisibility(wpmRow as HTMLElement | null, true);
      break;
    case 'hybrid':
      // Treat UI like auto but with WPM target visible
      if (autoSpeedLabel) autoSpeedLabel.textContent = 'Auto-scroll (WPM)';
      if (!asrLive) setRowVisibility(wpmRow as HTMLElement | null, true);
      break;
    case 'asr':
      if (autoSpeed) autoSpeed.disabled = true;
      if (autoSpeedLabel) autoSpeedLabel.textContent = 'ASR controls speed';
      if (autoToggle) {
        autoToggle.disabled = true;
        autoToggle.textContent = 'ASR-controlled';
      }
      setRowVisibility(wpmRow as HTMLElement | null, false);
      break;
    case 'step':
      if (autoSpeed) autoSpeed.disabled = true;
      if (autoSpeedLabel) autoSpeedLabel.textContent = 'Step mode';
      if (autoToggle) {
        autoToggle.disabled = false;
        autoToggle.textContent = 'Step';
      }
      setRowVisibility(stepRow as HTMLElement | null, true);
      break;
    case 'rehearsal':
      if (autoSpeed) autoSpeed.disabled = true;
      if (autoSpeedLabel) autoSpeedLabel.textContent = 'Manual only (Rehearsal)';
      if (autoToggle) {
        autoToggle.disabled = true;
        autoToggle.textContent = 'Auto-scroll disabled';
      }
      setRowVisibility(wpmRow as HTMLElement | null, false);
      setRowVisibility(stepRow as HTMLElement | null, false);
      break;
  }
}

export function initWpmBindings(root: Document | HTMLElement = document): void {
  const anyWin = window as any;
  const store = anyWin.__tpStore;
  const wpmInput = root.querySelector<HTMLInputElement>('#wpmTarget');
  const wpmPxChip = root.querySelector<HTMLElement>('#wpmPx');

  if (!wpmInput || !store || typeof store.set !== 'function' || typeof store.get !== 'function') return;

  const updateFromStore = () => {
    const wpm = Number(store.get('wpmTarget') ?? 150) || 150;
    const pxPerWord = Number(store.get('pxPerWord') ?? 4) || 4;
    const pxPerSec = (wpm * pxPerWord) / 60;
    wpmInput.value = String(wpm);
    if (wpmPxChip) {
      wpmPxChip.textContent = `${pxPerSec.toFixed(1)} px/s`;
    }
  };

  wpmInput.addEventListener('change', () => {
    const next = Number(wpmInput.value || '0') || 0;
    store.set('wpmTarget', next);
    updateFromStore();
  });

  if (typeof store.subscribe === 'function') {
    store.subscribe('wpmTarget', updateFromStore);
    store.subscribe('pxPerWord', updateFromStore);
  }

  updateFromStore();
}
