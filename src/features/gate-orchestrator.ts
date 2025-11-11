/* Gate Orchestrator
 * Normalizes UI + ASR events → applyGate(mode, user, speech)
 */
import type { ScrollMode } from '../scroll-router';
import { applyGate } from '../scroll-router';

type GateBits = { mode: ScrollMode; user: boolean; speech: boolean };

const state: GateBits = { mode: 'manual', user: false, speech: false };

function pushGate() {
  applyGate(state.mode, state.user, state.speech);
}

// --- UI helpers ---
function readModeFromDOM(): ScrollMode {
  // 1) pills like: <button class="mode-pill" data-mode="wpm">
  const pill = document.querySelector<HTMLElement>('.mode-pill.active, [data-mode].active');
  if (pill?.dataset.mode) return pill.dataset.mode as ScrollMode;

  // 2) radios: <input type="radio" name="scrollMode" value="wpm" checked>
  const checked = document.querySelector<HTMLInputElement>('input[name="scrollMode"]:checked');
  if (checked?.value) return checked.value as ScrollMode;

  // 3) select: <select id="modeSelect"><option value="wpm">
  const sel = document.getElementById('modeSelect') as HTMLSelectElement | null;
  if (sel?.value) return sel.value as ScrollMode;

  return state.mode;
}

function readAutoIntentFromDOM(): boolean {
  // Any of: <button id="autoPill" class="on">, <div class="auto-toggle on">, <body class="auto-on">
  if ((window as any).__tpAutoOn != null) return !!(window as any).__tpAutoOn;
  if (document.querySelector('#autoPill.on, .auto-toggle.on, [data-auto="on"]')) return true;
  return document.body.classList.contains('auto-on');
}

// --- Bind mode changes ---
function bindMode() {
  // pills
  document.addEventListener('click', (e) => {
    const el = (e.target as HTMLElement)?.closest?.('[data-mode], .mode-pill') as HTMLElement | null;
    if (!el) return;
    const v = (el.dataset.mode || el.getAttribute('data-mode') || el.getAttribute('value')) as ScrollMode | null;
    if (!v) return;
    state.mode = v;
    pushGate();
  }, { passive: true });

  // radios
  document.addEventListener('change', (e) => {
    const el = e.target as HTMLInputElement;
    if (el?.name === 'scrollMode' && el.checked) {
      state.mode = el.value as ScrollMode;
      pushGate();
    }
  });

  // select
  const sel = document.getElementById('modeSelect') as HTMLSelectElement | null;
  sel?.addEventListener('change', () => { state.mode = sel.value as ScrollMode; pushGate(); });
}

// --- Bind Auto toggle changes ---
function bindAuto() {
  const update = () => { state.user = readAutoIntentFromDOM(); pushGate(); };

  // obvious buttons
  ['autoPill', 'autoToggle'].forEach((id) => {
    const el = document.getElementById(id);
    el?.addEventListener('click', () => setTimeout(update, 0), { passive: true });
    el?.addEventListener('change', update);
  });

  // mutation fallback (class flips)
  const pill = document.getElementById('autoPill') || document.querySelector('.auto-toggle');
  if (pill && 'MutationObserver' in window) {
    const mo = new MutationObserver(update);
    mo.observe(pill, { attributes: true, attributeFilter: ['class', 'data-auto', 'aria-pressed'] });
  }

  // body class fallback
  if ('MutationObserver' in window) {
    const moBody = new MutationObserver(update);
    moBody.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
    moBody.observe(document.body, { attributes: true, attributeFilter: ['class'] });
  }
}

// --- Speech/ASR integration ---
function bindSpeech() {
  // 1) CustomEvent path (recommended): window.dispatchEvent(new CustomEvent('tp:speech', { detail:{ on:true } }))
  window.addEventListener('tp:speech', (ev: Event) => {
    const on = !!(ev as CustomEvent).detail?.on;
    state.speech = on; pushGate();
  });

  // 2) Legacy path seen in your HUD logs: window.dispatchEvent(new CustomEvent('speech', { detail:{ state:'start'|'stop' } }))
  window.addEventListener('speech', (ev: Event) => {
    const s = (ev as CustomEvent).detail?.state;
    if (s === 'start') state.speech = true;
    else if (s === 'stop') state.speech = false;
    else return;
    pushGate();
  });

  // 3) Shim for direct calls from ASR modules that don’t want to dispatch events
  (window as any).__tpSpeechGate = (on: boolean) => { state.speech = !!on; pushGate(); };
}

// --- Viewer/script availability nudges (helps “Nothing to scroll” detection) ---
function bindViewerNudges() {
  const viewer = document.getElementById('viewer');
  if ('MutationObserver' in window && viewer) {
    const mo = new MutationObserver(() => pushGate());
    mo.observe(viewer, { childList: true, subtree: true });
  }
  window.addEventListener('resize', () => pushGate(), { passive: true });
}

// --- Public init ---
export function initGateOrchestrator() {
  // seed state once
  state.mode = readModeFromDOM();
  state.user = readAutoIntentFromDOM();
  state.speech = false;

  bindMode();
  bindAuto();
  bindSpeech();
  bindViewerNudges();

  // first gate
  pushGate();
}
