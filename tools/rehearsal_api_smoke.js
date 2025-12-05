(async function(){
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    console.log('[rehearsal_api_smoke] skip: no DOM available (Node context)');
    return;
  }
  const ok=(b,m)=>{ if(!b) throw new Error(m); };
  const R = window.__tpRehearsal || window;
  const enter = (R && (R.enterRehearsal || R.enable || (window.enterRehearsal))) || null;
  const exit  = (R && (R.exitRehearsal || R.disable || (window.exitRehearsal))) || null;
  const isOn  = (R && (R.isRehearsal || R.isActive || (window.isRehearsal))) || null;
  ok(typeof enter==='function' && typeof exit==='function' && typeof isOn==='function', 'API functions present');
  // Enter
  enter();
  ok(isOn(), 'entered rehearsal');
  // Exit without confirm if supported
  try { exit(false); } catch { try { exit(); } catch {} }
  ok(!isOn(), 'exited rehearsal');
  console.log('[rehearsal_api_smoke] PASS');
})();
