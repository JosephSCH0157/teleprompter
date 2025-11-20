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
    ['#presentBtn','#settingsBtn,[data-action="settings-open"]','#shortcutsBtn,[data-action="help-open"]','#speakerIndexChip',
     '#settingsOverlay','#settingsClose,[data-action="settings-close"]','#shortcutsOverlay','#shortcutsClose,[data-action="help-close"]']
     .forEach(id => must(id));

    // Accept either legacy bottom meter (#dbMeter) or current top-bar meter (#dbMeterTop)
    (function () {
      const hasMeter = q('#dbMeterTop') || q('#dbMeter');
      if (!hasMeter) fails.push('#dbMeter missing');
    })();

    // topbar hairline present?
    try {
      const tb = q('.topbar'); const st = tb && getComputedStyle(tb);
      if (!st || st.borderBottomWidth === '0px') fails.push('topbar hairline missing');
    } catch {}

    // paste hint exists (either #emptyHint, current .empty-msg banner, or editor placeholder contains "Paste")
    (function () {
      const ed = document.getElementById('editor');
      const hint = document.getElementById('emptyHint');
      const banner = document.querySelector('.empty-msg');
      const scriptHint = document.querySelector('.tp-paste-hint');
      const ok = !!hint
        || !!banner
        || !!scriptHint
        || (ed && 'placeholder' in ed && /\bpaste\b/i.test(ed.placeholder||''))
        || (banner && /\bpaste\b/i.test(String(banner.textContent||'')))
        || (scriptHint && /\bpaste\b/i.test(String(scriptHint.textContent||'')));
      if (!ok) fails.push('paste-script hint missing');
    })();

    // wiring checks (open/close overlays)
    (function () {
      const so = q('#shortcutsOverlay'), sb = q('#shortcutsBtn');
      const se = q('#settingsOverlay'),  sb2 = q('#settingsBtn, [data-action="settings-open"]');
      try { sb?.click(); } catch {}
      if (so && so.classList.contains('hidden')) fails.push('Help overlay does not open');
      // Close explicitly via Close button to avoid depending on keydown target
      try { q('#shortcutsClose, [data-action="help-close"]')?.click(); } catch {}
      try { sb2?.click(); } catch {}
      if (se && se.classList.contains('hidden')) fails.push('Settings overlay does not open');
      q('#settingsClose, [data-action="settings-close"]')?.click();
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