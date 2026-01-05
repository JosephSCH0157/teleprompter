// UI helper for scroll mode select + auto/WPM/step controls.
type ScrollMode = 'timed' | 'wpm' | 'hybrid' | 'asr' | 'step' | 'rehearsal';

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
  const defaultHelpText = helpText?.textContent?.trim() || '';
  const setHelp = (content: string) => {
    if (!helpText) return;
    helpText.textContent = content;
  };
  setHelp(defaultHelpText);

  switch (mode) {
    case 'timed':
      // Baseline px/s UI
      setRowVisibility(autoRow as HTMLElement | null, true);
      setRowVisibility(autoSpeedWrap as HTMLElement | null, true);
      setRowVisibility(wpmRow as HTMLElement | null, false);
      setHelp('Timed scroll runs at the px/s value above.');
      break;
    case 'wpm':
      setRowVisibility(autoRow as HTMLElement | null, true);
      if (autoSpeedLabel) autoSpeedLabel.textContent = 'Auto-scroll (WPM)';
      setRowVisibility(autoSpeedWrap as HTMLElement | null, false);
      setRowVisibility(wpmRow as HTMLElement | null, true);
      setHelp('WPM mode uses this target pace to drive auto-scroll.');
      break;
    case 'hybrid':
      setRowVisibility(autoRow as HTMLElement | null, false);
      setRowVisibility(autoSpeedWrap as HTMLElement | null, false);
      setRowVisibility(wpmRow as HTMLElement | null, true);
      setHelp('Hybrid (Performance) keeps a WPM baseline while ASR (Training) can nudge ahead.');
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
      setHelp('Step mode follows the manual step controls.');
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
      setHelp('Rehearsal is manual-only; auto-scroll is disabled.');
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
