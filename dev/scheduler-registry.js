/* Dev-only RAF/Timer registry: wraps requestAnimationFrame and timers to inventory schedulers.
   Enable via ?sched=1 or localStorage tp_sched=1. Provides dumpRAF() and dumpTimers(). */
(function installSchedulerRegistry(){
  try {
    if (!window.__TP_DEV) return;
    const Q = new URLSearchParams(location.search);
    const ENABLED = Q.has('sched') || localStorage.getItem('tp_sched') === '1';
    if (!ENABLED) return;
    if (window.__tpSchedulerRegistryInstalled) return; window.__tpSchedulerRegistryInstalled = true;

    // RAF registry
    const rafMap = new Map(); // id -> { stack, hits }
    const _raf = window.requestAnimationFrame.bind(window);
    const _caf = window.cancelAnimationFrame.bind(window);
    window.requestAnimationFrame = function(cb){
      const id = _raf((ts)=>{
        try { const rec = rafMap.get(id); if (rec) rec.hits++; } catch {}
        try { cb(ts); } catch(e){ try { console.warn('[raf cb error]', e); } catch {} }
      });
      try {
        const stack = (new Error().stack || '').split('\n').slice(2,8).join('\n');
        rafMap.set(id, { hits:0, stack });
      } catch { rafMap.set(id, { hits:0, stack:'' }); }
      return id;
    };
    window.cancelAnimationFrame = function(id){ try { rafMap.delete(id); } catch {} return _caf(id); };
    window.dumpRAF = function(){
      try {
        const rows = [];
        rafMap.forEach((v, id) => rows.push({ id, hits: v.hits|0, stack: v.stack }));
        console.table(rows);
      } catch(e){ try { console.warn('[dumpRAF failed]', e); } catch {} }
    };

    // Timer registry
    const timers = new Map(); // id -> { type, stack, hits }
    const _st = window.setTimeout.bind(window);
    const _si = window.setInterval.bind(window);
    const _ct = window.clearTimeout.bind(window);
    const _ci = window.clearInterval.bind(window);
    window.setInterval = function(fn, ms){
      const id = _si(fn, ms);
      try {
        timers.set(id, { type: 'interval ' + ms, hits: 0, stack: (new Error().stack || '') });
      } catch { timers.set(id, { type: 'interval ' + ms, hits: 0, stack: '' }); }
      return id;
    };
    window.setTimeout = function(fn, ms){
      const id = _st(function(){
        try { const r = timers.get(id); if (r) r.hits++; } catch {}
        try { fn(); } catch(e){ try { console.warn('[timeout cb error]', e); } catch {} }
      }, ms);
      try {
        timers.set(id, { type: 'timeout ' + ms, hits: 0, stack: (new Error().stack || '') });
      } catch { timers.set(id, { type: 'timeout ' + ms, hits: 0, stack: '' }); }
      return id;
    };
    window.clearInterval = function(id){ try { timers.delete(id); } catch {} return _ci(id); };
    window.clearTimeout = function(id){ try { timers.delete(id); } catch {} return _ct(id); };
    window.dumpTimers = function(){
      try {
        const rows = [];
        timers.forEach((v, id) => {
          const stackShort = (v.stack || '').split('\n').slice(2,8).join('\n');
          rows.push({ id, type: v.type, hits: v.hits|0, stack: stackShort });
        });
        console.table(rows);
      } catch(e){ try { console.warn('[dumpTimers failed]', e); } catch {} }
    };

    try { console.warn('Scheduler registry armed. Call dumpRAF() / dumpTimers() to inspect.'); } catch {}
  } catch {}
})();
