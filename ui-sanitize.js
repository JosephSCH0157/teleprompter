/* ui-sanitize.js — small self-heal helper to remove duplicate settings panels */
(function(){
  try {
    // Legacy duplicate settings panels
    var panels = Array.from(document.querySelectorAll('[data-panel="settings"]'));
    if (panels.length > 1) {
      panels.slice(1).forEach(function(p){ try{ p.remove(); }catch{} });
      try { (window.tp_hud || window.__tpHud) && (window.tp_hud || window.__tpHud)('ui:selfheal', { removed: panels.length - 1, panel: 'settings' }); } catch{}
    }
  } catch{}

  try {
    // Prevent duplicate overlays injected by extensions/old builds
    var seen = new Set();
    document.querySelectorAll('#settingsOverlay, #shortcutsOverlay').forEach(function(n){
      try {
        if (seen.has(n.id)) n.remove(); else seen.add(n.id);
      } catch {}
    });
  } catch {}
})();
