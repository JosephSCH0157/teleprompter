/* Dev-only listener registry: logs who adds listeners and provides a dump helper.
   Enable via ?listeners=1 or localStorage tp_listeners=1. */
(function installListenerRegistry(){
  try {
    if (!window.__TP_DEV) return;
    const Q = new URLSearchParams(location.search);
    const ENABLED = Q.has('listeners') || localStorage.getItem('tp_listeners') === '1';
    if (!ENABLED) return;
    if (window.__tpListenerRegistryInstalled) return; window.__tpListenerRegistryInstalled = true;

    const REG = new Map(); // key: target+type -> {list:[{ts, options, stack}]}
    const key = (t, type) => `${t && t.tagName ? (t.tagName+"#"+(t.id||'')) : (t===window? 'window' : (t===document? 'document' : 'node'))}:${type}`;

    const _add = EventTarget.prototype.addEventListener;
    EventTarget.prototype.addEventListener = function(type, listener, options){
      try {
        const k = key(this, type);
        const entry = REG.get(k) || { list: [] };
        const stack = (new Error().stack || '').split('\n').slice(2, 8).join('\n');
        entry.list.push({ ts: (performance.now ? performance.now() : Date.now()), options, stack });
        REG.set(k, entry);
      } catch {}
      return _add.call(this, type, listener, options);
    };

    window.dumpListeners = function(filter){
      try {
        const re = (filter instanceof RegExp) ? filter : /scroll|wheel|resize|keydown|touch|pointer|selection|visibility|focus|speech/i;
        const rows = [];
        for (const [k, v] of REG.entries()){
          try { if (!re.test(k)) continue; } catch { continue; }
          const last = v.list && v.list.length ? v.list[v.list.length - 1] : null;
          rows.push({ targetType: k, count: (v.list||[]).length, lastStack: last ? last.stack : '' });
        }
        try { console.table(rows.sort((a,b)=> (b.count|0)-(a.count|0))); } catch { console.log(rows); }
      } catch (e) { try { console.warn('[listeners] dump failed', e); } catch {} }
    };

    // Quick snapshot for likely troublemakers that were added earlier (if DevTools provides getEventListeners)
    const tryDevtools = (t)=>{ try { return (window.getEventListeners ? window.getEventListeners(t) : null); } catch { return null; } };
    try { console.log('[listeners] window', tryDevtools(window)); } catch {}
    try { console.log('[listeners] document', tryDevtools(document)); } catch {}
    try {
      const viewer = document.getElementById('viewer');
      if (viewer) console.log('[listeners] #viewer', tryDevtools(viewer));
    } catch {}
    try { console.warn('Listener registry armed. Call dumpListeners() to see hot types.'); } catch {}
  } catch {}
})();
