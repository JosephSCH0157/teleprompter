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
        '  <div class="row">Application settings will appear here.</div>',
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
        '  <div class="row">',
        '    <label><input type="checkbox" id="settingsEnableObs"/> Enable OBS</label>',
        '  </div>',
        '  <div class="row">',
        '    <label>Scene <input id="settingsObsScene" type="text" class="select-md" placeholder="Scene name"/></label>',
        '    <label><input type="checkbox" id="settingsObsReconnect"/> Auto-reconnect</label>',
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

      // Wire OBS Scene/Auto-reconnect
      const obsScene = q('settingsObsScene');
      const obsReconn = q('settingsObsReconnect');
      if (obsScene && hasStore) obsScene.addEventListener('input', () => S.set('obsScene', String(obsScene.value||'')));
      if (obsReconn && hasStore) obsReconn.addEventListener('change', () => S.set('obsReconnect', !!obsReconn.checked));
      if (hasStore && typeof S.subscribe === 'function') {
        S.subscribe('obsScene', v => { try { if (obsScene && obsScene.value !== v) obsScene.value = v || ''; } catch {} });
        S.subscribe('obsReconnect', v => { try { if (obsReconn && obsReconn.checked !== !!v) obsReconn.checked = !!v; } catch {} });
      }

      // Wire OBS toggle wiring behavior to use S.set('obsEnabled') as source-of-truth
      if (hasStore && typeof S.subscribe === 'function') {
        S.subscribe('obsEnabled', v => {
          try {
            const pill = document.getElementById('obsStatusText') || document.getElementById('obsStatus');
            if (pill) pill.textContent = v ? 'enabled' : 'disabled';
          } catch {}
        });
      }

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
