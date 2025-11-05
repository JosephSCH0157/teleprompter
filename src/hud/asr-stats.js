// Dev-only ASR stats HUD line. Renders a compact status inside #hud-root.
// Shows commits, avg score, p95 gap, tween avg, and suppressed counters.
let __asrHudHandler = null;
(function(){
  try {
    const isDev = (() => {
      try {
        if (window.__TP_DEV) return true;
        if (/([?#]).*dev=1/.test(location.href)) return true;
        return (localStorage.getItem('tp_dev_mode') === '1');
      } catch { return false; }
    })();
    if (!isDev) return; // keep this HUD silent in prod

    function ensureHudRoot(){
      try {
        let r = document.getElementById('hud-root');
        if (!r) {
          r = document.createElement('div');
          r.id = 'hud-root';
          r.className = 'hud-root hidden';
          r.setAttribute('aria-hidden','true');
          r.setAttribute('inert','');
          document.body.appendChild(r);
        }
        return r;
      } catch { return null; }
    }

    function install(){
      const root = ensureHudRoot();
      if (!root) return;
      let line = document.getElementById('asrStatsHud');
      if (!line) {
        line = document.createElement('div');
        line.id = 'asrStatsHud';
        line.style.cssText = [
          'font:12px/1.3 system-ui,Segoe UI,Roboto,Arial,sans-serif',
          'color:#9fb4c9',
          'background:rgba(255,255,255,0.04)',
          'border:1px solid rgba(255,255,255,0.08)',
          'border-radius:8px',
          'padding:6px 8px',
          'margin:4px 0',
          'pointer-events:auto',
          'max-width:320px'
        ].join(';');
        const strong = document.createElement('strong');
        strong.textContent = 'ASR';
        strong.style.marginRight = '6px';
        line.appendChild(strong);
        const span = document.createElement('span');
        span.id = 'asrStatsText';
        span.textContent = '—';
        line.appendChild(span);

        // Optional small dB mute toggle (uses window.setHudQuietDb from src/index.js)
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.textContent = 'dB:on';
        btn.title = 'Toggle HUD dB breadcrumbs';
        btn.style.cssText = 'margin-left:8px;font:inherit;color:#e6eef8;background:transparent;border:1px solid rgba(255,255,255,0.15);border-radius:6px;padding:2px 6px;cursor:pointer';
        const syncBtn = () => {
          try {
            const off = localStorage.getItem('tp_hud_quiet_db') === '1';
            btn.textContent = off ? 'dB:off' : 'dB:on';
          } catch {}
        };
        btn.addEventListener('click', (e) => {
          try { e.preventDefault(); } catch {}
          try {
            const off = localStorage.getItem('tp_hud_quiet_db') === '1';
            localStorage.setItem('tp_hud_quiet_db', off ? '0' : '1');
            if (typeof window.setHudQuietDb === 'function') window.setHudQuietDb(!off);
          } catch {}
          syncBtn();
        });
        syncBtn();
        // Hide toggle if HUD root blocks pointer events
        try {
          const pe = getComputedStyle(root).pointerEvents;
          if (pe && pe.toLowerCase() === 'none') btn.style.display = 'none';
        } catch {}
        line.appendChild(btn);

        root.appendChild(line);
        // Try to unhide HUD in dev so the line is visible
        try {
          root.classList.remove('hidden');
          root.removeAttribute('aria-hidden');
          root.removeAttribute('inert');
        } catch {}
      }

      const textEl = document.getElementById('asrStatsText');
      const fmt = (v, n=2) => {
        try { return (typeof v === 'number' && isFinite(v)) ? v.toFixed(n) : String(v); } catch { return String(v); }
      };
      __asrHudHandler = (e) => {
        try {
          const d = (e && e.detail) || {};
          const sup = d.suppressed || {};
          const msg = `commits ${d.commits||0} • avg ${fmt(d.avgScore,2)} • p95 ${d.p95GapMs|0}ms • tween ${fmt(d.tweenStepsAvg,1)} • sup d:${sup.dup||0} b:${sup.backwards||0} l:${sup.leap||0} f:${sup.freeze||0}`;
          if (textEl) textEl.textContent = msg;
        } catch {}
      };
      window.addEventListener('asr:stats', __asrHudHandler);
    }

    if (document.readyState === 'complete' || document.readyState === 'interactive') install();
    else document.addEventListener('DOMContentLoaded', install);
  } catch {}
})();
export function teardownHud(){
  try { if (__asrHudHandler) window.removeEventListener('asr:stats', __asrHudHandler); } catch {}
  try { const line = document.getElementById('asrStatsHud'); if (line) line.remove(); } catch {}
  __asrHudHandler = null;
}

export { };

