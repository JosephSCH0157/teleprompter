(function(){
  // Mic + dB meter helpers extracted from monolith. Exposes window.__tpMic
  const DEVICE_KEY = 'tp_mic_device_v1';
  let audioStream = null;
  let analyser = null;
  let audioCtx = null;
  let dbAnim = null;

  function buildDbBars(target) {
    if (!target) return [];
    // Recreate simple bars if missing
    target.innerHTML = '';
    const ticks = document.createElement('div');
    ticks.className = 'db-ticks';
    target.appendChild(ticks);
    for (let i = 0; i < 12; i++) {
      const b = document.createElement('div');
      b.className = 'bar';
      b.style.display = 'inline-block';
      b.style.width = (100/12)+'%';
      b.style.height = '8px';
      b.style.marginRight = '2px';
      b.style.background = 'rgba(255,255,255,0.06)';
      b.style.borderRadius = '2px';
      target.appendChild(b);
    }
    return Array.from(target.querySelectorAll('.bar'));
  }

  function _clearBars(el) {
    if (!el) return;
    el.querySelectorAll('.bar.on').forEach((b) => b.classList.remove('on'));
  }

  function _stopDbMeter() {
    if (dbAnim) cancelAnimationFrame(dbAnim);
    dbAnim = null;
    try { if (audioStream) audioStream.getTracks().forEach(t=>t.stop()); } catch {}
    try { if (audioCtx && typeof audioCtx.close === 'function') audioCtx.close().catch(()=>{}); } catch {}
    audioStream = null; audioCtx = null; analyser = null;
  }

  function startDbMeter(stream) {
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      const ctx = new AC();
      audioCtx = ctx;
      try { if (typeof ctx.resume === 'function' && ctx.state === 'suspended') ctx.resume().catch(()=>{}); } catch {}
      const src = ctx.createMediaStreamSource(stream);
      analyser = ctx.createAnalyser();
      analyser.fftSize = 2048;
      src.connect(analyser);
      const data = new Uint8Array(analyser.frequencyBinCount);
      const topBars = buildDbBars(document.getElementById('dbMeterTop'));
      let levelSmooth = 0; const dBFloor = -60; const attack = 0.55; const release = 0.15; let _peakHold = { value: dBFloor, lastUpdate: performance.now(), decay: 0.9 };
      function draw(){
        if (!analyser || !data) { dbAnim = null; return; }
        analyser.getByteFrequencyData(data);
        const rms = Math.sqrt(data.reduce((a,b)=>a+b*b,0)/data.length)/255;
        const dbfs = rms>0?20*Math.log10(rms):-Infinity;
        const dB = dbfs===-Infinity?dBFloor:Math.max(dBFloor, Math.min(0, dbfs));
        let level = (dB - dBFloor)/(0-dBFloor);
        if (!isFinite(level) || level < 0) level=0; else if (level>1) level=1;
        if (level>levelSmooth) levelSmooth = levelSmooth + (level-levelSmooth)*attack; else levelSmooth = levelSmooth + (level-levelSmooth)*release;
        const bars = Math.max(0, Math.min(topBars.length, Math.round(levelSmooth*topBars.length)));
        for (let i=0;i<topBars.length;i++) topBars[i].classList.toggle('on', i<bars);
        // simple peak hold (in dB)
        try {
          const now = performance.now();
          _peakHold.value = Math.max(dB, _peakHold.value * _peakHold.decay + dB * (1 - _peakHold.decay));
          _peakHold.lastUpdate = now;
        } catch {}
        // Broadcast dB event for UI (meters, calibration, hybrid gating, ASR adapters)
        try { window.dispatchEvent(new CustomEvent('tp:db', { detail: { db: dB, peak: _peakHold.value } })); } catch {}
        dbAnim = requestAnimationFrame(draw);
      }
      draw();
    } catch (e) {
      console.warn('startDbMeter failed', e);
    }
  }

  async function requestMic() {
    try {
      const chosenId = (document.getElementById('settingsMicSel')||{}).value || undefined;
      const constraints = { audio: { deviceId: chosenId?{ exact: chosenId } : undefined } };
      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      audioStream = stream;
      try { const permChip = document.getElementById('permChip'); if (permChip) permChip.textContent = 'Mic: allowed'; } catch {}
      startDbMeter(stream);
      try { if (chosenId) localStorage.setItem(DEVICE_KEY, chosenId); } catch {}
      return stream;
    } catch (err) {
      console.warn('requestMic failed', err);
      try { const permChip = document.getElementById('permChip'); if (permChip) permChip.textContent = 'Mic: denied'; } catch {}
      throw err;
    }
  }

  function releaseMic() {
    try { if (audioStream) audioStream.getTracks().forEach(t=>t.stop()); } catch {}
    audioStream = null; try { const permChip = document.getElementById('permChip'); if (permChip) permChip.textContent = 'Mic: released'; } catch {}
    _stopDbMeter();
  }

  async function populateDevices() {
    try {
      if (!navigator.mediaDevices || !navigator.mediaDevices.enumerateDevices) return;
      const devs = await navigator.mediaDevices.enumerateDevices();
      const mics = devs.filter(d => d.kind === 'audioinput');
      const cams = devs.filter(d => d.kind === 'videoinput');

      const fill = (sel, list) => {
        if (!sel) return;
        const prev = sel.value;
        sel.innerHTML = '';
        for (const d of list) {
          const o = document.createElement('option');
          o.value = d.deviceId;
          o.textContent = d.label || (d.kind === 'audioinput' ? 'Microphone' : 'Camera');
          sel.appendChild(o);
        }
        try { if (prev && Array.from(sel.options).some(o => o.value === prev)) sel.value = prev; } catch {}
      };

      fill(document.getElementById('settingsMicSel'), mics);
      fill(document.getElementById('micDeviceSel'), mics); // legacy hidden
      fill(document.getElementById('settingsCamSel'), cams);
      try { if (window.camDeviceSel) fill(window.camDeviceSel, cams); } catch {}
    } catch (e) { console.warn('populateDevices failed', e); }
  }

  // expose
  try { window.__tpMic = window.__tpMic || {}; window.__tpMic.requestMic = requestMic; window.__tpMic.releaseMic = releaseMic; window.__tpMic.populateDevices = populateDevices; window.__tpMic.startDbMeter = startDbMeter; } catch {}
  // Attempt a safe populate once on boot
  try {
    if (document.readyState === 'loading') {
      window.addEventListener('DOMContentLoaded', () => { setTimeout(()=>{ try{ populateDevices(); }catch{} }, 120); });
    } else {
      setTimeout(()=>{ try{ populateDevices(); }catch{} }, 120);
    }
  } catch {}
})();
