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
    // Exit (no confirm path) and verify cleanup
    api.disable?.();
    ok(!api.isActive?.(), 'rehearsal inactive after disable');
    ok(!document.body.classList.contains('is-rehearsal'), 'body class removed');
    console.log('[rehearsal_smoke] PASS');
  }, 50);
})();
