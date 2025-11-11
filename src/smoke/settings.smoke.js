(function () {
  if (!window.__tpSettings) return;
  const HUD = window.HUD || { log: console.log };
  const before = window.__tpSettings.get();
  window.__tpSettings.patch({ fontSize: (before.fontSize || 28) + 1, mirror: !before.mirror });
  const after = window.__tpSettings.get();
  const ok = after.fontSize === before.fontSize + 1 && after.mirror === !before.mirror;
  HUD.log('settings:roundtrip', { ok });
  // Cross‑tab broadcast sanity (best-effort in smoke env)
  try { localStorage.setItem('tp_settings', localStorage.getItem('tp_settings') || ''); } catch {}
})();
