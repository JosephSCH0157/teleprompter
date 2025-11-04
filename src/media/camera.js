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

  function setCamButtons(active) {
    try {
      const startBtn = document.getElementById('startCam');
      const stopBtn = document.getElementById('stopCam');
      if (startBtn) startBtn.disabled = !!active;
      if (stopBtn) stopBtn.disabled = !active;
    } catch {}
  }

  function applyCamSizing() {
    try {
      const camWrap = document.getElementById('camWrap');
      const camSize = document.getElementById('camSize');
      if (!camWrap || !camSize) return;
      const pct = Math.max(15, Math.min(60, Number(camSize.value) || 28));
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
      try {
      // Ensure any previous stream is fully stopped before starting
      if (camStream) { try { camStream.getTracks().forEach(t=>t.stop()); } catch {} camStream = null; }
      // Prefer Settings selector as single source of truth; fall back to persisted/legacy id if present
      const camDeviceSel = document.getElementById('settingsCamSel') || document.getElementById('camDevice');
      let id = camDeviceSel?.value || undefined;
      try {
        if (!id) {
          const saved = localStorage.getItem('tp_camera_device_v1');
          if (saved) id = saved;
        }
        // NEW: persist + mirror the chosen id so next launches & the other select match
        if (id) {
          localStorage.setItem('tp_camera_device_v1', id);
          try {
            const mainSel = document.getElementById('camDevice');
            const setSel  = document.getElementById('settingsCamSel');
            if (mainSel && mainSel.value !== id) mainSel.value = id;
            if (setSel  && setSel.value  !== id) setSel.value  = id;
          } catch {}
        }
      } catch {}
      let stream = null;
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: id ? { deviceId: { exact: id } } : true, audio: false });
  } catch {
        // Fallback: if exact device fails (e.g., unplugged), try default camera
        try {
          stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
        } catch (err2) {
          console.warn('startCamera failed', err2);
          throw err2;
        }
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
      try { if (window.__tpMic) window.__tpMic.populateDevices && window.__tpMic.populateDevices(); } catch {}
      return true;
      } finally { __startingCam = false; }
    } catch (e) { console.warn('startCamera failed', e); throw e; }
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
        newStream = await navigator.mediaDevices.getUserMedia({ video: { deviceId: { exact: deviceId }, width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 30, max: 30 } }, audio: false });
  } catch {
        // Device missing/unavailable; attempt default fallback
        newStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
      }
      const camVideo = document.getElementById('camVideo');
      const old = camStream;
      camStream = newStream;
      if (camVideo) { camVideo.srcObject = newStream; try { await camVideo.play(); } catch {} }
      if (old) old.getTracks().forEach(t=>t.stop());
      try { window.sendToDisplay && window.sendToDisplay({ type: 'cam-sizing', pct: Math.max(15, Math.min(60, Number(document.getElementById('camSize')?.value) || 28)) }); } catch {}
      return true;
    } catch (e) { console.warn('switchCamera failed', e); throw e; }
  }

  try { window.__tpCamera = window.__tpCamera || {}; window.__tpCamera.startCamera = startCamera; window.__tpCamera.stopCamera = stopCamera; window.__tpCamera.switchCamera = switchCamera; window.__tpCamera.applyCamSizing = applyCamSizing; window.__tpCamera.applyCamOpacity = applyCamOpacity; window.__tpCamera.applyCamMirror = applyCamMirror; } catch {}
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
