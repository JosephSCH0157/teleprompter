(function () {
  if (!window.__tpSettings) return;
  const HUD = window.HUD || { log: console.log };
  const before = window.__tpSettings.get();
  window.__tpSettings.patch({ fontSize: (before.fontSize || 28) + 1 });
  const after = window.__tpSettings.get();
  HUD.log('settings:roundtrip', { ok: after.fontSize === (before.fontSize + 1) });

  // Cross‑tab broadcast sanity (best-effort in smoke env)
  try { localStorage.setItem('tp_settings', localStorage.getItem('tp_settings') || ''); } catch {}
})();
