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
      // Try File System Access API (save file prompt). If not allowed, fall back to download.
      const canPicker = !!(window.showSaveFilePicker);
      if (canPicker) {
        try {
          const fh = await window.showSaveFilePicker({ suggestedName: name, types: [{ description: 'WebM Video', accept: { 'video/webm': ['.webm'] } }] });
          const w = await fh.createWritable();
          await w.write(blob); await w.close();
          try { (window.toast || ((m)=>console.debug('[toast]', m)))('Saved recording: ' + (fh.name || name), { type: 'ok' }); } catch {}
          return;
        } catch (err) {
          // User canceled or NotAllowed (no gesture) → fall back
        }
      }
      // Download fallback
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
