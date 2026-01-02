import type { AsrThresholds } from '../asr/asr-thresholds';
import { getAsrDriverThresholds, setAsrDriverThresholds } from '../features/asr/asr-scroll-driver';
import { saveDevAsrThresholds } from './dev-thresholds';

type ThresholdControl = {
  key: keyof AsrThresholds;
  label: string;
  min: number;
  max: number;
  step: number;
  isInt?: boolean;
};

const CONTROLS: ThresholdControl[] = [
  { key: 'candidateMinSim', label: 'Candidate gate', min: 0, max: 1, step: 0.01 },
  { key: 'commitFinalMinSim', label: 'Commit final sim', min: 0, max: 1, step: 0.01 },
  { key: 'commitInterimMinSim', label: 'Commit interim sim', min: 0, max: 1, step: 0.01 },
  { key: 'stickinessDelta', label: 'Stickiness delta', min: 0, max: 0.3, step: 0.01 },
  { key: 'tieDelta', label: 'Tie margin', min: 0, max: 0.2, step: 0.01 },
  { key: 'interimStreakNeeded', label: 'Interim streak', min: 1, max: 5, step: 1, isInt: true },
  { key: 'maxJumpsPerSecond', label: 'Max jumps/sec', min: 1, max: 8, step: 1, isInt: true },
];

function isDevMode(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    const w = window as any;
    if (w.__TP_DEV || w.__TP_DEV1) return true;
    if (w.localStorage?.getItem('tp_dev_mode') === '1') return true;
    if (/[?&]dev=1/.test(window.location.search || '')) return true;
    return false;
  } catch {
    return false;
  }
}

if (!isDevMode() || typeof document === 'undefined') {
  // nothing to do in production
} else {
  const panel = document.createElement('div');
  panel.id = 'asr-thresholds-panel';
  panel.style.cssText = [
    'position:fixed',
    'bottom:8px',
    'left:8px',
    'padding:10px',
    'background:rgba(0,0,0,0.65)',
    'border:1px solid rgba(255,255,255,0.1)',
    'border-radius:8px',
    'font:12px/1.4 system-ui,Segoe UI,Roboto,Arial,sans-serif',
    'color:#e5ecfb',
    'max-width:320px',
    'z-index:1200',
    'box-shadow:0 12px 32px rgba(0,0,0,0.5)',
  ].join(';');

  const title = document.createElement('div');
  title.textContent = 'ASR thresholds (dev)';
  title.style.fontWeight = '600';
  title.style.marginBottom = '6px';
  panel.appendChild(title);

  const controlMap: Record<string, { input: HTMLInputElement; value: HTMLElement }> = {};

  const updateDisplayValue = (key: string, value: number, cfg: ThresholdControl) => {
    const entry = controlMap[key];
    if (!entry) return;
    const display = cfg.isInt ? String(Math.round(value)) : value.toFixed(2);
    entry.value.textContent = display;
    entry.input.value = String(value);
  };

  const syncControls = () => {
    const thresholds = getAsrDriverThresholds();
    CONTROLS.forEach((cfg) => {
      const value = thresholds[cfg.key];
      if (!Number.isFinite(value)) return;
      updateDisplayValue(cfg.key, value, cfg);
    });
  };

  const handleInput = (cfg: ThresholdControl, value: number) => {
    const normalized = cfg.isInt ? Math.max(cfg.min, Math.min(cfg.max, Math.round(value))) : value;
    setAsrDriverThresholds({ [cfg.key]: normalized });
    saveDevAsrThresholds(getAsrDriverThresholds());
    updateDisplayValue(cfg.key, normalized, cfg);
  };

  CONTROLS.forEach((cfg) => {
    const line = document.createElement('label');
    line.style.display = 'flex';
    line.style.alignItems = 'center';
    line.style.marginBottom = '6px';
    line.style.gap = '6px';
    const label = document.createElement('span');
    label.textContent = cfg.label;
    label.style.flex = '1';
    const value = document.createElement('span');
    value.style.minWidth = '42px';
    value.style.textAlign = 'right';
    const input = document.createElement('input');
    input.type = 'range';
    input.min = String(cfg.min);
    input.max = String(cfg.max);
    input.step = String(cfg.step);
    input.style.flex = '1';
    input.addEventListener('input', (event) => {
      const target = event.target as HTMLInputElement;
      const parsed = Number.parseFloat(target.value);
      if (Number.isNaN(parsed)) return;
      handleInput(cfg, parsed);
    });
    controlMap[cfg.key] = { input, value };
    line.appendChild(label);
    line.appendChild(input);
    line.appendChild(value);
    panel.appendChild(line);
  });

  document.body.appendChild(panel);

  const onWindowThreshold = () => {
    syncControls();
  };
  window.addEventListener('tp:asr:thresholds', onWindowThreshold as EventListener);
  syncControls();
}
