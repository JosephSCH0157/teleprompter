(function(){
  try {
    var panels = Array.from(document.querySelectorAll('[data-panel="settings"]'));
    if (panels.length > 1) {
      panels.slice(1).forEach(function(p){ try{ p.remove(); }catch(e){} });
      try { (window.tp_hud || window.__tpHud) && (window.tp_hud || window.__tpHud)('ui:selfheal', { removed: panels.length - 1, panel: 'settings' }); } catch(e){}
    }
  } catch(e) {}
})();
