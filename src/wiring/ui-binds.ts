// Unified core UI binder (TS path)
// Centralizes lightweight, idempotent DOM event wiring that was previously
// scattered across legacy scripts. Keep this file SIDE-EFFECT FREE except for
// the explicit bindCoreUI() invocation by the caller (index.ts) so tests can
// re-run it safely.
//
// Contract:
//  - Safe to call multiple times (no duplicate listeners / mutations)
//  - Does not throw (best-effort guards everywhere)
//  - Exposes minimal helpers on window for legacy fallbacks (__tpUiBinder)
//  - Wires: scroll mode select → setScrollMode router, present mode button,
//           shortcuts / settings open helpers (kept tiny since index.ts also
//           provides overlay lifecycle events for smoke determinism), and
//           anchor HUD tick.
//
// NOTE: We intentionally DO NOT de‑duplicate all existing legacy wiring here
// yet; this first pass focuses on the scroll mode router + minimal parity.
// Future cleanup can migrate more overlay logic once smoke tests cover it.

export interface CoreUIBindOptions {
  scrollModeSelect?: string;      // CSS selector for the scroll mode <select>
  presentBtn?: string;            // Present mode toggle button
}

function q<T extends HTMLElement = HTMLElement>(sel: string | undefined | null): T | null {
  if (!sel) return null; try { return document.querySelector(sel) as T | null; } catch { return null; }
}

function on(el: Element | null | undefined, ev: string, fn: any, opts?: any) {
  try { if (el && 'addEventListener' in el) (el as any).addEventListener(ev, fn, opts); } catch {}
}

// Map <option value> → internal UiScrollMode (see index.ts applyUiScrollMode)
function mapScrollValue(v: string): 'auto'|'asr'|'step'|'rehearsal'|'off' {
  switch (v) {
    case 'timed': return 'auto';        // pure time-based
    case 'wpm': return 'auto';          // WPM currently modeled as timed brain
    case 'hybrid': return 'asr';        // legacy label for hybrid (auto + ASR)
    case 'asr': return 'asr';           // explicit ASR option
    case 'step': return 'step';
    case 'rehearsal': return 'rehearsal';
    default: return 'off';
  }
}

export function bindCoreUI(opts: CoreUIBindOptions = {}) {
  try {
    if ((window as any).__tpCoreUiBound) return; // idempotent short‑circuit
    (window as any).__tpCoreUiBound = true;
  } catch {}

  try { (window as any).__tpUiBinder = { rebind: () => { try { (window as any).__tpCoreUiBound = false; bindCoreUI(opts); } catch {} } }; } catch {}

  // Scroll Mode select → setScrollMode router
  try {
    const sel = q<HTMLSelectElement>(opts.scrollModeSelect || '#scrollMode');
    if (sel && !sel.dataset.uiBound) {
      sel.dataset.uiBound = '1';
      const apply = () => {
        try {
          const raw = String(sel.value || '').trim();
          const mode = mapScrollValue(raw);
          const fn = (window as any).setScrollMode as ((_m: any)=>void)|undefined;
          fn && fn(mode);
          // HUD log for visibility
          try { (window as any).HUD?.log?.('scroll:ui-mode', { raw, mapped: mode }); } catch {}
        } catch {}
      };
      on(sel, 'change', apply);
      // Initialize once DOM is stable (microtask → rAF)
      queueMicrotask(() => requestAnimationFrame(apply));
    }
  } catch {}

  // Present Mode toggle (mirrors legacy wiring in ui/dom.js but harmless if duplicated)
  try {
    const btn = q<HTMLButtonElement>(opts.presentBtn || '#presentBtn');
    if (btn && !btn.dataset.uiBound) {
      btn.dataset.uiBound = '1';
      on(btn, 'click', (e: Event) => {
        try { e.preventDefault(); } catch {}
        try {
          const root = document.documentElement;
            const on = !root.classList.contains('tp-present');
            root.classList.toggle('tp-present', on);
            btn.textContent = on ? 'Exit Present' : 'Present Mode';
            try { localStorage.setItem('tp_present', on ? '1' : '0'); } catch {}
        } catch {}
      });
      // Restore persisted state early
      try {
        const was = (function(){ try { return localStorage.getItem('tp_present') === '1'; } catch { return false; } })();
        if (was) document.documentElement.classList.add('tp-present');
      } catch {}
    }
  } catch {}

  // ESC safety exit & P hotkey (non-invasive; capture late)
  try {
    if (!(window as any).__tpCoreUiKeybinds) {
      (window as any).__tpCoreUiKeybinds = true;
      window.addEventListener('keydown', (e) => {
        try {
          const root = document.documentElement;
          if (e.key === 'Escape' && root.classList.contains('tp-present')) root.classList.remove('tp-present');
          if ((e.key === 'p' || e.key === 'P') && !e.metaKey && !e.ctrlKey && !e.altKey) {
            root.classList.toggle('tp-present');
          }
        } catch {}
      });
    }
  } catch {}

  // Anchor HUD heartbeat for dev visibility (fires lightweight event every 2s)
  try {
    if (!(window as any).__tpAnchorPulse) {
      (window as any).__tpAnchorPulse = true;
      setInterval(() => { try { window.dispatchEvent(new CustomEvent('tp:anchor:pulse')); } catch {}; }, 2000);
    }
  } catch {}
}

// (No auto‑invoke here; index.ts calls bindCoreUI() inside its onReady path)
