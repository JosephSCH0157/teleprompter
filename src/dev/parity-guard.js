// Runs only in dev. Verifies core UI exists & is wired.
(function () {
  try {
    const isDev = window.__TP_BOOT_INFO?.isDev;
    if (!isDev) return;

    const fails = [];
    const q = (s) => document.querySelector(s);
    const must = (sel, msg) => { if (!q(sel)) fails.push(msg || `${sel} missing`); };

    // existence
    must('.topbar');
    must('#viewer');
    ['#presentBtn','#settingsBtn','#shortcutsBtn','#speakerIndexChip','#dbMeter',
     '#settingsOverlay','#settingsClose','#shortcutsOverlay','#shortcutsClose']
     .forEach(id => must(id));

    // topbar hairline present?
    try {
      const tb = q('.topbar'); const st = tb && getComputedStyle(tb);
      if (!st || st.borderBottomWidth === '0px') fails.push('topbar hairline missing');
    } catch {}

    // paste hint exists (either #emptyHint or editor placeholder contains "Paste")
    (function () {
      const ed = document.getElementById('editor');
      const hint = document.getElementById('emptyHint');
      const ok = !!hint || (ed && 'placeholder' in ed && /\bpaste\b/i.test(ed.placeholder||''));
      if (!ok) fails.push('paste-script hint missing');
    })();

    // wiring checks (open/close overlays)
    (function () {
      const so = q('#shortcutsOverlay'), sb = q('#shortcutsBtn');
      const se = q('#settingsOverlay'),  sb2 = q('#settingsBtn');
      try { sb?.click(); } catch {}
      if (so && so.classList.contains('hidden')) fails.push('Help overlay does not open');
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
      try { sb2?.click(); } catch {}
      if (se && se.classList.contains('hidden')) fails.push('Settings overlay does not open');
      q('#settingsClose')?.click();
    })();

    // present toggle works (and reverts)
    (function () {
      const root = document.documentElement; const b = root.classList.contains('tp-present');
      q('#presentBtn')?.click();
      const a = root.classList.contains('tp-present');
      if (b === a) fails.push('Present toggle not working');
      q('#presentBtn')?.click(); // revert
    })();

    if (fails.length) {
      try { console.warn('[UI PARITY FAIL]', fails); } catch {}
      const box = document.createElement('div');
      box.style.cssText = 'position:fixed;top:8px;left:8px;z-index:99999;background:#b00020;color:#fff;padding:8px 10px;border-radius:8px;font:600 12px system-ui';
      box.textContent = `UI parity fail: ${fails.join(' • ')}`;
      document.body.appendChild(box);
    } else {
      try { console.log('%c[UI PARITY OK]', 'color:#0a0'); } catch {}
    }
  } catch {}
})();