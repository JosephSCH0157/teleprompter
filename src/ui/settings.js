(function(){
  // Settings UI centralization: binds overlay and main panel; tolerates no-store mode
  const S = window.__tpStore;
  const hasStore = !!S;

  function q(id) { return document.getElementById(id); }

  function showTab(tab){
    try {
      const tabs = Array.from(document.querySelectorAll('#settingsTabs .settings-tab'));
      tabs.forEach(t => t.classList.toggle('active', t.dataset.tab === tab));
      const sb = document.getElementById('settingsBody');
      if (!sb) return;
      const cards = Array.from(sb.querySelectorAll('[data-tab-content]'));
      cards.forEach(c => { c.style.display = (c.getAttribute('data-tab-content') === tab) ? '' : 'none'; });
    } catch {}
  }

  function buildSettingsContent(rootEl){
    try {
      if (!rootEl) return;
      if (rootEl.dataset.mounted === '1') return; // idempotent
      const html = [
        '<div data-tab-content="general">',
        '  <h4>General</h4>',
        '  <div class="row">',
        '    <label>Font size <input id="settingsFontSize" type="number" min="16" max="96" step="2" class="select-md"/></label>',
        '    <label>Line height <input id="settingsLineHeight" type="number" min="1.1" max="2" step="0.05" class="select-md"/></label>',
        '  </div>',
        '  <div class="row">',
        '    <label>Max line width (ch – Main)<input id="settingsMaxChMain" type="number" min="40" max="140" step="1" class="select-md" placeholder="95"/></label>',
        '    <label>Max line width (ch – Display)<input id="settingsMaxChDisplay" type="number" min="40" max="140" step="1" class="select-md" placeholder="95"/></label>',
        '  </div>',
        '  <div class="settings-small">Typography applies locally by default. Use Link to mirror changes.</div>',
        '  <label class="row" style="align-items:center;gap:8px;">',
        '    <input id="typoLink" type="checkbox"/> Link typography across displays (size & spacing)',
        '  </label>',
        '  <div class="row">',
        '    <button id="typoCopyMainToDisplay" class="chip">Copy Main → Display</button>',
        '    <button id="typoCopyDisplayToMain" class="chip">Copy Display → Main</button>',
        '  </div>',
        '</div>',
        '',
        '<div data-tab-content="media" style="display:none">',
        '  <h4>Microphone</h4>',
  '  <div class="row">',
  '    <label>Input device',
  '      <select id="settingsMicSel" class="select-md"></select>',
  '    </label>',
  '  </div>',
  '  <div class="row">',
  '    <div id="settingsMicLevel" class="db-mini" title="Input level" style="width:120px;height:8px;border-radius:999px;overflow:hidden;background:rgba(255,255,255,.08);">',
  '      <i style="display:block;height:100%;transform-origin:left center;transform:scaleX(0);background:linear-gradient(90deg,#4caf50,#ffc107 60%,#e53935)"></i>',
  '    </div>',
  '    <div id="settingsMicInfo" class="microcopy" style="margin-left:8px;color:#9fb4c9;font-size:12px;">',
  '      Device: <span id="settingsMicDeviceName">—</span> • Level: <span id="settingsMicDb">–∞ dB</span>',
  '    </div>',
  '  </div>',
  '  <div class="row">',
  '    <button id="settingsRequestMicBtn" data-action="settings-request-mic" class="chip">Request mic</button>',
  '    <button id="settingsReleaseMicBtn" data-action="settings-release-mic" class="chip">Release mic</button>',
  '  </div>',
  '  <h4>ASR / Mic Calibration</h4>',
  '  <div class="row microcopy" style="color:#9fb4c9;font-size:12px">Use Start to measure room noise, then speak to measure voice. We0ll derive safe thresholds for voice activity detection.</div>',
  '  <div class="row" style="align-items:center;gap:10px">',
  '    <button id="asrCalibBtn" class="chip">Start calibration</button>',
  '    <label><input type="checkbox" id="asrApplyHybrid"/> Apply to Hybrid Gate</label>',
  '    <span id="asrCalibProgress" class="microcopy" style="margin-left:4px;color:#9fb4c9;font-size:12px">Ready</span>',
  '  </div>',
  '  <div class="row settings-small" id="asrHybridUsing" style="color:#9fb4c9;font-size:12px">Using: —</div>',
  '  <div class="row settings-small" id="asrCalibReadout">',
  '    Noise: <strong id="asrNoiseDb">—</strong> • Speech: <strong id="asrSpeechDb">—</strong> • ton: <strong id="asrTonDb">—</strong> • toff: <strong id="asrToffDb">—</strong>',
  '  </div>',
  '  <div class="row">',
  '    <label>Attack (ms) <input id="asrAttackMs" type="number" min="20" max="500" step="10" value="80" class="select-sm"/></label>',
  '    <label>Release (ms) <input id="asrReleaseMs" type="number" min="80" max="1000" step="20" value="300" class="select-sm"/></label>',
  '  </div>',
        '  <h4>Camera</h4>',
        '  <div class="row">',
        '    <label>Device',
        '      <select id="settingsCamSel" class="select-md"></select>',
        '    </label>',
        '  </div>',
        '</div>',
        '',
        '<div data-tab-content="recording" style="display:none">',
        '  <h4>Recording</h4>',
        '  <div class="row">',
  '    <label><input type="checkbox" id="settingsAutoRecord"/> Auto-record on start</label>',
        '  </div>',
        '  <div class="row">',
        '    <label>Pre-roll (sec) <input id="settingsPreroll" type="number" min="0" max="10" step="1" class="select-md"/></label>',
        '  </div>',
  '  <h4>OBS</h4>',
  '  <div class="row microcopy" style="color:#9fb4c9;font-size:12px">OBS is optional — speech sync does not require OBS.</div>',
  '  <div class="row">',
        '    <label><input type="checkbox" id="settingsEnableObs"/> Enable OBS</label>',
        '  </div>',
  '  <div class="row">',
  '    <label>IP/Host <input id="settingsObsHost" type="text" class="select-md" placeholder="127.0.0.1"/></label>',
  '    <label>Password <input id="settingsObsPassword" type="password" class="select-md" placeholder="••••••"/></label>',
  '  </div>',
  '  <div class="row microcopy" style="color:#9fb4c9;font-size:12px">Port defaults to 4455; uses ws://</div>',
  '  <div class="row">',
        '    <label>Scene <input id="settingsObsScene" type="text" class="select-md" placeholder="Scene name"/></label>',
        '    <label><input type="checkbox" id="settingsObsReconnect"/> Auto-reconnect</label>',
        '  </div>',
  '  <div class="row">',
  '    <button id="settingsObsTest" data-action="obs-test" class="chip btn-chip" type="button">Test connection</button>',
  '    <span id="settingsObsTestMsg" class="obs-test-msg" role="status" aria-live="polite"></span>',
  '  </div>',
        '</div>',
        '',
        '<div data-tab-content="advanced" style="display:none">',
        '  <h4>Advanced</h4>',
        '  <div class="row">',
        '    <label><input type="checkbox" id="settingsDevHud"/> Enable HUD (dev only)</label>',
        '  </div>',
        '  <div class="row">',
        '    <button id="settingsResetState" class="chip">Reset app state</button>',
        '  </div>',
        '</div>'
      ].join('\n');
      rootEl.innerHTML = html;
      rootEl.dataset.mounted = '1';
    } catch {}
  }

  function populateDevices() {
    try {
      if (!navigator.mediaDevices || !navigator.mediaDevices.enumerateDevices) return;
      navigator.mediaDevices.enumerateDevices().then((devs) => {
        const mics = devs.filter(d => d.kind === 'audioinput');
        const cams = devs.filter(d => d.kind === 'videoinput');
        const fill = (id, list) => {
          try {
            const el = document.getElementById(id);
            if (!el) return;
            const prev = el.value;
            el.innerHTML = '';
            list.forEach((d) => {
              const opt = document.createElement('option');
              opt.value = d.deviceId;
              opt.textContent = d.label || (d.kind === 'audioinput' ? 'Microphone' : 'Camera');
              el.appendChild(opt);
            });
            if (prev && Array.from(el.options).some(o => o.value === prev)) el.value = prev;
          } catch {}
        };
        fill('settingsMicSel', mics);
        fill('micDeviceSel', mics); // keep main panel in sync if present
        fill('settingsCamSel', cams);
        // Apply persisted mic/cam preferences if available
        try {
          // Mic preference: prefer app store, else localStorage fallback
          const micSel = document.getElementById('settingsMicSel');
          let micSaved = null;
          try { const S = window.__tpStore; micSaved = (S && typeof S.get === 'function' && S.get('micDevice')) || null; } catch {}
          if (!micSaved) { try { micSaved = localStorage.getItem('tp_mic_device_v1'); } catch {} }
          if (micSel && micSaved && Array.from(micSel.options).some(o => o.value === micSaved)) {
            micSel.value = micSaved;
          }
        } catch {}
        try {
          // Camera preference from localStorage
          const camSel = document.getElementById('settingsCamSel');
          const camSaved = (function(){ try { return localStorage.getItem('tp_camera_device_v1'); } catch { return null; } })();
          if (camSel && camSaved && Array.from(camSel.options).some(o => o.value === camSaved)) {
            camSel.value = camSaved;
          }
        } catch {}
        // Update visible current device name in Settings if present
        try {
          const sel = document.getElementById('settingsMicSel');
          const nameSpan = document.getElementById('settingsMicDeviceName');
          if (sel && nameSpan) {
            const opt = sel.options[sel.selectedIndex];
            nameSpan.textContent = opt ? (opt.textContent || 'Microphone') : '—';
          }
        } catch {}
      }).catch(() => {});
    } catch {}
  }

  function init() {
    try {
      // Bind settings tab persistence
      const tabs = Array.from(document.querySelectorAll('#settingsTabs .settings-tab'));
      tabs.forEach(t => {
        t.addEventListener('click', () => {
          const tab = t.dataset.tab;
          if (!tab) return;
          if (hasStore) { try { S.set('settingsTab', tab); } catch {} }
          else showTab(tab);
        });
      });
      if (hasStore && typeof S.subscribe === 'function') {
        S.subscribe('settingsTab', tab => { try { if (tab) showTab(tab); } catch {} });
      }
      // Ensure a default tab is visible on first open
      const active = (document.querySelector('#settingsTabs .settings-tab.active')||null);
      showTab(active && active.getAttribute('data-tab') || 'general');

      // Wire settings overlay mic buttons (fallback) — skip if centralized delegates are active
      try {
        if (!window.__tpSettingsDelegatesActive) {
          const reqBtn = q('settingsRequestMicBtn');
          const relBtn = q('settingsReleaseMicBtn');
          if (reqBtn) reqBtn.addEventListener('click', async () => { try { await (window.__tpMic?.requestMic?.() || Promise.resolve()); } catch {} });
          if (relBtn) relBtn.addEventListener('click', () => { try { window.__tpMic?.releaseMic?.(); } catch {} });
        }
      } catch {}

      // Wire mic device selector (persist to store + localStorage; mirror main panel select)
      try {
        const sel = q('settingsMicSel');
        if (sel) sel.addEventListener('change', () => {
          try { if (hasStore) S.set('micDevice', sel.value); } catch {}
          try { localStorage.setItem('tp_mic_device_v1', String(sel.value||'')); } catch {}
          try { const main = q('micDeviceSel') || q('micDevice'); if (main && main.value !== sel.value) main.value = sel.value; } catch {}
          try { const nameSpan = q('settingsMicDeviceName'); const opt = sel.options[sel.selectedIndex]; if (nameSpan) nameSpan.textContent = opt ? (opt.textContent||'Microphone') : '—'; } catch {}
        });
        if (hasStore && typeof S.subscribe === 'function') {
          S.subscribe('micDevice', (v) => { try { if (sel && sel.value !== v) sel.value = v || ''; } catch {} });
        }
      } catch {}

      // Populate devices initially and when device list changes
      populateDevices();
      try { navigator.mediaDevices && navigator.mediaDevices.addEventListener && navigator.mediaDevices.addEventListener('devicechange', populateDevices); } catch {}

      // Mic device selector
      const settingsMicSel = q('settingsMicSel');
      const micDeviceSel = q('micDeviceSel') || q('micDevice') || q('micDeviceSel');
      if (settingsMicSel) {
        settingsMicSel.addEventListener('change', () => { try { S.set('micDevice', settingsMicSel.value); } catch {} try { localStorage.setItem('tp_mic_device_v1', String(settingsMicSel.value||'')); } catch {} });
      }
      if (hasStore && typeof S.subscribe === 'function') {
        S.subscribe('micDevice', v => {
          try {
            if (settingsMicSel && settingsMicSel.value !== v) settingsMicSel.value = v || '';
            if (micDeviceSel && micDeviceSel.value !== v) micDeviceSel.value = v || '';
          } catch {}
        });
      }

      // Camera device selector (Settings) — switch/start camera (single source of truth)
      try {
        const camSel = q('settingsCamSel');
        if (camSel && !camSel.dataset.wired) {
          camSel.dataset.wired = '1';
          camSel.addEventListener('change', async () => {
            try {
              const id = camSel.value;
              try { localStorage.setItem('tp_camera_device_v1', String(id||'')); } catch {}
              // Capture friendly label for toast feedback
              const label = (function(){
                try { const opt = camSel.options[camSel.selectedIndex]; return (opt && (opt.textContent||'').trim()) || 'Camera'; } catch { return 'Camera'; }
              })();
              const camApi = window.__tpCamera || {};
              const camVideo = document.getElementById('camVideo');
              const isActive = !!(camVideo && camVideo.srcObject);
              if (isActive && typeof camApi.switchCamera === 'function') {
                await camApi.switchCamera(id);
                try { if (window.toast) window.toast('Camera set to ' + label, { type: 'ok' }); } catch {}
              } else if (typeof camApi.startCamera === 'function') {
                // Ensure Settings select reflects desired device before starting, since startCamera reads from DOM
                await camApi.startCamera();
                try { if (window.toast) window.toast('Camera set to ' + label, { type: 'ok' }); } catch {}
              }
            } catch (e) { try { console.warn('[settings] camera switch failed', e); } catch {} }
          });
        }
      } catch {}

      // OBS enabled toggle: central write path
      const settingsEnableObs = q('settingsEnableObs');
      const mainEnableObs = q('enableObs');
      if (settingsEnableObs && hasStore) settingsEnableObs.addEventListener('change', () => S.set('obsEnabled', !!settingsEnableObs.checked));
      if (mainEnableObs && hasStore) mainEnableObs.addEventListener('change', () => S.set('obsEnabled', !!mainEnableObs.checked));
      if (hasStore && typeof S.subscribe === 'function') {
        S.subscribe('obsEnabled', v => {
          try {
            if (settingsEnableObs && settingsEnableObs.checked !== !!v) settingsEnableObs.checked = !!v;
            if (mainEnableObs && mainEnableObs.checked !== !!v) mainEnableObs.checked = !!v;
          } catch {}
        });
      }

      // Auto-record: Settings overlay control is source of truth (mirrors to any main control if present)
      const settingsAutoRec = q('settingsAutoRecord');
      const mainAutoRec = q('autoRecordToggle') || q('autoRecord');
      if (settingsAutoRec && hasStore) settingsAutoRec.addEventListener('change', () => S.set('autoRecord', !!settingsAutoRec.checked));
      if (mainAutoRec && hasStore) mainAutoRec.addEventListener('change', () => S.set('autoRecord', !!mainAutoRec.checked));
      if (hasStore && typeof S.subscribe === 'function') {
        S.subscribe('autoRecord', v => {
          try {
            if (settingsAutoRec && settingsAutoRec.checked !== !!v) settingsAutoRec.checked = !!v;
            if (mainAutoRec && mainAutoRec.checked !== !!v) mainAutoRec.checked = !!v;
          } catch {}
        });
      }

      // Preroll seconds persistence
      const settingsPreroll = q('settingsPreroll');
      if (settingsPreroll && hasStore) {
        settingsPreroll.addEventListener('input', () => {
          const n = parseInt(settingsPreroll.value, 10);
          if (isFinite(n)) S.set('prerollSeconds', Math.max(0, Math.min(10, n)));
        });
        S.subscribe && S.subscribe('prerollSeconds', (v) => { try { if (settingsPreroll.value !== String(v)) settingsPreroll.value = String(v); } catch {} });
      }

      // Typography (Font size / Line height) — Settings is source-of-truth; mirror to main hidden inputs
      try {
        // If TS is driving typography, skip legacy listeners & writes
        if (window.__tpTsTypographyActive) {
          // no-op: TS path owns typography and wheel bindings
        } else {
        const fsS = q('settingsFontSize');
        const lhS = q('settingsLineHeight');
        const maxChMain = q('settingsMaxChMain');
        const maxChDisp = q('settingsMaxChDisplay');
        const fsMain = q('fontSize');
        const lhMain = q('lineHeight');
        const setRootMaxCh = (val) => {
          try {
            const n = Math.max(40, Math.min(140, Number(val)));
            if (!Number.isFinite(n)) return;
            document.documentElement.style.setProperty('--tp-maxch', String(n));
            // persist under tp_typography_v1 for 'main'
            const KEY = 'tp_typography_v1';
            const raw = localStorage.getItem(KEY);
            const st = raw ? JSON.parse(raw) : {};
            st.main = { ...(st.main||{}), maxLineWidthCh: n };
            localStorage.setItem(KEY, JSON.stringify(st));
            window.dispatchEvent(new Event('tp:lineMetricsDirty'));
          } catch {}
        };
        const sendToDisplayTypography = (t) => {
          try {
            const payload = { kind:'tp:typography', source:'main', display:'display', t: { ...t } };
            try { new BroadcastChannel('tp_display').postMessage(payload); } catch {}
            try { const w = window.__tpDisplayWindow; if (w && !w.closed) w.postMessage(payload, '*'); } catch {}
          } catch {}
        };
        const applyFromSettings = () => {
          try {
            if (fsS && fsMain) {
              if (fsMain.value !== fsS.value) fsMain.value = fsS.value;
              try { fsMain.dispatchEvent(new Event('input', { bubbles: true })); } catch {}
            }
            if (lhS && lhMain) {
              if (lhMain.value !== lhS.value) lhMain.value = lhS.value;
              try { lhMain.dispatchEvent(new Event('input', { bubbles: true })); } catch {}
            }
            // Monolith path: apply immediately when helper exists
            try { if (typeof window.applyTypography === 'function') window.applyTypography(); } catch {}
            // Modular path fallback: set CSS vars directly so updates are visible immediately
            try {
              const root = document.documentElement;
              if (fsS && fsS.value) root.style.setProperty('--tp-font-size', String(fsS.value) + 'px');
              if (lhS && lhS.value) root.style.setProperty('--tp-line-height', String(lhS.value));
              try { window.dispatchEvent(new Event('tp:lineMetricsDirty')); } catch {}
              // persist per-display (main) under shared store so reload restores
              const KEY = 'tp_typography_v1';
              const raw = localStorage.getItem(KEY);
              const st = raw ? JSON.parse(raw) : {};
              st.main = { ...(st.main||{}), fontSizePx: Number(fsS && fsS.value || 0), lineHeight: Number(lhS && lhS.value || 0) };
              localStorage.setItem(KEY, JSON.stringify(st));
            } catch {}
            // Persist to localStorage for legacy boot hydration
            try {
              if (fsS && fsS.value) localStorage.setItem('tp_font_size_v1', String(fsS.value));
              if (lhS && lhS.value) localStorage.setItem('tp_line_height_v1', String(lhS.value));
            } catch {}
            // Broadcast to Display immediately (no link preference required)
            try {
              const fs = fsS && fsS.value ? Number(fsS.value) : undefined;
              const lh = lhS && lhS.value ? Number(lhS.value) : undefined;
              const payload = { kind:'tp:typography', source:'main', display:'display', t: { fontSizePx: fs, lineHeight: lh } };
              try { new BroadcastChannel('tp_display').postMessage(payload); } catch {}
              try { const w = window.__tpDisplayWindow; if (w && !w.closed) w.postMessage(payload, '*'); } catch {}
            } catch {}
          } catch {}
        };
        if (fsS) fsS.addEventListener('input', applyFromSettings);
        if (lhS) lhS.addEventListener('input', applyFromSettings);
        if (maxChMain) maxChMain.addEventListener('input', () => { try { setRootMaxCh(maxChMain.value); } catch {} });
        if (maxChDisp) maxChDisp.addEventListener('input', () => {
          try {
            const n = Math.max(40, Math.min(140, Number(maxChDisp.value)));
            if (!Number.isFinite(n)) return;
            // Persist under display bucket so it survives reload
            const KEY = 'tp_typography_v1';
            const raw = localStorage.getItem(KEY);
            const st = raw ? JSON.parse(raw) : {};
            st.display = { ...(st.display||{}), maxLineWidthCh: n };
            localStorage.setItem(KEY, JSON.stringify(st));
            // Immediate broadcast to display
            sendToDisplayTypography({ maxLineWidthCh: n });
          } catch {}
        });
        // Initial sync: prefer existing main values or stored values
        try {
          const storedFS = (function(){ try { return localStorage.getItem('tp_font_size_v1'); } catch { return null; } })();
          const storedLH = (function(){ try { return localStorage.getItem('tp_line_height_v1'); } catch { return null; } })();
          const KEY = 'tp_typography_v1';
          const raw = localStorage.getItem(KEY);
          const st = raw ? JSON.parse(raw) : {};
          const ownMain = (st && st.main) || {};
          const ownDisp = (st && st.display) || {};
          if (fsS) fsS.value = (fsMain && fsMain.value) || storedFS || '48';
          if (lhS) lhS.value = (lhMain && lhMain.value) || storedLH || '1.35';
          // Hydrate maxCh inputs from computed style or store
          try {
            const cs = getComputedStyle(document.documentElement);
            const curMax = parseFloat(cs.getPropertyValue('--tp-maxch'));
            const mainVal = Number.isFinite(ownMain.maxLineWidthCh) ? ownMain.maxLineWidthCh : (Number.isFinite(curMax)?curMax:95);
            if (maxChMain) maxChMain.value = String(mainVal);
            // For display, use stored display value if available; otherwise show blank default
            const dispVal = Number.isFinite(ownDisp.maxLineWidthCh) ? ownDisp.maxLineWidthCh : '';
            if (maxChDisp) maxChDisp.value = dispVal === '' ? '' : String(dispVal);
          } catch {}
          applyFromSettings();
        } catch {}
        }
      } catch {}

      // Link typography pref + Copy buttons
      try {
        const PREF_KEY = 'tp_ui_prefs_v1';
        const readPrefs = () => { try { return JSON.parse(localStorage.getItem(PREF_KEY) || '{}') || {}; } catch { return {}; } };
        const writePrefs = (p) => { try { localStorage.setItem(PREF_KEY, JSON.stringify(p||{})); } catch {} };
        const box = q('typoLink');
        if (box) {
          const st = readPrefs();
          box.checked = !!st.linkTypography;
          box.addEventListener('change', () => {
            const cur = readPrefs();
            cur.linkTypography = !!box.checked;
            writePrefs(cur);
          });
        }
        const btnA = q('typoCopyMainToDisplay');
        const btnB = q('typoCopyDisplayToMain');
        // Helper: get computed typography snapshot of a window
        const grab = (win) => {
          try {
            const cs = win.getComputedStyle(win.document.documentElement);
            return {
              fontSizePx: parseFloat(cs.getPropertyValue('--tp-font-size')) || 56,
              lineHeight: parseFloat(cs.getPropertyValue('--tp-line-height')) || 1.4,
              fontFamily: cs.getPropertyValue('--tp-font-family')?.trim() || undefined,
              weight: parseFloat(cs.getPropertyValue('--tp-weight')) || undefined,
              letterSpacingEm: parseFloat(cs.getPropertyValue('--tp-letter-spacing')) || undefined,
              wordSpacingEm: parseFloat(cs.getPropertyValue('--tp-word-spacing')) || undefined,
              color: cs.getPropertyValue('--tp-fg')?.trim() || undefined,
              background: cs.getPropertyValue('--tp-bg')?.trim() || undefined,
              maxLineWidthCh: parseFloat(cs.getPropertyValue('--tp-maxch')) || undefined,
              dimOthers: parseFloat(cs.getPropertyValue('--tp-dim')) || undefined,
            };
          } catch { return {}; }
        };
        // Apply snapshot to this window and persist locally for 'main'
        const applyLocal = (snap) => {
          try {
            const s = document.documentElement.style;
            if (snap.fontFamily) s.setProperty('--tp-font-family', snap.fontFamily);
            if (snap.fontSizePx != null) s.setProperty('--tp-font-size', String(snap.fontSizePx) + 'px');
            if (snap.lineHeight != null) s.setProperty('--tp-line-height', String(snap.lineHeight));
            if (snap.weight != null) s.setProperty('--tp-weight', String(snap.weight));
            if (snap.letterSpacingEm != null) s.setProperty('--tp-letter-spacing', String(snap.letterSpacingEm) + 'em');
            if (snap.wordSpacingEm != null) s.setProperty('--tp-word-spacing', String(snap.wordSpacingEm) + 'em');
            if (snap.color) s.setProperty('--tp-fg', snap.color);
            if (snap.background) s.setProperty('--tp-bg', snap.background);
            if (snap.maxLineWidthCh != null) s.setProperty('--tp-maxch', String(snap.maxLineWidthCh));
            if (snap.dimOthers != null) s.setProperty('--tp-dim', String(snap.dimOthers));
            // persist under tp_typography_v1 for 'main'
            try {
              const KEY = 'tp_typography_v1';
              const raw = localStorage.getItem(KEY);
              const st = raw ? JSON.parse(raw) : {};
              st.main = { ...(st.main||{}), ...snap };
              localStorage.setItem(KEY, JSON.stringify(st));
              window.dispatchEvent(new Event('tp:lineMetricsDirty'));
            } catch {}
          } catch {}
        };
        if (btnA) btnA.addEventListener('click', () => {
          try {
            const snap = grab(window);
            // Addressed snapshot to display only
            const payload = { kind:'tp:typography', source:'main', display:'display', t: snap };
            try { const bc = new BroadcastChannel('tp_display'); bc.postMessage(payload); } catch {}
            try { const w = window.__tpDisplayWindow; w && w.postMessage && w.postMessage(payload, '*'); } catch {}
          } catch {}
        });
        if (btnB) btnB.addEventListener('click', () => {
          try {
            const w = window.__tpDisplayWindow;
            if (!w) return;
            const snap = grab(w);
            applyLocal(snap);
          } catch {}
        });
      } catch {}

      // Mirror OBS URL/password live between settings overlay and main panel via input events
  const obsUrlS = q('settingsObsUrl');
  const mainUrl = q('obsUrl');
  const obsPassS = q('settingsObsPassword');
  const mainPass = q('obsPassword');
      // OBS fields and controls
      const obsHost = q('settingsObsHost');
      const obsPass = q('settingsObsPassword');
      const obsScene = q('settingsObsScene');
      const obsReconn = q('settingsObsReconnect');
      const obsTestBtn = q('settingsObsTest');
      const obsTestMsg = q('settingsObsTestMsg');
      // Skip legacy OBS input mirroring when TS inline bridge owns OBS to avoid duplicate churn
      if (!window.__tpObsInlineBridgeActive) {
        if (obsUrlS && mainUrl) {
          obsUrlS.addEventListener('input', () => { try { if (mainUrl.value !== obsUrlS.value) mainUrl.value = obsUrlS.value; } catch {} });
          mainUrl.addEventListener('input', () => { try { if (obsUrlS.value !== mainUrl.value) obsUrlS.value = mainUrl.value; } catch {} });
        }
        if (obsPassS && mainPass) {
          obsPassS.addEventListener('input', () => { try { if (mainPass.value !== obsPassS.value) mainPass.value = obsPassS.value; } catch {} });
          mainPass.addEventListener('input', () => { try { if (obsPassS.value !== mainPass.value) obsPassS.value = mainPass.value; } catch {} });
        }

  // Wire OBS Host/Password/Scene/Auto-reconnect
        if (obsHost && hasStore) obsHost.addEventListener('input', () => S.set('obsHost', String(obsHost.value||'')));
        if (obsPass && hasStore) obsPass.addEventListener('input', () => S.set('obsPassword', String(obsPass.value||'')));
        if (obsScene && hasStore) obsScene.addEventListener('input', () => S.set('obsScene', String(obsScene.value||'')));
        if (obsReconn && hasStore) obsReconn.addEventListener('change', () => S.set('obsReconnect', !!obsReconn.checked));
        if (hasStore && typeof S.subscribe === 'function') {
          S.subscribe('obsHost', v => { try { if (obsHost && obsHost.value !== v) obsHost.value = v || ''; } catch {} });
          S.subscribe('obsPassword', v => { try { if (obsPass && obsPass.value !== v) obsPass.value = v || ''; } catch {} });
          S.subscribe('obsScene', v => { try { if (obsScene && obsScene.value !== v) obsScene.value = v || ''; } catch {} });
          S.subscribe('obsReconnect', v => { try { if (obsReconn && obsReconn.checked !== !!v) obsReconn.checked = !!v; } catch {} });
        }
      }

      // OBS Test connection button (skip if inline TS bridge is active)
      if (obsTestBtn && !window.__tpObsInlineBridgeActive) {
        obsTestBtn.addEventListener('click', async () => {
          try {
            const host = hasStore ? String(S.get('obsHost')||'') : (obsHost ? String(obsHost.value||'') : '');
            const pass = hasStore ? String(S.get('obsPassword')||'') : (obsPass ? String(obsPass.value||'') : '');
            const reconnect = false; // temporary test connection should not linger
            const port = 4455;
            const secure = false;
            const setMsg = (ok, txt, extra) => {
              try {
                if (!obsTestMsg) return;
                obsTestMsg.textContent = String(txt||'');
                obsTestMsg.classList.remove('obs-test-ok','obs-test-error');
                obsTestMsg.classList.add(ok ? 'obs-test-ok' : 'obs-test-error');
                try { window.dispatchEvent(new CustomEvent('tp:obs-test', { detail: { ok: !!ok, ...(extra||{}) } })); } catch {}
              } catch {}
            };
            if (!host) { setMsg(false, 'Enter IP/Host and try again'); return; }
            if (!window.__tpOBS || typeof window.__tpOBS.connect !== 'function') { setMsg(false, 'OBS adapter unavailable'); return; }
            if (obsTestMsg) { obsTestMsg.textContent = 'Testing…'; obsTestMsg.classList.remove('obs-test-ok','obs-test-error'); }

            const existing = window.__tpObsConn;
            // Use existing identified connection if available
            if (existing && typeof existing.isIdentified === 'function' && existing.isIdentified()) {
              try {
                const res = await existing.request('GetVersion', {});
                if (res && res.ok) setMsg(true, 'Connected • ' + (res.data && (res.data.obsVersion || 'OK')), { version: res.data && res.data.obsVersion });
                else setMsg(false, 'Connected but request failed');
              } catch { setMsg(false, 'Connected but request failed'); }
              return;
            }

            // Temporary connection for test
            const conn = window.__tpOBS.connect({ host, port, secure, password: pass, reconnect });
            let done = false;
            const cleanup = () => { try { if (conn && conn.close) conn.close(); } catch {} };
            const timeout = setTimeout(() => { if (!done) { done = true; setMsg(false, 'Timeout waiting for OBS'); cleanup(); } }, 7000);
            try {
              await new Promise((resolve, reject) => {
                try {
                  conn.on && conn.on('identified', resolve);
                  conn.on && conn.on('closed', () => reject(new Error('closed')));
                  conn.on && conn.on('error', () => reject(new Error('error')));
                } catch { reject(new Error('listener-failed')); }
              });
              const res = await conn.request('GetVersion', {});
              if (res && res.ok) setMsg(true, 'Connected • ' + (res.data && (res.data.obsVersion || 'OK')), { version: res.data && res.data.obsVersion });
              else setMsg(false, 'Connected but request failed');
            } catch {
              setMsg(false, 'Failed to connect');
            } finally {
              done = true; clearTimeout(timeout); cleanup();
            }
          } catch {}
        });
      }

      // Wire OBS toggle wiring behavior to use S.set('obsEnabled') as source-of-truth and manage connection
      function ensureObsConnection(){
        if (window.__tpObsInlineBridgeActive) return; // TS inline bridge manages OBS; avoid double connections
        try {
          const enabled = hasStore ? !!S.get('obsEnabled') : false;
          const host = hasStore ? String(S.get('obsHost')||'') : '';
          const pass = hasStore ? String(S.get('obsPassword')||'') : '';
          const shouldReconnect = hasStore ? !!S.get('obsReconnect') : true;
          const statusEl = document.getElementById('obsStatusText') || document.getElementById('obsStatus');
          const setStatus = (txt) => { try { if (statusEl) statusEl.textContent = txt; } catch {} };
          if (!enabled) {
            if (window.__tpObsConn && window.__tpObsConn.close) { try { window.__tpObsConn.close(); } catch {} }
            window.__tpObsConn = null; setStatus && setStatus('disabled'); return;
          }
          if (!host || !window.__tpOBS || typeof window.__tpOBS.connect !== 'function') return;
          if (window.__tpObsConn && window.__tpObsConn.close) { try { window.__tpObsConn.close(); } catch {} }
          try {
            const conn = window.__tpOBS.connect({ host, port: 4455, secure: false, password: pass, reconnect: shouldReconnect });
            window.__tpObsConn = conn;
            if (conn && conn.on) {
              conn.on('connecting', () => setStatus('connecting'));
              conn.on('open', () => setStatus('connected'));
              conn.on('error', () => setStatus('error'));
              conn.on('closed', () => setStatus('closed'));
            }
          } catch {}
        } catch {}
      }
      if (hasStore && typeof S.subscribe === 'function') {
        S.subscribe('obsEnabled', (v) => { try { if (settingsEnableObs && settingsEnableObs.checked !== !!v) settingsEnableObs.checked = !!v; } catch {} ensureObsConnection(); });
        S.subscribe('obsHost', ensureObsConnection);
        S.subscribe('obsPassword', ensureObsConnection);
      }
      // Initial connection attempt after mount
      setTimeout(ensureObsConnection, 0);

      // Dev HUD toggle (advanced)
      const devHud = q('settingsDevHud');
      if (devHud && hasStore) devHud.addEventListener('change', () => S.set('devHud', !!devHud.checked));
      if (hasStore && typeof S.subscribe === 'function') {
        S.subscribe('devHud', v => {
          try {
            if (devHud && devHud.checked !== !!v) devHud.checked = !!v;
            // Show/hide the modern HUD (installed by debug-tools)
            try {
              if (v && typeof window.__tpInstallHUD === 'function' && !window.__tpHud) {
                window.__tpHud = window.__tpInstallHUD({ hotkey: '~' });
              }
              if (window.__tpHud) {
                if (v) { try { window.__tpHud.show && window.__tpHud.show(); } catch {} }
                else { try { window.__tpHud.hide && window.__tpHud.hide(); } catch {} }
              }
            } catch {}
            // Back-compat: toggle legacy mount visibility if present
            const hud = document.getElementById('hud-root');
            if (hud) hud.style.display = v ? '' : 'none';
          } catch {}
        });
      }

      // Reset app state
      const resetBtn = q('settingsResetState');
      if (resetBtn) {
        resetBtn.addEventListener('click', () => {
          try {
            const ok = confirm('Reset all app data and reload? This will clear saved scripts and settings.');
            if (!ok) return;
            try { localStorage.clear(); } catch {}
            try { sessionStorage && sessionStorage.clear && sessionStorage.clear(); } catch {}
            location.reload();
          } catch {}
        });
      }

      // Mic dB meter in settings
      try {
        const bar = document.querySelector('#settingsMicLevel i');
        const dbSpan = q('settingsMicDb');
        const clamp = (v,a,b)=>Math.max(a,Math.min(b,v));
        window.addEventListener('tp:db', (e) => {
          try {
            const db = (e && e.detail && typeof e.detail.db === 'number') ? e.detail.db : -60;
            const pct = (clamp(db, -60, 0) + 60) / 60;
            if (bar) bar.style.transform = 'scaleX(' + pct + ')';
            if (dbSpan) dbSpan.textContent = (Number.isFinite(db) ? db.toFixed(0) : '–∞') + ' dB';
          } catch {}
        });
      } catch {}

      // ASR / Mic Calibration wiring
      try {
        const btn = q('asrCalibBtn');
        const chk = q('asrApplyHybrid');
        const prog = q('asrCalibProgress');
        const outNoise = q('asrNoiseDb');
        const outSpeech = q('asrSpeechDb');
        const outTon = q('asrTonDb');
        const outToff = q('asrToffDb');
        const attackInp = q('asrAttackMs');
        const releaseInp = q('asrReleaseMs');
        const VAD_PROF_KEY = 'tp_vad_profile_v1'; // legacy
        const ASR_KEY = 'tp_asr_profiles_v1';
        const UIPREF_KEY = 'tp_ui_prefs_v1';
        const APPLY_KEY = 'tp_vad_apply_hybrid';

        function readUiPrefs(){ try { return JSON.parse(localStorage.getItem(UIPREF_KEY)||'{}')||{}; } catch { return {}; } }
        function writeUiPrefs(p){ try { const cur = readUiPrefs(); localStorage.setItem(UIPREF_KEY, JSON.stringify({ ...cur, ...p })); } catch {} }

        function readAsrState(){ try { return JSON.parse(localStorage.getItem(ASR_KEY)||'{}')||{}; } catch { return {}; } }
        function writeAsrState(next){ try { localStorage.setItem(ASR_KEY, JSON.stringify(next||{})); } catch {} }
        function upsertAsrProfile(profile){
          try {
            const st = readAsrState();
            st.profiles = st.profiles || {};
            st.profiles[profile.id] = { ...profile, updatedAt: Date.now() };
            if (!st.activeProfileId) st.activeProfileId = profile.id;
            writeAsrState(st);
          } catch {}
        }
        function pickHybridProfile(){
          try {
            const st = readAsrState();
            const prefs = readUiPrefs();
            const id = prefs.hybridUseProfileId && st.profiles && st.profiles[prefs.hybridUseProfileId] ? prefs.hybridUseProfileId : st.activeProfileId;
            return id && st.profiles ? st.profiles[id] : null;
          } catch { return null; }
        }
        function updateHybridUsingUI(){
          try {
            const el = q('asrHybridUsing'); if (!el) return;
            const prof = pickHybridProfile();
            if (prof && prof.vad) {
              const v = prof.vad;
              el.textContent = `Using: ${prof.label||prof.id} • On ${Math.round(v.tonDb)} dB / Off ${Math.round(v.toffDb)} dB (${v.attackMs}/${v.releaseMs} ms)`;
            } else {
              el.textContent = 'Using: —';
            }
          } catch {}
        }
        // Restore prior profile (legacy readouts for continuity)
        try {
          const raw = localStorage.getItem(VAD_PROF_KEY);
          if (raw) {
            const p = JSON.parse(raw);
            if (outNoise && p && typeof p.noiseDb === 'number') outNoise.textContent = String(p.noiseDb.toFixed(0)) + ' dB';
            if (outSpeech && p && typeof p.speechDb === 'number') outSpeech.textContent = String(p.speechDb.toFixed(0)) + ' dB';
            if (outTon && p && typeof p.tonDb === 'number') outTon.textContent = String(p.tonDb.toFixed(0)) + ' dB';
            if (outToff && p && typeof p.toffDb === 'number') outToff.textContent = String(p.toffDb.toFixed(0)) + ' dB';
            if (attackInp && typeof p.attackMs === 'number') attackInp.value = String(p.attackMs);
            if (releaseInp && typeof p.releaseMs === 'number') releaseInp.value = String(p.releaseMs);
          }
          if (chk) chk.checked = localStorage.getItem(APPLY_KEY) === '1';
          updateHybridUsingUI();
        } catch {}

        // --- Calibration modal helpers ---
        function ensureCalibModal(){
          let wrap = document.getElementById('tp-calib-overlay');
          if (!document.getElementById('tp-calib-style')){
            const st = document.createElement('style');
            st.id = 'tp-calib-style';
            st.textContent = `
  #tp-calib-overlay{position:fixed;inset:0;background:rgba(0,0,0,.6);z-index:999998;display:none;align-items:center;justify-content:center}
  #tp-calib-panel{background:#0e1722;color:#d6dfeb;border:1px solid #25384d;border-radius:12px;box-shadow:0 10px 30px rgba(0,0,0,.4);width:min(520px,92vw);padding:20px}
  #tp-calib-title{font:600 18px/1.3 system-ui,sans-serif;margin:0 0 8px}
  #tp-calib-instr{opacity:.9;margin:0 0 12px}
  #tp-calib-count{font:700 56px/1.1 ui-monospace,Menlo,Consolas,monospace;text-align:center;margin:8px 0 4px}
  #tp-calib-phase{font:500 14px/1.2 system-ui,sans-serif;text-align:center;margin:0 0 12px}
  #tp-calib-actions{display:flex;gap:8px;justify-content:flex-end}
  #tp-calib-actions button{background:#16324a;color:#d6dfeb;border:1px solid #25384d;border-radius:8px;padding:8px 12px;cursor:pointer}
  #tp-calib-actions button[disabled]{opacity:.6;cursor:not-allowed}
            `;
            document.head.appendChild(st);
          }
          if (!wrap){
            wrap = document.createElement('div');
            wrap.id = 'tp-calib-overlay';
            wrap.innerHTML = `
  <div id="tp-calib-panel" role="dialog" aria-modal="true" aria-labelledby="tp-calib-title">
    <h2 id="tp-calib-title">Mic calibration</h2>
    <p id="tp-calib-instr">We’ll measure room noise, then your speaking level.</p>
    <div id="tp-calib-count">3</div>
    <div id="tp-calib-phase">Preparing…</div>
    <div id="tp-calib-actions">
      <button id="tp-calib-cancel">Cancel</button>
      <button id="tp-calib-close" style="display:none">Close</button>
    </div>
  </div>`;
            document.body.appendChild(wrap);
          }
          const panel = wrap.querySelector('#tp-calib-panel');
          const title = wrap.querySelector('#tp-calib-title');
          const instr = wrap.querySelector('#tp-calib-instr');
          const count = wrap.querySelector('#tp-calib-count');
          const phase = wrap.querySelector('#tp-calib-phase');
          const btnCancel = wrap.querySelector('#tp-calib-cancel');
          const btnClose = wrap.querySelector('#tp-calib-close');
          return { wrap, panel, title, instr, count, phase, btnCancel, btnClose };
        }
        function showCalibModal(){ try { const {wrap} = ensureCalibModal(); wrap.style.display = 'flex'; } catch {} }
        function hideCalibModal(){ try { const wrap = document.getElementById('tp-calib-overlay'); if (wrap) wrap.style.display = 'none'; } catch {} }
        // Expose globally so post-mount wiring can reuse
        try {
          window.ensureCalibModal = ensureCalibModal;
          window.showCalibModal = showCalibModal;
          window.hideCalibModal = hideCalibModal;
        } catch {}

        const measure = (ms) => new Promise((resolve) => {
          const vals = [];
          const onDb = (e) => { try { const db = (e && e.detail && typeof e.detail.db === 'number') ? e.detail.db : NaN; if (Number.isFinite(db)) vals.push(db); } catch {} };
          try { window.addEventListener('tp:db', onDb); } catch {}
          setTimeout(() => { try { window.removeEventListener('tp:db', onDb); } catch {} resolve(vals); }, ms);
        });
        const avg = (arr) => { if (!arr || !arr.length) return NaN; return arr.reduce((a,b)=>a+b,0)/arr.length; };

        function _startPhase(label, ms){
          try {
            if (!prog) return () => {};
            const t0 = Date.now();
            const update = () => {
              const elapsed = Date.now() - t0;
              const rem = Math.max(0, ms - elapsed);
              const secs = Math.ceil(rem / 1000);
              prog.textContent = label + ' ' + secs + 's';
            };
            update();
            const id = setInterval(update, 200);
            return () => { try { clearInterval(id); } catch {} };
          } catch { return () => {}; }
        }

        async function runCalibration(){
          try {
            const ui = ensureCalibModal();
            let canceled = false;
            const setPhase = (label, secs, hint) => {
              try {
                if (ui.title) ui.title.textContent = 'Mic calibration';
                if (ui.instr) ui.instr.textContent = hint || 'Follow the instructions below.';
                if (ui.phase) ui.phase.textContent = label;
                if (ui.count) ui.count.textContent = String(Math.max(0, Math.ceil(secs)));
              } catch {}
            };
            const countdown = (msTotal, updateLabel, hint) => {
              const t0 = Date.now();
              const tick = () => {
                const rem = Math.max(0, msTotal - (Date.now() - t0));
                setPhase(updateLabel, rem/1000, hint);
                if (!canceled && rem > 0) setTimeout(tick, 200);
              };
              tick();
            };
            showCalibModal();
            if (ui.btnClose) ui.btnClose.style.display = 'none';
            if (ui.btnCancel) {
              ui.btnCancel.disabled = false;
              ui.btnCancel.onclick = () => { canceled = true; hideCalibModal(); };
            }
            // Ensure mic is requested so dB events are flowing
            try { if (window.__tpMic && typeof window.__tpMic.requestMic === 'function') await window.__tpMic.requestMic(); } catch {}
            if (btn) { btn.disabled = true; btn.textContent = 'Calibrating…'; }
            if (prog) { prog.textContent = 'Preparing…'; }
            const atk = Math.max(20, Math.min(500, parseInt(attackInp && attackInp.value || '80', 10) || 80));
            const rel = Math.max(80, Math.min(1000, parseInt(releaseInp && releaseInp.value || '300', 10) || 300));
            // Phase 1: room noise
            setPhase('Step 1 — Stay quiet', 1.5, 'Please be silent while we measure room noise.');
            countdown(1500, 'Step 1 — Stay quiet', 'Please be silent while we measure room noise.');
            const noiseVals = await measure(1500);
            if (canceled) { if (btn) { btn.disabled = false; btn.textContent = 'Recalibrate'; } return; }
            const noise = avg(noiseVals);
            if (outNoise) outNoise.textContent = Number.isFinite(noise) ? (noise.toFixed(0) + ' dB') : '—';
            // Phase 2: speech
            setPhase('Step 2 — Speak', 1.8, 'Speak clearly at your normal volume.');
            countdown(1800, 'Step 2 — Speak', 'Speak clearly at your normal volume.');
            const speechVals = await measure(1800);
            if (canceled) { if (btn) { btn.disabled = false; btn.textContent = 'Recalibrate'; } return; }
            const speech = avg(speechVals);
            if (outSpeech) outSpeech.textContent = Number.isFinite(speech) ? (speech.toFixed(0) + ' dB') : '—';
            // Derive thresholds
            let ton = -30, toff = -36;
            if (Number.isFinite(noise) && Number.isFinite(speech)) {
              const minTon = noise + 8;
              const maxTon = speech - 4;
              ton = Math.min(-20, Math.max(minTon, Math.min(maxTon, -26)));
              toff = ton - 6;
            }
            if (outTon) outTon.textContent = ton.toFixed(0) + ' dB';
            if (outToff) outToff.textContent = toff.toFixed(0) + ' dB';
            // Persist to unified ASR store
            const deviceId = (function(){ try { return (document.getElementById('settingsMicSel')||{}).value || ''; } catch { return ''; } })();
            const id = `vad::${deviceId || 'unknown'}`;
            const asrProf = {
              id,
              label: 'VAD Cal',
              capture: { deviceId, sampleRateHz: 48000, channelCount: 1, echoCancellation: false, noiseSuppression: false, autoGainControl: false },
              cal: { noiseRmsDbfs: Number(noise||-50), noisePeakDbfs: Number((noise||-50)+6), speechRmsDbfs: Number(speech||-20), speechPeakDbfs: Number((speech||-20)+6), snrDb: Number((speech||-20) - (noise||-50)) },
              vad: { tonDb: Number(ton), toffDb: Number(toff), attackMs: Number(atk), releaseMs: Number(rel) },
              filters: {}, createdAt: Date.now(), updatedAt: Date.now()
            };
            upsertAsrProfile(asrProf);
            // Apply preference and apply flag
            if (chk && chk.checked) {
              try { localStorage.setItem(APPLY_KEY, '1'); } catch {}
              writeUiPrefs({ hybridUseProfileId: id });
            } else {
              try { localStorage.removeItem(APPLY_KEY); } catch {}
            }
            // Notify listeners (router can re-read profile)
            try { window.dispatchEvent(new CustomEvent('tp:vad:profile', { detail: asrProf })); } catch {}
            if (btn) { btn.disabled = false; btn.textContent = 'Recalibrate'; }
            if (prog) { prog.textContent = 'Saved'; setTimeout(() => { try { if (prog.textContent === 'Saved') prog.textContent = 'Ready'; } catch {} }, 1500); }
            try { if (window.toast) window.toast('Calibration saved', { type:'ok' }); } catch {}
            updateHybridUsingUI();
            try {
              if (ui.phase) ui.phase.textContent = 'Calibration complete';
              if (ui.instr) ui.instr.textContent = `Noise ${Number.isFinite(noise)?noise.toFixed(0):'—'} dB, Speech ${Number.isFinite(speech)?speech.toFixed(0):'—'} dB`;
              if (ui.count) ui.count.textContent = '';
              if (ui.btnCancel) ui.btnCancel.style.display = 'none';
              if (ui.btnClose) { ui.btnClose.style.display = ''; ui.btnClose.onclick = () => hideCalibModal(); }
            } catch {}
          } catch {}
        }
        if (btn && !btn.dataset.wired) { btn.dataset.wired = '1'; btn.addEventListener('click', runCalibration); }
        if (chk) chk.addEventListener('change', () => { try { localStorage.setItem(APPLY_KEY, chk.checked ? '1' : '0'); } catch {} });
        // Keep "Using:" label fresh on storage changes
        try {
          window.addEventListener('storage', (e) => {
            try { if (e && (e.key === ASR_KEY || e.key === UIPREF_KEY)) updateHybridUsingUI(); } catch {}
          });
        } catch {}
      } catch {}

      // Refresh device labels after permission grant
      window.addEventListener('tp:devices-refresh', () => { try { populateDevices(); } catch {} });

    } catch {}
  }

  // Run init when DOM is ready
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else setTimeout(init, 0);

  // Expose a mount function for overlay open handler
  try {
    window.__tp = window.__tp || {};
    window.__tp.settings = window.__tp.settings || {};
    if (typeof window.__tp.settings.mount !== 'function') {
      window.__tp.settings.mount = function(root){
        try {
          const el = root || document.getElementById('settingsBody');
          buildSettingsContent(el);
          // ensure latest devices are shown
          populateDevices();
          // After building, ensure tabs show active one
          const active = (document.querySelector('#settingsTabs .settings-tab.active')||null);
          showTab(active && active.getAttribute('data-tab') || 'general');
          // Critical post-mount wiring for controls that require existing DOM
          try {
            // Mic buttons (fallback wiring if delegates not active)
            if (!window.__tpSettingsDelegatesActive) {
              const reqBtn = q('settingsRequestMicBtn');
              const relBtn = q('settingsReleaseMicBtn');
              if (reqBtn && !reqBtn.dataset.wired) { reqBtn.dataset.wired='1'; reqBtn.addEventListener('click', async () => { try { await (window.__tpMic?.requestMic?.() || Promise.resolve()); } catch {} }); }
              if (relBtn && !relBtn.dataset.wired) { relBtn.dataset.wired='1'; relBtn.addEventListener('click', () => { try { window.__tpMic?.releaseMic?.(); } catch {} }); }
            }
          } catch {}
          try {
            // ASR / Mic Calibration post-mount wiring (in case init ran before content existed)
            (function(){
              const btn = q('asrCalibBtn');
              if (!btn || btn.dataset.wired) return;
              const chk = q('asrApplyHybrid');
              const prog = q('asrCalibProgress');
              const outNoise = q('asrNoiseDb');
              const outSpeech = q('asrSpeechDb');
              const outTon = q('asrTonDb');
              const outToff = q('asrToffDb');
              const attackInp = q('asrAttackMs');
              const releaseInp = q('asrReleaseMs');
              const VAD_PROF_KEY = 'tp_vad_profile_v1';
              const ASR_KEY = 'tp_asr_profiles_v1';
              const UIPREF_KEY = 'tp_ui_prefs_v1';
              const APPLY_KEY = 'tp_vad_apply_hybrid';

              function readUiPrefs(){ try { return JSON.parse(localStorage.getItem(UIPREF_KEY)||'{}')||{}; } catch { return {}; } }
              function writeUiPrefs(p){ try { const cur = readUiPrefs(); localStorage.setItem(UIPREF_KEY, JSON.stringify({ ...cur, ...p })); } catch {} }
              function readAsrState(){ try { return JSON.parse(localStorage.getItem(ASR_KEY)||'{}')||{}; } catch { return {}; } }
              function writeAsrState(next){ try { localStorage.setItem(ASR_KEY, JSON.stringify(next||{})); } catch {} }
              function upsertAsrProfile(profile){
                try {
                  const st = readAsrState();
                  st.profiles = st.profiles || {};
                  st.profiles[profile.id] = { ...profile, updatedAt: Date.now() };
                  if (!st.activeProfileId) st.activeProfileId = profile.id;
                  writeAsrState(st);
                } catch {}
              }
              function pickHybridProfile(){
                try {
                  const st = readAsrState();
                  const prefs = readUiPrefs();
                  const id = prefs.hybridUseProfileId && st.profiles && st.profiles[prefs.hybridUseProfileId] ? prefs.hybridUseProfileId : st.activeProfileId;
                  return id && st.profiles ? st.profiles[id] : null;
                } catch { return null; }
              }
              function updateHybridUsingUI(){
                try {
                  const el = q('asrHybridUsing'); if (!el) return;
                  const prof = pickHybridProfile();
                  if (prof && prof.vad) {
                    const v = prof.vad;
                    el.textContent = `Using: ${prof.label||prof.id} • On ${Math.round(v.tonDb)} dB / Off ${Math.round(v.toffDb)} dB (${v.attackMs}/${v.releaseMs} ms)`;
                  } else {
                    el.textContent = 'Using: —';
                  }
                } catch {}
              }
              // Restore prior profile UI snippets
              try {
                const raw = localStorage.getItem(VAD_PROF_KEY);
                if (raw) {
                  const p = JSON.parse(raw);
                  if (outNoise && p && typeof p.noiseDb === 'number') outNoise.textContent = String(p.noiseDb.toFixed(0)) + ' dB';
                  if (outSpeech && p && typeof p.speechDb === 'number') outSpeech.textContent = String(p.speechDb.toFixed(0)) + ' dB';
                  if (outTon && p && typeof p.tonDb === 'number') outTon.textContent = String(p.tonDb.toFixed(0)) + ' dB';
                  if (outToff && p && typeof p.toffDb === 'number') outToff.textContent = String(p.toffDb.toFixed(0)) + ' dB';
                  if (attackInp && typeof p.attackMs === 'number') attackInp.value = String(p.attackMs);
                  if (releaseInp && typeof p.releaseMs === 'number') releaseInp.value = String(p.releaseMs);
                }
                if (chk) chk.checked = localStorage.getItem(APPLY_KEY) === '1';
                updateHybridUsingUI();
              } catch {}

              const measure = (ms) => new Promise((resolve) => {
                const vals = [];
                const onDb = (e) => { try { const db = (e && e.detail && typeof e.detail.db === 'number') ? e.detail.db : NaN; if (Number.isFinite(db)) vals.push(db); } catch {} };
                try { window.addEventListener('tp:db', onDb); } catch {}
                setTimeout(() => { try { window.removeEventListener('tp:db', onDb); } catch {} resolve(vals); }, ms);
              });
              const avg = (arr) => { if (!arr || !arr.length) return NaN; return arr.reduce((a,b)=>a+b,0)/arr.length; };
              // legacy in-panel countdown helper (unused after modal flow retained for back-compat)
              function _startPhase(label, ms){
                try {
                  if (!prog) return () => {};
                  const t0 = Date.now();
                  const update = () => {
                    const elapsed = Date.now() - t0;
                    const rem = Math.max(0, ms - elapsed);
                    const secs = Math.ceil(rem / 1000);
                    prog.textContent = label + ' ' + secs + 's';
                  };
                  update();
                  const id = setInterval(update, 200);
                  return () => { try { clearInterval(id); } catch {} };
                } catch { return () => {}; }
              }
              async function runCalibration(){
                try {
                  // Reuse modal helpers from the initial wiring block if available
                  const ensureCalibModal = (window.ensureCalibModal) || (function(){
                    return function(){
                      // Create style if missing
                      if (!document.getElementById('tp-calib-style')){
                        const st = document.createElement('style');
                        st.id = 'tp-calib-style';
                        st.textContent = `
  #tp-calib-overlay{position:fixed;inset:0;background:rgba(0,0,0,.6);z-index:999998;display:none;align-items:center;justify-content:center}
  #tp-calib-panel{background:#0e1722;color:#d6dfeb;border:1px solid #25384d;border-radius:12px;box-shadow:0 10px 30px rgba(0,0,0,.4);width:min(520px,92vw);padding:20px}
  #tp-calib-title{font:600 18px/1.3 system-ui,sans-serif;margin:0 0 8px}
  #tp-calib-instr{opacity:.9;margin:0 0 12px}
  #tp-calib-count{font:700 56px/1.1 ui-monospace,Menlo,Consolas,monospace;text-align:center;margin:8px 0 4px}
  #tp-calib-phase{font:500 14px/1.2 system-ui,sans-serif;text-align:center;margin:0 0 12px}
  #tp-calib-actions{display:flex;gap:8px;justify-content:flex-end}
  #tp-calib-actions button{background:#16324a;color:#d6dfeb;border:1px solid #25384d;border-radius:8px;padding:8px 12px;cursor:pointer}
  #tp-calib-actions button[disabled]{opacity:.6;cursor:not-allowed}
                        `;
                        document.head.appendChild(st);
                      }
                      // Create overlay if missing
                      let wrap = document.getElementById('tp-calib-overlay');
                      if (!wrap){
                        wrap = document.createElement('div');
                        wrap.id = 'tp-calib-overlay';
                        wrap.innerHTML = `
  <div id="tp-calib-panel" role="dialog" aria-modal="true" aria-labelledby="tp-calib-title">
    <h2 id="tp-calib-title">Mic calibration</h2>
    <p id="tp-calib-instr">We’ll measure room noise, then your speaking level.</p>
    <div id="tp-calib-count">3</div>
    <div id="tp-calib-phase">Preparing…</div>
    <div id="tp-calib-actions">
      <button id="tp-calib-cancel">Cancel</button>
      <button id="tp-calib-close" style="display:none">Close</button>
    </div>
  </div>`;
                        document.body.appendChild(wrap);
                      }
                      const title = wrap.querySelector('#tp-calib-title');
                      const instr = wrap.querySelector('#tp-calib-instr');
                      const count = wrap.querySelector('#tp-calib-count');
                      const phase = wrap.querySelector('#tp-calib-phase');
                      const btnCancel = wrap.querySelector('#tp-calib-cancel');
                      const btnClose = wrap.querySelector('#tp-calib-close');
                      return { wrap, title, instr, count, phase, btnCancel, btnClose };
                    }
                  })();
                  const showCalibModal = (window.showCalibModal) || (function(){ return function(){ const el=document.getElementById('tp-calib-overlay') || ensureCalibModal().wrap; if (el) el.style.display='flex'; } })();
                  const hideCalibModal = (window.hideCalibModal) || (function(){ return function(){ const el=document.getElementById('tp-calib-overlay'); if (el) el.style.display='none'; } })();

                  const ui = ensureCalibModal();
                  let canceled = false;
                  const setPhase = (label, secs, hint) => {
                    try { ui.title && (ui.title.textContent = 'Mic calibration'); } catch {}
                    try { ui.instr && (ui.instr.textContent = hint || 'Follow the instructions below.'); } catch {}
                    try { ui.phase && (ui.phase.textContent = label); } catch {}
                    try { ui.count && (ui.count.textContent = String(Math.max(0, Math.ceil(secs)))); } catch {}
                  };
                  const countdown = (msTotal, updateLabel, hint) => {
                    const t0 = Date.now();
                    const tick = () => {
                      const rem = Math.max(0, msTotal - (Date.now() - t0));
                      setPhase(updateLabel, rem/1000, hint);
                      if (!canceled && rem > 0) setTimeout(tick, 200);
                    };
                    tick();
                  };
                  showCalibModal();
                  if (ui.btnClose) ui.btnClose.style.display = 'none';
                  if (ui.btnCancel) { ui.btnCancel.disabled = false; ui.btnCancel.onclick = () => { canceled = true; hideCalibModal(); }; }

                  try { if (window.__tpMic && typeof window.__tpMic.requestMic === 'function') await window.__tpMic.requestMic(); } catch {}
                  if (btn) { btn.disabled = true; btn.textContent = 'Calibrating…'; }
                  if (prog) { prog.textContent = 'Preparing…'; }
                  const atk = Math.max(20, Math.min(500, parseInt(attackInp && attackInp.value || '80', 10) || 80));
                  const rel = Math.max(80, Math.min(1000, parseInt(releaseInp && releaseInp.value || '300', 10) || 300));
                  setPhase('Step 1 — Stay quiet', 1.5, 'Please be silent while we measure room noise.');
                  countdown(1500, 'Step 1 — Stay quiet', 'Please be silent while we measure room noise.');
                  const noiseVals = await measure(1500);
                  if (canceled) { if (btn) { btn.disabled = false; btn.textContent = 'Recalibrate'; } return; }
                  const noise = avg(noiseVals);
                  if (outNoise) outNoise.textContent = Number.isFinite(noise) ? (noise.toFixed(0) + ' dB') : '—';
                  setPhase('Step 2 — Speak', 1.8, 'Speak clearly at your normal volume.');
                  countdown(1800, 'Step 2 — Speak', 'Speak clearly at your normal volume.');
                  const speechVals = await measure(1800);
                  if (canceled) { if (btn) { btn.disabled = false; btn.textContent = 'Recalibrate'; } return; }
                  const speech = avg(speechVals);
                  if (outSpeech) outSpeech.textContent = Number.isFinite(speech) ? (speech.toFixed(0) + ' dB') : '—';
                  let ton = -30, toff = -36;
                  if (Number.isFinite(noise) && Number.isFinite(speech)) {
                    const minTon = noise + 8;
                    const maxTon = speech - 4;
                    ton = Math.min(-20, Math.max(minTon, Math.min(maxTon, -26)));
                    toff = ton - 6;
                  }
                  if (outTon) outTon.textContent = ton.toFixed(0) + ' dB';
                  if (outToff) outToff.textContent = toff.toFixed(0) + ' dB';
                  const deviceId = (function(){ try { return (document.getElementById('settingsMicSel')||{}).value || ''; } catch { return ''; } })();
                  const id = `vad::${deviceId || 'unknown'}`;
                  const asrProf = {
                    id,
                    label: 'VAD Cal',
                    capture: { deviceId, sampleRateHz: 48000, channelCount: 1, echoCancellation: false, noiseSuppression: false, autoGainControl: false },
                    cal: { noiseRmsDbfs: Number(noise||-50), noisePeakDbfs: Number((noise||-50)+6), speechRmsDbfs: Number(speech||-20), speechPeakDbfs: Number((speech||-20)+6), snrDb: Number((speech||-20) - (noise||-50)) },
                    vad: { tonDb: Number(ton), toffDb: Number(toff), attackMs: Number(atk), releaseMs: Number(rel) },
                    filters: {}, createdAt: Date.now(), updatedAt: Date.now()
                  };
                  upsertAsrProfile(asrProf);
                  if (chk && chk.checked) {
                    try { localStorage.setItem(APPLY_KEY, '1'); } catch {}
                    writeAsrState({ ...(readAsrState()), activeProfileId: id });
                    writeUiPrefs({ hybridUseProfileId: id });
                  } else {
                    try { localStorage.removeItem(APPLY_KEY); } catch {}
                  }
                  try { window.dispatchEvent(new CustomEvent('tp:vad:profile', { detail: asrProf })); } catch {}
                  if (btn) { btn.disabled = false; btn.textContent = 'Recalibrate'; }
                  if (prog) { prog.textContent = 'Saved'; setTimeout(() => { try { if (prog.textContent === 'Saved') prog.textContent = 'Ready'; } catch {} }, 1500); }
                  try { if (window.toast) window.toast('Calibration saved', { type:'ok' }); } catch {}
                  updateHybridUsingUI();
                  try {
                    if (ui.phase) ui.phase.textContent = 'Calibration complete';
                    if (ui.instr) ui.instr.textContent = `Noise ${Number.isFinite(noise)?noise.toFixed(0):'—'} dB, Speech ${Number.isFinite(speech)?speech.toFixed(0):'—'} dB`;
                    if (ui.count) ui.count.textContent = '';
                    if (ui.btnCancel) ui.btnCancel.style.display = 'none';
                    if (ui.btnClose) { ui.btnClose.style.display = ''; ui.btnClose.onclick = () => hideCalibModal(); }
                  } catch {}
                } catch {}
              }
              btn.dataset.wired = '1';
              btn.addEventListener('click', runCalibration);
              if (chk) chk.addEventListener('change', () => { try { localStorage.setItem(APPLY_KEY, chk.checked ? '1' : '0'); } catch {} });
              try {
                window.addEventListener('storage', (e) => {
                  try { if (e && (e.key === ASR_KEY || e.key === UIPREF_KEY)) updateHybridUsingUI(); } catch {}
                });
              } catch {}
            })();
          } catch {}
          try {
            // Typography + width (idempotent wiring)
            // If TS is driving typography, skip legacy listeners & writes
            if (window.__tpTsTypographyActive) {
              // no-op: TS path owns typography and wheel bindings
            } else {
            const fsS = q('settingsFontSize');
            const lhS = q('settingsLineHeight');
            const maxChMain = q('settingsMaxChMain');
            const maxChDisp = q('settingsMaxChDisplay');
            const applyVars = () => {
              try {
                const root = document.documentElement;
                const fs = fsS && fsS.value ? Number(fsS.value) : NaN;
                const lh = lhS && lhS.value ? Number(lhS.value) : NaN;
                if (Number.isFinite(fs)) root.style.setProperty('--tp-font-size', String(fs) + 'px');
                if (Number.isFinite(lh)) root.style.setProperty('--tp-line-height', String(lh));
                try { window.dispatchEvent(new Event('tp:lineMetricsDirty')); } catch {}
                // persist under tp_typography_v1 (main)
                const KEY = 'tp_typography_v1';
                const raw = localStorage.getItem(KEY);
                const st = raw ? JSON.parse(raw) : {};
                st.main = { ...(st.main||{}),
                  ...(Number.isFinite(fs)?{fontSizePx:fs}:{ }),
                  ...(Number.isFinite(lh)?{lineHeight:lh}:{ })
                };
                localStorage.setItem(KEY, JSON.stringify(st));
                // immediate broadcast to display
                const payload = { kind:'tp:typography', source:'main', display:'display', t: { fontSizePx: fs, lineHeight: lh } };
                try { new BroadcastChannel('tp_display').postMessage(payload); } catch {}
                try { const w = window.__tpDisplayWindow; if (w && !w.closed) w.postMessage(payload, '*'); } catch {}
              } catch {}
            };
            if (fsS && !fsS.dataset.wired) { fsS.dataset.wired='1'; fsS.addEventListener('input', applyVars); }
            if (lhS && !lhS.dataset.wired) { lhS.dataset.wired='1'; lhS.addEventListener('input', applyVars); }
            const setRootMaxCh = (val) => {
              try {
                const n = Math.max(40, Math.min(140, Number(val)));
                if (!Number.isFinite(n)) return;
                document.documentElement.style.setProperty('--tp-maxch', String(n));
                const KEY = 'tp_typography_v1';
                const raw = localStorage.getItem(KEY);
                const st = raw ? JSON.parse(raw) : {};
                st.main = { ...(st.main||{}), maxLineWidthCh: n };
                localStorage.setItem(KEY, JSON.stringify(st));
                window.dispatchEvent(new Event('tp:lineMetricsDirty'));
              } catch {}
            };
            const sendToDisplayTypography = (t) => {
              try {
                const payload = { kind:'tp:typography', source:'main', display:'display', t: { ...t } };
                try { new BroadcastChannel('tp_display').postMessage(payload); } catch {}
                try { const w = window.__tpDisplayWindow; if (w && !w.closed) w.postMessage(payload, '*'); } catch {}
              } catch {}
            };
            if (maxChMain && !maxChMain.dataset.wired) { maxChMain.dataset.wired='1'; maxChMain.addEventListener('input', () => setRootMaxCh(maxChMain.value)); }
            if (maxChDisp && !maxChDisp.dataset.wired) { maxChDisp.dataset.wired='1'; maxChDisp.addEventListener('input', () => {
              try {
                const n = Math.max(40, Math.min(140, Number(maxChDisp.value)));
                if (!Number.isFinite(n)) return;
                const KEY = 'tp_typography_v1';
                const raw = localStorage.getItem(KEY);
                const st = raw ? JSON.parse(raw) : {};
                st.display = { ...(st.display||{}), maxLineWidthCh: n };
                localStorage.setItem(KEY, JSON.stringify(st));
                sendToDisplayTypography({ maxLineWidthCh: n });
              } catch {}
            }); }
            }
          } catch {}
        } catch {}
      };
    }
  } catch {}

})();
