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
        '    <button id="settingsRequestMicBtn" class="chip">Request mic</button>',
        '    <button id="settingsReleaseMicBtn" class="chip">Release mic</button>',
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
  '    <button id="settingsObsTest" class="chip btn-chip" type="button">Test connection</button>',
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

      // Wire settings overlay mic buttons (fallback to window.__tpMic when available)
      try {
        const reqBtn = q('settingsRequestMicBtn');
        const relBtn = q('settingsReleaseMicBtn');
        if (reqBtn) reqBtn.addEventListener('click', async () => { try { await (window.__tpMic?.requestMic?.() || Promise.resolve()); } catch {} });
        if (relBtn) relBtn.addEventListener('click', () => { try { window.__tpMic?.releaseMic?.(); } catch {} });
      } catch {}

      // Wire mic device selector (persist to store when available; mirror main panel select)
      try {
        const sel = q('settingsMicSel');
        if (sel) sel.addEventListener('change', () => {
          try { if (hasStore) S.set('micDevice', sel.value); } catch {}
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
        settingsMicSel.addEventListener('change', () => S.set('micDevice', settingsMicSel.value));
      }
      if (hasStore && typeof S.subscribe === 'function') {
        S.subscribe('micDevice', v => {
          try {
            if (settingsMicSel && settingsMicSel.value !== v) settingsMicSel.value = v || '';
            if (micDeviceSel && micDeviceSel.value !== v) micDeviceSel.value = v || '';
          } catch {}
        });
      }

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
        const fsS = q('settingsFontSize');
        const lhS = q('settingsLineHeight');
        const fsMain = q('fontSize');
        const lhMain = q('lineHeight');
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
          } catch {}
        };
        if (fsS) fsS.addEventListener('input', applyFromSettings);
        if (lhS) lhS.addEventListener('input', applyFromSettings);
        // Initial sync: prefer existing main values or stored values
        try {
          const storedFS = (function(){ try { return localStorage.getItem('tp_font_size_v1'); } catch { return null; } })();
          const storedLH = (function(){ try { return localStorage.getItem('tp_line_height_v1'); } catch { return null; } })();
          if (fsS) fsS.value = (fsMain && fsMain.value) || storedFS || '48';
          if (lhS) lhS.value = (lhMain && lhMain.value) || storedLH || '1.35';
          applyFromSettings();
        } catch {}
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
      const obsPassS = q('settingsObsPass');
      const mainPass = q('obsPassword');
      if (obsUrlS && mainUrl) {
        obsUrlS.addEventListener('input', () => { try { if (mainUrl.value !== obsUrlS.value) mainUrl.value = obsUrlS.value; } catch {} });
        mainUrl.addEventListener('input', () => { try { if (obsUrlS.value !== mainUrl.value) obsUrlS.value = mainUrl.value; } catch {} });
      }
      if (obsPassS && mainPass) {
        obsPassS.addEventListener('input', () => { try { if (mainPass.value !== obsPassS.value) mainPass.value = obsPassS.value; } catch {} });
        mainPass.addEventListener('input', () => { try { if (obsPassS.value !== mainPass.value) obsPassS.value = mainPass.value; } catch {} });
      }

      // Wire OBS Host/Password/Scene/Auto-reconnect
      const obsHost = q('settingsObsHost');
      const obsPass = q('settingsObsPassword');
      const obsScene = q('settingsObsScene');
      const obsReconn = q('settingsObsReconnect');
      const obsTestBtn = q('settingsObsTest');
      const obsTestMsg = q('settingsObsTestMsg');
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

      // OBS Test connection button
      if (obsTestBtn) {
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
        } catch {}
      };
    }
  } catch {}

})();
