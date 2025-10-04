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
        applyFilters();
      });
      filterChips[t] = b;
      filterBar.appendChild(b);
      });

    // Assemble HUD DOM
    hud.append(head, body, foot);
    foot.append(autoWrap, filterBar, mkEl('span','dim','Filters'));
    document.body.appendChild(hud);

    // Wire footer controls
    cbAuto.addEventListener('change', ()=>{ state.autoscroll = !!cbAuto.checked; });
    let paused = false;
    btnPause.addEventListener('click', ()=>{ paused = !paused; btnPause.textContent = paused ? 'Resume' : 'Pause'; });
    btnClear.addEventListener('click', ()=>{ body.innerHTML = ''; });
    btnCopy.addEventListener('click', async ()=>{
      try {
        const text = Array.from(body.querySelectorAll('.tp-hud-row')).map(r=>r.innerText).join('\n');
        if (navigator.clipboard?.writeText) await navigator.clipboard.writeText(text);
        else {
          const ta = mkEl('textarea'); ta.style.position='fixed'; ta.style.opacity='0'; ta.value = text; document.body.appendChild(ta); ta.select(); document.execCommand('copy'); ta.remove();
        }
      } catch {}
    });
    btnClose.addEventListener('click', ()=>{ hud.classList.remove('open'); state.open = false; });

    function applyFilters(){
      const rows = body.querySelectorAll('.tp-hud-row');
      rows.forEach(r=>{
        const tg = r.getAttribute('data-tag') || 'other';
        r.style.display = state.filters[tg] ? '' : 'none';
      });
    }

    function addRow(tag, payload){
      if (paused) return;
      const tg = normalizeTag(tag);
      const row = mkEl('div','tp-hud-row');
      row.setAttribute('data-tag', tg);
      const tsEl = mkEl('div','tp-hud-ts', timeStamp());
      const tagEl = mkEl('div','tp-hud-tag', tg);
      const payloadEl = mkEl('div','tp-hud-payload', typeof payload === 'string' ? payload : safeJson(payload));
      row.append(tsEl, tagEl, payloadEl);
      body.appendChild(row);
      // Trim oldest
      while (body.childElementCount > (Number(state.maxRows)||400)) {
        const first = body.firstElementChild; if (first) first.remove(); else break;
      }
      applyFilters();
      if (state.autoscroll && hud.classList.contains('open')) {
        body.scrollTop = body.scrollHeight;
      }
    }

    // Toggle via hotkey
    function matchesHotkey(e){
      const key = String(opts.hotkey||'~');
      return (e.key === key) || (key === '~' && e.code === 'Backquote');
    }
    const onKey = (e)=>{ if (matchesHotkey(e) && !e.repeat) { e.preventDefault(); state.open = !state.open; hud.classList.toggle('open', state.open); if (state.open && state.autoscroll) body.scrollTop = body.scrollHeight; } };
    window.addEventListener('keydown', onKey);

    // API
    const api = {
      log(tag, payload){ addRow(tag, payload); },
      open(){ state.open = true; hud.classList.add('open'); if (state.autoscroll) body.scrollTop = body.scrollHeight; },
      close(){ state.open = false; hud.classList.remove('open'); },
      toggle(){ state.open ? this.close() : this.open(); },
      _el: hud,
      _state: state,
    };

    // Expose singleton
    try { window.__TP_HUD = api; } catch {}
    try { window.HUD = window.HUD || api; } catch {}

    return api;
  }

  // Public installer
  try {
    if (!window.__tpInstallHUD) {
      window.__tpInstallHUD = function(userOpts){
        if (window.__TP_HUD) return window.__TP_HUD;
        return installHUD(userOpts);
      };
    }
    // Ensure window.HUD exists and delegates to the installed HUD
    if (!window.HUD) {
      window.HUD = {
        log(tag, payload){
          try {
            if (!window.__TP_HUD) window.__TP_HUD = installHUD();
            window.__TP_HUD.log(tag, payload);
          } catch {}
        }
      };
    }
  } catch {}

})();
