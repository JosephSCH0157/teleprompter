(function(){
  let mediaRecorder = null;
  let chunks = [];
  let active = false;
  let currentStream = null;

  function nowName(){
    try {
      const d = new Date();
      const pad = (n)=> String(n).padStart(2,'0');
      return `Teleprompter_${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}_${pad(d.getHours())}-${pad(d.getMinutes())}-${pad(d.getSeconds())}.webm`;
    } catch { return 'Teleprompter_Recording.webm'; }
  }

  function pickMime(){
    try {
      const cand = [
        'video/webm;codecs=vp9,opus',
        'video/webm;codecs=vp8,opus',
        'video/webm;codecs=vp9',
        'video/webm;codecs=vp8',
        'video/webm'
      ];
      for (const t of cand) { if (MediaRecorder.isTypeSupported && MediaRecorder.isTypeSupported(t)) return t; }
    } catch {}
    return 'video/webm';
  }

  async function getVideoStream(){
    try {
      // Prefer existing camera stream from #camVideo
      const v = document.getElementById('camVideo');
      const s = v && v.srcObject;
      if (s && typeof s.getVideoTracks === 'function' && s.getVideoTracks().length) return new MediaStream([ ...s.getVideoTracks() ]);
    } catch {}
    try {
      // High-quality preferences; browsers will clamp as needed
      return await navigator.mediaDevices.getUserMedia({ video: { width: { ideal: 1920 }, height: { ideal: 1080 }, frameRate: { ideal: 60 } }, audio: false });
    } catch {
      return await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
    }
  }

  async function getAudioStream(){
    try {
      const w = window;
      // Prefer existing mic stream
      const s = (w.__tpMic && w.__tpMic.__lastStream) ? w.__tpMic.__lastStream : null;
      if (s && typeof s.getAudioTracks === 'function' && s.getAudioTracks().length) return new MediaStream([ ...s.getAudioTracks() ]);
    } catch {}
    try {
      // Attempt to request mic via app API to keep HUD/meter in sync
      if (window.__tpMic && typeof window.__tpMic.requestMic === 'function') {
        const s = await window.__tpMic.requestMic();
        return new MediaStream([ ...s.getAudioTracks() ]);
      }
    } catch {}
    // Fallback: direct getUserMedia
    const s = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
    return new MediaStream([ ...s.getAudioTracks() ]);
  }

  function mustSkipForMode(){
    try {
      const store = window.__tpStore;
      const mode = store && typeof store.get === 'function' ? String(store.get('scrollMode') || '') : '';
      return /rehearsal/i.test(mode);
    } catch { return false; }
  }

  async function start(){
    if (active) return;
    if (mustSkipForMode()) { try { console.info('[auto-rec] skip in rehearsal mode'); } catch {}; return; }
    try {
      const v = await getVideoStream();
      const a = await getAudioStream();
      const mix = new MediaStream();
      try { a.getAudioTracks().forEach(t => mix.addTrack(t)); } catch {}
      try { v.getVideoTracks().forEach(t => mix.addTrack(t)); } catch {}
      currentStream = mix;
      const mime = pickMime();
      mediaRecorder = new MediaRecorder(mix, { mimeType: mime, videoBitsPerSecond: 5_000_000, audioBitsPerSecond: 128_000 });
      chunks = [];
      mediaRecorder.ondataavailable = (e) => { try { if (e && e.data && e.data.size) chunks.push(e.data); } catch {} };
      mediaRecorder.onstop = async () => {
        try {
          const blob = new Blob(chunks, { type: (mediaRecorder && mediaRecorder.mimeType) || 'video/webm' });
          chunks = [];
          await saveBlob(blob, nowName());
        } catch (e) { try { console.warn('[auto-rec] save failed', e); } catch {} }
      };
      mediaRecorder.start();
      active = true;
      try { window.dispatchEvent(new CustomEvent('rec:state', { detail: { state: 'recording' } })); } catch {}
    } catch (e) {
      try { console.warn('[auto-rec] start failed', e); } catch {}
    }
  }

  async function stop(){
    if (!active) return;
    try {
      if (mediaRecorder && mediaRecorder.state !== 'inactive') mediaRecorder.stop();
    } catch {}
    try { if (currentStream) currentStream.getTracks().forEach(t => { try { t.stop(); } catch {} }); } catch {}
    currentStream = null; mediaRecorder = null; active = false;
    try { window.dispatchEvent(new CustomEvent('rec:state', { detail: { state: 'idle' } })); } catch {}
  }

  async function saveBlob(blob, name){
    try {
      // Lazy-load dir helper
      let dir = null;
      try {
        await import('../fs/recording-dir.js');
        // module exposes window shim; prefer direct window surface
        if (window.__tpRecDir && typeof window.__tpRecDir.init === 'function') { try { await window.__tpRecDir.init(); } catch {} }
        dir = window.__tpRecDir && typeof window.__tpRecDir.get === 'function' ? window.__tpRecDir.get() : null;
      } catch {}

      if (dir) {
        try {
          // @ts-ignore
          const ok = (await dir.requestPermission?.({ mode: 'readwrite' })) || (await dir.queryPermission?.({ mode: 'readwrite' }));
          if (ok === 'granted' || ok === 'prompt') {
            const fh = await dir.getFileHandle(name, { create: true });
            const w = await fh.createWritable(); await w.write(blob); await w.close();
            try { (window.toast || console.debug)('Recording saved to folder', { type: 'ok' }); } catch {}
            return;
          }
        } catch {}
      }

      // Save-as picker fallback if available
      try {
        // @ts-ignore
        if ('showSaveFilePicker' in window) {
          // @ts-ignore
          const handle = await window.showSaveFilePicker({ suggestedName: name, types: [{ accept: { 'video/webm': ['.webm'] } }] });
          const w = await handle.createWritable(); await w.write(blob); await w.close();
          return;
        }
      } catch {}

      // Last resort: force a download
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a'); a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
    } catch (e) { try { console.warn('[auto-rec] save fallback failed', e); } catch {} }
  }

  try { window.__tpAutoRecord = window.__tpAutoRecord || {}; } catch {}
  try { window.__tpAutoRecord.start = start; window.__tpAutoRecord.stop = stop; Object.defineProperty(window.__tpAutoRecord, 'active', { get(){ return active; } }); } catch {}
})();

export { };
(function(){
  // Simple local auto-recorder: camera + mic to a single WebM file.
  // Exposes window.__tpAutoRecord with start/stop used by Speech Sync.

  let _rec = null;            // MediaRecorder
  let _chunks = [];           // Blob parts
  let _active = false;        // recording state
  let _stream = null;         // combined MediaStream
  let _saving = false;        // prevent concurrent saves

  function nowStamp() {
    try {
      const d = new Date();
      const pad = (n)=> String(n).padStart(2,'0');
      return [
        d.getFullYear(), '-', pad(d.getMonth()+1), '-', pad(d.getDate()), '_',
        pad(d.getHours()), '-', pad(d.getMinutes()), '-', pad(d.getSeconds())
      ].join('');
    } catch { return String(Date.now()); }
  }

  function pickMime() {
    try {
      const prefs = [
        'video/webm;codecs=vp9,opus',
        'video/webm;codecs=vp8,opus',
        'video/webm'
      ];
      for (const t of prefs) { if (window.MediaRecorder && MediaRecorder.isTypeSupported && MediaRecorder.isTypeSupported(t)) return t; }
    } catch {}
    return 'video/webm';
  }

  async function ensureStreams() {
    // Try to reuse existing camera and mic; fall back to getUserMedia
    let vTrack = null, aTrack = null;
    try {
      const vEl = document.getElementById('camVideo');
      const vSrc = vEl && vEl.srcObject;
      const vTr = vSrc && typeof vSrc.getVideoTracks === 'function' ? vSrc.getVideoTracks() : [];
      if (vTr && vTr[0]) vTrack = vTr[0];
      if (!vTrack && window.__tpCamera && typeof window.__tpCamera.startCamera === 'function') {
        try { await window.__tpCamera.startCamera(); } catch {}
        const v2 = document.getElementById('camVideo');
        const s2 = v2 && v2.srcObject; const t2 = s2 && s2.getVideoTracks && s2.getVideoTracks();
        if (t2 && t2[0]) vTrack = t2[0];
      }
      if (!vTrack && navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
        const v = await navigator.mediaDevices.getUserMedia({ video: { width: { ideal: 1920 }, height: { ideal: 1080 }, frameRate: { ideal: 60, max: 60 } }, audio: false });
        const ts = v.getVideoTracks(); if (ts && ts[0]) vTrack = ts[0];
      }
    } catch {}
    try {
        const micLast = (window.__tpMic && window.__tpMic.__lastStream) ? window.__tpMic.__lastStream : null;
        const aTr = micLast && micLast.getAudioTracks ? micLast.getAudioTracks() : [];
        if (aTr && aTr[0]) aTrack = aTr[0];
        if (!aTrack) {
          if (window.__tpMic && typeof window.__tpMic.requestMic === 'function') {
            const ms = await window.__tpMic.requestMic();
            const aa = ms && ms.getAudioTracks && ms.getAudioTracks(); if (aa && aa[0]) aTrack = aa[0];
          } else if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
            const a = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
            const ts = a.getAudioTracks(); if (ts && ts[0]) aTrack = ts[0];
          }
        }
    } catch {}
    if (!vTrack || !aTrack) throw new Error('media-tracks-unavailable');
    const ms = new MediaStream();
    try { ms.addTrack(vTrack); } catch {}
    try { ms.addTrack(aTrack); } catch {}
    return ms;
  }

  function allowedByMode() {
    try {
      const S = (window.__tpStore || null);
      const mode = S && typeof S.get === 'function' ? String(S.get('scrollMode') || '') : '';
      if (/rehearsal/i.test(mode)) return false;
    } catch {}
    return true;
  }

  async function start() {
    if (_active) return; // already running
    try {
      const S = (window.__tpStore || null);
      const armed = S && typeof S.get === 'function' ? !!S.get('autoRecord') : !!(localStorage.getItem('tp_auto_record') === '1');
      if (!armed) return; // feature disabled
      if (!allowedByMode()) { try { console.info('[auto-record] skip (rehearsal mode)'); } catch {} return; }
      _stream = await ensureStreams();
      _chunks = [];
      const mt = pickMime();
      const opts = { mimeType: mt, videoBitsPerSecond: 5_000_000, audioBitsPerSecond: 128_000 };
      _rec = new MediaRecorder(_stream, opts);
      _rec.ondataavailable = (ev) => { try { if (ev && ev.data && ev.data.size) _chunks.push(ev.data); } catch {} };
      _rec.onstop = () => { try { finalizeSave().catch(()=>{}); } catch {} };
      _rec.start();
      _active = true;
      try { (window.HUD?.log || console.debug)?.('[auto-record] start', { mime: mt }); } catch {}
    } catch (e) { try { console.warn('[auto-record] start failed', e); } catch {} }
  }

  async function stop() {
    if (!_active) return;
    try {
      const r = _rec; _rec = null; _active = false;
      if (r && r.state !== 'inactive') { try { r.stop(); } catch {} }
    } catch {}
  }

  async function finalizeSave() {
    if (_saving) return; _saving = true;
    try {
      const blob = new Blob(_chunks.slice(), { type: 'video/webm' });
      _chunks = [];
      const name = 'Teleprompter_' + nowStamp() + '.webm';
      
      // 1. Try mapped folder handle first (persistent auto-save folder)
      try {
        await import('../fs/recording-dir.js');
        if (window.__tpRecDir && typeof window.__tpRecDir.init === 'function') { try { await window.__tpRecDir.init(); } catch {} }
        const dir = window.__tpRecDir && typeof window.__tpRecDir.get === 'function' ? window.__tpRecDir.get() : null;
        if (dir) {
          const perm = (await dir.requestPermission?.({ mode: 'readwrite' })) || (await dir.queryPermission?.({ mode: 'readwrite' }));
          if (perm === 'granted' || perm === 'prompt') {
            const fh = await dir.getFileHandle(name, { create: true });
            const w = await fh.createWritable(); await w.write(blob); await w.close();
            try { (window.toast || ((m)=>console.debug('[toast]', m)))('Recording saved to folder: ' + name, { type: 'ok' }); } catch {}
            return;
          }
        }
      } catch (dirErr) {
        try { console.debug('[auto-record] folder save failed, trying picker', dirErr); } catch {}
      }
      
      // 2. Try File System Access API (save file prompt). If not allowed, fall back to download.
      const canPicker = !!(window.showSaveFilePicker);
      if (canPicker) {
        try {
          const fh = await window.showSaveFilePicker({ suggestedName: name, types: [{ description: 'WebM Video', accept: { 'video/webm': ['.webm'] } }] });
          const w = await fh.createWritable();
          await w.write(blob); await w.close();
          try { (window.toast || ((m)=>console.debug('[toast]', m)))('Saved recording: ' + (fh.name || name), { type: 'ok' }); } catch {}
          return;
        } catch {
          // User canceled or NotAllowed (no gesture) → fall back
        }
      }
      // 3. Download fallback
      try {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url; a.download = name; a.style.display = 'none';
        document.body.appendChild(a); a.click(); setTimeout(() => { try { URL.revokeObjectURL(url); } catch {} try { a.remove(); } catch {} }, 1200);
        try { (window.toast || ((m)=>console.debug('[toast]', m)))('Saved recording (Downloads): ' + name, { type: 'ok' }); } catch {}
      } catch {}
    } finally { _saving = false; try { _stream = null; } catch {} }
  }

  // If the user flips to rehearsal mode during recording, stop immediately.
  try {
    const S = (window.__tpStore || null);
    if (S && typeof S.subscribe === 'function') {
      S.subscribe('scrollMode', (m) => { try { if (/rehearsal/i.test(String(m||'')) && _active) stop(); } catch {} });
    }
  } catch {}

  try {
    window.__tpAutoRecord = window.__tpAutoRecord || {};
    window.__tpAutoRecord.start = start;
    window.__tpAutoRecord.stop = stop;
    window.__tpAutoRecord.active = () => !!_active;
  } catch {}
})();
