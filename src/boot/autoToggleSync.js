// Auto-toggle label synchronizer: listens to tp:autoState events and seeds initial label.
// Idempotent; safe to call from multiple boot paths (TS or JS).

export function installAutoToggleSync(AutoApi) {
  try { if (window.__tpAutoToggleSyncInstalled) return; window.__tpAutoToggleSyncInstalled = true; } catch {}

  function applyAutoToggleLabelFromState(detail) {
    try {
      const btn = document.getElementById('autoToggle');
      if (!btn) return;
      const label = String(detail && detail.label || '').trim();
      const gate  = String(detail && detail.gate  || '').trim(); // 'on' | 'paused' | 'manual' | 'off'
      if (label) btn.textContent = label;
      if (gate) {
        btn.setAttribute('data-state', gate);
        btn.setAttribute('aria-pressed', String(gate !== 'manual' && gate !== 'off'));
      }
    } catch {}
  }

  try {
    document.addEventListener('tp:autoState', (ev) => {
      try { applyAutoToggleLabelFromState(ev && ev.detail); } catch {}
    }, { capture: true });
  } catch {}

  // Seed initial state
  try {
    const st = AutoApi && typeof AutoApi.getState === 'function' ? AutoApi.getState() : null;
    const btn = document.getElementById('autoToggle');
    if (btn && st) {
      const enabled = !!st.enabled;
      const speed = Math.round(Number(st.speed || 0));
      const sel = document.getElementById('scrollMode');
      const mode = (sel && sel.value) || '';
      if (mode === 'wpm') {
        const baseline = Math.round(Number(window.tp_baseline_wpm || 120));
        btn.textContent = `Auto-scroll: ${enabled ? 'On' : 'Off'}${enabled ? ` — ${baseline} WPM` : ''}`;
      } else {
        btn.textContent = `Auto-scroll: ${enabled ? 'On' : 'Off'}${enabled ? ` — ${speed} px/s` : ''}`;
      }
      btn.setAttribute('data-state', enabled ? 'on' : 'off');
      btn.setAttribute('aria-pressed', String(enabled));
    }
  } catch {}
}
