// Lightweight, idempotent sidebar mode rows synchronizer for both JS and TS boot paths
// It toggles #autoRow and #wpmRow based on the current #scrollMode value and on DOM mutations.

export function installModeRowsSync(root = document) {
  try {
    if (window.__tpModeRowsSyncInstalled) return; // idempotent
    window.__tpModeRowsSyncInstalled = true;
  } catch {}

  function syncSidebarModeUI() {
    try {
      const sel = (root.getElementById ? root.getElementById('scrollMode') : document.getElementById('scrollMode'));
      const val = (sel && sel.value) || '';
      const autoRow = document.getElementById('autoRow');
      const wpmRow = document.getElementById('wpmRow');
      const isWpm = val === 'wpm';
      if (autoRow) {
        autoRow.classList.toggle('visually-hidden', isWpm);
        if (isWpm) autoRow.setAttribute('aria-hidden', 'true'); else autoRow.removeAttribute('aria-hidden');
      }
      if (wpmRow) {
        wpmRow.classList.toggle('visually-hidden', !isWpm);
        if (isWpm) wpmRow.removeAttribute('aria-hidden'); else wpmRow.setAttribute('aria-hidden', 'true');
      }
    } catch {}
  }

  try {
    const modeSel = document.getElementById('scrollMode');
    if (modeSel && modeSel.addEventListener) {
      modeSel.addEventListener('change', () => { try { syncSidebarModeUI(); } catch {} });
    }
  } catch {}

  // Initial sync
  try { syncSidebarModeUI(); } catch {}

  // Observe sidebar re-renders
  try {
    const panel = document.querySelector('aside.panel');
    if (panel && 'MutationObserver' in window) {
      const mo = new MutationObserver(() => { try { syncSidebarModeUI(); } catch {} });
      mo.observe(panel, { childList: true, subtree: true });
    }
  } catch {}
}
