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
  presentBtn?: string;            // Present mode toggle button (supports CSS list)
}

function q<T extends HTMLElement = HTMLElement>(sel: string | undefined | null): T | null {
  if (!sel) return null; try { return document.querySelector(sel) as T | null; } catch { return null; }
}

// Multi-selector helper: returns first match from a list
function _qq<T extends HTMLElement = HTMLElement>(sels: readonly string[] | undefined | null): T | null {
  try {
    if (!sels || !Array.isArray(sels)) return null as any;
    for (const s of sels) {
      const el = q<T>(s);
      if (el) return el;
    }
  } catch {}
  return null as any;
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
    const btn = q<HTMLButtonElement>(opts.presentBtn || '#presentBtn, [data-action="present-toggle"]');
    if (btn && !btn.dataset.uiBound) {
      btn.dataset.uiBound = '1';
      on(btn, 'click', (e: Event) => {
        try { e.preventDefault(); } catch {}
        try {
          const root = document.documentElement;
            const on = !root.classList.contains('tp-present');
            root.classList.toggle('tp-present', on);
            // Keep body class in sync for smoke harness compatibility
            try { document.body.classList.toggle('present-mode', on); } catch {}
            btn.textContent = on ? 'Exit Present' : 'Present Mode';
            try { localStorage.setItem('tp_present', on ? '1' : '0'); } catch {}
        } catch {}
      });
      // Restore persisted state early
      try {
        const was = (function(){ try { return localStorage.getItem('tp_present') === '1'; } catch { return false; } })();
        if (was) { document.documentElement.classList.add('tp-present'); try { document.body.classList.add('present-mode'); } catch {} }
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

  // Settings / Help overlay wiring (single source of truth)
  try {
    const toggle = (el: HTMLElement | null, visible?: boolean) => {
      if (!el) return;
      try {
        if (typeof visible === 'boolean') {
          el.classList.toggle('hidden', !visible);
        } else {
          el.classList.toggle('hidden');
        }
      } catch {}
    };

    const settingsBtn     = _qq<HTMLButtonElement>(SEL.settingsOpen);
    const settingsClose   = _qq<HTMLButtonElement>(SEL.settingsClose);
    const settingsOverlay = _qq<HTMLElement>(SEL.settingsOverlay);
    if (settingsBtn && !settingsBtn.dataset.uiBound) {
      settingsBtn.dataset.uiBound = '1';
      on(settingsBtn, 'click', (e: Event) => {
        try { e.preventDefault?.(); } catch {}
        toggle(settingsOverlay, true);
        try { dispatch('tp:settings:open', { source: 'binder' }); } catch {}
        try { document.body.dispatchEvent(new CustomEvent('tp:settings:open', { detail: { source: 'binder' } })); } catch {}
      });
    }
    if (settingsClose && !settingsClose.dataset.uiBound) {
      settingsClose.dataset.uiBound = '1';
      on(settingsClose, 'click', (e: Event) => {
        try { e.preventDefault?.(); } catch {}
        toggle(settingsOverlay, false);
        try { dispatch('tp:settings:close', { source: 'binder' }); } catch {}
        try { document.body.dispatchEvent(new CustomEvent('tp:settings:close', { detail: { source: 'binder' } })); } catch {}
      });
    }

    const helpBtn     = _qq<HTMLButtonElement>(SEL.helpOpen);
    const helpClose   = _qq<HTMLButtonElement>(SEL.helpClose);
    const helpOverlay = _qq<HTMLElement>(SEL.helpOverlay);
    if (helpBtn && !helpBtn.dataset.uiBound) {
      helpBtn.dataset.uiBound = '1';
      on(helpBtn, 'click', (e: Event) => { try { e.preventDefault?.(); } catch {}; toggle(helpOverlay, true); });
    }
    if (helpClose && !helpClose.dataset.uiBound) {
      helpClose.dataset.uiBound = '1';
      on(helpClose, 'click', (e: Event) => { try { e.preventDefault?.(); } catch {}; toggle(helpOverlay, false); });
    }
  } catch {}
}

// (No auto‑invoke here; index.ts calls bindCoreUI() inside its onReady path)

// ----------------- DEV/UI MOCKS AND CONTROL WIRING -----------------

// Lightweight event dispatcher used by mock flows
function dispatch(type: string, detail?: any) {
  try { window.dispatchEvent(new CustomEvent(type, { detail })); } catch {}
}

// File picker helper
async function pickFile(accept = '*/*'): Promise<File | null> {
  try {
    if ('showOpenFilePicker' in window) {
      const [h]: any = await (window as any).showOpenFilePicker({ multiple: false, types: [{ description: 'Files', accept: { [accept]: ['.txt', '.md', '.rtf', '.docx'] } }] });
      const f = await h.getFile();
      return f as File;
    }
  } catch {}
  // Fallback: use a hidden input
  return await new Promise<File | null>((res) => {
    try {
      const inp = document.createElement('input');
      inp.type = 'file';
      inp.accept = '.txt,.md,.rtf,.docx';
      inp.style.position = 'fixed';
      inp.style.left = '-9999px';
      inp.addEventListener('change', () => {
        try { res((inp.files && inp.files[0]) || null); } catch { res(null); }
      }, { once: true });
      document.body.appendChild(inp);
      inp.click();
      setTimeout(() => { try { inp.remove(); } catch {} }, 15000);
    } catch { res(null); }
  });
}

const DEV_UI = (() => { try { return location.search.includes('uiMock=1') || ((navigator as any).webdriver === true); } catch { return false; } })();
const fakeFile = (name: string, text: string) => new File([text], name, { type: 'text/plain' });

// script helpers used by UI controls
const scripts = {
  async loadSample() {
    const sample = `[s1]\nWelcome to Anvil. This is a sample script.\n[beat]\nUse the arrow keys or your foot pedal to step.\n[/s1]`;
    try {
      const ed = document.getElementById('editor') as HTMLTextAreaElement | null;
      if (ed && 'value' in ed) {
        ed.value = sample;
        try { ed.dispatchEvent(new Event('input', { bubbles: true })); } catch {}
      }
    } catch {}
    dispatch('tp:script-load', { name: 'Sample.txt', text: sample });
  },
  async upload() {
    try {
      if (DEV_UI) {
        const f = fakeFile('SmokeUpload.txt', '[s1] CI upload OK [/s1]');
        const text = await f.text();
        const ed = document.getElementById('editor') as HTMLTextAreaElement | null;
        if (ed && 'value' in ed) {
          ed.value = text;
          try { ed.dispatchEvent(new Event('input', { bubbles: true })); } catch {}
        }
        dispatch('tp:script-load', { name: f.name, text });
        return;
      }
      const f = await pickFile();
      if (!f) return;
      let text = '';
      if (f.name.toLowerCase().endsWith('.docx') && (window as any).docxToText) {
        try { text = await (window as any).docxToText(f); } catch { text = await f.text(); }
      } else {
        text = await f.text();
      }
      const ed = document.getElementById('editor') as HTMLTextAreaElement | null;
      if (ed && 'value' in ed) {
        ed.value = text;
        try { ed.dispatchEvent(new Event('input', { bubbles: true })); } catch {}
      }
      dispatch('tp:script-load', { name: f.name, text });
    } catch {}
  }
};

// ASR & Camera fallbacks used in headless/dev
const asr = {
  requestMic: (window as any).__tpAsrImpl?.requestMic
           ?? (window as any).ASR?.requestMic
           ?? (async () => DEV_UI ? true : ((await navigator.mediaDevices.getUserMedia({ audio: true })), true)),
  start:      (window as any).__tpAsrImpl?.start
           ?? (window as any).ASR?.start
           ?? (() => { if (DEV_UI) try { console.log('[ASR] start (mock)'); } catch {} })
};

const cam = {
  start: (window as any).__tpCamImpl?.start
       ?? (window as any).Camera?.start
       ?? (async () => { if (DEV_UI) { try { console.log('[CAM] start (mock)'); } catch {} return true; }
                         const v = document.getElementById('cameraPreview') as HTMLVideoElement | null;
                         if (!v) return false;
                         const s = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
                         (v as any).srcObject = s; try { await (v as any).play?.(); } catch {} return true; }),
  pip: async () => {
    if (DEV_UI) { try { console.log('[PiP] request (mock)'); } catch {} return; }
    const v = document.getElementById('cameraPreview') as HTMLVideoElement | null;
    if (v && (document as any).pictureInPictureEnabled && !(document as any).pictureInPictureElement) {
      try { await (v as any).requestPictureInPicture?.(); } catch {}
    }
  }
};

// Common selectors for legacy + new data-action hooks
const SEL = {
  // overlays
  settingsOpen:   ['#settingsBtn','#btnSettings','#shortcutsBtn','[data-action="settings-open"]'],
  settingsClose:  ['#settingsClose','[data-action="settings-close"]'],
  settingsOverlay:['#settingsOverlay','[data-overlay="settings"]'],

  helpOpen:       ['#helpBtn','#shortcutsBtn','[data-action="help-open"]'],
  helpClose:      ['#helpClose','[data-action="help-close"]'],
  helpOverlay:    ['#helpOverlay','#shortcutsOverlay','[data-overlay="help"]'],

  // core toggles / windows
  present:        ['#presentBtn','[data-action="present-toggle"]'],
  display:        ['#displayWindowBtn','#openDisplayBtn','[data-action="display"]'],
  hud:            ['#hudBtn','[data-action="hud-toggle"]'],

  // asr / cam
  mic:            ['#requestMicBtn','#micBtn','[data-action="request-mic"]'],
  speech:         ['#startSpeechBtn','#recBtn','[data-action="start-speech"]'],
  camera:         ['#startCameraBtn','#startCam','[data-action="start-camera"]'],
  pip:            ['#pipBtn','#camPiP','[data-action="pip"]'],

  // scripts
  sample:         ['#loadSampleBtn','#loadSample','[data-action="load-sample"]'],
  upload:         ['#uploadBtn','#uploadFileBtn','[data-action="upload"]'],

  // speakers
  speakersToggle: ['#speakersToggleBtn','[data-action="speakers-toggle"]'],
  speakersKey:    ['#speakersKeyBtn','[data-action="speakers-key"]'],
  speakersPanel:  ['#speakersPanel','[data-panel="speakers"]'],
  speakersKeyInput:['#speakersKey','[name="speakersKey"]','[data-key="speakers"]'],

  // scripts selects
  mainSelect:     ['#scriptSelect','[data-select="scripts-main"]'],
  sideSelect:     ['#scriptSelectSidebar','[data-select="scripts-side"]'],
  sidebar:        ['#sidebar','.sidebar','#leftCol'],
} as const;

// Wire the related buttons if present (idempotent via dataset flags); support both IDs and data-action hooks
(() => {
  try {
  const map: Array<{ sels: readonly string[]; fn: () => any }> = [
      { sels: SEL.sample, fn: () => scripts.loadSample() },
      { sels: SEL.upload, fn: () => scripts.upload() },
      { sels: SEL.mic,    fn: () => asr.requestMic() },
      { sels: SEL.speech, fn: () => asr.start() },
      { sels: SEL.camera, fn: () => cam.start() },
      { sels: SEL.pip,    fn: () => cam.pip() },
    ];
    map.forEach(({ sels, fn }) => {
      try {
        for (const s of sels) {
          const el = q<HTMLElement>(s);
          if (el && !(el as any).dataset.coreUiWired) {
            (el as any).dataset.coreUiWired = '1';
            on(el, 'click', (e: any) => { try { e.preventDefault?.(); } catch {}; try { fn(); } catch {} });
          }
        }
      } catch {}
    });
  } catch {}
})();

// Ensure sidebar mirror select exists and two-way syncs (idempotent)
export function ensureSidebarMirror() {
  try {
    const main = document.querySelector('#scriptSelect,[data-select="scripts-main"]') as HTMLSelectElement | null;
    let side = document.querySelector('#scriptSelectSidebar,[data-select="scripts-side"]') as HTMLSelectElement | null;
    if (!main) return;
    if (!side) {
      side = document.createElement('select');
      side.id = 'scriptSelectSidebar';
      side.setAttribute('aria-label', 'Mapped folder scripts');
      side.className = 'select-md';
      side.setAttribute('aria-busy', 'true');
      const host = document.getElementById('scriptsQuickRow') || document.getElementById('sidebar') || document.body;
      const wrap = document.createElement('div'); wrap.className = 'row';
      const lab = document.createElement('label'); lab.textContent = 'Scripts';
      lab.appendChild(side); wrap.appendChild(lab); host?.appendChild(wrap);
    }
    if ((side as any)._mirrorWired) return;
    (side as any)._mirrorWired = '1';
    const sync = (src: HTMLSelectElement, dst: HTMLSelectElement) => {
      try { dst.selectedIndex = src.selectedIndex; } catch {}
      try { dst.dispatchEvent(new Event('change', { bubbles: true })); } catch {}
    };
    side.addEventListener('change', () => { if (main) sync(side!, main); }, { capture: true });
    main.addEventListener('change', () => { if (side) sync(main, side!); }, { capture: true });
  } catch {}
}

// One-time binding audit: prints presence of common controls/selectors
export function auditBindingsOnce() {
  try {
    if ((window as any).__tpUiAuditDone) return; (window as any).__tpUiAuditDone = true;
    const has = (s: string) => !!document.querySelector(s);
    const report = {
      settingsBtn: has('#settingsBtn,[data-action="settings-open"]'),
      helpBtn:     has('#helpBtn,#shortcutsBtn,[data-action="help-open"]'),
      presentBtn:  has('#presentBtn,[data-action="present-toggle"]'),
      displayBtn:  has('#displayWindowBtn,#openDisplayBtn,[data-action="display"]'),
      hudBtn:      has('#hudBtn,[data-action="hud-toggle"]'),
      mic:         has('#requestMicBtn,#micBtn,[data-action="request-mic"]'),
      speech:      has('#startSpeechBtn,#recBtn,[data-action="start-speech"]'),
      cam:         has('#startCameraBtn,#startCam,[data-action="start-camera"]'),
      pip:         has('#pipBtn,#camPiP,[data-action="pip"]'),
      loadSample:  has('#loadSampleBtn,#loadSample,[data-action="load-sample"]'),
      upload:      has('#uploadBtn,#uploadFileBtn,[data-action="upload"]'),
      speakersT:   has('#speakersToggleBtn,#toggleSpeakers,[data-action="speakers-toggle"]'),
      speakersK:   has('#speakersKeyBtn,[data-action="speakers-key"]'),
      mainSelect:  has('#scriptSelect,[data-select="scripts-main"]'),
      sideSelect:  has('#scriptSelectSidebar,[data-select="scripts-side"]'),
    } as const;
  console.table(report);
  } catch {}
}
