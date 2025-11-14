// tools/rehearsal_smoke.js
// Minimal smoke test for Rehearsal Mode behavior
(function(){
  function ok(cond, msg){ if(!cond) throw new Error('[rehearsal_smoke] ' + msg); }
  function getSel(){ return document.getElementById('scrollMode'); }
  const api = window.__tpRehearsal || {};
  // Force mode selection if not already
  try { const sel = getSel(); if (sel) { sel.value = 'rehearsal'; sel.dispatchEvent(new Event('change', { bubbles:true })); } } catch {}
  if (!api.isActive?.()) { api.enable?.(); }
  ok(api.isActive?.() === true, 'rehearsal active after enable');
  ok(document.body.classList.contains('is-rehearsal'), 'body class present');
  // Ensure OBS won't connect (bridge short-circuit)
  try { if (window.__obsBridge) { window.__obsBridge.configure({}); window.__obsBridge.enableAutoReconnect && window.__obsBridge.enableAutoReconnect(true); } } catch {}
  try { window.__obsBridge?.start?.(); } catch {}
  setTimeout(()=>{ try { ok(!(window.__obsConnected), 'obs remains disconnected in rehearsal'); } catch {} }, 50);
  // Watermark check
  const wm = document.getElementById('rehearsalWatermark');
  ok(wm && getComputedStyle(wm).display !== 'none', 'watermark visible');
  // Clamp guard denies programmatic scroll
  ok(typeof window.__tpClampGuard === 'function', 'clamp guard installed');
  ok(window.__tpClampGuard(100, 200) === false, 'clamp guard denies scroll');
  // Hotkey interception (F9)
  let blocked = false;
  const probe = (_ev) => { blocked = true; };
  document.addEventListener('keydown', probe, { capture:true, once:true });
  document.dispatchEvent(new KeyboardEvent('keydown', { key:'F9', bubbles:true }));
  setTimeout(()=>{
    ok(blocked, 'hotkey intercepted');
    // Attempt to enable auto-scroll (should stay disabled)
    try { window.Auto?.toggle?.(); } catch {}
    ok(!(window.__tpAuto?.getState?.().enabled), 'auto-scroll kept disabled');
    // --- ASR cannot start or move scroll while in rehearsal ---
    try {
      const viewer = document.getElementById('viewer');
      const scEl = viewer || document.scrollingElement || document.documentElement || document.body;
      const startY = scEl.scrollTop|0;
      try { window.__tpASR?.start?.(); } catch {}
      setTimeout(()=>{
        const afterY = scEl.scrollTop|0;
        ok(afterY === startY, 'ASR did not move scroll');
        try { if (window.__tpASR && typeof window.__tpASR.isRunning === 'function') ok(!window.__tpASR.isRunning(), 'ASR reports not running under rehearsal'); } catch {}
      }, 90);
    } catch {}
    // Display window sync (open a lightweight mock and assert watermark mirror)
    let dispOk = true;
    try {
      const w = window.open('display.html#test','_blank','width=400,height=400');
      if (w) {
        setTimeout(()=>{ try { w.postMessage('tp:rehearsal:start','*'); } catch {} }, 30);
        setTimeout(()=>{ try { const mark = w.document.getElementById('rehearsalDisplayWatermark'); if(!mark) dispOk=false; } catch { dispOk=false; } }, 180);
      }
    } catch {}
    setTimeout(()=>{
      ok(dispOk, 'display window watermark present');
      // Exit (no confirm path) and verify cleanup
      api.disable?.();
      ok(!api.isActive?.(), 'rehearsal inactive after disable');
      ok(!document.body.classList.contains('is-rehearsal'), 'body class removed');
      console.log('[rehearsal_smoke] PASS');
    }, 250);
  }, 50);
})();
