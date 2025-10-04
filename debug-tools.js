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

    // Styles (scoped)
    if (!document.getElementById('tp-hud-styles')) {
      const st = document.createElement('style');
      st.id = 'tp-hud-styles';
      st.textContent = `
      [data-tp-hud]{position:fixed;z-index:999999;right:8px;bottom:8px;width:min(560px,96vw);max-height:58vh;background:#0b1118cc;border:1px solid #213041;border-radius:10px;backdrop-filter:saturate(1.2) blur(6px);color:#d6dfeb;font:12px ui-monospace, Menlo, Consolas, monospace;display:none;box-shadow:0 4px 20px #000a}
      [data-tp-hud].open{display:flex;flex-direction:column}
      .tp-hud-head{display:flex;gap:8px;align-items:center;padding:8px;border-bottom:1px solid #213041}
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
      .tp-hud-foot{display:flex;gap:8px;align-items:center;padding:6px 8px;border-top:1px solid #213041}
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
    const HUD = {
      log(tag, payload){
        try {
          if (paused) return;
          appendRow(tag, payload);
        } catch {}
        // Also mirror to console for trace tails
        try { console.log('[HUD]', tag, payload); } catch {}
      },
      show, hide, toggle,
      setFilter(tag, on){ state.filters[tag] = !!on; if (filterChips[tag]) filterChips[tag].classList.toggle('on', !!on); },
      setAutoscroll(on){ state.autoscroll = !!on; cbAuto.checked = !!on; }
    };
    try { window.HUD = HUD; } catch {}

    // Install default debug() bridge if missing
    if (typeof window.debug !== 'function') {
      window.debug = (evt) => {
        const tag = (evt && (evt.tag || evt.type)) || 'other';
        HUD.log(tag, evt);
      };
    } else {
      // wrap existing debug() to also feed HUD
      const orig = window.debug;
      window.debug = function(evt){
        try { orig.apply(this, arguments); } catch {}
        const tag = (evt && (evt.tag || evt.type)) || 'other';
        HUD.log(tag, evt);
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
          viewer.addEventListener('scroll', ()=>{
            const now = performance.now();
            if (now - last > 150) { // throttle
              last = now;
              const max = Math.max(0, viewer.scrollHeight - viewer.clientHeight);
              HUD.log('scroll:viewer', { top: viewer.scrollTop, ratio: max ? +(viewer.scrollTop/max).toFixed(3) : 0 });
            }
          }, { passive:true });
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
      ['scrollByPx','scrollToY','scrollToEl'].forEach(fn=>{
        if (typeof window[fn] === 'function' && !window[fn].__hudWrapped) {
          const orig = window[fn];
          window[fn] = function(){
            try { HUD.log('scroll:'+fn, Array.from(arguments)); } catch {}
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
          }
        };
        setInterval(tryBindRecog, 300);
      } catch {}
    }

    // Try wrapping periodically as pieces come online
    const wrapTimer = setInterval(lateWrap, 250);
    setTimeout(()=> clearInterval(wrapTimer), 15000); // stop polling after 15s

    return { toggle, show, hide, log: (...a)=>HUD.log(...a) };
  }

  // Publish installer
  try { window.__tpInstallHUD = installHUD; } catch {}
})();
