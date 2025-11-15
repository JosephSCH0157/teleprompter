(function(){
  // Settings UI centralization: binds overlay and main panel; tolerates no-store mode
  const S = window.__tpStore;
  const hasStore = !!S;
  let __recBusy = false; // 'starting' | 'recording' | 'stopping' → block adapter changes

  // Unified recorder state listener
  try {
    window.addEventListener('rec:state', (e) => {
      try {
        const s = e && e.detail && e.detail.state;
        __recBusy = (s === 'starting' || s === 'recording' || s === 'stopping');
      } catch {}
    }, { passive: true });
  } catch {}

  function q(id) { return document.getElementById(id); }

  function showTab(tab){
    try {
      const tabs = Array.from(document.querySelectorAll('#settingsTabs .settings-tab'));
      tabs.forEach(t => t.classList.toggle('active', t.dataset.tab === tab));
      const sb = document.getElementById('settingsBody');
      if (!sb) return;
      // Toggle builder sections ([data-tab-content])
      const dyn = Array.from(sb.querySelectorAll('[data-tab-content]'));
      dyn.forEach(c => { c.style.display = (c.getAttribute('data-tab-content') === tab) ? '' : 'none'; });
      // Toggle static cards (.settings-card[data-tab]) — keep parity with HTML variant
      const stat = Array.from(sb.querySelectorAll('.settings-card[data-tab]'));
      stat.forEach(c => {
        const on = (c.getAttribute('data-tab') === tab);
        if (on) c.removeAttribute('hidden'); else c.setAttribute('hidden','');
      });
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
  '    <label>Target WPM <input id="settingsWpmTarget" type="number" min="60" max="260" step="5" class="select-md" placeholder="150"/></label>',
  '    <span id="settingsWpmPx" class="microcopy" style="margin-left:6px;color:#9fb4c9;font-size:12px">≈ — px/s</span>',
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
  '    <label><input type="checkbox" id="settingsAutoRecord"/> Auto-save camera + mic when Speech Sync runs</label>',
        '  </div>',
        '  <div class="row" id="autoRecordFolderRow">',
        '    <span class="microcopy" style="color:#9fb4c9;font-size:12px">Folder: <span id="autoRecordFolderName">Not set</span></span>',
        '    <button id="autoRecordPickBtn" class="chip" type="button">Change auto-save folder…</button>',
        '    <button id="autoRecordClearBtn" class="chip" type="button">Clear</button>',
        '  </div>',
        '  <div class="row">',
        '    <label>Pre-roll (sec) <input id="settingsPreroll" type="number" min="0" max="10" step="1" class="select-md"/></label>',
        '  </div>',
    '  <h4>Recording adapters</h4>',
    '  <div class="row settings-inline-row" id="recAdaptersRow">',
    '    <div id="recAdaptersList" class="rec-list" style="display:flex;flex-wrap:wrap;gap:10px"></div>',
    '  </div>',
    '  <div class="row settings-inline-row">',
    '    <label class="tp-check"><input type="checkbox" id="recModeSingle"/> Single mode (one adapter at a time)</label>',
    '    <button id="recAdaptersRefresh" class="chip btn-chip" type="button">Refresh status</button>',
    '    <span id="recAdaptersHint" class="microcopy" style="color:#9fb4c9;font-size:12px">Pick which integrations to trigger when Auto‑record is on.</span>',
    '  </div>',
  '  <div class="settings-subgroup" id="recAdaptersConfig"></div>',
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
  '    <label><input type="checkbox" id="settingsHudProd"/> Show Transcript HUD in production</label>',
        '  </div>',
        '  <div class="row">',
        '    <button id="settingsResetState" class="chip">Reset app state</button>',
        '  </div>',
        '</div>',
        '',
        // Pricing — mirror static card content in HTML build
        '<div data-tab-content="pricing" style="display:none">',
        '  <h4>Pricing</h4>',
        '  <div class="row">',
        '    <p class="microcopy" style="color:#9fb4c9">',
        '      Anvil starts with a free tier for solo creators. Paid plans unlock advanced features like',
        '      multi-recorder control, hybrid scroll tuning presets, and future Forge integrations.',
        '    </p>',
        '  </div>',
        '  <ul class="microcopy" style="color:#9fb4c9">',
        '    <li><strong>Free:</strong> Core teleprompter, script saving, basic OBS control.</li>',
        '    <li><strong>Creator:</strong> Auto-record presets, hybrid scroll profiles, priority fixes.</li>',
        '    <li><strong>Studio:</strong> Multi-seat, shared presets, dedicated support. (Coming soon)</li>',
        '  </ul>',
        '  <div class="hr"></div>',
        '  <div class="row">',
        '    <p>Want to keep Anvil’s hammer swinging while this all ships?<br/>',
        '      <a href="https://buymeacoffee.com/podcastersforge" target="_blank" rel="noopener noreferrer">Buy me a coffee ☕</a>',
        '    </p>',
        '  </div>',
        '</div>',
        '',
        // About — includes #aboutVersion so the version filler can target it
        '<div data-tab-content="about" style="display:none">',
        '  <h4>About Anvil</h4>',
        '  <p class="microcopy" style="color:#9fb4c9">',
        '    Anvil is the teleprompter built for working creators — podcasters, YouTubers, and anyone recording without a full studio team.',
        '    It keeps your script, timing, and on‑screen tools in one place so you can focus on the delivery, not the juggling act.',
        '  </p>',
        '  <p class="microcopy" style="color:#9fb4c9">',
        '    Anvil is part of the Podcaster’s Forge toolset, an all‑in‑one workflow for writing, reading, and shipping shows from a single browser tab instead of ten different apps.',
        '  </p>',
        '  <ul class="microcopy" style="color:#9fb4c9">',
        '    <li>Smart scrolling modes for live reads and rehearsals</li>',
        '    <li>Color‑coded speakers and notes for easier performance</li>',
        '    <li>Script loading from local files instead of cloud lock‑in</li>',
        '    <li>OBS‑friendly layout designed for recording days</li>',
        '  </ul>',
        '  <div class="hr"></div>',
        '  <p class="microcopy" style="color:#9fb4c9">',
        '    You’re currently using Anvil <span id="aboutVersion">—</span>.<br/>',
        '    Built by the Podcaster’s Forge project.',
        '  </p>',
        '</div>'
      ].join('\n');
      rootEl.innerHTML = html;
      rootEl.dataset.mounted = '1';
      // Fill About version if available (works even when replacing static HTML later)
      try {
        const el = document.getElementById('aboutVersion');
        if (el) {
          let v = '';
          try { v = String(window.APP_VERSION || ''); } catch {}
          if (!v) {
            try { const av = document.getElementById('appVersion'); v = (av && av.textContent) ? av.textContent.trim() : ''; } catch {}
          }
          if (v) el.textContent = v;
        }
      } catch {}
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

  // --- Recording adapters picker: define once and call after settings DOM exists ---
  let __recAdaptersInitDone = false;
  let __recMod = null; // cached recorders module
  async function __ensureRecordersMod(){
    if (!__recMod) {
      try { __recMod = await import('/recorders.js'); } catch {}
    }
    return __recMod;
  }
  function __statusChip(txt, kind){
    const span = document.createElement('span');
    span.textContent = txt;
    span.style.marginLeft = '6px';
    span.style.opacity = '.9';
    span.style.fontSize = '12px';
    span.style.color = kind === 'ok' ? '#b7f4c9' : (kind === 'warn' ? '#ffdca8' : '#ffd6d6');
    return span;
  }
  async function initRecorderAdaptersUI(){
    try {
      const listEl = document.getElementById('recAdaptersList');
      const refreshBtn = document.getElementById('recAdaptersRefresh');
      const modeSingle = document.getElementById('recModeSingle');
      if (!listEl) return; // settings content not mounted yet

      // Prevent double-wiring while still allowing re-render calls
      if (!listEl.dataset.wired){
        listEl.dataset.wired = '1';
        __recAdaptersInitDone = true;
      }

      const KNOWN = [
        { id: 'obs', label: 'OBS' },
        { id: 'bridge', label: 'Bridge' },
        { id: 'descript', label: 'Descript' },
        { id: 'premiere', label: 'Adobe Premiere Pro' },
        { id: 'rev', label: 'Rev' },
      ];

      async function readState(){
        await __ensureRecordersMod();
        try { return __recMod?.getSettings?.() || { mode:'multi', selected: [] }; } catch { return { mode:'multi', selected: [] }; }
      }

      async function render(){
        const st = await readState();
        listEl.innerHTML = '';
        if (modeSingle) modeSingle.checked = (st.mode === 'single');
        for (const k of KNOWN){
          const item = document.createElement('label');
          item.className = 'tp-check';
          item.style.display = 'inline-flex';
          item.style.alignItems = 'center';
          item.style.gap = '6px';
          const box = document.createElement('input');
          box.type = 'checkbox';
          box.dataset.id = k.id;
          box.checked = Array.isArray(st.selected) && st.selected.includes(k.id);
          const text = document.createElement('span');
          text.textContent = k.label;
          item.appendChild(box); item.appendChild(text);
          const chip = __statusChip('checking…', 'warn');
          chip.id = 'rec-adapter-chip-' + k.id;
          item.appendChild(chip);
          listEl.appendChild(item);

          // availability probe (best-effort)
          (async () => {
            try {
              await __ensureRecordersMod();
              const a = __recMod?.get?.(k.id);
              if (a && typeof a.isAvailable === 'function') {
                const ok = await a.isAvailable();
                let kind = ok ? 'ok' : 'err';
                let label = ok ? 'available' : 'unavailable';
                try {
                  if (k.id === 'obs' && window.__obsBridge && typeof window.__obsBridge.isConnected === 'function') {
                    const conn = !!window.__obsBridge.isConnected();
                    if (conn) { kind = 'ok'; label = 'connected'; }
                  }
                } catch {}
                chip.textContent = '(' + label + ')';
                chip.style.color = kind === 'ok' ? '#b7f4c9' : '#ffd6d6';
              } else {
                chip.textContent = '(unavailable)';
                chip.style.color = '#ffd6d6';
              }
            } catch {
              chip.textContent = '(unavailable)';
              chip.style.color = '#ffd6d6';
            }
          })();

          box.addEventListener('change', async () => {
            // Block changes while recording
            if (__recBusy) {
              try { box.checked = !box.checked; } catch {}
              try { (window.toast || ((m)=>console.debug('[toast]', m)))('Can’t change adapters while recording. Stop first.', { type: 'warn' }); } catch {}
              return;
            }
            try {
              const boxes = Array.from(listEl.querySelectorAll('input[type="checkbox"][data-id]'));
              let ids = boxes.filter(b => b.checked).map(b => String(b.dataset.id||''));
              if (modeSingle && modeSingle.checked && ids.length > 1) {
                ids = [ String(box.dataset.id||'') ];
                for (const b of boxes) { if (b !== box) b.checked = false; }
              }
              await __ensureRecordersMod();
              __recMod?.setSelected?.(ids);
            } catch {}
          }, { capture: true });
        }
      }

      async function renderConfig(){
        const wrap = document.getElementById('recAdaptersConfig');
        if (!wrap) return;
        await __ensureRecordersMod();
        const st = (await readState()) || {};
        const premCfg = (st.configs && st.configs.premiere) || { startHotkey:'Ctrl+R', stopHotkey:'', baseUrl:'http://127.0.0.1:5723' };
        const bridgeCfgRaw = (st.configs && st.configs.bridge) || { startUrl:'http://127.0.0.1:5723/record/start', stopUrl:'' };
        // Infer bridge mode/base/hotkeys from URLs if not explicitly saved
        const inferBridge = (() => {
          const out = { mode: 'http', baseUrl: 'http://127.0.0.1:5723', startHotkey: 'Ctrl+R', stopHotkey: '' };
          try {
            const su = String(bridgeCfgRaw.startUrl||'');
            const bu = su.replace(/\/+$/, '');
            if (/\/send(?:\?|$)/.test(su)) {
              out.mode = 'hotkey';
              try {
                const u = new URL(su, window.location.href);
                const b = u.origin + u.pathname.replace(/\/send$/, '');
                const k = u.searchParams.get('keys') || 'Ctrl+R';
                out.baseUrl = b.replace(/\/+$/, '');
                out.startHotkey = k;
              } catch {}
            } else {
              out.mode = 'http';
              try {
                const m = bu.match(/^(.*)\/record\/start$/);
                if (m) out.baseUrl = m[1];
              } catch {}
            }
            if (bridgeCfgRaw.stopUrl) {
              if (/\/send(?:\?|$)/.test(bridgeCfgRaw.stopUrl||'')) {
                try {
                  const u2 = new URL(String(bridgeCfgRaw.stopUrl||''), window.location.href);
                  out.stopHotkey = u2.searchParams.get('keys') || '';
                } catch {}
              }
            }
          } catch {}
          // Prefer explicitly saved fields if present
          const explicit = {
            mode: bridgeCfgRaw.mode || out.mode,
            baseUrl: bridgeCfgRaw.baseUrl || out.baseUrl,
            startHotkey: bridgeCfgRaw.startHotkey || out.startHotkey,
            stopHotkey: bridgeCfgRaw.stopHotkey || out.stopHotkey,
          };
          return explicit;
        })();

        // Bridge + Premiere config cards
        const html = [
          '<div class="card">',
          '  <h5 style="margin:6px 0 8px">Bridge</h5>',
          '  <div class="row" style="gap:10px;align-items:center">',
          '    <label>Mode',
          '      <select id="bridgeMode" class="select-sm">',
          '        <option value="http">HTTP hooks</option>',
          '        <option value="hotkey">Hotkey bridge</option>',
          '      </select>',
          '    </label>',
          '    <span class="microcopy" style="color:#9fb4c9;font-size:12px">Hotkey mode uses tools/hotkey_bridge.ps1</span>',
          '  </div>',
          '  <div class="row" style="gap:10px;align-items:center;margin-top:6px">',
          '    <button id="bridgeTestStart" class="chip btn-chip" type="button">Start (SSOT)</button>',
          '    <button id="bridgeTestStop" class="chip btn-chip" type="button">Stop (SSOT)</button>',
          '    <span id="bridgeSSOTMsg" class="microcopy" style="color:#9fb4c9;font-size:12px"></span>',
          '  </div>',
          '  <div id="bridgeHttpRow" class="row" style="gap:10px;align-items:center;margin-top:6px">',
          '    <label>Start URL <input id="bridgeStartUrl" type="text" class="select-lg" placeholder="http://127.0.0.1:5723/record/start"/></label>',
          '    <label>Stop URL <input id="bridgeStopUrl" type="text" class="select-lg" placeholder="(optional)"/></label>',
          '    <button id="bridgeHttpTestStart" class="chip btn-chip" type="button">Test start</button>',
          '    <button id="bridgeHttpTestStop" class="chip btn-chip" type="button">Test stop</button>',
          '    <span id="bridgeHttpMsg" class="microcopy" style="color:#9fb4c9;font-size:12px"></span>',
          '  </div>',
          '  <div id="bridgeHotkeyRow" class="row" style="gap:10px;align-items:center;margin-top:6px">',
          '    <label>Preset',
          '      <select id="bridgePreset" class="select-sm">',
          '        <option value="Ctrl+R">Ctrl+R</option>',
          '        <option value="Win+Alt+R">Win+Alt+R</option>',
          '        <option value="custom">Custom…</option>',
          '      </select>',
          '    </label>',
          '    <label>Start hotkey <input id="bridgeStartHotkey" type="text" class="select-sm" placeholder="Ctrl+R"/></label>',
          '    <label>Stop hotkey <input id="bridgeStopHotkey" type="text" class="select-sm" placeholder="(optional)"/></label>',
          '    <label>Endpoint <input id="bridgeBaseUrl" type="text" class="select-md" placeholder="http://127.0.0.1:5723"/></label>',
          '    <button id="bridgeHotkeyTestBtn" class="chip btn-chip" type="button">Send test</button>',
          '    <span id="bridgeHotkeyMsg" class="microcopy" style="color:#9fb4c9;font-size:12px"></span>',
          '  </div>',
          '</div>',
          '',
          '<div class="card">',
          '  <h5 style="margin:6px 0 8px">Adobe Premiere Pro</h5>',
          '  <div class="row" style="gap:10px;align-items:center">',
          '    <label>Start hotkey <input id="premStartHotkey" type="text" class="select-sm" placeholder="Ctrl+R"/></label>',
          '    <label>Stop hotkey <input id="premStopHotkey" type="text" class="select-sm" placeholder="(optional)"/></label>',
          '    <label>Endpoint <input id="premBaseUrl" type="text" class="select-md" placeholder="http://127.0.0.1:5723"/></label>',
          '    <button id="premTestBtn" class="chip btn-chip" type="button">Send test</button>',
          '    <button id="premiereTest" class="chip btn-chip" type="button">Start (SSOT)</button>',
          '    <span id="premTestMsg" class="microcopy" style="color:#9fb4c9;font-size:12px"></span>',
          '  </div>',
          '  <div class="settings-small" style="color:#9fb4c9">Requires the Hotkey Bridge (tools/hotkey_bridge.ps1) to be running.</div>',
          '</div>',
          '',
          '<div class="card">',
          '  <h5 style="margin:6px 0 8px">Descript</h5>',
          '  <div class="row" style="gap:10px;align-items:center">',
          '    <label>Start hotkey <input id="descStartHotkey" type="text" class="select-sm" placeholder="Ctrl+R"/></label>',
          '    <label>Stop hotkey <input id="descStopHotkey" type="text" class="select-sm" placeholder="(optional)"/></label>',
          '    <label>Endpoint <input id="descBaseUrl" type="text" class="select-md" placeholder="http://127.0.0.1:5723"/></label>',
          '    <button id="descTestBtn" class="chip btn-chip" type="button">Send test</button>',
          '    <button id="descriptTest" class="chip btn-chip" type="button">Start (SSOT)</button>',
          '    <span id="descTestMsg" class="microcopy" style="color:#9fb4c9;font-size:12px"></span>',
          '  </div>',
          '  <div class="settings-small" style="color:#9fb4c9">Uses the same Hotkey Bridge. Default Ctrl+R works for Descript’s record toggle.</div>',
          '</div>'
        ].join('');

        // Render
        wrap.innerHTML = html;

        // --- Bridge wiring ---
        const modeSel = document.getElementById('bridgeMode');
        const httpRow = document.getElementById('bridgeHttpRow');
        const hotkeyRow = document.getElementById('bridgeHotkeyRow');
        const startUrlInp = document.getElementById('bridgeStartUrl');
        const stopUrlInp = document.getElementById('bridgeStopUrl');
        const httpTestStart = document.getElementById('bridgeHttpTestStart');
        const httpTestStop = document.getElementById('bridgeHttpTestStop');
        const httpMsg = document.getElementById('bridgeHttpMsg');
  const presetSel = document.getElementById('bridgePreset');
        const startHotkeyInp = document.getElementById('bridgeStartHotkey');
        const stopHotkeyInp = document.getElementById('bridgeStopHotkey');
        const baseUrlInp = document.getElementById('bridgeBaseUrl');
        const hotkeyTestBtn = document.getElementById('bridgeHotkeyTestBtn');
        const hotkeyMsg = document.getElementById('bridgeHotkeyMsg');
  const bridgeSSOTStart = document.getElementById('bridgeTestStart');
  const bridgeSSOTStop = document.getElementById('bridgeTestStop');
  const bridgeSSOTMsg = document.getElementById('bridgeSSOTMsg');

        // Initialize values
        if (modeSel) modeSel.value = String(inferBridge.mode || 'http');
        if (startUrlInp) startUrlInp.value = String(bridgeCfgRaw.startUrl || 'http://127.0.0.1:5723/record/start');
        if (stopUrlInp) stopUrlInp.value = String(bridgeCfgRaw.stopUrl || '');
        if (baseUrlInp) baseUrlInp.value = String(inferBridge.baseUrl || 'http://127.0.0.1:5723');
        if (startHotkeyInp) startHotkeyInp.value = String(inferBridge.startHotkey || 'Ctrl+R');
        if (stopHotkeyInp) stopHotkeyInp.value = String(inferBridge.stopHotkey || '');
        if (presetSel) {
          const k = String(inferBridge.startHotkey||'Ctrl+R');
          presetSel.value = (k === 'Ctrl+R' || k === 'Win+Alt+R') ? k : 'custom';
        }

        function updateBridgeVisibility(){
          const mode = modeSel ? modeSel.value : 'http';
          if (httpRow) httpRow.style.display = mode === 'http' ? '' : 'none';
          if (hotkeyRow) hotkeyRow.style.display = mode === 'hotkey' ? '' : 'none';
        }
        updateBridgeVisibility();

        function saveBridge(){
          try {
            const mode = (modeSel && modeSel.value) || 'http';
            const base = (baseUrlInp && baseUrlInp.value) || 'http://127.0.0.1:5723';
            const baseClean = base.replace(/\/+$/, '');
            let startUrl = (startUrlInp && startUrlInp.value) || (baseClean + '/record/start');
            let stopUrl = (stopUrlInp && stopUrlInp.value) || '';
            let startHot = (startHotkeyInp && startHotkeyInp.value) || 'Ctrl+R';
            let stopHot = (stopHotkeyInp && stopHotkeyInp.value) || '';
            if (mode === 'hotkey') {
              startUrl = baseClean + '/send?keys=' + encodeURIComponent(startHot);
              stopUrl = stopHot ? (baseClean + '/send?keys=' + encodeURIComponent(stopHot)) : '';
            }
            const next = {
              mode,
              baseUrl: baseClean,
              startHotkey: startHot,
              stopHotkey: stopHot,
              startUrl,
              stopUrl,
            };
            __recMod?.setSettings?.({ configs: { bridge: next } });
          } catch {}
        }

        // Bridge listeners
        modeSel && modeSel.addEventListener('change', () => { updateBridgeVisibility(); saveBridge(); });
        startUrlInp && startUrlInp.addEventListener('input', saveBridge);
        stopUrlInp && stopUrlInp.addEventListener('input', saveBridge);
        baseUrlInp && baseUrlInp.addEventListener('input', saveBridge);
        startHotkeyInp && startHotkeyInp.addEventListener('input', () => {
          if (presetSel) {
            const v = String(startHotkeyInp.value||'');
            presetSel.value = (v === 'Ctrl+R' || v === 'Win+Alt+R') ? v : 'custom';
          }
          saveBridge();
        });
        stopHotkeyInp && stopHotkeyInp.addEventListener('input', saveBridge);
        presetSel && presetSel.addEventListener('change', () => {
          const v = presetSel.value;
          if (v !== 'custom' && startHotkeyInp) startHotkeyInp.value = v;
          saveBridge();
        });
        if (httpTestStart) {
          httpTestStart.addEventListener('click', async () => {
            try {
              const u = (startUrlInp && startUrlInp.value) || 'http://127.0.0.1:5723/record/start';
              if (httpMsg) { httpMsg.textContent = 'Sending…'; httpMsg.style.color = '#9fb4c9'; }
              await fetch(u, { method: 'GET', mode: 'no-cors' });
              if (httpMsg) { httpMsg.textContent = 'Start ping sent'; httpMsg.style.color = '#b7f4c9'; }
            } catch {
              if (httpMsg) { httpMsg.textContent = 'Failed — is endpoint up?'; httpMsg.style.color = '#ffd6d6'; }
            }
          });
        }
        if (httpTestStop) {
          httpTestStop.addEventListener('click', async () => {
            try {
              const u = (stopUrlInp && stopUrlInp.value) || '';
              if (!u) { if (httpMsg) { httpMsg.textContent = 'No Stop URL set'; httpMsg.style.color = '#ffdca8'; } return; }
              if (httpMsg) { httpMsg.textContent = 'Sending…'; httpMsg.style.color = '#9fb4c9'; }
              await fetch(u, { method: 'GET', mode: 'no-cors' });
              if (httpMsg) { httpMsg.textContent = 'Stop ping sent'; httpMsg.style.color = '#b7f4c9'; }
            } catch {
              if (httpMsg) { httpMsg.textContent = 'Failed — is endpoint up?'; httpMsg.style.color = '#ffd6d6'; }
            }
          });
        }
        if (hotkeyTestBtn) {
          hotkeyTestBtn.addEventListener('click', async () => {
            try {
              const base = (baseUrlInp && baseUrlInp.value) || 'http://127.0.0.1:5723';
              const keys = (startHotkeyInp && startHotkeyInp.value) || 'Ctrl+R';
              const u = base.replace(/\/+$/, '') + '/send?keys=' + encodeURIComponent(keys);
              if (hotkeyMsg) { hotkeyMsg.textContent = 'Sending…'; hotkeyMsg.style.color = '#9fb4c9'; }
              await fetch(u, { method: 'GET', mode: 'no-cors' });
              if (hotkeyMsg) { hotkeyMsg.textContent = 'Sent ' + keys; hotkeyMsg.style.color = '#b7f4c9'; }
            } catch {
              if (hotkeyMsg) { hotkeyMsg.textContent = 'Failed — is bridge running?'; hotkeyMsg.style.color = '#ffd6d6'; }
            }
          });
        }

        // Bridge SSOT tests (call central API)
        bridgeSSOTStart && bridgeSSOTStart.addEventListener('click', async (e) => {
          try { e.stopPropagation(); e.stopImmediatePropagation && e.stopImmediatePropagation(); } catch {}
          try {
            if (bridgeSSOTMsg) { bridgeSSOTMsg.textContent = 'Starting…'; bridgeSSOTMsg.style.color = '#9fb4c9'; }
            const ok = await (window.__tpRecording?.start?.() || Promise.resolve(false));
            try { window.__tpHud?.log?.('[bridge:test] start →', ok); } catch {}
            if (bridgeSSOTMsg) { bridgeSSOTMsg.textContent = ok ? 'Started' : 'Failed'; bridgeSSOTMsg.style.color = ok ? '#b7f4c9' : '#ffd6d6'; }
          } catch {
            if (bridgeSSOTMsg) { bridgeSSOTMsg.textContent = 'Failed'; bridgeSSOTMsg.style.color = '#ffd6d6'; }
          }
        });
        bridgeSSOTStop && bridgeSSOTStop.addEventListener('click', async (e) => {
          try { e.stopPropagation(); e.stopImmediatePropagation && e.stopImmediatePropagation(); } catch {}
          try {
            if (bridgeSSOTMsg) { bridgeSSOTMsg.textContent = 'Stopping…'; bridgeSSOTMsg.style.color = '#9fb4c9'; }
            const ok = await (window.__tpRecording?.stop?.() || Promise.resolve(false));
            try { window.__tpHud?.log?.('[bridge:test] stop →', ok); } catch {}
            if (bridgeSSOTMsg) { bridgeSSOTMsg.textContent = ok ? 'Stopped' : 'Failed'; bridgeSSOTMsg.style.color = ok ? '#b7f4c9' : '#ffd6d6'; }
          } catch {
            if (bridgeSSOTMsg) { bridgeSSOTMsg.textContent = 'Failed'; bridgeSSOTMsg.style.color = '#ffd6d6'; }
          }
        });

        // --- Premiere wiring ---
        const premStartInp = document.getElementById('premStartHotkey');
        const premStopInp = document.getElementById('premStopHotkey');
        const premBaseInp = document.getElementById('premBaseUrl');
  const premTestBtn = document.getElementById('premTestBtn');
  const premSSOTBtn = document.getElementById('premiereTest');
        const premMsg = document.getElementById('premTestMsg');
        if (premStartInp) premStartInp.value = String(premCfg.startHotkey || 'Ctrl+R');
        if (premStopInp) premStopInp.value = String(premCfg.stopHotkey || '');
        if (premBaseInp) premBaseInp.value = String(premCfg.baseUrl || 'http://127.0.0.1:5723');

        const savePrem = () => {
          try {
            const next = {
              startHotkey: (premStartInp && premStartInp.value) || 'Ctrl+R',
              stopHotkey: (premStopInp && premStopInp.value) || '',
              baseUrl: (premBaseInp && premBaseInp.value) || 'http://127.0.0.1:5723',
            };
            __recMod?.setSettings?.({ configs: { premiere: next } });
          } catch {}
        };
        premStartInp && premStartInp.addEventListener('input', savePrem);
        premStopInp && premStopInp.addEventListener('input', savePrem);
        premBaseInp && premBaseInp.addEventListener('input', savePrem);
        if (premTestBtn) {
          premTestBtn.addEventListener('click', async () => {
            try {
              const base = (premBaseInp && premBaseInp.value) || 'http://127.0.0.1:5723';
              const keys = (premStartInp && premStartInp.value) || 'Ctrl+R';
              const u = base.replace(/\/+$/, '') + '/send?keys=' + encodeURIComponent(keys);
              if (premMsg) { premMsg.textContent = 'Sending…'; premMsg.style.color = '#9fb4c9'; }
              await fetch(u, { method: 'GET', mode: 'no-cors' });
              if (premMsg) { premMsg.textContent = 'Sent ' + keys; premMsg.style.color = '#b7f4c9'; }
            } catch {
              if (premMsg) { premMsg.textContent = 'Failed — is bridge running?'; premMsg.style.color = '#ffd6d6'; }
            }
          });
        }
        if (premSSOTBtn) {
          premSSOTBtn.addEventListener('click', async (e) => {
            try { e.stopPropagation(); e.stopImmediatePropagation && e.stopImmediatePropagation(); } catch {}
            const old = (localStorage.getItem('tp_rec_adapter') || 'bridge');
            try { localStorage.setItem('tp_rec_adapter', 'premiere'); } catch {}
            try {
              if (premMsg) { premMsg.textContent = 'Starting…'; premMsg.style.color = '#9fb4c9'; }
              const ok = await (window.__tpRecording?.start?.() || Promise.resolve(false));
              try { window.__tpHud?.log?.('[premiere:test] →', ok); } catch {}
              if (premMsg) { premMsg.textContent = ok ? 'Started' : 'Failed'; premMsg.style.color = ok ? '#b7f4c9' : '#ffd6d6'; }
            } finally {
              try { localStorage.setItem('tp_rec_adapter', old); } catch {}
            }
          });
        }

        // --- Descript wiring ---
        const descStartInp = document.getElementById('descStartHotkey');
        const descStopInp = document.getElementById('descStopHotkey');
        const descBaseInp = document.getElementById('descBaseUrl');
        const descTestBtn = document.getElementById('descTestBtn');
        const descMsg = document.getElementById('descTestMsg');
        // Defaults for Descript mimic Premiere’s hotkey bridge
        const dcfg = (st.configs && st.configs.descript) || { startHotkey:'Ctrl+R', stopHotkey:'', baseUrl:'http://127.0.0.1:5723' };
        if (descStartInp) descStartInp.value = String(dcfg.startHotkey || 'Ctrl+R');
        if (descStopInp) descStopInp.value = String(dcfg.stopHotkey || '');
        if (descBaseInp) descBaseInp.value = String(dcfg.baseUrl || 'http://127.0.0.1:5723');

        const saveDesc = () => {
          try {
            const next = {
              startHotkey: (descStartInp && descStartInp.value) || 'Ctrl+R',
              stopHotkey: (descStopInp && descStopInp.value) || '',
              baseUrl: (descBaseInp && descBaseInp.value) || 'http://127.0.0.1:5723',
            };
            __recMod?.setSettings?.({ configs: { descript: next } });
          } catch {}
        };
        descStartInp && descStartInp.addEventListener('input', saveDesc);
        descStopInp && descStopInp.addEventListener('input', saveDesc);
        descBaseInp && descBaseInp.addEventListener('input', saveDesc);
        if (descTestBtn) {
          descTestBtn.addEventListener('click', async () => {
            try {
              const base = (descBaseInp && descBaseInp.value) || 'http://127.0.0.1:5723';
              const keys = (descStartInp && descStartInp.value) || 'Ctrl+R';
              const u = base.replace(/\/+$/, '') + '/send?keys=' + encodeURIComponent(keys);
              if (descMsg) { descMsg.textContent = 'Sending…'; descMsg.style.color = '#9fb4c9'; }
              await fetch(u, { method: 'GET', mode: 'no-cors' });
              if (descMsg) { descMsg.textContent = 'Sent ' + keys; descMsg.style.color = '#b7f4c9'; }
            } catch {
              if (descMsg) { descMsg.textContent = 'Failed — is bridge running?'; descMsg.style.color = '#ffd6d6'; }
            }
          });
        }
        const descSSOTBtn = document.getElementById('descriptTest');
        if (descSSOTBtn) {
          descSSOTBtn.addEventListener('click', async (e) => {
            try { e.stopPropagation(); e.stopImmediatePropagation && e.stopImmediatePropagation(); } catch {}
            const old = (localStorage.getItem('tp_rec_adapter') || 'bridge');
            try { localStorage.setItem('tp_rec_adapter', 'descript'); } catch {}
            try {
              if (descMsg) { descMsg.textContent = 'Starting…'; descMsg.style.color = '#9fb4c9'; }
              const ok = await (window.__tpRecording?.start?.() || Promise.resolve(false));
              try { window.__tpHud?.log?.('[descript:test] →', ok); } catch {}
              if (descMsg) { descMsg.textContent = ok ? 'Started' : 'Failed'; descMsg.style.color = ok ? '#b7f4c9' : '#ffd6d6'; }
            } finally {
              try { localStorage.setItem('tp_rec_adapter', old); } catch {}
            }
          });
        }
      }

      // Live chip updater for OBS when WebSocket connects/disconnects
      async function updateObsChip(){
        try {
          const chip = document.getElementById('rec-adapter-chip-obs');
          if (!chip) return;
          // Prefer bridge connected state if present
          const bridge = (typeof window !== 'undefined') ? (window.__obsBridge || null) : null;
          if (bridge && typeof bridge.isConnected === 'function') {
            const conn = !!bridge.isConnected();
            chip.textContent = conn ? '(connected)' : '(unavailable)';
            chip.style.color = conn ? '#b7f4c9' : '#ffd6d6';
            // If disconnected, fall back to adapter.isAvailable() probe for a softer status
            if (!conn) {
              await __ensureRecordersMod();
              const a = __recMod?.get?.('obs');
              if (a && typeof a.isAvailable === 'function') {
                try {
                  const ok = await a.isAvailable();
                  chip.textContent = ok ? '(available)' : '(unavailable)';
                  chip.style.color = ok ? '#b7f4c9' : '#ffd6d6';
                } catch {}
              }
            }
            return;
          }
          // No bridge yet: do a regular availability probe
          await __ensureRecordersMod();
          const a = __recMod?.get?.('obs');
          if (a && typeof a.isAvailable === 'function') {
            const ok = await a.isAvailable();
            chip.textContent = ok ? '(available)' : '(unavailable)';
            chip.style.color = ok ? '#b7f4c9' : '#ffd6d6';
          }
        } catch {}
      }

      // Attach bridge listeners once available; retry a few times if not yet on window
      (function ensureObsBridgeListeners(){
        try {
          if (typeof window === 'undefined') return;
          const br = window.__obsBridge;
          if (br && !window.__tpSettingsObsBridgeWired) {
            window.__tpSettingsObsBridgeWired = true;
            try { updateObsChip(); } catch {}
            try { br.on && br.on('connect', () => { try { updateObsChip(); } catch {} try { clearTimeout(window.__tpObsChipFallbackTimer); } catch {} try { (async ()=>{ try { const issues = await (window.__recorder?.preflight?.('obs') || Promise.resolve([])); if (Array.isArray(issues) && issues.length) { (window.toast || ((m)=>console.debug('[toast]', m)))('OBS preflight: ' + issues.join('; '), { type: 'warn' }); } } catch {} })(); } catch {} }); } catch {}
            try { br.on && br.on('disconnect', () => { try { updateObsChip(); } catch {} }); } catch {}
          } else if (!br) {
            // Retry later; stop after a handful of attempts to avoid a long loop
            let attempts = (window.__tpSettingsObsBridgeWireAttempts||0);
            if (attempts < 10) {
              window.__tpSettingsObsBridgeWireAttempts = attempts + 1;
              setTimeout(ensureObsBridgeListeners, 800);
            }
          }
        } catch {}
      })();

      // Hint status immediately when user toggles OBS: show "(connecting…)" before the socket opens
      try {
        if (!window.__tpObsChipHintWired) {
          window.__tpObsChipHintWired = true;
          const setHint = (on) => {
            try {
              const chip = document.getElementById('rec-adapter-chip-obs');
              if (!chip) return;
              if (on) {
                chip.textContent = '(connecting…)';
                chip.style.color = '#ffdca8'; // warn color
                // Start a fallback timer: if not connected within 5s, show unavailable
                try { clearTimeout(window.__tpObsChipFallbackTimer); } catch {}
                window.__tpObsChipFallbackTimer = setTimeout(() => {
                  try {
                    // Still enabled?
                    const enabled = (hasStore && S && typeof S.get === 'function')
                      ? !!S.get('obsEnabled')
                      : !!(document.getElementById('settingsEnableObs')?.checked || document.getElementById('enableObs')?.checked);
                    if (!enabled) return;
                    // If bridge reports connected, skip fallback
                    try { if (window.__obsBridge && typeof window.__obsBridge.isConnected === 'function' && window.__obsBridge.isConnected()) return; } catch {}
                    const c = document.getElementById('rec-adapter-chip-obs');
                    if (c) { c.textContent = '(unavailable)'; c.style.color = '#ffd6d6'; }
                  } catch {}
                }, 5000);
              } else {
                chip.textContent = '(disabled)';
                chip.style.color = '#ffd6d6'; // err color
                try { clearTimeout(window.__tpObsChipFallbackTimer); } catch {}
              }
            } catch {}
          };
          // Prefer store subscription when available
          if (hasStore && typeof S?.subscribe === 'function') {
            try { S.subscribe('obsEnabled', (v) => setHint(!!v)); } catch {}
          }
          // Fallback: bind to checkbox changes if store isn’t present
          try {
            const onChange = (e) => { try { const on = !!(e?.target?.checked); setHint(on); } catch {} };
            const a = document.getElementById('settingsEnableObs');
            const b = document.getElementById('enableObs');
            if (a && !a.dataset.obsHintWired) { a.dataset.obsHintWired = '1'; a.addEventListener('change', onChange, { capture: true }); }
            if (b && !b.dataset.obsHintWired) { b.dataset.obsHintWired = '1'; b.addEventListener('change', onChange, { capture: true }); }
          } catch {}
        }
      } catch {}

      // Mode toggle wiring (idempotent)
      if (modeSingle && !modeSingle.dataset.wired){
        modeSingle.dataset.wired = '1';
        modeSingle.addEventListener('change', async () => {
          if (__recBusy) {
            try { modeSingle.checked = !modeSingle.checked; } catch {}
            try { (window.toast || ((m)=>console.debug('[toast]', m)))('Can’t change adapters while recording. Stop first.', { type: 'warn' }); } catch {}
            return;
          }
          await __ensureRecordersMod();
          try { __recMod?.setMode?.(modeSingle.checked ? 'single' : 'multi'); } catch {}
          if (modeSingle.checked) {
            const boxes = Array.from(listEl.querySelectorAll('input[type="checkbox"][data-id]'));
            const firstChecked = boxes.find(b => b.checked) || null;
            for (const b of boxes) { if (b !== firstChecked) b.checked = false; }
            try {
              const id = firstChecked ? String(firstChecked.dataset.id||'') : '';
              __recMod?.setSelected?.(id ? [id] : []);
            } catch {}
          }
        });
      }

      // Refresh (idempotent)
      if (refreshBtn && !refreshBtn.dataset.wired){
        refreshBtn.dataset.wired = '1';
        refreshBtn.addEventListener('click', render);
      }

      // Initial render
      render();
      renderConfig();
      // Also refresh OBS chip once shortly after, in case the socket connects post-render
      setTimeout(() => { try { updateObsChip(); } catch {} }, 1000);
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

      // --- Camera device selector: Settings ↔ Main mirror + live switching ---
      try {
        const settingsCamSel = document.getElementById('settingsCamSel');
        const camDeviceSel   = document.getElementById('camDevice');

        function syncCamSelects(val) {
          try { if (settingsCamSel && settingsCamSel.value !== val) settingsCamSel.value = val; } catch {}
          try { if (camDeviceSel   && camDeviceSel.value   !== val) camDeviceSel.value   = val; } catch {}
          try { if (val) localStorage.setItem('tp_camera_device_v1', val); } catch {}
        }

        async function onCamPick(val) {
          syncCamSelects(val);
          const active = !!(window.__tpCamera?.isActive?.());
          if (active) {
            try { await window.__tpCamera?.switchCamera?.(val); } catch (e) { console.warn('switchCamera (settings) failed', e); }
          }
        }

        if (settingsCamSel && !settingsCamSel.dataset.wired) {
          settingsCamSel.dataset.wired = '1';
          settingsCamSel.addEventListener('change', () => onCamPick(settingsCamSel.value), { capture: true });
        }

        if (camDeviceSel && !camDeviceSel.dataset.wired) {
          camDeviceSel.dataset.wired = '1';
          camDeviceSel.addEventListener('change', () => onCamPick(camDeviceSel.value), { capture: true });
        }

        // Hydrate initial pick from storage (if present)
        try {
          const saved = localStorage.getItem('tp_camera_device_v1');
          if (saved) syncCamSelects(saved);
        } catch {}
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
            // Legacy bridge: persist under old key for callers still reading localStorage
            try { localStorage.setItem('tp_auto_record', v ? '1' : '0'); } catch {}
            // On enable, run a quick OBS preflight and surface early warnings
            if (v) {
              try {
                (async () => {
                  try {
                    const issues = await (window.__recorder?.preflight?.('obs') || Promise.resolve([]));
                    if (Array.isArray(issues) && issues.length) {
                      (window.toast || ((m)=>console.debug('[toast]', m)))('OBS preflight: ' + issues.join('; '), { type: 'warn' });
                    }
                  } catch {}
                })();
              } catch {}
            }
          } catch {}
        });
      }

      // --- Auto-record folder picker wiring ---
      try {
        const folderNameEl = q('autoRecordFolderName');
        const pickBtn = q('autoRecordPickBtn');
        const clearBtn = q('autoRecordClearBtn');

        async function renderFolder() {
          try {
            // lazy import helper; it attaches window.__tpRecDir
            await import('../fs/recording-dir.js');
            if (window.__tpRecDir && typeof window.__tpRecDir.init === 'function') { try { await window.__tpRecDir.init(); } catch {} }
            const dir = window.__tpRecDir && window.__tpRecDir.get ? window.__tpRecDir.get() : null;
            if (folderNameEl) folderNameEl.textContent = dir ? (dir.name || 'Selected') : 'Not set';
          } catch {}
        }

        async function pickFolderFlow() {
          try {
            await import('../fs/recording-dir.js');
            const supported = !!(window.__tpRecDir && window.__tpRecDir.supported && window.__tpRecDir.supported());
            if (!supported) {
              (window.toast || ((m)=>console.debug('[toast]', m)))('This browser will download recordings instead of saving to a folder.', { type: 'warn' });
              return true; // not an error; we just warn and proceed with downloads
            }
            const existing = window.__tpRecDir && window.__tpRecDir.get ? window.__tpRecDir.get() : null;
            if (existing) return true; // nothing to do
            const dir = await window.__tpRecDir.pick();
            if (!dir) {
              (window.toast || ((m)=>console.debug('[toast]', m)))('Auto-save canceled — no folder selected.', { type: 'warn' });
              return false;
            }
            await renderFolder();
            return true;
          } catch { return false; }
        }

        // On enabling auto-save, if supported and no folder yet: prompt; revert if canceled
        if (settingsAutoRec && hasStore) {
          settingsAutoRec.addEventListener('change', async () => {
            try {
              if (!settingsAutoRec.checked) return;
              const ok = await pickFolderFlow();
              if (!ok) {
                settingsAutoRec.checked = false; S.set('autoRecord', false);
              }
            } catch {}
          }, { capture: true });
        }

        if (pickBtn && !pickBtn.dataset.wired) {
          pickBtn.dataset.wired = '1';
          pickBtn.addEventListener('click', async () => { await pickFolderFlow(); });
        }
        if (clearBtn && !clearBtn.dataset.wired) {
          clearBtn.dataset.wired = '1';
          clearBtn.addEventListener('click', async () => {
            try { await import('../fs/recording-dir.js'); await window.__tpRecDir?.clear?.(); await renderFolder(); } catch {}
          });
        }

        // Initial render
        try { renderFolder(); } catch {}
      } catch {}

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
        const wpmT = q('settingsWpmTarget');
        const wpmPx = q('settingsWpmPx');
        const maxChMain = q('settingsMaxChMain');
        const maxChDisp = q('settingsMaxChDisplay');
        const fsMain = q('fontSize');
        const lhMain = q('lineHeight');
        const mapWpmToPxPerSec = (wpm)=>{
          try {
            const cs = getComputedStyle(document.documentElement);
            const fsPx = parseFloat(cs.getPropertyValue('--tp-font-size')) || 56;
            const lhScale = parseFloat(cs.getPropertyValue('--tp-line-height')) || 1.4;
            const lineHeightPx = fsPx * lhScale;
            const wpl = parseFloat(localStorage.getItem('tp_wpl_hint') || '8') || 8;
            const linesPerSec = (wpm / 60) / wpl;
            return linesPerSec * lineHeightPx;
          } catch { return (wpm / 60) / 8 * (56 * 1.4); }
        };
        const clamp = (v,a,b)=>Math.max(a,Math.min(b,v));
        const getTargetWpm = ()=>{ try { return Number(localStorage.getItem('tp_wpm_target')||'150')||150; } catch { return 150; } };
        const setTargetWpm = (w)=>{ try { localStorage.setItem('tp_wpm_target', String(clamp(Math.round(w||0),60,260))); } catch {} };
        const updateWpmPx = ()=>{
          try { const s = (Math.round(mapWpmToPxPerSec(getTargetWpm())*10)/10).toFixed(1); if (wpmPx) wpmPx.textContent = '≈ ' + s + ' px/s'; } catch {}
        };
        // Seed WPM target value
        try { if (wpmT) wpmT.value = String(getTargetWpm()); } catch {}
        updateWpmPx();
        if (wpmT && !wpmT.dataset.wired) {
          wpmT.dataset.wired = '1';
          wpmT.addEventListener('input', () => {
            try {
              const n = Number(wpmT.value);
              if (!Number.isFinite(n)) return;
              setTargetWpm(n);
              updateWpmPx();
              // Mirror to main sidebar input and trigger its handler so WPM mode applies immediately
              const side = document.getElementById('wpmTarget');
              if (side) { side.value = String(clamp(Math.round(n),60,260)); side.dispatchEvent(new Event('input', { bubbles: true })); }
            } catch {}
          });
        }
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
              try { updateWpmPx(); } catch {}
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
        S.subscribe('obsEnabled', (v) => { try { if (settingsEnableObs && settingsEnableObs.checked !== !!v) settingsEnableObs.checked = !!v; } catch {} try { window.__tpObs?.setArmed?.(!!v); } catch {} ensureObsConnection(); });
        S.subscribe('obsHost', ensureObsConnection);
        S.subscribe('obsPassword', ensureObsConnection);
      }
      // Initial connection attempt after mount
      setTimeout(() => { try { window.__tpObs?.setArmed?.(!!(hasStore && S.get && S.get('obsEnabled'))); } catch {} ensureObsConnection(); }, 0);

      // --- Recording adapters picker ---
      initRecorderAdaptersUI();

      // Dev HUD toggle (advanced) — SSOT wiring to modern HUD (single source of truth)
      const devHud = q('settingsDevHud');
      if (devHud && hasStore) devHud.addEventListener('change', () => S.set('devHud', !!devHud.checked));
      if (hasStore && typeof S.subscribe === 'function') {
        S.subscribe('devHud', v => {
          try {
            if (devHud && devHud.checked !== !!v) devHud.checked = !!v;
            // Single-source: prefer modern SSOT API if present
            try { (window.__tpHud?.setEnabled && window.__tpHud.setEnabled(!!v)); } catch {}
            // Persist also under SSOT key for parity with non-store paths
            try { localStorage.setItem('tp_dev_hud_v1', v ? '1' : '0'); } catch {}
            // Back-compat: ensure #hud-root exists and is hidden/shown appropriately
            try {
              let hudRoot = document.getElementById('hud-root');
              if (!hudRoot) { hudRoot = document.createElement('div'); hudRoot.id = 'hud-root'; hudRoot.className = 'hud-root hidden'; hudRoot.setAttribute('aria-hidden','true'); hudRoot.setAttribute('inert',''); document.body.appendChild(hudRoot); }
              hudRoot.classList.toggle('hidden', !v);
              if (v) { hudRoot.removeAttribute('aria-hidden'); hudRoot.removeAttribute('inert'); }
              else { hudRoot.setAttribute('aria-hidden','true'); hudRoot.setAttribute('inert',''); }
            } catch {}
          } catch {}
        });
      }

      // Production HUD toggle (advanced) — persists tp_hud_prod key and prompts reload
      const hudProd = q('settingsHudProd');
      try { if (hudProd) hudProd.checked = localStorage.getItem('tp_hud_prod') === '1'; } catch {}
      if (hudProd && !hudProd.dataset.wired) {
        hudProd.dataset.wired = '1';
        hudProd.addEventListener('change', () => {
          try { localStorage.setItem('tp_hud_prod', hudProd.checked ? '1' : '0'); } catch {}
          try { alert('Transcript HUD production setting updated. Reload to apply.'); } catch {}
        }, { capture: true });
      }

      // Removed duplicate fallback HUD wiring block — store-managed block above is the single source of truth.

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
          // Ensure adapters UI is initialized now that DOM exists
          initRecorderAdaptersUI();
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
