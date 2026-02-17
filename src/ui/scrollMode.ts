// UI helper for scroll mode select + auto/WPM/step controls.
type ScrollMode = 'timed' | 'wpm' | 'hybrid' | 'asr' | 'step' | 'rehearsal';

const MODE_HELP_TEXT: Record<ScrollMode, string> = {
  timed: 'Timed scroll runs at the px/s value above.',
  wpm: 'WPM mode uses this target pace to drive auto-scroll.',
  hybrid: 'Hybrid keeps a WPM baseline while ASR can nudge ahead.',
  asr: 'ASR mode follows confirmed speech commits. Start speech sync to arm ASR.',
  step: 'Step mode follows the manual step controls.',
  rehearsal: 'Rehearsal is manual-only; auto-scroll is disabled.',
};

function getBaseHelpText(helpText: HTMLElement | null): string {
  if (!helpText) return 'Scroll mode controls.';
  const cached = helpText.dataset.tpDefaultHelpText?.trim();
  if (cached) return cached;
  const base = helpText.textContent?.trim() || 'Scroll mode controls.';
  helpText.dataset.tpDefaultHelpText = base;
  return base;
}

function findAutoControls(root: ParentNode) {
  const autoSpeed = root.querySelector<HTMLInputElement>('#autoSpeed');
  const autoSpeedLabel = autoSpeed?.closest('label') as HTMLLabelElement | null;
  const autoSpeedWrap = root.querySelector<HTMLElement>('#autoSpeedWrap');
  const autoToggle = root.querySelector<HTMLButtonElement>('#autoToggle');
  const autoRow = root.querySelector<HTMLElement>('#autoRow');
  const wpmRow = root.querySelector<HTMLElement>('#wpmRow');
  const stepRow = root.querySelector<HTMLElement>('#stepControlsRow');
  const helpText = root.querySelector<HTMLElement>('#scrollModeHelpText');
  return { autoSpeed, autoSpeedLabel, autoSpeedWrap, autoToggle, autoRow, wpmRow, stepRow, helpText };
}

function setRowVisibility(row: HTMLElement | null, visible: boolean) {
  if (!row) return;
  row.classList.toggle('visually-hidden', !visible);
  row.setAttribute('aria-hidden', visible ? 'false' : 'true');
}

export function applyScrollModeUI(mode: ScrollMode, root: Document | HTMLElement = document): void {
  const { autoSpeed, autoSpeedLabel, autoSpeedWrap, autoToggle, autoRow, wpmRow, stepRow, helpText } =
    findAutoControls(root);

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
  setRowVisibility(autoRow as HTMLElement | null, true);
  setRowVisibility(autoSpeedWrap as HTMLElement | null, true);
  setRowVisibility(wpmRow as HTMLElement | null, false);
  setRowVisibility(stepRow as HTMLElement | null, false);
  const defaultHelpText = getBaseHelpText(helpText);
  const setHelp = (content: string) => {
    if (!helpText) return;
    helpText.textContent = content;
  };
  setHelp(MODE_HELP_TEXT[mode] ?? MODE_HELP_TEXT.hybrid ?? defaultHelpText);

  switch (mode) {
    case 'timed':
      // Baseline px/s UI
      setRowVisibility(autoRow as HTMLElement | null, true);
      setRowVisibility(autoSpeedWrap as HTMLElement | null, true);
      setRowVisibility(wpmRow as HTMLElement | null, false);
      break;
    case 'wpm':
      setRowVisibility(autoRow as HTMLElement | null, true);
      if (autoSpeedLabel) autoSpeedLabel.textContent = 'Auto-scroll (WPM)';
      setRowVisibility(autoSpeedWrap as HTMLElement | null, false);
      setRowVisibility(autoRow as HTMLElement | null, false);
      setRowVisibility(wpmRow as HTMLElement | null, true);
      break;
    case 'hybrid':
      setRowVisibility(autoRow as HTMLElement | null, false);
      setRowVisibility(autoSpeedWrap as HTMLElement | null, false);
      setRowVisibility(wpmRow as HTMLElement | null, true);
      break;
    case 'asr':
      setRowVisibility(autoRow as HTMLElement | null, false);
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
      setRowVisibility(autoRow as HTMLElement | null, false);
      setRowVisibility(stepRow as HTMLElement | null, true);
      break;
    case 'rehearsal':
      if (autoSpeed) autoSpeed.disabled = true;
      if (autoSpeedLabel) autoSpeedLabel.textContent = 'Manual only (Rehearsal)';
      if (autoToggle) {
        autoToggle.disabled = true;
        autoToggle.textContent = 'Auto-scroll disabled';
      }
      setRowVisibility(autoRow as HTMLElement | null, false);
      setRowVisibility(wpmRow as HTMLElement | null, false);
      setRowVisibility(stepRow as HTMLElement | null, false);
      break;
  }
}

let lastEmittedWpm = Number.NaN;
let lastEmittedPxPerSec = Number.NaN;

function emitWpmChange(wpm: number, pxPerSec: number, source = "store"): void {
  const nextWpm = Number.isFinite(wpm) ? wpm : Number.NaN;
  const nextPx = Number.isFinite(pxPerSec) ? pxPerSec : Number.NaN;
  if (nextWpm === lastEmittedWpm && nextPx === lastEmittedPxPerSec) return;
  lastEmittedWpm = nextWpm;
  lastEmittedPxPerSec = nextPx;
  if (typeof window === 'undefined') return;
  try {
    window.dispatchEvent(
      new CustomEvent('tp:wpm:change', {
        detail: { wpm: nextWpm, pxPerSec: nextPx, source },
      }),
    );
  } catch {
    // ignore dispatch errors
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
    emitWpmChange(wpm, pxPerSec, 'store');
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
