// Debug HUD — Anvil/Teleprompter
// Toggle: "~" (tilde) — configurable via options.hotkey
// Exposes: window.__tpInstallHUD(opts), window.HUD.log(tag, payload)

(function () {
  'use strict';

  // Dev guard: only install HUD when dev mode is enabled
  var dev = false;
  try {
    dev =
      !!window.__TP_DEV ||
      (location.search + location.hash).indexOf('dev=1') !== -1 ||
      (window.localStorage && localStorage.getItem('tp_dev_mode') === '1');
  } catch (_e) {}

  if (!dev) {
    // Provide safe no-ops so HUD.log calls don't explode
    try {
      window.HUD = window.HUD || { log: function () {} };
      window.__tpInstallHUD = function () {};
    } catch (_e) {}
    return;
  }

  // Top of file: quiet flag + rate limiter
  window.__TP_QUIET = window.__TP_QUIET ?? false; // set true to silence info/debug
  window.__TP_LOG_MIN_MS = window.__TP_LOG_MIN_MS ?? 250; // throttle info/debug to at most 4/sec

  const __tpLogState = { lastAt: 0 };

  function tpLog(level, ...args) {
    // Always allow errors
    if (level === 'error') {
      console.error(...args);
      return;
    }

    // Quiet mode kills non-error logs
    if (window.__TP_QUIET) return;

    // Throttle non-error logs
    const now = performance.now();
    if (now - __tpLogState.lastAt < window.__TP_LOG_MIN_MS) return;
    __tpLogState.lastAt = now;

    if (level === 'warn') console.warn(...args);
    else if (level === 'info') console.info(...args);
    else console.debug(...args); // default to debug
  }

  const DEFAULTS = {
    hotkey: '~',
    maxRows: 400,
    autoscroll: true,
    filters: {
      scroll: true,
      speech: true,
      match: true,
      auto: true,
      anchor: true,
      display: true,
      boot: true,
      pll: true,
      other: true,
    },
  };

  function timeStamp() {
    const d = new Date();
    return (
      d.toLocaleTimeString([], { hour12: false }) +
      '.' +
      String(d.getMilliseconds()).padStart(3, '0')
    );
  }

  function mkEl(tag, cls, html) {
    const el = document.createElement(tag);
    if (cls) el.className = cls;
    if (html != null) el.innerHTML = html;
    return el;
  }

  function safeJson(x) {
    try {
      return JSON.stringify(x);
    } catch {
      return String(x);
    }
  }

  function normalizeTag(t) {
    if (!t) return 'other';
    const k = String(t).toLowerCase();
    if (k.includes('scroll')) return 'scroll';
    if (k.includes('speech') || k.includes('rec') || k.includes('asr') || k.includes('onresult'))
      return 'speech';
    if (k.includes('match') || k.includes('advance') || k.includes('sim') || k.includes('idx'))
      return 'match';
    if (k.includes('auto') || k.includes('timer')) return 'auto';
    if (k.includes('anchor') || k.includes('catchup')) return 'anchor';
    if (k.includes('display') || k.includes('sendtodisplay')) return 'display';
    if (k.includes('pll') || k.includes('bias') || k.includes('lock') || k.includes('coast'))
      return 'pll';
  }

  function installHUD(userOpts = {}) {
    const opts = Object.assign({}, DEFAULTS, userOpts);
    const state = {
      open: false,
      filters: { ...opts.filters },
      autoscroll: !!opts.autoscroll,
      maxRows: opts.maxRows,
    };
    const metrics = {
      // commit metrics
      lastCommitAt: 0,
      commitIntervals: [], // ms buckets
      simHist: { '<0.7': 0, '0.7-0.8': 0, '0.8-0.9': 0, '>=0.9': 0 },
      // scroll metrics
      scrollWrites: 0,
      lastWriteTs: 0,
      // reflow risk detection
      frameReads: 0,
      frameWrites: 0,
      lastRAF: 0,
        // counters requested for CI/HUD diagnostics
        drops: { command: 0, oov: 0, meta: 0 },
        softAdv: { allowed: 0, blockedLost: 0, frozen: 0 },
        rescue: { count: 0, rescuesPerMin: 0 },
    };

    // Styles (scoped)
    if (!document.getElementById('tp-hud-styles')) {
      const st = document.createElement('style');
      st.id = 'tp-hud-styles';
      st.textContent = `
  [data-tp-hud]{position:fixed;z-index:999999;right:8px;bottom:8px;width:min(560px,96vw);max-height:58vh;background:#0b1118cc;border:1px solid var(--edge, #213041);border-radius:10px;backdrop-filter:saturate(1.2) blur(6px);color:#d6dfeb;font:12px ui-monospace, Menlo, Consolas, monospace;display:none;box-shadow:0 4px 20px #000a}
      [data-tp-hud].open{display:flex;flex-direction:column}
  .tp-hud-head{display:flex;gap:8px;align-items:center;padding:8px;border-bottom:1px solid var(--edge, #213041)}
      .tp-hud-head .title{font-weight:600}
      .tp-hud-head .chip{border:1px solid #25384d;background:#0e1722; padding:4px 8px;border-radius:8px;cursor:pointer}
      .tp-hud-head .chip.on{background:#16324a}
      .tp-hud-head .grow{flex:1}
      .tp-hud-body{overflow:auto;padding:6px 8px}
      .tp-hud-row{display:grid;grid-template-columns:82px 76px 1fr;gap:8px;align-items:start;padding:3px 0;border-bottom:1px dashed #142232}
      .tp-hud-row:last-child{border-bottom:0}
      .tp-hud-ts{color:#8fb3ff}
      .tp-hud-tag{color:#9fe69f}
      .tp-hud-payload{white-space:pre-wrap;word-break:break-word;color:#d6dfeb}
  .tp-hud-foot{display:flex;gap:8px;align-items:center;padding:6px 8px;border-top:1px solid var(--edge, #213041)}
      .tp-hud-foot input[type=checkbox]{transform:translateY(1px)}
      .tp-hud-filterbar{display:flex;flex-wrap:wrap;gap:4px;margin-left:6px}
      .tp-hud-filterbar .chip{font-size:11px}
      .tp-hud-foot .dim{color:#98a6b5}
      `;
      document.head.appendChild(st);
    }

    // DOM
    const hud = mkEl('div', null);
    hud.setAttribute('data-tp-hud', '1');

    // Header
    const head = mkEl('div', 'tp-hud-head');
    const title = mkEl('span', 'title', 'HUD · Scroll & Speech');
    const ver = mkEl(
      'span',
      'dim',
      typeof window.APP_VERSION === 'string' ? `v${window.APP_VERSION}` : ''
    );
    const grow = mkEl('div', 'grow');
    const btnPause = mkEl('button', 'chip', 'Pause');
    const btnClear = mkEl('button', 'chip', 'Clear');
    const btnCopy = mkEl('button', 'chip', 'Copy');
    const btnClose = mkEl('button', 'chip', '✕');
    head.append(title, ver, grow, btnPause, btnClear, btnCopy, btnClose);

    // Body
    const body = mkEl('div', 'tp-hud-body');

    // Footer (filters + autoscroll)
    const foot = mkEl('div', 'tp-hud-foot');
    const autoWrap = mkEl(
      'label',
      null,
      `<input type="checkbox" ${state.autoscroll ? 'checked' : ''}/> <span>Auto-scroll</span>`
    );
    const cbAuto = autoWrap.querySelector('input');
    const filterBar = mkEl('div', 'tp-hud-filterbar');

    const tags = ['scroll', 'speech', 'match', 'auto', 'anchor', 'display', 'boot', 'pll', 'other'];
    const filterChips = {};
    tags.forEach((t) => {
      const b = mkEl('button', 'chip' + (state.filters[t] ? ' on' : ''), t);
      b.addEventListener('click', () => {
        state.filters[t] = !state.filters[t];
        b.classList.toggle('on', state.filters[t]);
      });
      filterChips[t] = b;
      filterBar.appendChild(b);
    });

    foot.append(mkEl('span', 'dim', 'Filters:'), filterBar, mkEl('div', 'grow'), autoWrap);

    // Assemble
    hud.append(head, body, foot);
    // Prefer mounting to #hud-root if present, else fallback to body
    const hudRoot = document.getElementById('hud-root');
    if (hudRoot) {
      try { hudRoot.style.pointerEvents = 'auto'; } catch {}
      hudRoot.appendChild(hud);
    } else {
      document.body.appendChild(hud);
    }

    // Make HUD draggable via its header
    (function makeHudDraggable() {
      let dragging = false;
      let startX = 0;
      let startY = 0;
      let startLeft = 0;
      let startTop = 0;

      head.style.cursor = 'move';
      hud.style.right = 'auto';
      hud.style.bottom = 'auto';

      function onPointerDown(ev) {
        if (ev.button !== undefined && ev.button !== 0) return;
        dragging = true;
        const rect = hud.getBoundingClientRect();
        startLeft = rect.left;
        startTop = rect.top;
        startX = ev.clientX;
        startY = ev.clientY;
        hud.style.position = 'fixed';
        hud.style.left = startLeft + 'px';
        hud.style.top = startTop + 'px';
        window.addEventListener('pointermove', onPointerMove);
        window.addEventListener('pointerup', onPointerUp);
        window.addEventListener('pointercancel', onPointerUp);
        try { ev.preventDefault(); } catch (_e) {}
      }

      function onPointerMove(ev) {
        if (!dragging) return;
        const dx = ev.clientX - startX;
        const dy = ev.clientY - startY;
        hud.style.left = startLeft + dx + 'px';
        hud.style.top = startTop + dy + 'px';
      }

      function onPointerUp() {
        if (!dragging) return;
        dragging = false;
        window.removeEventListener('pointermove', onPointerMove);
        window.removeEventListener('pointerup', onPointerUp);
        window.removeEventListener('pointercancel', onPointerUp);
      }

      head.addEventListener('pointerdown', onPointerDown);
    })();

    // State
    let paused = false;

    function show() {
      hud.classList.add('open');
      state.open = true;
      try { if (hudRoot) hudRoot.style.pointerEvents = 'auto'; } catch {}
    }
    function hide() {
      hud.classList.remove('open');
      state.open = false;
      // Keep pointer events enabled so the toggle button remains clickable if present in the root
      try { if (hudRoot) hudRoot.style.pointerEvents = 'auto'; } catch {}
    }

    function toggle() {
      (state.open ? hide : show)();
    }

    // Controls
    btnPause.addEventListener('click', () => {
      paused = !paused;
      btnPause.textContent = paused ? 'Resume' : 'Pause';
    });
    btnClear.addEventListener('click', () => {
      body.innerHTML = '';
    });
    btnCopy.addEventListener('click', async () => {
      const rows = [...body.querySelectorAll('.tp-hud-row')]
        .map((r) => {
          const ts = r.querySelector('.tp-hud-ts')?.textContent || '';
          const tag = r.querySelector('.tp-hud-tag')?.textContent || '';
          const pl = r.querySelector('.tp-hud-payload')?.textContent || '';
          return `${ts}\t${tag}\t${pl}`;
        })
        .join('\n');
      try {
        await navigator.clipboard.writeText(rows);
      } catch {}
    });
    btnClose.addEventListener('click', hide);
    cbAuto.addEventListener('change', () => (state.autoscroll = !!cbAuto.checked));

    function appendRow(tag, payload) {
      const norm = normalizeTag(tag);
      if (!state.filters[norm]) return;
      const row = mkEl('div', 'tp-hud-row');
      const ts = mkEl('div', 'tp-hud-ts', timeStamp());
      const tg = mkEl('div', 'tp-hud-tag', String(tag));
      const pl = mkEl(
        'div',
        'tp-hud-payload',
        typeof payload === 'string' ? payload : safeJson(payload)
      );
      row.append(ts, tg, pl);
      body.appendChild(row);
      // trim
      const extra = body.children.length - state.maxRows;
      if (extra > 0) {
        for (let i = 0; i < extra; i++) body.removeChild(body.firstChild);
      }
      if (state.autoscroll) body.scrollTop = body.scrollHeight;
    }

    // Keyboard toggle
    window.addEventListener('keydown', (e) => {
      if (e.key === opts.hotkey && !e.altKey && !e.metaKey && !e.ctrlKey) {
        e.preventDefault();
        toggle();
      }
    });

    // Public log sink
    // Simple event bus for HUD-local events
    const listeners = Object.create(null);
    const bus = {
      on(evt, fn) {
        (listeners[evt] ||= []).push(fn);
        return () => bus.off(evt, fn);
      },
      off(evt, fn) {
        const a = listeners[evt];
        if (!a) return;
        const i = a.indexOf(fn);
        if (i >= 0) a.splice(i, 1);
      },
      emit(evt, ...args) {
        const a = listeners[evt];
        if (!a) return;
        a.slice().forEach((fn) => {
          try {
            fn(...args);
          } catch {}
        });
      },
    };

    const HUD = {
      log(tag, payload) {
        try {
          if (paused) return;
          appendRow(tag, payload);
        } catch {}
        // Also mirror to console for trace tails (with quiet flag + rate limiter)
        try {
          tpLog('debug', '[HUD]', tag, payload);
        } catch {}
      },
      show,
      hide,
      toggle,
      setFilter(tag, on) {
        state.filters[tag] = !!on;
        if (filterChips[tag]) filterChips[tag].classList.toggle('on', !!on);
      },
      setAutoscroll(on) {
        state.autoscroll = !!on;
        cbAuto.checked = !!on;
      },
      bus,
    };
    try {
      window.HUD = HUD;
    } catch {}

    // Optional: quiet mode — filter noisy HUD tags to keep console readable during dev
    (function () {
      try {
        const quiet =
          /([?#]).*quiet=1/.test(location.href) ||
          (function () {
            try {
              return localStorage.getItem('tp_quiet_hud') === '1';
            } catch {
              return false;
            }
          })();
        if (!quiet) return;
        const orig = HUD.log;
        const NOISY = /^(match(:sim|:catchup:stop)?|scroll:(tick|viewer|jump)|fallback-nudge)$/;
        HUD.log = function (tag, payload) {
          try {
            if (NOISY.test(String(tag))) return;
          } catch {}
          return orig(tag, payload);
        };
        try {
          console.info('[HUD] quiet mode enabled');
        } catch {}
      } catch {}
    })();

    // Install default debug() bridge if missing
    if (typeof window.debug !== 'function') {
      window.debug = (evt) => {
        const tag = (evt && (evt.tag || evt.type)) || 'other';
        HUD.log(tag, evt);
      };
    } else {
      // wrap existing debug() to also feed HUD
      const orig = window.debug;
      window.debug = function (evt) {
        try {
          orig.apply(this, arguments);
        } catch {}
        const tag = (evt && (evt.tag || evt.type)) || 'other';
        HUD.log(tag, evt);
      };
    }

    // Monkey-patch common scroller & display paths if present later
    function lateWrap() {
      // legacy monkeypatches removed
    }
