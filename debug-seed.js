(function(){
  'use strict';

  function log(tag, payload){ try { window.HUD && HUD.log(tag, payload); } catch {} }

  // -------------  A) Boot snapshot  -------------
  function bootSnapshot(){
    const flags = {
      devQuery: /([?#]).*dev=1/.test(location.href),
      devLocal: (function(){ try { return localStorage.getItem('tp_dev_mode'); } catch { return null; } })(),
      hasViewer: !!document.getElementById('viewer'),
      hasDisplay: !!window.sendToDisplay,
      version: window.APP_VERSION || '(unknown)'
    };
    log('boot:snapshot', flags);
  }

  // -------------  B) Targeted module wrappers -------------
  function wrapModule(name){
    const mod = window[name];
    if (!mod || typeof mod !== 'object') return;
    if (mod.__hudWrapped) return; mod.__hudWrapped = true;
    Object.keys(mod).forEach(k=>{
      const v = mod[k];
      if (typeof v === 'function' && !v.__hudWrapped) {
        const path = `${name}.${k}`;
        const orig = v;
        mod[k] = function(){
          log(`wrap:${path}`, { args: Array.from(arguments).slice(0,3) });
          return orig.apply(this, arguments);
        };
        mod[k].__hudWrapped = true;
      }
    });
    log('boot:wrapped', name);
  }

  // Known modules in this baseline split:
  function wrapKnown(){
    wrapModule('scrollHelpers');
    wrapModule('scrollControl');
    wrapModule('ioAnchor');
    wrapModule('recorders');
  }

  // -------------  C) Aggressive pattern wrapper (opt-in) -------------
  let aggressiveOn = false;
  function wrapAllFunctions(pattern = /(scroll|match|anchor|speech|recog|sync|align|seek|index|nudge|catchup|advance)/i){
    if (!aggressiveOn) return;
    const seen = new WeakSet();
    const wrapObj = (obj, path='window', depth=0)=>{
      if (!obj || typeof obj !== 'object' || seen.has(obj) || depth>1) return;
      seen.add(obj);
      for (const k of Object.keys(obj)) {
        if (k.startsWith('__') || k.endsWith('__')) continue;
        const v = obj[k];
        const p = `${path}.${k}`;
        if (typeof v === 'function') {
          if (v.__hudWrapped) continue;
          if (!pattern.test(k)) continue;
          const orig = v;
          obj[k] = function(){
            log(`wrap:${k}`, { path: p, args: Array.from(arguments).slice(0,3) });
            return orig.apply(this, arguments);
          };
          obj[k].__hudWrapped = true;
        } else if (typeof v === 'object' && v) {
          wrapObj(v, p, depth+1);
        }
      }
    };
    wrapObj(window);
    log('boot:aggressive-wrap', 'scan-complete');
  }

  // -------------  D) Watch index changes -------------
  function interceptCurrentIndex(){
    if (!('currentIndex' in window)) return;
    let _ci = window.currentIndex;
    try {
      Object.defineProperty(window, 'currentIndex', {
        get(){ return _ci; },
        set(v){ _ci = v; log('match:index', { currentIndex: v }); },
        configurable: true
      });
      log('boot:index-intercept', 'ok');
    } catch {}
  }

  // -------------  E) Speech recognition (additional taps) -------------
  function hookSpeech(){
    const tryBind = ()=>{
      const r = window.recog || window.recognition || window.sr || null;
      if (!r || r.__seedBound) return;
      r.__seedBound = true;

      const bind = (ev)=>{
        const k = 'on'+ev;
        const prev = r[k];
        r[k] = function(e){
          if (ev === 'result') {
            const res = e && e.results && e.results[e.results.length-1];
            const tail = res && res[0] && res[0].transcript;
            log('speech:onresult+', { tail });
          } else {
            log('speech:'+k, e && e.type || k);
          }
          return typeof prev === 'function' ? prev.apply(this, arguments) : undefined;
        };
      };
      ['start','end','error','audiostart','audioend','soundstart','soundend','speechstart','speechend','result'].forEach(bind);
      log('boot:speech-hook', 'ok');
    };
    const t = setInterval(tryBind, 300);
    setTimeout(()=>clearInterval(t), 15000);
  }

  // -------------  F) Display bridge -------------
  function hookPostMessage(){
    window.addEventListener('message', (e)=>{
      try {
        const data = e && e.data;
        if (!data) return;
        if (data.type) log('display:postMessage', { type: data.type, ...data });
      } catch {}
    });
  }

  // -------------  G) Scroll jump + “stuck” detector -------------
  function installScrollDetectors(){
    const viewer = document.getElementById('viewer');
    if (!viewer) return;
    let lastTop = viewer.scrollTop;
    let lastMoveAt = performance.now();

    viewer.addEventListener('scroll', ()=>{
      const now = performance.now();
      const dt = now - lastMoveAt;
      const dy = Math.abs(viewer.scrollTop - lastTop);
      const vh = viewer.clientHeight || 1;

      if (dy > Math.max(64, vh*0.5)) { // big jump
        log('scroll:jump', { from: lastTop, to: viewer.scrollTop, dt: Math.round(dt) });
      } else {
        log('scroll:tick', { top: viewer.scrollTop });
      }
      lastTop = viewer.scrollTop;
      lastMoveAt = now;
    }, { passive: true });

    // If speech fires but scroll hasn't moved in 1500ms -> likely “stuck”
    window.addEventListener('tp-speech-chunk', ()=>{
      setTimeout(()=>{
        const idle = performance.now() - lastMoveAt;
        if (idle > 1500) log('scroll:stuck?', { idleMs: Math.round(idle), top: viewer.scrollTop });
      }, 1550);
    });

    // Optional: emit this custom event from your onresult handler:
    // window.dispatchEvent(new Event('tp-speech-chunk'));
  }

  // -------------  H) Init order -------------
  function init(){
    bootSnapshot();
    wrapKnown();
    interceptCurrentIndex();
    hookSpeech();
    hookPostMessage();
    installScrollDetectors();

    // Optional: turn on aggressive wrapping by default in dev
    aggressiveOn = (function(){ try { return localStorage.getItem('tp_dev_mode') === '1'; } catch { return false; } })() || /([?#]).*dev=1/.test(location.href);
    if (aggressiveOn) wrapAllFunctions();
    // Try to read MANIFEST.md front-matter and log to HUD
    try {
      fetch('./MANIFEST.md', { cache: 'no-store' })
        .then(r=>r.text())
        .then(txt=>{
          const m = txt.match(/^---[\r\n]+([\s\S]*?)[\r\n]+---/);
          if (m) log('boot:manifest', m[1]);
        })
        .catch(()=>{});
    } catch {}

    // Optional: also fetch and log first ~2KB of manifest so it's visible in HUD
    (async function logManifest(){
      try {
        const urls = ['./Manifest.md','./MANIFEST.md','./manifest.md'];
        for (const u of urls){
          try {
            const r = await fetch(u, { cache: 'no-store' });
            if (!r.ok) continue;
            const t = await r.text();
            const head = t.slice(0, 2000);
            if (window.HUD) HUD.log('boot:manifest', head);
            break;
          } catch {}
        }
      } catch {}
    })();

    log('boot:seed-complete', { aggressiveOn });
  }

  if (document.readyState === 'complete' || document.readyState === 'interactive') {
    setTimeout(init, 0);
  } else {
    document.addEventListener('DOMContentLoaded', init);
  }
})();
