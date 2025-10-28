// Minimal DOM helpers for the UI layer

function on(el, ev, fn, opts) {
  try { if (el && typeof el.addEventListener === 'function') el.addEventListener(ev, fn, opts); } catch {}
}

function $(id) {
  try { return document.getElementById(id); } catch { return null; }
}

// --- UI Hydration Contract ---------------------------------------------------
const UI_WIRED = new Set();
const $id = (id) => { try { return document.getElementById(id); } catch { return null; } };

// Wire once per key
function once(key, fn) {
  try {
    if (UI_WIRED.has(key)) return;
    try { fn && fn(); } finally { UI_WIRED.add(key); }
  } catch {}
}

// (legacy toggleOverlay helper removed with legacy overlay wiring)

// (legacy non-delegated overlay wiring removed; replaced by idempotent delegated wiring)

function wireDisplayBridge() {
  // Bridge wrappers for legacy global API expected by some helpers/self-checks
  try {
    const disp = (window.__tpDisplay || {});
    if (disp && !window.openDisplay) window.openDisplay = () => { try { return disp.openDisplay && disp.openDisplay(); } catch {} };
    if (disp && !window.closeDisplay) window.closeDisplay = () => { try { return disp.closeDisplay && disp.closeDisplay(); } catch {} };
    if (disp && !window.sendToDisplay) window.sendToDisplay = (p) => { try { return disp.sendToDisplay && disp.sendToDisplay(p); } catch {} };
  } catch {}

  // Wire message handler once
  try {
    const handler = (e) => { try { window.__tpDisplay && window.__tpDisplay.handleMessage && window.__tpDisplay.handleMessage(e); } catch {} };
    if (!window.__tpDisplayMsgWired) {
      window.addEventListener('message', handler);
      window.__tpDisplayMsgWired = true;
    }
  } catch {}

  // Buttons
  const openBtn = $('openDisplayBtn');
  const closeBtn = $('closeDisplayBtn');
  on(openBtn, 'click', () => { try { window.openDisplay && window.openDisplay(); } catch {} });
  on(closeBtn, 'click', () => { try { window.closeDisplay && window.closeDisplay(); } catch {} });
}

function wireMic() {
  const req = $('micBtn');
  const rel = $('releaseMicBtn');
  on(req, 'click', async () => { try { await window.__tpMic?.requestMic?.(); } catch {} });
  on(rel, 'click', () => { try { window.__tpMic?.releaseMic?.(); } catch {} });
}

function wireCamera() {
  const start = $('startCam');
  const stop = $('stopCam');
  const camSel = $('camDevice');
  const size = $('camSize');
  const op = $('camOpacity');
  const mir = $('camMirror');
  on(start, 'click', async () => { try { await window.__tpCamera?.startCamera?.(); } catch {} });
  on(stop, 'click', () => { try { window.__tpCamera?.stopCamera?.(); } catch {} });
  on(camSel, 'change', () => { try { window.__tpCamera?.switchCamera?.(camSel.value); } catch {} });
  on(size, 'input', () => { try { window.__tpCamera?.applyCamSizing?.(); } catch {} });
  on(op, 'input', () => { try { window.__tpCamera?.applyCamOpacity?.(); } catch {} });
  on(mir, 'change', () => { try { window.__tpCamera?.applyCamMirror?.(); } catch {} });
}

function wireUpload() {
  const btn = $('uploadFileBtn');
  const inp = $('uploadFile');
  on(btn, 'click', () => { try { inp && inp.click && inp.click(); } catch {} });
  on(inp, 'change', async () => {
    try {
      const f = inp && inp.files && inp.files[0];
      if (f && typeof window._uploadFromFile === 'function') await window._uploadFromFile(f);
    } catch {}
  });
}

function wirePresentMode() {
  once('present', () => {
    const btn = $id('presentBtn');
    const exitBtn = $id('presentExitBtn');
    const root = document.documentElement;
    const KEY = 'tp_present';

    const apply = (on) => {
      try {
        root.classList.toggle('tp-present', !!on);
        if (btn) btn.textContent = on ? 'Exit Present' : 'Present Mode';
        try { localStorage.setItem(KEY, on ? '1' : '0'); } catch {}
      } catch {}
    };

    // restore on load
    try { apply(localStorage.getItem(KEY) === '1'); } catch {}

    // main toggle
    on(btn, 'click', () => apply(!root.classList.contains('tp-present')));

    // guaranteed escape routes
    on(exitBtn, 'click', () => apply(false));
    on(document, 'keydown', (e) => {
      try {
        if (e.key === 'Escape' && root.classList.contains('tp-present')) apply(false);
        if ((e.key === 'p' || e.key === 'P') && !e.metaKey && !e.ctrlKey && !e.altKey) {
          apply(!root.classList.contains('tp-present'));
        }
      } catch {}
    });
  });
}

function installSpeakerIndex() {
  try {
    const host = $('speakerIndexChip');
    if (!host) return;
    const editor = $('editor') || $('scriptInput') || $('sourceText');
    const viewer = $('viewer');
    const getText = () => {
      try { if (editor && 'value' in editor) return editor.value; } catch {}
      try { return (viewer && viewer.textContent) || ''; } catch {}
      return '';
    };
    const countTag = (tag) => {
      try { const m = getText().match(new RegExp('\\\[' + tag + '\\]', 'g')); return m ? m.length : 0; } catch { return 0; }
    };
    const render = () => {
      try {
        const s1 = countTag('s1');
        const s2 = countTag('s2');
        // tolerate variants: guest1, g1, guest
        const g = countTag('g1') + countTag('g2') + countTag('guest1') + countTag('guest');
        host.textContent = `Speakers: S1 ${s1} • S2 ${s2}${g ? ` • G ${g}` : ''}`;
      } catch {}
    };
    render();
    on(document, 'input', (e) => {
      try { const id = (e && e.target && e.target.id) ? String(e.target.id) : ''; if (/editor|script|source/i.test(id)) render(); } catch {}
    });
  } catch {}
}

function installDbMeter() {
  try {
    const text = document.getElementById('dbText');
    const bar = document.querySelector('#dbMeter .bar i');
    if (!text || !bar) return;
    const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
    const render = (db = NaN, peak = NaN) => {
      try {
        text.textContent = Number.isFinite(db) ? `${Math.round(db)} dB` : '— dB';
        const val = Number.isFinite(peak) ? peak : (Number.isFinite(db) ? db : -60);
        const pct = (clamp(val, -60, 0) + 60) / 60; // map -60..0 dBFS → 0..1
        bar.style.transform = `scaleX(${pct})`;
      } catch {}
    };
    render(); // idle
    window.addEventListener('tp:db', (e) => {
      try { const d = (e && e.detail) || {}; render(d.db, d.peak); } catch {}
    });
  } catch {}
}

function wireOverlays() {
  once('overlays', () => {
    try {
      const open = (name) => {
        try {
          const btn = $id(name + 'Btn');
          const dlg = $id(name + 'Overlay');
          if (!dlg) return;
          dlg.classList.remove('hidden');
          btn && btn.setAttribute('aria-expanded', 'true');
        } catch {}
      };
      const close = (name) => {
        try {
          const btn = $id(name + 'Btn');
          const dlg = $id(name + 'Overlay');
          if (!dlg) return;
          dlg.classList.add('hidden');
          btn && btn.setAttribute('aria-expanded', 'false');
        } catch {}
      };

      document.addEventListener('click', (e) => {
        try {
          const t = e.target;
          if (t && t.closest && t.closest('#shortcutsBtn')) return open('shortcuts');
          if (t && t.closest && t.closest('#settingsBtn')) return open('settings');
          if (t && t.closest && t.closest('#shortcutsClose')) return close('shortcuts');
          if (t && t.closest && t.closest('#settingsClose')) return close('settings');
          const sc = $id('shortcutsOverlay');
          if (sc && t === sc) close('shortcuts');
          const se = $id('settingsOverlay');
          if (se && t === se) close('settings');
        } catch {}
      }, { capture: true });

      window.addEventListener('keydown', (e) => {
        try {
          if (e.key !== 'Escape') return;
          $id('shortcutsOverlay')?.classList.add('hidden');
          $id('settingsOverlay')?.classList.add('hidden');
          $id('shortcutsBtn')?.setAttribute('aria-expanded','false');
          $id('settingsBtn')?.setAttribute('aria-expanded','false');
        } catch {}
      });
    } catch {}
  });
}

const ROLE_KEYS = ['s1','s2','g1','g2'];
const ROLES_KEY = 'tp_roles_v2';
const ROLE_DEFAULTS = {
  s1: { name: 'Speaker 1', color: '#60a5fa' },
  s2: { name: 'Speaker 2', color: '#facc15' },
  g1: { name: 'Guest 1',   color: '#34d399' },
  g2: { name: 'Guest 2',   color: '#f472b6' },
};

function loadRoles() {
  try { return Object.assign({}, ROLE_DEFAULTS, JSON.parse(localStorage.getItem(ROLES_KEY) || '{}')); }
  catch { return { ...ROLE_DEFAULTS }; }
}

function updateLegend() {
  once('legend', () => {
    try {
      const legend = document.getElementById('legend');
      if (!legend) return;
      const ROLES = loadRoles();
      legend.innerHTML = '';
      for (const key of ROLE_KEYS) {
        const item = ROLES[key];
        const tag = document.createElement('span');
        tag.className = 'tag';
        const dot = document.createElement('span');
        dot.className = 'dot';
        dot.style.background = item.color;
        const name = document.createElement('span');
        name.textContent = item.name;
        tag.appendChild(dot);
        tag.appendChild(name);
        legend.appendChild(tag);
      }
    } catch {}
  });
}

function ensureViewerPlaceholder() {
  once('viewer-placeholder', () => {
    try {
      const scriptEl = document.getElementById('script');
      if (!scriptEl) return;
      if (!scriptEl.querySelector('.line')) {
        scriptEl.innerHTML = '<div class="line" data-line-idx="0">First line…</div>' +
                             '<div class="line" data-line-idx="1">Second line…</div>';
      }
    } catch {}
  });
}

// === Master hydrator: run now and whenever DOM changes ===
function hydrateUI() {
  wireOverlays();
  wirePresentMode();
  updateLegend();
  ensureViewerPlaceholder();
}

export function bindStaticDom() {
  console.log('[src/ui/dom] bindStaticDom');
  try {
    // one-time UI wiring guard to prevent duplicate listeners and chips
    if (document.documentElement.dataset.uiWired === '1') return;
    document.documentElement.dataset.uiWired = '1';

    // core feature wiring
    wireDisplayBridge();
    wireMic();
    wireCamera();
    wireUpload();
    installSpeakerIndex();
    installDbMeter();

    // initial hydration pass
    hydrateUI();

    // keep it healthy: observe DOM changes and rehydrate idempotently
    const mo = new MutationObserver(() => {
      try {
        if ($id('shortcutsBtn') || $id('settingsBtn') || $id('legend') || $id('script')) {
          hydrateUI();
        }
      } catch {}
    });
    try { mo.observe(document.documentElement, { childList: true, subtree: true }); } catch {}
  } catch {}
}

export function query(selector) {
  return document.querySelector(selector);
}

export function readText(selector) {
  const el = document.querySelector(selector);
  return el ? el.textContent : null;
}

export function setText(selector, txt) {
  const el = document.querySelector(selector);
  if (el) el.textContent = String(txt);
}
