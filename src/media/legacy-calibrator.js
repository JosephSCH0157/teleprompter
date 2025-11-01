(function(){
  // Legacy mic calibration hook — inert unless #asrCalibBtn exists
  try {
    function $(id){ return document.getElementById(id); }
    function onDbFor(ms){
      return new Promise((resolve)=>{
        const vals = [];
        const handler = (e)=>{
          try { const db = e && e.detail && typeof e.detail.db === 'number' ? e.detail.db : NaN; if (Number.isFinite(db)) vals.push(db); } catch {}
        };
        try { window.addEventListener('tp:db', handler); } catch {}
        setTimeout(()=>{ try { window.removeEventListener('tp:db', handler); } catch {} resolve(vals); }, ms|0);
      });
    }
    function avg(a){ return (!a||!a.length)?NaN:(a.reduce((x,y)=>x+y,0)/a.length); }
    function clamp(v,a,b){ return Math.max(a, Math.min(b, v)); }

    async function runLegacyCalibration(){
      const btn = $('asrCalibBtn');
      const prog = $('asrCalibProgress');
      const outNoise = $('asrNoiseDb');
      const outSpeech = $('asrSpeechDb');
      const outTon = $('asrTonDb');
      const outToff = $('asrToffDb');
      const attackInp = $('asrAttackMs');
      const releaseInp = $('asrReleaseMs');
      const chkApply = $('asrApplyHybrid');
      try { if (btn) { btn.disabled = true; btn.textContent = 'Calibrating…'; } } catch {}
      try { if (prog) prog.textContent = 'Quiet…'; } catch {}
      try { if (window.__tpMic && typeof window.__tpMic.requestMic === 'function') await window.__tpMic.requestMic(); } catch {}

      const noiseVals = await onDbFor(1500);
      const noise = avg(noiseVals);
      try { if (outNoise) outNoise.textContent = Number.isFinite(noise) ? (noise.toFixed(0) + ' dB') : '—'; } catch {}

      try { if (prog) prog.textContent = 'Speak…'; } catch {}
      const speechVals = await onDbFor(1800);
      const speech = avg(speechVals);
      try { if (outSpeech) outSpeech.textContent = Number.isFinite(speech) ? (speech.toFixed(0) + ' dB') : '—'; } catch {}

      // Derive thresholds (simple heuristic)
      const atk = clamp(parseInt(attackInp && attackInp.value || '80', 10) || 80, 20, 500);
      const rel = clamp(parseInt(releaseInp && releaseInp.value || '300', 10) || 300, 80, 1000);
      let ton = -26, toff = -32;
      if (Number.isFinite(noise) && Number.isFinite(speech)) {
        const minTon = noise + 8;
        const maxTon = speech - 4;
        ton = clamp(isFinite(minTon) && isFinite(maxTon) ? clamp(ton, minTon, maxTon) : ton, -40, -18);
        toff = ton - 6;
      }
      try { if (outTon) outTon.textContent = ton.toFixed(0) + ' dB'; } catch {}
      try { if (outToff) outToff.textContent = toff.toFixed(0) + ' dB'; } catch {}

      // Persist legacy VAD profile (readable by older code paths)
      try {
        const prof = { noiseDb: Number(noise||-50), speechDb: Number(speech||-20), tonDb: Number(ton), toffDb: Number(toff), attackMs: Number(atk), releaseMs: Number(rel), ts: Date.now() };
        localStorage.setItem('tp_vad_profile_v1', JSON.stringify(prof));
        if (chkApply && chkApply.checked) localStorage.setItem('tp_vad_apply_hybrid', '1');
        else localStorage.removeItem('tp_vad_apply_hybrid');
        // Notify listeners
        try { window.dispatchEvent(new CustomEvent('tp:vad:profile', { detail: prof })); } catch {}
      } catch {}

      try { if (prog) { prog.textContent = 'Saved'; setTimeout(()=>{ try { if (prog.textContent==='Saved') prog.textContent='Ready'; } catch{} }, 1500); } } catch {}
      try { if (btn) { btn.disabled = false; btn.textContent = 'Recalibrate'; } } catch {}
      try { if (window.toast) window.toast('Calibration saved', { type:'ok' }); } catch {}
    }

    function wire(){
      const btn = $('asrCalibBtn');
      if (!btn || btn.__legacyWired) return;
      btn.__legacyWired = true;
      btn.addEventListener('click', ()=>{ runLegacyCalibration().catch(()=>{}); });
    }

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', wire);
    else setTimeout(wire, 0);
    try { const mo = new MutationObserver(()=>wire()); mo.observe(document.documentElement, { childList:true, subtree:true }); } catch {}
  } catch {}
})();
