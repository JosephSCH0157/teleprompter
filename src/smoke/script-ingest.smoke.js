(function(){
  try {
    const ok = typeof window.__tpIngest !== 'undefined';
    (window.HUD || console).log('script-ingest:api', { ok });
  } catch (e) {
    try { console.warn('[smoke] script-ingest probe error', e && e.message || e); } catch {}
  }
})();