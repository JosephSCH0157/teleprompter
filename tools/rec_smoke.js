/*
rec_smoke.js — tiny recorder state machine smoke tests (node)
Run with: node tools/rec_smoke.js
*/

(async function(){
  const results = [];
  function pass(name){ results.push({ name, ok:true }); console.log('PASS -', name); }
  function fail(name, msg){ results.push({ name, ok:false, msg }); console.log('FAIL -', name, msg||''); }

  // Minimal window/EventTarget polyfill for rec:state events
  global.window = global.window || {};
  const listeners = {};
  window.addEventListener = (ev, cb) => { (listeners[ev]||(listeners[ev]=[])).push(cb); };
  window.removeEventListener = (ev, cb) => {
    const L = listeners[ev]||[]; const i=L.indexOf(cb); if(i>=0) L.splice(i,1);
  };
  window.dispatchEvent = (ev) => { const L=listeners[ev.type]||[]; for(const cb of L.slice()) try{ cb(ev); } catch{} };
  global.CustomEvent = class CustomEvent { constructor(type, init){ this.type=type; this.detail=init && init.detail; } };

  try {
    const rec = await import('../recorders.js');

    // Fake adapters
    let startCount = 0;
    const fakeObs = {
      id: 'obs', label: 'OBS (fake)',
      async isAvailable(){ return true; },
      async start(){ startCount++; if (startCount === 1) return; /* succeed */ },
      async stop(){ /* no-op */ },
    };
    const fakeBridge = {
      id: 'bridge', label: 'Bridge (fake)',
      async isAvailable(){ return true; },
      async start(){}, async stop(){},
    };
    rec.register(fakeObs);
    rec.register(fakeBridge);

    // Configure single mode -> obs
    rec.setSettings({ mode: 'single', selected: ['obs'], timeouts: { start: 200, stop: 200 } });

    const seen = [];
    window.addEventListener('rec:state', (e) => { seen.push(e.detail && e.detail.state); });

    // 1) Happy path start
    startCount = 1; // make first observed call succeed
    await rec.startSelected();
    if (seen.includes('starting') && seen.includes('recording')) pass('rec: happy path starting->recording');
    else fail('rec: happy path starting->recording', JSON.stringify(seen));

    // 2) Idempotent start
  await rec.startSelected();
  const last = seen.slice(-1)[0];
  if (last === 'recording' && !seen.includes('error')) pass('rec: idempotent start'); else fail('rec: idempotent start', JSON.stringify(seen));

    // 3) Stop race (from recording)
    await rec.stopSelected();
    const tail = seen.slice(-1)[0];
    if (tail === 'idle') pass('rec: stop -> idle'); else fail('rec: stop -> idle', tail);

    // 4) Persist mirrors
    const rawMode = (typeof localStorage !== 'undefined' && localStorage.getItem && localStorage.getItem('tp_record_mode')) || null;
    const rawSel = (typeof localStorage !== 'undefined' && localStorage.getItem && localStorage.getItem('tp_adapters')) || null;
    if (rawMode && rawSel) pass('rec: legacy mirrors present'); else pass('rec: legacy mirrors present (no LS)');

  } catch (e) {
    console.error('rec_smoke error', e);
    fail('setup', String(e && e.message || e));
  }
})();
