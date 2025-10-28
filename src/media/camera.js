(function(){
  // Camera overlay helpers. Exposes window.__tpCamera
  let camStream = null;
  let camPC = null;
  let _wantCamRTC = false;

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
      const camDeviceSel = document.getElementById('camDevice') || document.getElementById('settingsCamSel');
      const id = camDeviceSel?.value || undefined;
      const stream = await navigator.mediaDevices.getUserMedia({ video: id ? { deviceId: { exact: id } } : true, audio: false });
      const camVideo = document.getElementById('camVideo');
      const camWrap = document.getElementById('camWrap');
      if (!camVideo || !camWrap) return;
      camVideo.muted = true; camVideo.autoplay = true; camVideo.playsInline = true; camVideo.controls = false;
      camVideo.srcObject = stream;
      camWrap.style.display = 'block';
      camStream = stream;
      applyCamSizing(); applyCamOpacity(); applyCamMirror();
      try { if (window.__tpMic) window.__tpMic.populateDevices && window.__tpMic.populateDevices(); } catch {}
    } catch (e) { console.warn('startCamera failed', e); }
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
      try { window.sendToDisplay && window.sendToDisplay({ type: 'webrtc-stop' }); } catch {}
      if (camPC) { try { camPC.close(); } catch {} camPC = null; }
    } catch (e) { console.warn('stopCamera failed', e); }
  }

  async function switchCamera(deviceId) {
    try {
      if (!deviceId) return;
      const newStream = await navigator.mediaDevices.getUserMedia({ video: { deviceId: { exact: deviceId }, width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 30, max: 30 } }, audio: false });
      const camVideo = document.getElementById('camVideo');
      const old = camStream;
      camStream = newStream;
      if (camVideo) camVideo.srcObject = newStream;
      if (old) old.getTracks().forEach(t=>t.stop());
      try { window.sendToDisplay && window.sendToDisplay({ type: 'cam-sizing', pct: Math.max(15, Math.min(60, Number(document.getElementById('camSize')?.value) || 28)) }); } catch {}
    } catch (e) { console.warn('switchCamera failed', e); throw e; }
  }

  try { window.__tpCamera = window.__tpCamera || {}; window.__tpCamera.startCamera = startCamera; window.__tpCamera.stopCamera = stopCamera; window.__tpCamera.switchCamera = switchCamera; window.__tpCamera.applyCamSizing = applyCamSizing; window.__tpCamera.applyCamOpacity = applyCamOpacity; window.__tpCamera.applyCamMirror = applyCamMirror; } catch {}
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
})();
