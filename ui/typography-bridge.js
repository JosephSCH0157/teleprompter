// Typography bridge for modular dev path
// - Applies CSS variables for typography
// - Bridges Settings (window.applyTypography)
// - Prevents browser zoom and adds wheel-based font-size adjustments

(function(){
  try {
    const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
    const DISPLAY_ID = (function(){ try { return window.opener ? 'display' : 'main'; } catch { return 'main'; } })();

    // Minimal local store: tp_typography_v1 = { main: {...}, display: {...} }
    const KEY = 'tp_typography_v1';
    function readStore(){
      try { const raw = localStorage.getItem(KEY); return raw ? JSON.parse(raw) : {}; } catch { return {}; }
    }
    function writeStore(st){ try { localStorage.setItem(KEY, JSON.stringify(st||{})); } catch {}
    }
    function setTypographyLocal(patch){
      try {
        const st = readStore();
        const cur = st[DISPLAY_ID] || {};
        st[DISPLAY_ID] = { ...cur, ...patch };
        writeStore(st);
      } catch {}
    }

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
        // Persist per-window (no cross-broadcast by default)
        setTypographyLocal({ fontSizePx: fs, lineHeight: lh });
        try { window.dispatchEvent(new Event('tp:lineMetricsDirty')); } catch {}
      } catch {}
    }

    // Expose bridge for Settings overlay
    try {
      window.applyTypography = function(){
        try {
          const fsEl = document.getElementById('fontSize');
          const lhEl = document.getElementById('lineHeight');
          const fs = fsEl && 'value' in fsEl ? Number(fsEl.value) : NaN;
          const lh = lhEl && 'value' in lhEl ? Number(lhEl.value) : NaN;
          applyTypographyVars(fs, lh);
        } catch {}
      };
    } catch {}

    // Initial hydration from storage or fallback to hidden inputs
    try {
      const store = readStore();
      const own = (store && store[DISPLAY_ID]) || {};
      let fsInit = Number(own.fontSizePx);
      let lhInit = Number(own.lineHeight);
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

    // Shift + Wheel over viewer (main) or wrap (display) → adjust font size without Ctrl/Cmd
    function wireLocalWheelTargets() {
      try {
        const targetId = (DISPLAY_ID === 'display') ? 'wrap' : 'viewer';
        const host = document.getElementById(targetId);
        if (!host) return;
        if (host.__tpWheelWired) return; // idempotent
        Object.defineProperty(host, '__tpWheelWired', { value: true, configurable: true });
        host.addEventListener('wheel', (e) => {
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
      } catch {}
    }
    // Wire after DOM is ready and re-wire if the target gets replaced
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', () => { try { wireLocalWheelTargets(); } catch {} });
    } else {
      wireLocalWheelTargets();
    }
    try {
      const mo = new MutationObserver(() => { try { wireLocalWheelTargets(); } catch {} });
      mo.observe(document.documentElement, { childList: true, subtree: true });
    } catch {}
  } catch {}
})();
