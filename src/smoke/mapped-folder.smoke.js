(function(){
  try {
    const ok = typeof window.__tpFolder !== 'undefined';
    (window.HUD || console).log('mapped-folder:api', { ok });
  } catch (e) {
    try { console.warn('[smoke] mapped-folder probe error', e && e.message || e); } catch {}
  }
})();