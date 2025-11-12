// src/ui/hide-legacy-scripts.ts
// Disables legacy "browser-saved files" dropdowns to avoid confusion with mapped-folder.
export function disableLegacyScriptsUI() {
  const sel = '#savedScripts, #browserSavedScripts, #localScripts, .legacy-scripts, [data-saved="scripts"], [data-legacy-scripts]';
  const candidates = Array.from(document.querySelectorAll(sel)) as HTMLElement[];
  if (!candidates.length) return;
  for (const el of candidates) {
    try {
      const clone = el.cloneNode(true) as HTMLElement;
      clone.style.display = 'none';
      el.replaceWith(clone);
    } catch {}
  }
  try { (window as any).HUD?.log?.('ui:legacy-scripts:disabled', { count: candidates.length }); } catch {}
}
