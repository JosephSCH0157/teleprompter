// UI helper for scroll mode select + auto/WPM/step controls.
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

  // Default reset
  if (autoSpeed) autoSpeed.disabled = false;
  if (autoSpeedLabel) autoSpeedLabel.textContent = 'Auto-scroll (px/s)';
  if (autoToggle) {
    autoToggle.disabled = false;
    autoToggle.textContent = 'Auto-scroll: Off';
  }
  setRowVisibility(wpmRow as HTMLElement | null, false);
  setRowVisibility(stepRow as HTMLElement | null, false);

  switch (mode) {
    case 'timed':
      // Baseline px/s
      break;
    case 'wpm':
      if (autoSpeedLabel) autoSpeedLabel.textContent = 'Auto-scroll (WPM)';
      setRowVisibility(wpmRow as HTMLElement | null, true);
      break;
    case 'hybrid':
      // Treat UI like auto but with WPM target visible
      if (autoSpeedLabel) autoSpeedLabel.textContent = 'Auto-scroll (WPM)';
      setRowVisibility(wpmRow as HTMLElement | null, true);
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
