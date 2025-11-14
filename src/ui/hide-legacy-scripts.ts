// src/ui/hide-legacy-scripts.ts
// Disables legacy "browser-saved files" dropdowns to avoid confusion with mapped-folder.
export function disableLegacyScriptsUI() {
  const sel = '#savedScripts, #browserSavedScripts, #localScripts, #scriptSlots, #externalScriptsRow, .legacy-scripts, [data-saved="scripts"], [data-legacy-scripts]';
  const candidates = Array.from(document.querySelectorAll(sel)) as HTMLElement[];
  if (!candidates.length) return;
  for (const el of candidates) {
    try { el.style.display = 'none'; } catch {}
  }
  try { (window as any).HUD?.log?.('ui:legacy-scripts:disabled', { count: candidates.length }); } catch {}
}

// Observe for late-added legacy selects and hide them immediately.
try {
  const LEGACY_OBS_SEL = '#scriptSlots';
  const obs = new MutationObserver(() => {
    try {
      const late = document.querySelector(LEGACY_OBS_SEL) as HTMLElement | null;
      if (late && late.style.display !== 'none') {
        try { late.style.display = 'none'; (window as any).HUD?.log?.('ui:legacy-scripts:late-hidden', { id: late.id }); } catch {}
      }
    } catch {}
  });
  obs.observe(document.documentElement, { childList: true, subtree: true });
  setTimeout(() => { try { obs.disconnect(); } catch {} }, 8000);
} catch {}

// Neuters legacy saved-scripts initialization functions so they cannot reattach UI.
export function neuterLegacyScriptsInit() {
  try {
    const g: any = window as any;
    const initFns = ['initBrowserSavedScripts', 'bindLocalScripts', '__tpLegacyScriptsInit'];
    for (const k of initFns) {
      if (typeof g[k] === 'function') {
        g[k] = () => { try { (window as any).HUD?.log?.('ui:legacy-scripts:neutered', { fn: k }); } catch {}; };
      }
    }
  } catch {}
}
