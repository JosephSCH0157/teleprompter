// src/ui/settings-retrofit.ts
import { applyDomEffects, bindSettingsForm } from './settings-bind';

const MAP: Record<string, string> = {
  // id → Settings key
  'opt-theme': 'theme',
  'opt-font-size': 'fontSize',
  'opt-line-height': 'lineHeight',
  'opt-mirror': 'mirror',
  'opt-colorize': 'colorize',
  'opt-hide-notes': 'hideNotes',
  'opt-hud': 'hud',
  'opt-wpm': 'wpm',
  'opt-step-size': 'stepSize',
  'opt-auto-start': 'autoStart',
  'opt-asr-lang': 'asrLang',
};

export function retrofitSettingsAttributes(root: Document | ParentNode = document) {
  Object.entries(MAP).forEach(([id, key]) => {
    let el: HTMLElement | null = null;
    try {
      if ((root as Document).getElementById) el = (root as Document).getElementById(id) as HTMLElement | null;
      else el = (root as ParentNode).querySelector?.(`#${CSS?.escape?.(id)}`) as HTMLElement | null;
    } catch {}
    if (el && !el.hasAttribute('data-setting')) el.setAttribute('data-setting', key);
  });
  // Re-bind after tagging
  bindSettingsForm(root);
  // Ensure CSS vars apply once immediately
  try { applyDomEffects((window as any).__tpSettings?.get?.()); } catch {}
}
