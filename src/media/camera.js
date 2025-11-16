(function(){
  // Camera overlay helpers. Exposes window.__tpCamera
  let camStream = null;
  let camPC = null;
  let _wantCamRTC = false;
  // Reentrancy guard for startCamera
  let __startingCam = false;

  function isCamActive() {
    try {
      const v = document.getElementById('camVideo');
      const s = v && v.srcObject;
      const tracks = s && typeof s.getTracks === 'function' ? s.getTracks() : [];
      return !!(tracks && tracks.some(t => t && t.readyState === 'live'));
    } catch { return false; }
  }

  async function findDeviceLabelById(id) {
    try {
      if (!id || !navigator.mediaDevices || !navigator.mediaDevices.enumerateDevices) return '';
      const list = await navigator.mediaDevices.enumerateDevices();
      const d = list.find((x) => x && x.kind === 'videoinput' && x.deviceId === id);
      return (d && d.label) || '';
    } catch { return ''; }
  }

  function activeTrackLabel(stream) {
    try {
      const s = stream || (document.getElementById('camVideo')?.srcObject);
      const tr = s && typeof s.getVideoTracks === 'function' ? s.getVideoTracks()[0] : null;
      return (tr && tr.label) || '';
    } catch { return ''; }
  }

  async function findObsVirtualCameraId() {
    try {
      if (!navigator.mediaDevices?.enumerateDevices) return '';
      const list = await navigator.mediaDevices.enumerateDevices();
      const hit = list.find((d) => d && d.kind === 'videoinput' && /obs.*virtual|virtual\s*camera/i.test(String(d.label||'')));
      return (hit && hit.deviceId) || '';
    } catch { return ''; }
  }

  function setCamButtons(active) {
    try {
      const startBtn = document.getElementById('startCam') || document.getElementById('StartCam');
      const stopBtn = document.getElementById('stopCam') || document.getElementById('StopCam');
      if (startBtn) startBtn.disabled = !!active;
      if (stopBtn) stopBtn.disabled = !active;
    } catch {}
  }

  function applyCamSizing() {
    try {
      const camWrap = document.getElementById('camWrap');
      const camSize = document.getElementById('camSize');
      if (!camWrap || !camSize) return;
      const val = Number((camSize && camSize.value) || 28);
      const pct = Math.max(15, Math.min(60, isFinite(val) ? val : 28));
      camWrap.style.width = pct + '%';
      try { window.sendToDisplay && window.sendToDisplay({ type: 'cam-sizing', pct }); } catch {}
    } catch {}
  }

  function applyCamOpacity() {
    try {
      const camWrap = document.getElementById('camWrap');
      const camOpacity = document.getElementById('camOpacity');
      if (!camWrap || !camOpacity) return;
      const op = Math.max(0.2, Math.min(1, (Number(camOpacity.value) || 100) / 100));
      camWrap.style.opacity = String(op);
      try { window.sendToDisplay && window.sendToDisplay({ type: 'cam-opacity', opacity: op }); } catch {}
    } catch {}
  }

  function applyCamMirror() {
    try {
      const camWrap = document.getElementById('camWrap');
      const camMirror = document.getElementById('camMirror');
      if (!camWrap || !camMirror) return;
      camWrap.classList.toggle('mirrored', !!camMirror.checked);
      try { window.sendToDisplay && window.sendToDisplay({ type: 'cam-mirror', on: !!camMirror.checked }); } catch {}
    } catch {}
  }

  async function startCamera() {
    try {
      if (__startingCam) return; // prevent double-fire
      if (isCamActive()) return; // already live
      __startingCam = true;
      try { window.dispatchEvent(new CustomEvent('tp:camera:starting')); } catch {}
      try {
      // Ensure any previous stream is fully stopped before starting
      if (camStream) { try { camStream.getTracks().forEach(t=>t.stop()); } catch {} camStream = null; }
      // Prefer Settings selector as single source of truth; fall back to persisted/legacy id if present
        const camDeviceSel = document.getElementById('settingsCamSel') || document.getElementById('camDevice');
        let idSource = 'select';
        let id = camDeviceSel?.value || undefined;
        try {
          if (!id) {
            const saved = localStorage.getItem('tp_camera_device_v1');
            if (saved) { id = saved; idSource = 'storage'; }
          }
        } catch {}
        let stream = null;
        let fellBackFromSaved = false;
        let fellBackFromSelected = false;
        if (id) {
          try {
            // Explicit device requested
            stream = await navigator.mediaDevices.getUserMedia({ video: { deviceId: { exact: id } }, audio: false });
          } catch (err) {
            // If the id came from storage (stale) allow a one-time fallback to default device
            if (idSource === 'storage') {
              stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
              fellBackFromSaved = true;
              try { localStorage.removeItem('tp_camera_device_v1'); } catch {}
              try { const sSel = document.getElementById('settingsCamSel'); const mSel = document.getElementById('camDevice'); if (sSel) sSel.value = ''; if (mSel) mSel.value = ''; } catch {}
              try { window.toast && window.toast('Saved camera unavailable — using default', { type: 'warn' }); } catch {}
            } else if (err && (err.name === 'NotReadableError' || err.name === 'TrackStartError')) {
              // Selected device is busy/in use — allow fallback to default so user can proceed
              try {
                // Prefer OBS Virtual Camera if present
                const obsId = await findObsVirtualCameraId();
                if (obsId) {
                  try {
                    stream = await navigator.mediaDevices.getUserMedia({ video: { deviceId: { exact: obsId } }, audio: false });
                    // Treat this as an intentional switch we can persist
                    id = obsId;
                    fellBackFromSelected = false;
                    try { window.toast && window.toast('Selected camera busy — switched to OBS Virtual Camera', { type: 'warn' }); } catch {}
                  } catch {
                    // If OBS VC acquisition fails, fall back to default
                    stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
                    fellBackFromSelected = true;
                    try { window.toast && window.toast('Selected camera busy — using default', { type: 'warn' }); } catch {}
                  }
                } else {
                  stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
                  fellBackFromSelected = true;
                  try { window.toast && window.toast('Selected camera busy — using default', { type: 'warn' }); } catch {}
                }
              } catch {
                // Re-throw original error if even default fails
                throw err;
              }
            } else {
              throw err;
            }
          }
        } else {
          // No explicit device → use default
          stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
        }
      const camVideo = document.getElementById('camVideo');
      const camWrap = document.getElementById('camWrap');
      if (!camVideo || !camWrap) throw new Error('camera elements missing');
      camVideo.muted = true; camVideo.autoplay = true; camVideo.playsInline = true; camVideo.controls = false;
      camVideo.srcObject = stream;
      try { await camVideo.play(); } catch {}
      camWrap.style.display = 'block';
      camStream = stream;
      setCamButtons(true);
      applyCamSizing(); applyCamOpacity(); applyCamMirror();
        // Persist + mirror only after successful start
        try {
          if (id && !fellBackFromSaved && !fellBackFromSelected) {
            localStorage.setItem('tp_camera_device_v1', id);
            const mainSel = document.getElementById('camDevice');
            const setSel  = document.getElementById('settingsCamSel');
            if (mainSel && mainSel.value !== id) mainSel.value = id;
            if (setSel  && setSel.value  !== id) setSel.value  = id;
          }
        } catch {}
      // Announce active camera label for visibility
      try {
        const label = activeTrackLabel(stream);
        if (label) {
          window.toast && window.toast('Camera: ' + label, { type: 'ok' });
          window.dispatchEvent && window.dispatchEvent(new CustomEvent('tp:camera-active', { detail: { deviceId: id || null, label } }));
        }
      } catch {}
      try { if (window.__tpMic) window.__tpMic.populateDevices && window.__tpMic.populateDevices(); } catch {}
      try { window.dispatchEvent(new CustomEvent('tp:camera:started', { detail: { label: activeTrackLabel(stream) } })); } catch {}
      return true;
      } finally { __startingCam = false; }
    } catch (e) {
      console.warn('startCamera failed', e);
      try { window.dispatchEvent(new CustomEvent('tp:camera:error', { detail: { message: String(e && e.message || e) } })); } catch {}
      try { (window.toast && window.toast('Camera failed: ' + (e && e.message || 'Unknown error'), { type: 'error' })) || console.error('Camera failed'); } catch {}
      throw e;
    }
  }

  function stopCamera() {
    try {
  _wantCamRTC = false;
      const camVideo = document.getElementById('camVideo');
      const camWrap = document.getElementById('camWrap');
      if (camStream) camStream.getTracks().forEach(t=>t.stop());
      if (camVideo) camVideo.srcObject = null;
      if (camWrap) camWrap.style.display = 'none';
      camStream = null;
      setCamButtons(false);
      try { window.sendToDisplay && window.sendToDisplay({ type: 'webrtc-stop' }); } catch {}
      if (camPC) { try { camPC.close(); } catch {} camPC = null; }
    } catch (e) { console.warn('stopCamera failed', e); }
  }

  async function switchCamera(deviceId) {
    try {
      if (!deviceId) return;
      let newStream = null;
      try {
        // Try with reasonable prefs first
        newStream = await navigator.mediaDevices.getUserMedia({ video: { deviceId: { exact: deviceId }, width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 30, max: 30 } }, audio: false });
      } catch {
        try {
          // Retry with only deviceId (drop resolution/frameRate preferences)
          newStream = await navigator.mediaDevices.getUserMedia({ video: { deviceId: { exact: deviceId } }, audio: false });
        } catch {
          // Do not silently fall back to default for an explicit switch — surface failure
          throw new Error('Requested camera not available');
        }
      }
      const camVideo = document.getElementById('camVideo');
      const old = camStream;
      camStream = newStream;
      if (camVideo) { camVideo.srcObject = newStream; try { await camVideo.play(); } catch {} }
      if (old) old.getTracks().forEach(t=>t.stop());
      try { window.sendToDisplay && window.sendToDisplay({ type: 'cam-sizing', pct: Math.max(15, Math.min(60, Number(document.getElementById('camSize')?.value) || 28)) }); } catch {}
      // Announce active camera and compare with selection label (best-effort)
      try {
        const activeLabelNow = activeTrackLabel(newStream);
        const pickedLabel = await findDeviceLabelById(deviceId);
        if (activeLabelNow) {
          if (pickedLabel && activeLabelNow && pickedLabel !== activeLabelNow) {
            window.toast && window.toast(`Camera switched: got "${activeLabelNow}" (selected "${pickedLabel}")`, { type: 'warn' });
          } else {
            window.toast && window.toast('Camera: ' + activeLabelNow, { type: 'ok' });
          }
          window.dispatchEvent && window.dispatchEvent(new CustomEvent('tp:camera-active', { detail: { deviceId: deviceId || null, label: activeLabelNow } }));
        }
      } catch {}
      return true;
    } catch (e) { console.warn('switchCamera failed', e); throw e; }
  }

  try { window.__tpCamera = window.__tpCamera || {}; window.__tpCamera.startCamera = startCamera; window.__tpCamera.stopCamera = stopCamera; window.__tpCamera.switchCamera = switchCamera; window.__tpCamera.applyCamSizing = applyCamSizing; window.__tpCamera.applyCamOpacity = applyCamOpacity; window.__tpCamera.applyCamMirror = applyCamMirror; } catch {}
  // Provide legacy alias expected by newer inline toggle code
  try { if (!window.__camApi) window.__camApi = window.__tpCamera; } catch {}
  // Publish activity check
  try { window.__tpCamera = Object.assign(window.__tpCamera || {}, { isActive: isCamActive }); } catch {}
  // Aliases for simplified API expected by some callers
  try {
    window.__tpCamera = window.__tpCamera || {};
    // start/stop aliases
    if (!window.__tpCamera.start) window.__tpCamera.start = startCamera;
    if (!window.__tpCamera.stop) window.__tpCamera.stop = stopCamera;
    // setDevice alias -> switchCamera
    if (!window.__tpCamera.setDevice) window.__tpCamera.setDevice = (id) => { try { switchCamera(id); } catch {} };
    // setSize alias -> set input value and apply
    if (!window.__tpCamera.setSize) window.__tpCamera.setSize = (pct) => {
      try { const el = document.getElementById('camSize'); if (el) el.value = String(Math.max(15, Math.min(60, Number(pct)||28))); } catch {}
      try { applyCamSizing(); } catch {}
    };
    // setOpacity alias -> set input value and apply
    if (!window.__tpCamera.setOpacity) window.__tpCamera.setOpacity = (op) => {
      try { const el = document.getElementById('camOpacity'); if (el) el.value = String(Math.max(20, Math.min(100, Number(op)||100))); } catch {}
      try { applyCamOpacity(); } catch {}
    };
    // setMirror alias -> set checkbox and apply
    if (!window.__tpCamera.setMirror) window.__tpCamera.setMirror = (on) => {
      try { const el = document.getElementById('camMirror'); if (el) el.checked = !!on; } catch {}
      try { applyCamMirror(); } catch {}
    };
  } catch {}
  // Legacy global fallbacks for older code paths that reference applyCam* functions directly
  try {
    if (typeof window.applyCamSizing !== 'function') {
      window.applyCamSizing = function(){ try { window.__tpCamera?.applyCamSizing?.(); } catch {} };
    }
    if (typeof window.applyCamOpacity !== 'function') {
      window.applyCamOpacity = function(){ try { window.__tpCamera?.applyCamOpacity?.(); } catch {} };
    }
    if (typeof window.applyCamMirror !== 'function') {
      window.applyCamMirror = function(){ try { window.__tpCamera?.applyCamMirror?.(); } catch {} };
    }
  } catch {}
})();

// Hardened camera start/stop facade (starting flag + clean event emissions)
(function(){
  try {
    const cam = (window.__tpCamera = window.__tpCamera || {});
    const state = { stream: null, starting: false };
    function emit(name, detail){ try { window.dispatchEvent(new CustomEvent(name, { detail })); } catch(_){} }
    async function start(){
      if (state.starting) return; // ignore parallel calls
      if (state.stream) { emit('tp:camera:started', { resumed: true }); return; }
      state.starting = true; emit('tp:camera:starting');
      try {
        const constraints = { video: true, audio: false };
        const stream = await navigator.mediaDevices.getUserMedia(constraints);
        state.stream = stream;
        const videoEl = document.getElementById('camVideo');
        if (videoEl) {
          try {
            videoEl.srcObject = stream;
            videoEl.muted = true; videoEl.autoplay = true; videoEl.playsInline = true; videoEl.controls = false;
            videoEl.play().catch(()=>{});
            const wrap = document.getElementById('camWrap'); if (wrap) wrap.style.display = 'block';
          } catch(_){}
        }
        emit('tp:camera:started', { label: (stream.getVideoTracks?.()[0]?.label)||'' });
      } catch(err) {
        try { console.error('[camera] start failed', err); } catch(_){}
        emit('tp:camera:error', { message: String(err && err.message || err) });
        try { (window.toast && window.toast('Camera failed: ' + (err && err.message || 'Unknown'), { type:'error' })); } catch(_){}
        throw err; // allow callers to handle
      } finally { state.starting = false; }
    }
    function stop(){
      if (!state.stream) return; try { for (const t of state.stream.getTracks()) t.stop(); } catch(_){}
      state.stream = null;
      const videoEl = document.getElementById('camVideo'); if (videoEl) { try { videoEl.srcObject = null; } catch(_){} }
      const wrap = document.getElementById('camWrap'); if (wrap) { try { wrap.style.display = 'none'; } catch(_){ } }
      emit('tp:camera:stopped');
    }
    // Expose hardened API (override previous startCamera/stopCamera if present)
    cam.startCamera = start; cam.stopCamera = stop; cam.start = start; cam.stop = stop;
    // Legacy alias
    if (!window.__camApi) window.__camApi = cam;
  } catch(_){ }
})();
