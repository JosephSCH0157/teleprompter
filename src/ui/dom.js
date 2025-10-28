// Minimal DOM helpers for the UI layer

function on(el, ev, fn, opts) {
  try { if (el && typeof el.addEventListener === 'function') el.addEventListener(ev, fn, opts); } catch {}
}

function $(id) {
  try { return document.getElementById(id); } catch { return null; }
}

function toggleOverlay(overlay, show) {
  try {
    if (!overlay) return;
    const want = !!show;
    overlay.classList.toggle('hidden', !want);
  } catch {}
}

function wireOverlayBasics() {
  // Shortcuts overlay
  const shortcutsBtn = $('shortcutsBtn');
  const shortcutsOverlay = $('shortcutsOverlay');
  const shortcutsClose = $('shortcutsClose');
  on(shortcutsBtn, 'click', () => {
    try { shortcutsBtn.setAttribute('aria-expanded', 'true'); } catch {}
    toggleOverlay(shortcutsOverlay, true);
  });
  on(shortcutsClose, 'click', () => {
    toggleOverlay(shortcutsOverlay, false);
    try { shortcutsBtn.setAttribute('aria-expanded', 'false'); shortcutsBtn.focus && shortcutsBtn.focus(); } catch {}
  });
  on(shortcutsOverlay, 'click', (e) => {
    try {
      if (e.target === shortcutsOverlay) {
        toggleOverlay(shortcutsOverlay, false);
        shortcutsBtn && shortcutsBtn.setAttribute('aria-expanded', 'false');
      }
    } catch {}
  });

  // Settings overlay
  const settingsBtn = $('settingsBtn');
  const settingsOverlay = $('settingsOverlay');
  const settingsClose = $('settingsClose');
  on(settingsBtn, 'click', () => {
    try { settingsBtn.setAttribute('aria-expanded', 'true'); } catch {}
    toggleOverlay(settingsOverlay, true);
  });
  on(settingsClose, 'click', () => {
    toggleOverlay(settingsOverlay, false);
    try { settingsBtn.setAttribute('aria-expanded', 'false'); settingsBtn.focus && settingsBtn.focus(); } catch {}
  });
  on(settingsOverlay, 'click', (e) => {
    try {
      if (e.target === settingsOverlay) {
        toggleOverlay(settingsOverlay, false);
        settingsBtn && settingsBtn.setAttribute('aria-expanded', 'false');
      }
    } catch {}
  });

  // Escape closes any open overlay
  on(document, 'keydown', (e) => {
    try {
      if (e.key === 'Escape') {
        toggleOverlay(shortcutsOverlay, false);
        shortcutsBtn && shortcutsBtn.setAttribute('aria-expanded', 'false');
        toggleOverlay(settingsOverlay, false);
        settingsBtn && settingsBtn.setAttribute('aria-expanded', 'false');
      }
    } catch {}
  });
}

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
  const btn = $('presentBtn');
  try {
    // Apply persisted state
    const KEY = 'tp_present';
    let initial = false;
    try { initial = (localStorage.getItem(KEY) === '1'); } catch {}
    document.documentElement.classList.toggle('tp-present', !!initial);
    if (btn) btn.textContent = initial ? 'Exit Present' : 'Present Mode';
    // Toggle + persist
    on(btn, 'click', () => {
      try {
        const next = !document.documentElement.classList.contains('tp-present');
        document.documentElement.classList.toggle('tp-present', next);
        btn.textContent = next ? 'Exit Present' : 'Present Mode';
        try { localStorage.setItem(KEY, next ? '1' : '0'); } catch {}
      } catch {}
    });
  } catch {}
}

export function bindStaticDom() {
  console.log('[src/ui/dom] bindStaticDom');
  try {
    wireOverlayBasics();
    wireDisplayBridge();
    wireMic();
    wireCamera();
    wireUpload();
    wirePresentMode();
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
