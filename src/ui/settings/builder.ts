export function buildSettingsContent(rootEl: HTMLElement | null) {
  if (!rootEl) return '';
  // Minimal placeholder: return inner HTML or a stub
  try { return rootEl.innerHTML || ''; } catch { return ''; }
}

export {};
