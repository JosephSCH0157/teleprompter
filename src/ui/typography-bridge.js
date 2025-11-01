// Typography bridge for modular dev path
// - Applies CSS variables for typography
// - Bridges Settings (window.applyTypography)
// - Prevents browser zoom and adds wheel-based font-size adjustments

(function(){
  try { if (window.__tpTsTypographyActive) return; } catch {}
  try { window.__tpTypographyBridgeActive = true; } catch {}
  try {
    const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

    function applyTypographyVars(fontPx, lineH) {
      try {
        const root = document.documentElement;
        const cs = getComputedStyle(root);
        const curFS = Number.parseFloat(cs.getPropertyValue('--tp-font-size')) || 56;
        const curLH = Number.parseFloat(cs.getPropertyValue('--tp-line-height')) || 1.4;
        const fs = Number.isFinite(fontPx) ? clamp(fontPx, 18, 120) : curFS;
        const lh = Number.isFinite(lineH) ? clamp(lineH, 1.1, 2.0) : curLH;
        root.style.setProperty('--tp-font-size', String(fs) + 'px');
        root.style.setProperty('--tp-line-height', String(lh));
        // Persist legacy keys for hydration
        try { localStorage.setItem('tp_font_size_v1', String(fs)); } catch {}
        try { localStorage.setItem('tp_line_height_v1', String(lh)); } catch {}
        // Notify local listeners
        try { window.dispatchEvent(new Event('tp:lineMetricsDirty')); } catch {}
        // Broadcast to Display immediately (no link toggle required)
        try {
          const snap = { fontSizePx: fs, lineHeight: lh };
          const payload = { kind: 'tp:typography', source: 'main', display: 'display', t: snap };
          try { new BroadcastChannel('tp_display').postMessage(payload); } catch {}
          try {
            const w = window.__tpDisplayWindow || (window.tpDisplay && window.tpDisplay.win) || null;
            if (w && !w.closed) w.postMessage(payload, '*');
          } catch {}
        } catch {}
        // Also support older path
        try { window.sendToDisplay && window.sendToDisplay({ type: 'typography', fontSize: fs, lineHeight: lh }); } catch {}
      } catch {}
    }

    // Expose bridge for Settings overlay
    try {
      window.applyTypography = function(){
        try {
          const pick = (ids) => { for (const id of ids) { const el = document.getElementById(id); if (el) return el; } return null; };
          const fsEl = pick(['typoFontSize-main','fontSize-main','settingsFontSize','fontSize']);
          const lhEl = pick(['typoLineHeight-main','lineHeight-main','settingsLineHeight','lineHeight']);
          const fs = fsEl && 'value' in fsEl ? Number(fsEl.value) : NaN;
          const lh = lhEl && 'value' in lhEl ? Number(lhEl.value) : NaN;
          applyTypographyVars(fs, lh);
        } catch {}
      };
    } catch {}

    // Initial hydration from storage or fallback to hidden inputs
    try {
      const fsStored = (function(){ try { return Number(localStorage.getItem('tp_font_size_v1')); } catch { return NaN; } })();
      const lhStored = (function(){ try { return Number(localStorage.getItem('tp_line_height_v1')); } catch { return NaN; } })();
      let fsInit = Number.isFinite(fsStored) ? fsStored : NaN;
      let lhInit = Number.isFinite(lhStored) ? lhStored : NaN;
      if (!Number.isFinite(fsInit) || !Number.isFinite(lhInit)) {
        const fsEl = document.getElementById('fontSize');
        const lhEl = document.getElementById('lineHeight');
        const fsV = fsEl && 'value' in fsEl ? Number(fsEl.value) : NaN;
        const lhV = lhEl && 'value' in lhEl ? Number(lhEl.value) : NaN;
        if (!Number.isFinite(fsInit)) fsInit = fsV;
        if (!Number.isFinite(lhInit)) lhInit = lhV;
      }
      applyTypographyVars(fsInit, lhInit);
    } catch {}

    // Zoom guard: prevent browser-level zoom (Ctrl/Meta + wheel or +/-/0)
    try {
      window.addEventListener('wheel', (e) => {
        if (e && (e.ctrlKey || e.metaKey)) { try { e.preventDefault(); } catch {} }
      }, { passive: false });
      window.addEventListener('keydown', (e) => {
        try {
          if (!(e.ctrlKey || e.metaKey)) return;
          const k = e.key || '';
          if (k === '+' || k === '=' || k === '-' || k === '_' || k === '0') {
            e.preventDefault();
          }
        } catch {}
      }, { capture: true });
    } catch {}

    // Ctrl/Cmd + Wheel anywhere → adjust font size (CSS var)
    try {
      window.addEventListener('wheel', (e) => {
        try {
          if (!(e.ctrlKey || e.metaKey)) return;
          const tag = (e.target && e.target.tagName || '').toLowerCase();
          if (tag === 'input' || tag === 'textarea' || (e.target && e.target.isContentEditable)) return;
          e.preventDefault();
          const root = document.documentElement;
          const cs = getComputedStyle(root);
          const curPx = parseFloat(cs.getPropertyValue('--tp-font-size')) || 56;
          const next = clamp(curPx + (e.deltaY < 0 ? 2 : -2), 18, 120);
          const lh = parseFloat(cs.getPropertyValue('--tp-line-height')) || 1.4;
          applyTypographyVars(next, lh);
        } catch {}
      }, { passive: false });
    } catch {}

    // Shift + Wheel over viewer → adjust font size without Ctrl/Cmd
    try {
      const viewer = document.getElementById('viewer');
      if (viewer) {
        viewer.addEventListener('wheel', (e) => {
          try {
            if (!e.shiftKey || e.ctrlKey || e.metaKey) return;
            const tag = (e.target && e.target.tagName || '').toLowerCase();
            if (tag === 'input' || tag === 'textarea' || (e.target && e.target.isContentEditable)) return;
            e.preventDefault();
            const root = document.documentElement;
            const cs = getComputedStyle(root);
            const curPx = parseFloat(cs.getPropertyValue('--tp-font-size')) || 56;
            const next = clamp(curPx + (e.deltaY < 0 ? 2 : -2), 18, 120);
            const lh = parseFloat(cs.getPropertyValue('--tp-line-height')) || 1.4;
            applyTypographyVars(next, lh);
          } catch {}
        }, { passive: false });
      }
    } catch {}
  } catch {}
})();
