// src/ui/settings-bind.ts
import { getSettings, patchSettings, onSettings } from '../core/settings-state';
import type { Settings } from '../core/settings-types';

/** Declarative binder: elements with data-setting="key" stay in sync with SSOT.
 *  Supports inputs (checkbox/number/range/text), selects, and radios. */
export function bindSettingsForm(root: ParentNode = document): () => void {
  const els = Array.from(root.querySelectorAll<HTMLElement>('[data-setting]'));
  const off = onSettings(apply as any);
  els.forEach(wire);
  // initial
  apply(getSettings());
  return () => { try { off && (off as any)(); } catch {} };

  function wire(el: HTMLElement) {
    const key = el.getAttribute('data-setting') as keyof Settings;
    if (!key) return;
    const tag = (el as any).tagName;
    const isInput = tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA';
    if (!isInput) return;

    const onChange = () => {
      const v = readValue(el as any);
      patchSettings({ [key]: v } as any);
    };
    el.addEventListener('change', onChange);
    if ((el as any).type === 'range' || (el as any).type === 'number') el.addEventListener('input', onChange);
  }

  function apply(s: Settings) {
    for (const el of els) {
      const key = el.getAttribute('data-setting') as keyof Settings;
      if (!key) continue;
      writeValue(el as any, (s as any)[key]);
    }
    applyDomEffects(s);
  }
}

function readValue(el: HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement): any {
  if ((el as HTMLInputElement).type === 'checkbox') return (el as HTMLInputElement).checked;
  if ((el as HTMLInputElement).type === 'number' || (el as HTMLInputElement).type === 'range') return Number((el as HTMLInputElement).value);
  if (el.tagName === 'SELECT') return (el as HTMLSelectElement).value;
  return (el as HTMLInputElement).value;
}
function writeValue(el: HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement, v: any): void {
  if ((el as HTMLInputElement).type === 'checkbox') (el as HTMLInputElement).checked = !!v;
  else (el as any).value = v;
}

/** Apply side-effects to DOM/CSS variables for instant feedback */
export function applyDomEffects(s: Settings) {
  const root = document.documentElement;
  try {
    root.style.setProperty('--tp-font-size', `${s.fontSize}px`);
    root.style.setProperty('--tp-line-height', String(s.lineHeight));
    root.dataset.theme = s.theme; // CSS can theme by [data-theme]
    root.dataset.notesHidden = String(!!s.hideNotes);
    root.dataset.mirror = String(!!s.mirror);
    root.dataset.colorize = String(!!s.colorize);
    root.dataset.hud = String(!!s.hud);
  } catch {}
}
