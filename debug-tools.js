// Debug HUD — Anvil/Teleprompter
// Toggle: "~" (tilde) — configurable via options.hotkey
// Exposes: window.__tpInstallHUD(opts), window.HUD.log(tag, payload)

(function () {
  'use strict';

  const DEFAULTS = {
    hotkey: '~',
    maxRows: 400,
    autoscroll: true,
    filters: { scroll: true, speech: true, match: true, auto: true, anchor: true, display: true, boot: true, other: true }
  };

  function timeStamp() {
    const d = new Date();
    return d.toLocaleTimeString([], { hour12: false }) + '.' + String(d.getMilliseconds()).padStart(3, '0');
  }

  function mkEl(tag, cls, html) {
    const el = document.createElement(tag);
    if (cls) el.className = cls;
    if (html != null) el.innerHTML = html;
    return el;
  }

  function safeJson(x) {
    try { return JSON.stringify(x); } catch { return String(x); }
  }

  function normalizeTag(t) {
    if (!t) return 'other';
    const k = String(t).toLowerCase();
    if (k.includes('scroll')) return 'scroll';
    if (k.includes('speech') || k.includes('rec') || k.includes('asr') || k.includes('onresult')) return 'speech';
    if (k.includes('match') || k.includes('advance') || k.includes('sim') || k.includes('idx')) return 'match';
    if (k.includes('auto') || k.includes('timer')) return 'auto';
    if (k.includes('anchor') || k.includes('catchup')) return 'anchor';
    if (k.includes('display') || k.includes('sendtodisplay')) return 'display';
    if (k.includes('boot') || k.includes('init')) return 'boot';
    return 'other';
  }

  function installHUD(userOpts = {}) {
    const opts = Object.assign({}, DEFAULTS, userOpts);
    const state = {
      open: false,
      filters: { ...opts.filters },
      autoscroll: !!opts.autoscroll,
      maxRows: opts.maxRows,
    };
    // HUD config: levels and muting
    const LEVEL_RANK = { DEBUG:10, INFO:20, WARN:30, ERROR:40 };
    const hudConfig = {
      enabled: true,
      minLevel: 'WARN',
      mute: /^(catchup:hold:oscillation|match:catchup:stop|speech:(stop|onend))$/,
    };
    const metrics = {
      // commit metrics
      lastCommitAt: 0,
      commitIntervals: [], // ms buckets
      simHist: { '<0.7':0, '0.7-0.8':0, '0.8-0.9':0, '>=0.9':0 },
      // scroll metrics
      scrollWrites: 0,
      lastWriteTs: 0,
      // reflow risk detection
      frameReads: 0,
      frameWrites: 0,
      lastRAF: 0,
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
    const ver = mkEl('span', 'dim', typeof window.APP_VERSION === 'string' ? `v${window.APP_VERSION}` : '');
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
    const autoWrap = mkEl('label', null, `<input type="checkbox" ${state.autoscroll?'checked':''}/> <span>Auto-scroll</span>`);
    const cbAuto = autoWrap.querySelector('input');
    const filterBar = mkEl('div', 'tp-hud-filterbar');

    const tags = ['scroll','speech','match','auto','anchor','display','boot','other'];
    const filterChips = {};
    tags.forEach(t=>{
      const b = mkEl('button', 'chip' + (state.filters[t] ? ' on' : ''), t);
      b.addEventListener('click', ()=>{
        state.filters[t] = !state.filters[t];
        b.classList.toggle('on', state.filters[t]);
      });
      filterChips[t]=b; filterBar.appendChild(b);
    });

    foot.append(mkEl('span','dim','Filters:'), filterBar, mkEl('div','grow'), autoWrap);

    // Assemble
    hud.append(head, body, foot);
    document.body.appendChild(hud);

    // State
    let paused = false;

    function show() { hud.classList.add('open'); state.open = true; }
    function hide() { hud.classList.remove('open'); state.open = false; }

    function toggle() { (state.open ? hide : show)(); }

    // Controls
    btnPause.addEventListener('click', ()=>{ paused = !paused; btnPause.textContent = paused ? 'Resume' : 'Pause'; });
    btnClear.addEventListener('click', ()=>{ body.innerHTML=''; });
    btnCopy.addEventListener('click', async ()=>{
      const rows = [...body.querySelectorAll('.tp-hud-row')].map(r=>{
        const ts = r.querySelector('.tp-hud-ts')?.textContent||'';
        const tag = r.querySelector('.tp-hud-tag')?.textContent||'';
        const pl = r.querySelector('.tp-hud-payload')?.textContent||'';
        return `${ts}\t${tag}\t${pl}`;
      }).join('\n');
      try { await navigator.clipboard.writeText(rows); } catch {}
    });
    btnClose.addEventListener('click', hide);
    cbAuto.addEventListener('change', ()=> state.autoscroll = !!cbAuto.checked);

    function appendRow(tag, payload) {
      const norm = normalizeTag(tag);
      if (!state.filters[norm]) return;
      const row = mkEl('div', 'tp-hud-row');
      const ts = mkEl('div', 'tp-hud-ts', timeStamp());
      const tg = mkEl('div', 'tp-hud-tag', String(tag));
      const pl = mkEl('div', 'tp-hud-payload', typeof payload === 'string' ? payload : safeJson(payload));
      row.append(ts, tg, pl);
      body.appendChild(row);
      // trim
      const extra = body.children.length - state.maxRows;
      if (extra > 0) {
        for (let i=0;i<extra;i++) body.removeChild(body.firstChild);
      }
      if (state.autoscroll) body.scrollTop = body.scrollHeight;
    }

    // Keyboard toggle
    window.addEventListener('keydown', (e)=>{
      if (e.key === opts.hotkey && !e.altKey && !e.metaKey && !e.ctrlKey) {
        e.preventDefault();
        toggle();
      }
    });

    // Public log sink
    // Simple event bus for HUD-local events
    const listeners = Object.create(null);
    const bus = {
      on(evt, fn){ (listeners[evt] ||= []).push(fn); return () => bus.off(evt, fn); },
      off(evt, fn){ const a = listeners[evt]; if (!a) return; const i = a.indexOf(fn); if (i>=0) a.splice(i,1); },
      emit(evt, ...args){ const a = listeners[evt]; if (!a) return; a.slice().forEach(fn=>{ try{ fn(...args); }catch{} }); }
    };

    const HUD = {
      log(tag, payload, level){
        try {
          if (paused) return;
          const lvl = (typeof level === 'string') ? level : 'DEBUG';
          if (hudConfig && hudConfig.enabled === false) return;
          // Level threshold filter: keep suppressed logs in console, not HUD
          if (LEVEL_RANK[lvl] < LEVEL_RANK[hudConfig.minLevel]) { try { console.debug('[HUD]', tag, payload); } catch {} return; }
          // Mute pattern: console only
          try { if (hudConfig.mute && hudConfig.mute.test(String(tag))) { console.debug('[HUD muted]', tag, payload); return; } } catch {}
          appendRow(tag, payload);
        } catch {}
        // Also mirror to console for trace tails
        try { console.log('[HUD]', tag, payload); } catch {}
      },
      show, hide, toggle,
      setFilter(tag, on){ state.filters[tag] = !!on; if (filterChips[tag]) filterChips[tag].classList.toggle('on', !!on); },
      setAutoscroll(on){ state.autoscroll = !!on; cbAuto.checked = !!on; },
      setConfig(cfg){ try { Object.assign(hudConfig, cfg||{}); } catch {} },
      bus
    };
    try { window.HUD = HUD; } catch {}

    // Global emit wrapper compatible with the requested API
    try {
      window.emitHUD = function emitHUD(tag, data, level){
        try { HUD.log(tag, data, level); } catch {}
      };
    } catch {}

    // Optional: quiet mode — filter noisy HUD tags to keep console readable during dev
    (function(){
      try {
        const quiet = /([?#]).*quiet=1/.test(location.href) || (function(){ try { return localStorage.getItem('tp_quiet_hud')==='1'; } catch { return false; } })();
        if (!quiet) return;
        const orig = HUD.log;
        const NOISY = /^(match(:sim|:catchup:stop)?|scroll:(tick|viewer|jump)|fallback-nudge)$/;
        HUD.log = function(tag, payload){
          try { if (NOISY.test(String(tag))) return; } catch {}
          return orig(tag, payload);
        };
        try { console.info('[HUD] quiet mode enabled'); } catch {}
        // Log once on wrap to show initial relation
        try { const info0 = _getMarkerInfo && _getMarkerInfo(); if (info0) HUD.log('anchor:marker:init', info0); } catch {}
        // Update on resize as well (viewport changes)
        try { window.addEventListener('resize', ()=>{ try{ const info = _getMarkerInfo && _getMarkerInfo(); if (info) HUD.log('anchor:marker', info); }catch{} }, { passive:true }); } catch {}
      } catch {}
    })();

    // Install default debug() bridge if missing
    if (typeof window.debug !== 'function') {
      window.debug = (evt) => {
        const tag = (evt && (evt.tag || evt.type)) || 'other';
        HUD.log(tag, evt, 'DEBUG');
      };
    } else {
      // wrap existing debug() to also feed HUD
      const orig = window.debug;
      window.debug = function(evt){
        try { orig.apply(this, arguments); } catch {}
        const tag = (evt && (evt.tag || evt.type)) || 'other';
        HUD.log(tag, evt, 'DEBUG');
      };
    }

    // Monkey-patch common scroller & display paths if present later
    function lateWrap() {
      // viewer scroll telemetry
      try {
        const viewer = document.getElementById('viewer');
        if (viewer && !viewer.__hudBound) {
          viewer.__hudBound = true;
          let last = 0;
          let lastMarkerDelta = null, lastMarkerLog = 0;
          function _getMarkerInfo(){
            try {
              const marker = document.getElementById('marker');
              const script = document.getElementById('script');
              const active = (script || viewer)?.querySelector('p.active') || null;
              if (!viewer || !marker || !active) return null;
              const vRect = viewer.getBoundingClientRect();
              const mRect = marker.getBoundingClientRect();
              const aRect = active.getBoundingClientRect();
              const markerY = mRect.top - vRect.top;
              const activeY = aRect.top - vRect.top;
              const deltaPx = activeY - markerY; // + below marker, - above marker
              const vh = Math.max(1, viewer.clientHeight || 1);
              const deltaVH = +(deltaPx / vh).toFixed(3);
              return { markerY: Math.round(markerY), activeY: Math.round(activeY), deltaPx: Math.round(deltaPx), deltaVH };
            } catch { return null; }
          }
          viewer.addEventListener('scroll', ()=>{
            const now = performance.now();
            if (now - last > 150) { // throttle
              last = now;
              const max = Math.max(0, viewer.scrollHeight - viewer.clientHeight);
              HUD.log('scroll:viewer', { top: viewer.scrollTop, ratio: max ? +(viewer.scrollTop/max).toFixed(3) : 0 });
              // Also log where the spoken (active) line is relative to the marker
              const info = _getMarkerInfo();
              if (info) {
                const d = info.deltaPx;
                if (lastMarkerDelta == null || Math.abs(d - lastMarkerDelta) >= 6 || (now - lastMarkerLog) > 400) {
                  HUD.log('anchor:marker', info);
                  lastMarkerDelta = d; lastMarkerLog = now;
                }
              }
            }
          }, { passive:true });
          // track writes per second via scheduler hint
          const origScrollTo = viewer.scrollTo?.bind(viewer);
          if (origScrollTo && !viewer.__hudWriteWrap) {
            viewer.scrollTo = function(){ try { metrics.scrollWrites++; metrics.lastWriteTs = Date.now(); _wpsStartOnWrite(); } catch{} return origScrollTo.apply(this, arguments); };
            viewer.__hudWriteWrap = true;
          }
        }
      } catch {}

      // wrap sendToDisplay
      if (typeof window.sendToDisplay === 'function' && !window.sendToDisplay.__hudWrapped) {
        const orig = window.sendToDisplay;
        window.sendToDisplay = function(msg){
          try { if (msg && msg.type === 'scroll') HUD.log('display:scroll', msg); else if (msg && msg.type) HUD.log('display:'+msg.type, msg); } catch {}
          return orig.apply(this, arguments);
        };
        window.sendToDisplay.__hudWrapped = true;
      }

      // wrap scroll helpers
      ['scrollByPx','scrollToY','scrollToEl','requestScroll'].forEach(fn=>{
        if (typeof window[fn] === 'function' && !window[fn].__hudWrapped) {
          const orig = window[fn];
          window[fn] = function(){
            try { HUD.log('scroll:'+fn, Array.from(arguments)); } catch {}
            try { metrics.scrollWrites++; metrics.lastWriteTs = Date.now(); _wpsStartOnWrite(); } catch {}
            return orig.apply(this, arguments);
          };
          window[fn].__hudWrapped = true;
        }
      });

      // wrap auto scroll on/off
      ['startAutoScroll','stopAutoScroll','tweakSpeed'].forEach(fn=>{
        if (typeof window[fn] === 'function' && !window[fn].__hudWrapped) {
          const orig = window[fn];
          window[fn] = function(){
            try { HUD.log('auto:'+fn, Array.from(arguments)); } catch {}
            return orig.apply(this, arguments);
          };
          window[fn].__hudWrapped = true;
        }
      });

      // wrap “scrollToCurrentIndex” & matcher bumps
      ['scrollToCurrentIndex'].forEach(fn=>{
        if (typeof window[fn] === 'function' && !window[fn].__hudWrapped) {
          const orig = window[fn];
          window[fn] = function(){
            try { HUD.log('match:'+fn, { currentIndex: window.currentIndex }); } catch {}
            try {
              const sim = (window.__lastSimScore ?? null);
              // simAtCommit histogram
              if (typeof sim === 'number'){
                if (sim < 0.7) metrics.simHist['<0.7']++;
                else if (sim < 0.8) metrics.simHist['0.7-0.8']++;
                else if (sim < 0.9) metrics.simHist['0.8-0.9']++;
                else metrics.simHist['>=0.9']++;
              }
              // time-between-commits
              const now = performance.now();
              if (metrics.lastCommitAt){ metrics.commitIntervals.push(now - metrics.lastCommitAt); }
              metrics.lastCommitAt = now;
              HUD.log('match:commit:metrics', { sim, simHist: metrics.simHist, lastIntervalMs: metrics.commitIntervals.at(-1) });
            } catch {}
            return orig.apply(this, arguments);
          };
          window[fn].__hudWrapped = true;
        }
      });

      // speech recognition lifecycle
      try {
        const SR = (window.SpeechRecognition || window.webkitSpeechRecognition);
        // If code creates "recog" later, we’ll wrap handlers once it exists
        const tryBindRecog = () => {
          const r = window.recog;
          if (r && !r.__hudBound) {
            r.__hudBound = true;
            const bind = (ev, tag) => {
              const k = 'on'+ev;
              const prev = r[k];
              r[k] = function(e){
                try {
                  if (tag === 'onresult') {
                    // log just the tail transcript for brevity
                    const res = e && e.results && e.results[e.results.length-1];
                    const tail = res && res[0] && res[0].transcript;
                    HUD.log('speech:'+tag, { tail });
                  } else {
                    HUD.log('speech:'+tag, e && e.type || tag);
                  }
                } catch {}
                if (typeof prev === 'function') return prev.apply(this, arguments);
              };
            };
            ['start','end','error','result','audiostart','audioend','soundstart','soundend','speechstart','speechend'].forEach(ev=>bind(ev, 'on'+ev));
            // Gate WPS: toggle on speech start/end
            const prevStart = r.onstart;
            r.onstart = function(e){ try{ HUD.bus.emit('speech:toggle', true); }catch{} return typeof prevStart==='function'?prevStart.apply(this, arguments):undefined; };
            const prevEnd = r.onend;
            r.onend = function(e){ try{ HUD.bus.emit('speech:toggle', false); }catch{} return typeof prevEnd==='function'?prevEnd.apply(this, arguments):undefined; };
          }
        };
        setInterval(tryBindRecog, 300);
      } catch {}
    }

    // Try wrapping periodically as pieces come online
    const wrapTimer = setInterval(lateWrap, 250);
    setTimeout(()=> clearInterval(wrapTimer), 15000); // stop polling after 15s

    // Gate WPS to speech-sync state
    let wpsTimer = null, lastWrites = 0;
    let speechOn = false;
    const startWps = () => {
      if (wpsTimer) return;
      wpsTimer = setInterval(() => {
        const writes = metrics.scrollWrites || 0;
        const wps = writes - lastWrites;
        lastWrites = writes;
        if (speechOn && Date.now() - (metrics.lastWriteTs || 0) < 5000 && wps > 0) {
          HUD.log('scroll:wps', { writesPerSec: wps, writes });
        }
      }, 1000);
    };
    const stopWps = () => { if (wpsTimer) { clearInterval(wpsTimer); wpsTimer = null; } };
    HUD.bus.on('speech:toggle', on => { speechOn = !!on; return on ? startWps() : stopWps(); });

    // Also start WPS on first scroll write so we don't miss initial activity
    function _wpsStartOnWrite(){ try { startWps(); } catch {} }

    // Reflow risk detection: if both writes and layout reads occur in same frame
    ;(function installReflowRisk(){
      try {
        const doc = document;
        const props = ['offsetTop','offsetLeft','offsetWidth','offsetHeight','clientTop','clientLeft','clientWidth','clientHeight','scrollTop','scrollLeft','scrollWidth','scrollHeight'];
        const elProto = Element.prototype;
        const rd = new WeakSet();
        // track reads
        props.forEach(p=>{
          const d = Object.getOwnPropertyDescriptor(elProto, p);
          if (d && typeof d.get === 'function'){
            Object.defineProperty(elProto, p, {
              configurable: true,
              get: function(){ try { metrics.frameReads = (metrics.frameReads||0)+1; } catch {} return d.get.call(this); }
            });
          }
        });
        // track writes via style assignments
        const origStyleSet = CSSStyleDeclaration.prototype.setProperty;
        CSSStyleDeclaration.prototype.setProperty = function(){ try { metrics.frameWrites = (metrics.frameWrites||0)+1; } catch{} return origStyleSet.apply(this, arguments); };
        // tick each rAF
        const loop = ()=>{
          try {
            const had = { r: metrics.frameReads||0, w: metrics.frameWrites||0 };
            if (had.r > 0 && had.w > 0) {
              HUD.log('perf:reflow-risk', had);
            }
            metrics.frameReads = 0; metrics.frameWrites = 0;
          } catch {}
          requestAnimationFrame(loop);
        };
        requestAnimationFrame(loop);
      } catch {}
    })();

    return { toggle, show, hide, log: (...a)=>HUD.log(...a) };
  }

  // Publish installer
  try { window.__tpInstallHUD = installHUD; } catch {}
})();
