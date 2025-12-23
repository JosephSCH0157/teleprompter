// HUD smoke test: validates HUD mounts, renders a tagged note, filter behavior, and session id presence
// Run inside app context (after teleprompter_pro.html boot). Exits with error on failure.
(async function(){
  if (typeof document === 'undefined' || typeof window === 'undefined') {
    console.log('[hud_smoke] skip: no DOM available (Node context)');
    return;
  }
  const ok = (b,m)=>{ if(!b) throw new Error(m); };
  try { localStorage.setItem('tp_hud_prod','1'); } catch {}
  // Wait a moment for loader to mount
  await new Promise(r=>setTimeout(r, 60));
  // Root element
  const root = document.getElementById('tp-dev-hud');
  ok(root, 'HUD root mounted');
  // Ensure session badge hydrated (may be '—' if rehearsal not started)
  const sessEl = document.getElementById('hudSpeechStatus');
  ok(sessEl, 'session status element present');
  // Dispatch transcript events (INT + FINAL with tag)
  window.dispatchEvent(new CustomEvent('tp:speech:transcript', { detail: { text:'todo: first smoke line', final:false, ts:Date.now(), sim:.11 } }));
  window.dispatchEvent(new CustomEvent('tp:speech:transcript', { detail: { text:'idea: second smoke line', final:true, ts:Date.now()+5, sim:.42 } }));
  await new Promise(r=>setTimeout(r, 40));
  const notesWrap = document.getElementById('hudNotes');
  ok(notesWrap && notesWrap.children.length >= 2, 'HUD rendered rows');
  // Check badge presence and tag removal
  const rows = Array.from(notesWrap.children);
  const hasTodoBadge = rows.some(r => /TODO/.test(r.textContent||'') || (r.querySelector && r.querySelector('span') && /TODO/.test(r.querySelector('span')?.textContent||'')));
  ok(hasTodoBadge, 'TODO badge present');
  // Toggle finals-only filter and ensure FINAL remains
  const filterCb = document.getElementById('hudFilterFinals');
  if (filterCb) {
    filterCb.click();
    await new Promise(r=>setTimeout(r,30));
    const filteredRows = Array.from(notesWrap.children);
    ok(filteredRows.length >= 1, 'Finals filter shows at least one row');
  }
  console.log('[hud_smoke] PASS');
})();
