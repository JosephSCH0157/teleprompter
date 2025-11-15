// Minimal JS binder shim (ui-binds.js)
// Provides bindCoreUI() used by src/index.js. Avoids 404 when TypeScript version not emitted.
// Focus: present mode toggle, settings/help open markers for smoke harness, and exported setter.

export function bindCoreUI(opts = {}) {
  try { if (window.__tpUiBinderInstalled) return; } catch {}
  try { window.__tpUiBinderInstalled = true; } catch {}
  const presentSel = opts.presentBtn || '#presentBtn, [data-action="present-toggle"]';
  const settingsOpenSel = '#settingsBtn, [data-action="settings-open"]';
  const settingsCloseSel = '#settingsClose, [data-action="settings-close"]';
  const helpOpenSel = '#shortcutsBtn, [data-action="help-open"], #helpBtn';
  const helpCloseSel = '#shortcutsClose, [data-action="help-close"]';

  const root = document.documentElement;

  function applyPresent(on) {
    try {
      root.classList.toggle('tp-present', !!on);
      if (on) root.setAttribute('data-smoke-present','1'); else root.removeAttribute('data-smoke-present');
      const btn = document.querySelector(presentSel);
      if (btn) btn.textContent = on ? 'Exit Present' : 'Present Mode';
      try { localStorage.setItem('tp_present', on ? '1':'0'); } catch {}
    } catch {}
  }
  try { window.__tpSetPresent = applyPresent; } catch {}
  // Restore prior state
  try { applyPresent(localStorage.getItem('tp_present') === '1'); } catch {}

  // Present button wiring
  try {
    const btn = document.querySelector(presentSel);
    if (btn && !btn.dataset.uiBound) {
      btn.dataset.uiBound = '1';
      btn.addEventListener('click', (e) => { try { e.preventDefault(); } catch {}; applyPresent(!root.classList.contains('tp-present')); });
    }
  } catch {}

  // Overlay helpers
  function markOpen(name) {
    try { document.body.setAttribute('data-smoke-open', name); } catch {}
    try { window.dispatchEvent(new CustomEvent('tp:'+name+':open')); } catch {}
  }
  function markClose(name) {
    try { if (document.body.getAttribute('data-smoke-open') === name) document.body.removeAttribute('data-smoke-open'); } catch {}
    try { window.dispatchEvent(new CustomEvent('tp:'+name+':close')); } catch {}
  }

  function wireOverlay(openSel, closeSel, name) {
    try {
      // Delegate clicks (capture) so we run even if other handlers throw
      document.addEventListener('click', (ev) => {
        try {
          const t = ev.target && ev.target.closest && ev.target.closest(openSel + ',' + closeSel);
          if (!t) return;
          const isOpen = t.matches(openSel);
          const ov = name === 'settings' ? document.getElementById('settingsOverlay') : document.getElementById('shortcutsOverlay');
          if (isOpen) {
            if (ov) ov.classList.remove('hidden');
            markOpen(name);
          } else {
            if (ov) ov.classList.add('hidden');
            markClose(name);
          }
        } catch {}
      }, { capture: true });
      // Escape closes both
      document.addEventListener('keydown', (e) => {
        try { if (e.key === 'Escape') markClose(name); } catch {}
      }, { capture: true });
    } catch {}
  }

  wireOverlay(settingsOpenSel, settingsCloseSel, 'settings');
  wireOverlay(helpOpenSel, helpCloseSel, 'help');
}

// Auto-bind in case index.js import happens after DOM is ready
try { if (document.readyState === 'complete' || document.readyState === 'interactive') bindCoreUI(); else document.addEventListener('DOMContentLoaded', () => bindCoreUI(), { once: true }); } catch {}
