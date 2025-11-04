// Minimal DOM helpers for the UI layer

// Broadcast channel for cross-window display sync (names/colors)
let __bc = null; try { __bc = new BroadcastChannel('prompter'); } catch {}

function on(el, ev, fn, opts) {
  try { if (el && typeof el.addEventListener === 'function') el.addEventListener(ev, fn, opts); } catch {}
}

function $(id) {
  try { return document.getElementById(id); } catch { return null; }
}

// --- UI Hydration Contract ---------------------------------------------------
const UI_WIRED = new Set();
const $id = (id) => { try { return document.getElementById(id); } catch { return null; } };
let IS_HYDRATING = false;
let HYDRATE_SCHEDULED = false;

// Global capture-phase guard for camera controls to swallow legacy bubble listeners
try {
  if (!window.__tpCamGlobalCaptureGuard) {
    window.__tpCamGlobalCaptureGuard = true;
    document.addEventListener('click', (e) => {
      try {
        const t = e.target?.closest?.('#startCam, #stopCam, #camDevice, #StartCam, #StopCam, #CamDevice');
        if (!t) return;
        e.stopPropagation();
        e.stopImmediatePropagation?.();
      } catch {}
    }, { capture: true });
  }
} catch {}

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
    // Always delegate to the bridge to avoid stale no-op stubs
    if (disp) window.openDisplay = () => { try { return disp.openDisplay && disp.openDisplay(); } catch {} };
    if (disp) window.closeDisplay = () => { try { return disp.closeDisplay && disp.closeDisplay(); } catch {} };
    if (disp) window.sendToDisplay = (p) => { try { return disp.sendToDisplay && disp.sendToDisplay(p); } catch {} };
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

// Mirror main window state to display: scroll position, typography, and content
function wireDisplayMirror() {
  try {
    if (document.documentElement.dataset.displayMirrorWired === '1') return;
    document.documentElement.dataset.displayMirrorWired = '1';

    const viewer = $('viewer');
    const scriptEl = $('script');
    // Throttled scroll mirroring (send ratio for resolution independence)
    let scrollPending = false;
    const sendScroll = () => {
      try {
        if (!viewer || !window.sendToDisplay) return;
        const max = Math.max(0, viewer.scrollHeight - viewer.clientHeight);
        const ratio = max > 0 ? (viewer.scrollTop / max) : 0;
        window.sendToDisplay({ type: 'scroll', ratio });
      } finally {
        scrollPending = false;
      }
    };
    if (viewer) {
      viewer.addEventListener('scroll', () => {
        if (!scrollPending) {
          scrollPending = true;
          requestAnimationFrame(() => {
            try { sendScroll(); } finally { try { window.dispatchEvent(new Event('tp:anchorChanged')); } catch {} }
          });
        }
      }, { passive: true });
    }

    // Typography mirroring (font size / line height)
    const fs = $('fontSize');
    const lh = $('lineHeight');
    const sendTypography = () => {
      try {
        // Only broadcast when linking is ON
        let linkOn = false;
        try {
          const raw = localStorage.getItem('tp_ui_prefs_v1');
          const st = raw ? JSON.parse(raw) : {};
          linkOn = !!st.linkTypography;
        } catch {}
        if (!linkOn) return;
        const fontSize = fs && 'value' in fs ? Number(fs.value) : undefined;
        const lineHeight = lh && 'value' in lh ? Number(lh.value) : undefined;
        window.sendToDisplay && window.sendToDisplay({ type: 'typography', fontSize, lineHeight });
      } catch {}
    };
    on(fs, 'input', sendTypography);
    on(lh, 'input', sendTypography);

  // Initial push only if linking is enabled
  setTimeout(sendTypography, 0);

    // Content render mirroring: listen for our renderer's event and also observe #script for any DOM changes
    let renderPending = false;
    const sendRender = () => {
      try {
        const html = document.getElementById('script')?.innerHTML || '';
        const fontSize = fs && 'value' in fs ? Number(fs.value) : undefined;
        const lineHeight = lh && 'value' in lh ? Number(lh.value) : undefined;
        window.sendToDisplay && window.sendToDisplay({ type: 'render', html, fontSize, lineHeight });
      } finally {
        renderPending = false;
      }
    };
    document.addEventListener('tp:script-rendered', () => {
      if (!renderPending) { renderPending = true; requestAnimationFrame(sendRender); }
    });
    try {
      if (scriptEl) {
        const mo = new MutationObserver(() => {
          if (!renderPending) { renderPending = true; requestAnimationFrame(sendRender); }
        });
        mo.observe(scriptEl, { childList: true, subtree: true });
      }
    } catch {}
  } catch {}
}

function wireMic() {
  const req = $('micBtn');
  const rel = $('releaseMicBtn');
  on(req, 'click', async () => { try { await window.__tpMic?.requestMic?.(); } catch {} });
  on(rel, 'click', () => { try { window.__tpMic?.releaseMic?.(); } catch {} });
}

function wireCamera() {
  const start = $('startCam') || $('StartCam');
  const stop = $('stopCam') || $('StopCam');
  const camSel= $('camDevice') || $('CamDevice');
  const size = $('camSize');
  const op = $('camOpacity');
  const mir = $('camMirror');
  if (start && !start.dataset.captureWired) {
    start.dataset.captureWired = '1';
    start.addEventListener('click', async (e) => {
      try { e.stopImmediatePropagation(); e.preventDefault(); } catch {}
      try { if (window.toast) window.toast('Camera starting…'); } catch {}
      // Ensure camera module is loaded if not yet available
      try { if (!window.__tpCamera || typeof window.__tpCamera.startCamera !== 'function') await import('../media/camera.js'); } catch {}
      try {
        await window.__tpCamera?.startCamera?.();
      } catch {
        try { if (window.toast) window.toast('Camera start failed'); } catch {}
      }
    }, { capture: true });
  }
  if (stop && !stop.dataset.captureWired) {
    stop.dataset.captureWired = '1';
    stop.addEventListener('click', (e) => {
      try { e.stopImmediatePropagation(); e.preventDefault(); } catch {}
      try { window.__tpCamera?.stopCamera?.(); } catch {}
      try { if (window.toast) window.toast('Camera stopped', { type: 'ok' }); } catch {}
    }, { capture: true });
  }
  if (camSel && !camSel.dataset.captureWired) {
    camSel.dataset.captureWired = '1';
    camSel.addEventListener('change', (e) => {
      try { e.stopPropagation(); e.stopImmediatePropagation?.(); } catch {}
      try { window.__tpCamera?.switchCamera?.(camSel.value); } catch {}
    }, { capture: true });
  }
  on(size, 'input', () => { try { window.__tpCamera?.applyCamSizing?.(); } catch {} });
  on(op, 'input', () => { try { window.__tpCamera?.applyCamOpacity?.(); } catch {} });
  on(mir, 'change', () => { try { window.__tpCamera?.applyCamMirror?.(); } catch {} });
}

function wireLoadSample() {
  try {
    const btn = $('loadSample');
    const ed = $('editor');
    if (!btn || !ed || btn.dataset.wired) return;
    btn.dataset.wired = '1';
    const sample = [
      '[s1]',
      '[b]Lorem ipsum dolor[/b] sit amet, [i]consectetur[/i] [u]adipiscing[/u] elit. [note]Stage cue: smile and pause.[/note]',
      'Cras justo odio, dapibus ac facilisis in, egestas eget quam.',
      '[/s1]',
      '',
      '[s2]',
      '[color=#ffcc00]Vestibulum[/color] [bg=#112233]ante[/bg] ipsum primis in faucibus orci luctus et ultrices posuere cubilia curae;',
      'Integer posuere erat a ante venenatis dapibus posuere velit aliquet.',
      '[/s2]',
      '',
      '[g1]',
      'Curabitur [b]non nulla[/b] sit amet nisl tempus convallis quis ac lectus. Donec sollicitudin molestie malesuada.',
      'Maecenas faucibus mollis interdum.',
      '[/g1]',
      '',
      '[g2]',
      'Aenean eu leo quam. Pellentesque ornare sem lacinia quam venenatis vestibulum. [i]Etiam porta sem malesuada[/i] magna mollis euismod.',
      '[bg=#003344][color=#a4e8ff]Quisque[/color][/bg] sit amet est a [u]libero[/u] mollis tristique.',
      '[/g2]',
    ].join('\n');
    btn.addEventListener('click', () => {
      try {
        if ('value' in ed) ed.value = sample;
        // re-render via both event and direct call for robustness
        try { ed.dispatchEvent(new Event('input', { bubbles: true })); } catch {}
        try { if (typeof window.renderScript === 'function') window.renderScript(ed.value); } catch {}
      } catch {}
    });
  } catch {}
}
function wireUpload() {
  const btn = $('uploadFileBtn');
  const inp = $('uploadFile');
  on(btn, 'click', () => { try { inp && inp.click && inp.click(); } catch {} });
  on(inp, 'change', async () => {
    try {
      const f = inp && inp.files && inp.files[0];
      if (!f) return;
      if (typeof window._uploadFromFile === 'function') {
        await window._uploadFromFile(f);
        return;
      }
      // Fallback: handle basic text locally; docx via lazy upload module
      const lower = (f.name || '').toLowerCase();
      const isDocx = lower.endsWith('.docx') || f.type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
      if (isDocx) {
        try { await import('../../ui/upload.js'); } catch {}
        if (typeof window._uploadFromFile === 'function') { await window._uploadFromFile(f); return; }
      }
      // Read as text
      const txt = await f.text();
      const ed = document.getElementById('editor');
      if (ed && 'value' in ed) {
        ed.value = txt;
        try { ed.dispatchEvent(new Event('input', { bubbles: true })); } catch {}
      }
      try {
        if (typeof window.normalizeToStandard === 'function') window.normalizeToStandard();
        else if (typeof window.fallbackNormalize === 'function') window.fallbackNormalize();
      } catch {}
      try { if (typeof window.renderScript === 'function') window.renderScript(ed && ed.value || txt); } catch {}
      try { if (typeof window.setStatus === 'function') window.setStatus('Loaded "' + (f.name||'file') + '"'); } catch {}
    } catch {}
  });
}

function wireScriptControls() {
  try {
    const clearBtn = document.getElementById('clearText');
    const resetBtn = document.getElementById('resetScriptBtn');
    const editor = document.getElementById('editor');
    const title = document.getElementById('scriptTitle');

    if (clearBtn && !clearBtn.dataset.wired) {
      clearBtn.dataset.wired = '1';
      clearBtn.addEventListener('click', () => {
        try {
          if (editor && 'value' in editor) {
            editor.value = '';
            try { editor.dispatchEvent(new Event('input', { bubbles: true })); } catch {}
            try { if (typeof window.renderScript === 'function') window.renderScript(''); } catch {}
          }
          try { (window.setStatus || (()=>{}))('Cleared'); } catch {}
        } catch {}
      });
    }

    if (resetBtn && !resetBtn.dataset.wired) {
      resetBtn.dataset.wired = '1';
      resetBtn.addEventListener('click', () => {
        try {
          if (title && 'value' in title) title.value = '';
          if (editor && 'value' in editor) {
            editor.value = '';
            try { editor.dispatchEvent(new Event('input', { bubbles: true })); } catch {}
            try { if (typeof window.renderScript === 'function') window.renderScript(''); } catch {}
          }
          // Reset scroll position to the top for clarity
          try {
            const scroller = document.getElementById('viewer') || document.scrollingElement || document.documentElement;
            if (scroller) scroller.scrollTop = 0;
          } catch {}
          // Refresh scripts dropdown (if exposed by scripts-ui)
          try { if (typeof window.initScriptsUI === 'function') window.initScriptsUI(); } catch {}
          try { (window.setStatus || (()=>{}))('Script reset'); } catch {}
        } catch {}
      });
    }
  } catch {}
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
  once('db-meter', () => {
    try {
      // Top-bar compact meter (single source of truth)
      const hostTop = document.getElementById('dbMeterTop');
      let topFill = null;
      if (hostTop && !hostTop.dataset.wired) {
        hostTop.dataset.wired = '1';
        const barMini = document.createElement('div');
        barMini.style.cssText = 'height:6px;border-radius:999px;overflow:hidden;background:rgba(255,255,255,.1);width:90px';
        const fill = document.createElement('i');
        fill.style.cssText = 'display:block;height:100%;transform-origin:left center;transform:scaleX(0);background:linear-gradient(90deg,#4caf50,#ffc107 60%,#e53935)';
        barMini.appendChild(fill);
        hostTop.title = 'Input level';
        hostTop.appendChild(barMini);
        topFill = fill;
      } else if (hostTop) {
        topFill = hostTop.querySelector('i');
      }

      const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
      const render = (db = NaN, peak = NaN) => {
        try {
          const val = Number.isFinite(peak) ? peak : (Number.isFinite(db) ? db : -60);
          const pct = (clamp(val, -60, 0) + 60) / 60; // map -60..0 → 0..1
          if (topFill) topFill.style.transform = `scaleX(${pct})`;
        } catch {}
      };
      render(); // idle

      window.addEventListener('tp:db', (e) => {
        try { const d = (e && e.detail) || {}; render(d.db, d.peak); } catch {}
      });
    } catch {}
  });
}

// Tiny OBS status chip: creates #obsChip once and updates on tp:obs events
function installObsChip() {
  once('obs-chip', () => {
    try {
      const topbar = document.querySelector('.topbar') || document.body;
      let chip = document.getElementById('obsChip');
      if (!chip) {
        chip = document.createElement('span');
        chip.id = 'obsChip';
        chip.className = 'chip';
        // Create structured content: label + optional test icon
        const label = document.createElement('span');
        label.className = 'obs-chip-label';
        label.textContent = 'OBS: disconnected';
        const icon = document.createElement('i');
        icon.className = 'obs-test-icon';
        icon.setAttribute('aria-hidden','true');
        chip.appendChild(label);
        chip.appendChild(icon);
        topbar && topbar.appendChild(chip);
      }
      const labelEl = chip.querySelector('.obs-chip-label') || chip;
      const iconEl = chip.querySelector('.obs-test-icon');
      let hideTimer = null;
      const render = ({ status = 'disconnected', recording = false, scene } = {}) => {
        try {
          const s = String(status||'disconnected');
          labelEl.textContent = `OBS: ${s}${recording ? ' • REC' : ''}${scene ? ` • ${scene}` : ''}`;
          // reset state classes and apply new one(s)
          const base = ['chip'];
          if (s === 'identified' || s === 'open') base.push('obs-connected');
          else if (s === 'connecting') base.push('obs-reconnecting');
          else if (s === 'error') base.push('obs-error');
          if (recording) base.push('chip-live');
          chip.className = base.join(' ');
        } catch {}
      };
      render();
      window.addEventListener('tp:obs', (e) => { try { render((e && e.detail) || {}); } catch {} });
      // Show a brief test icon feedback when test completes
      window.addEventListener('tp:obs-test', (e) => {
        try {
          const d = (e && e.detail) || {}; const ok = !!d.ok;
          if (!iconEl) return;
          iconEl.textContent = ok ? '✓' : '!';
          iconEl.classList.remove('ok','error','show');
          iconEl.classList.add(ok ? 'ok' : 'error');
          // force reflow for transition
          void iconEl.offsetWidth;
          iconEl.classList.add('show');
          if (hideTimer) clearTimeout(hideTimer);
          hideTimer = setTimeout(() => { try { iconEl.classList.remove('show'); } catch {} }, 2500);
        } catch {}
      });
    } catch {}
  });
}

function wireOverlays() {
  once('overlays', () => {
    try {
      const open = (name) => {
        try {
          const btn = $id(name + 'Btn');
          const dlg = $id(name + 'Overlay');
          if (!dlg) return;
          // Ensure settings content is mounted before showing
          if (name === 'settings') {
            try {
              const api = (window.__tp && window.__tp.settings) ? window.__tp.settings : null;
              if (api && typeof api.mount === 'function') api.mount();
            } catch {}
          }
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
  s1: { name: 'Joe',    color: '#2ea8ff' },
  s2: { name: 'Brad',   color: '#ffd24a' },
  g1: { name: 'Guest 1',   color: '#25d08a' },
  g2: { name: 'Guest 2',   color: '#b36cff' },
};

function loadRoles() {
  try { return Object.assign({}, ROLE_DEFAULTS, JSON.parse(localStorage.getItem(ROLES_KEY) || '{}')); }
  catch { return { ...ROLE_DEFAULTS }; }
}

function updateLegend() {
  try {
    // Mark that legend is being rendered so the MutationObserver can ignore these mutations
    document.documentElement.dataset.legendRendering = '1';
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
      // Prefer live color input value if provided; else stored default
      try {
        const colorInput = document.getElementById('color-' + key);
        const c = (colorInput && 'value' in colorInput) ? String(colorInput.value || '').trim() : '';
        dot.style.background = c || item.color;
      } catch { dot.style.background = item.color; }
      const name = document.createElement('span');
      // Prefer live input value if provided; else show canonical tag (S1/S2/G1/G2)
      try {
        const input = document.getElementById('name-' + key);
        const val = (input && 'value' in input) ? String(input.value || '').trim() : '';
        name.textContent = val || key.toUpperCase();
      } catch { name.textContent = key.toUpperCase(); }
      tag.appendChild(dot);
      tag.appendChild(name);
      legend.appendChild(tag);
    }
    // One-time input wiring to re-render on user changes
    try {
      if (!document.documentElement.dataset.legendWired) {
        document.documentElement.dataset.legendWired = '1';
        document.addEventListener('input', (e) => {
          try {
            const id = (e && e.target && e.target.id) ? String(e.target.id) : '';
            if (/^(name|color)-(s1|s2|g1|g2)$/.test(id)) updateLegend();
          } catch {}
        });
      }
    } catch {}

    // Broadcast speaker names/colors to display (s1/s2 only for the legend there)
    try {
      const getColor = (role, fallback) => {
        try { const inp = document.getElementById('color-' + role); const v = (inp && 'value' in inp) ? String(inp.value||'').trim() : ''; return v || fallback; } catch { return fallback; }
      };
      const getName = (role, fallback) => {
        try { const inp = document.getElementById('name-' + role); const v = (inp && 'value' in inp) ? String(inp.value||'').trim() : ''; return v || fallback; } catch { return fallback; }
      };
      const s1Color = getColor('s1', ROLES.s1.color);
      const s2Color = getColor('s2', ROLES.s2.color);
      const s1Name  = getName('s1', 'S1');
      const s2Name  = getName('s2', 'S2');
      if (__bc) {
        try { __bc.postMessage({ type: 'SPEAKER_COLORS', s1: s1Color, s2: s2Color }); } catch {}
        try { __bc.postMessage({ type: 'SPEAKER_NAMES', s1Name, s2Name }); } catch {}
      }
    } catch {}
  } finally {
    try { delete document.documentElement.dataset.legendRendering; } catch {}
  }
}

function ensureEmptyBanner() {
  try {
    const scriptEl = document.getElementById('script');
    const viewer = document.getElementById('viewer');
    if (!scriptEl || !viewer) return;
    const anyLines = !!scriptEl.querySelector('.line');
    const banner = viewer.querySelector('.empty-msg');
    if (!anyLines && !banner) {
      const el = document.createElement('div');
      el.className = 'empty-msg';
      el.textContent = 'Paste text in the editor to begin…';
      viewer.appendChild(el);
    }
    if (anyLines && banner) {
      banner.remove();
    }
  } catch {}
}

// === Master hydrator: run now and whenever DOM changes ===
function hydrateUI() {
  if (IS_HYDRATING) return;
  IS_HYDRATING = true;
  try {
    wireOverlays();
    wirePresentMode();
    updateLegend();
    ensureEmptyBanner();
  } finally {
    IS_HYDRATING = false;
  }
}

export function bindStaticDom() {
  console.log('[src/ui/dom] bindStaticDom');
  try {
    // one-time UI wiring guard to prevent duplicate listeners and chips
    if (document.documentElement.dataset.uiWired === '1') return;
    document.documentElement.dataset.uiWired = '1';

    // core feature wiring
    wireDisplayBridge();
  wireDisplayMirror();
    wireMic();
    wireCamera();
    wireUpload();
    wireScriptControls();
  wireLoadSample();
    installSpeakerIndex();
    installDbMeter();
    installObsChip();
  initSelfChecksChip();
    // Speakers section toggle (show/hide panel body)
    try {
      const btn = document.getElementById('toggleSpeakers');
      const body = document.getElementById('speakersBody');
      if (btn && body && !btn.dataset.wired) {
        btn.dataset.wired = '1';
        const KEY = 'tp_speakers_visible';
        const apply = (vis) => {
          try {
            body.style.display = vis ? '' : 'none';
            btn.textContent = vis ? 'Hide' : 'Show';
            btn.setAttribute('aria-expanded', vis ? 'true' : 'false');
            try { localStorage.setItem(KEY, vis ? '1' : '0'); } catch {}
          } catch {}
        };
        // initial
        let vis = true; try { vis = (localStorage.getItem(KEY) !== '0'); } catch {}
        apply(vis);
        btn.addEventListener('click', () => apply(!(body.style.display === '' || body.style.display === 'block' || body.style.display === null)));
      }
    } catch {}

    // Wire normalize button(s) for parity (top bar / settings / help)
    try {
      const tryWire = (id) => {
        const btn = document.getElementById(id);
        if (btn && !btn.dataset.wired) {
          btn.dataset.wired = '1';
          btn.addEventListener('click', () => {
            try {
              if (typeof window.normalizeToStandard === 'function') window.normalizeToStandard();
              else if (typeof window.fallbackNormalize === 'function') window.fallbackNormalize();
            } catch {}
          });
        }
      };
      tryWire('normalizeTopBtn');
      tryWire('normalizeBtn');
      tryWire('settingsNormalize');
    } catch {}

    // Wire editor input to re-render script
    try {
      const ed = document.getElementById('editor');
      if (ed && !ed.dataset.renderWired) {
        ed.dataset.renderWired = '1';
        ed.addEventListener('input', () => {
          try { if (typeof window.renderScript === 'function') window.renderScript(ed.value); } catch {}
        });
      }
    } catch {}

    // initial hydration pass
    hydrateUI();

    // keep it healthy: observe DOM changes and rehydrate idempotently
    const mo = new MutationObserver(() => {
      try {
        // Ignore mutations caused by legend rendering to avoid feedback loops
        if (document.documentElement.dataset.legendRendering === '1') return;
        if (IS_HYDRATING) return;
        if (!HYDRATE_SCHEDULED) {
          HYDRATE_SCHEDULED = true;
          requestAnimationFrame(() => { try { hydrateUI(); } finally { HYDRATE_SCHEDULED = false; } });
        }
      } catch {}
    });
    try { mo.observe(document.documentElement, { childList: true, subtree: true }); } catch {}
  } catch {}
}

// Self-checks chip: stub interaction for parity (click to set static text)
function initSelfChecksChip() {
  try {
    const chip = document.getElementById('selfChecksChip');
    const txt = document.getElementById('selfChecksText');
    if (!chip || !txt) return;
    chip.title = 'Click to run self-checks';

    const runLocalChecks = () => {
      const checks = [];
      try {
        // Overlays wiring
        const openBtn = document.getElementById('shortcutsBtn');
        const ov = document.getElementById('shortcutsOverlay');
        openBtn && openBtn.click();
        const opened = ov && !ov.classList.contains('hidden');
        // close via Escape
        window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
        const closed = ov && ov.classList.contains('hidden');
        checks.push({ name: 'Overlays open/close', pass: Boolean(opened && closed) });
      } catch { checks.push({ name: 'Overlays open/close', pass: false }); }

      try {
        // Present Mode controls exist (non-invasive)
        const btn = document.getElementById('presentBtn');
        const root = document.documentElement;
        const was = root.classList.contains('tp-present');
        // Send Escape to ensure no errors when present is off; shouldn't change state
        window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
        const unchanged = root.classList.contains('tp-present') === was;
        checks.push({ name: 'Present Mode controls', pass: Boolean(btn && unchanged) });
      } catch { checks.push({ name: 'Present Mode controls', pass: false }); }

      try {
        // dB meter listener (robust: toggle across two extremes to avoid equal-state no-op)
        const hostTop = document.getElementById('dbMeterTop');
        const fill = hostTop && hostTop.querySelector('i');
        const t0 = fill && getComputedStyle(fill).transform;
        window.dispatchEvent(new CustomEvent('tp:db', { detail: { db: -60 } }));
        const t1 = fill && getComputedStyle(fill).transform;
        window.dispatchEvent(new CustomEvent('tp:db', { detail: { db: 0 } }));
        const t2 = fill && getComputedStyle(fill).transform;
        const changed = !!(hostTop && fill && t0 && (t1 !== t0 || t2 !== t1));
        checks.push({ name: 'dB meter updates', pass: changed });
      } catch { checks.push({ name: 'dB meter updates', pass: false }); }

      try {
        // Legend hydration (4 tags)
        const legend = document.getElementById('legend');
        const good = !!(legend && legend.querySelectorAll('.tag').length >= 4);
        checks.push({ name: 'Legend hydrated', pass: good });
      } catch { checks.push({ name: 'Legend hydrated', pass: false }); }

      return checks;
    };

    const renderResult = (checks) => {
      try {
        const total = checks.length;
        const passed = checks.filter(c => c.pass).length;
        txt.textContent = `${passed}/${total} ${passed===total ? '✔' : '•'}`;
        console.table(checks);
      } catch {}
    };

    const runChecks = () => {
      try {
        if (typeof window.runSelfChecks === 'function') {
          const legacy = window.runSelfChecks();
          // Merge with local checks for wiring specifics
          const local = runLocalChecks();
          renderResult([ ...legacy, ...local ]);
        } else {
          renderResult(runLocalChecks());
        }
      } catch { txt.textContent = '0/0 •'; }
    };

    // Initial quick pass after hydration
    setTimeout(runChecks, 0);
    // On click, re-run and show console table
    chip.addEventListener('click', runChecks);
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
