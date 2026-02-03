const UI_SCALE_KEY = 'tp_ui_scale_v1';
const DEFAULT_UI_SCALE = 0.67;
const MIN_UI_SCALE = 0.55;
const MAX_UI_SCALE = 1.1;

const clamp = (value: number) => Math.min(MAX_UI_SCALE, Math.max(MIN_UI_SCALE, value));

export function readUiScale(): number {
  if (typeof window === 'undefined') return DEFAULT_UI_SCALE;
  try {
    const raw = window.localStorage.getItem(UI_SCALE_KEY);
    const parsed = raw == null ? NaN : Number.parseFloat(raw);
    if (!Number.isFinite(parsed)) return DEFAULT_UI_SCALE;
    return clamp(parsed);
  } catch {
    return DEFAULT_UI_SCALE;
  }
}

export function applyUiScale(value: number): number {
  const next = clamp(Number(value) || DEFAULT_UI_SCALE);
  try {
    document.documentElement.style.setProperty('--tp-ui-scale', String(next));
  } catch {
    // ignore
  }
  return next;
}

export function initUiScale(): number {
  const next = readUiScale();
  return applyUiScale(next);
}

export function persistUiScale(value: number): number {
  const next = applyUiScale(value);
  try {
    window.localStorage.setItem(UI_SCALE_KEY, String(next));
  } catch {
    // ignore
  }
  return next;
}

export function wireUiScaleControls(root: ParentNode | null | undefined): void {
  if (!root || typeof document === 'undefined') return;
  const range = root.querySelector<HTMLInputElement>('#uiScaleRange');
  const number = root.querySelector<HTMLInputElement>('#uiScaleNumber');
  const valueEl = root.querySelector<HTMLElement>('#uiScaleValue');
  if (!range && !number) return;

  const format = (value: number) => value.toFixed(2);
  const syncFields = (value: number) => {
    const text = format(value);
    if (range && range.value !== text) range.value = text;
    if (number && number.value !== text) number.value = text;
    if (valueEl) valueEl.textContent = text;
  };

  const apply = (value: number, persist: boolean) => {
    const next = persist ? persistUiScale(value) : applyUiScale(value);
    syncFields(next);
  };

  const initial = readUiScale();
  syncFields(initial);
  applyUiScale(initial);

  const handleInput = (ev: Event) => {
    const target = ev.target as HTMLInputElement | null;
    if (!target) return;
    apply(Number.parseFloat(target.value), false);
  };

  const handleChange = (ev: Event) => {
    const target = ev.target as HTMLInputElement | null;
    if (!target) return;
    apply(Number.parseFloat(target.value), true);
  };

  if (range) {
    range.addEventListener('input', handleInput);
    range.addEventListener('change', handleChange);
  }
  if (number) {
    number.addEventListener('input', handleInput);
    number.addEventListener('change', handleChange);
  }
}
