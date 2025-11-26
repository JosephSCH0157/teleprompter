export function buildSettingsContent(rootEl: HTMLElement | null) {
  if (!rootEl) return '';
  // Render a compact settings body with tab content placeholders.
  // The media tab contains mic device selector and mic controls which
  // will be wired to the TS mic API via `wireSettingsDynamic`.
  const html = `
    <div class="settings-tabs" role="tablist">
      <button type="button" class="settings-tab active" data-settings-tab="general" aria-pressed="true">General</button>
      <button type="button" class="settings-tab" data-settings-tab="media" aria-pressed="false">Media</button>
      <button type="button" class="settings-tab" data-settings-tab="recording" aria-pressed="false">Recording</button>
      <button type="button" class="settings-tab" data-settings-tab="advanced" aria-pressed="false">Advanced</button>
      <button type="button" class="settings-tab" data-settings-tab="pricing" aria-pressed="false">Pricing</button>
      <button type="button" class="settings-tab" data-settings-tab="about" aria-pressed="false">About</button>
    </div>

    <div class="settings-panels">
      <section class="settings-panel" data-settings-panel="general" data-tab-content="general">
        <h4>General</h4>
      <div class="settings-grid">
        <div class="settings-card anim-in">
          <h4>Main Display Typography</h4>
          <div class="settings-inline-row">
            <label>Font family <input id="typoFontFamily-main" placeholder='system-ui, "Segoe UI", Roboto, Arial, sans-serif'></label>
            <label>Size (px) <input id="typoFontSize-main" type="number" min="18" max="120"></label>
            <label>Line height <input id="typoLineHeight-main" type="number" min="1.1" max="2" step="0.01"></label>
            <label>Weight <input id="typoWeight-main" type="number" min="300" max="900" step="50"></label>
            <label>Letter spacing (em) <input id="typoLetter-main" type="number" min="-0.05" max="0.2" step="0.005"></label>
            <label>Word spacing (em) <input id="typoWord-main" type="number" min="0" max="0.5" step="0.01"></label>
            <label>Text color <input id="typoColor-main" type="text" placeholder="#e5e7eb"></label>
            <label>Background <input id="typoBg-main" type="text" placeholder="#0b0f14"></label>
            <div id="typoContrastWarn-main" class="settings-small" style="color:#ffb74d"></div>
            <label>Max line width (ch) <input id="typoMaxCh-main" type="number" min="20" max="90"></label>
            <label>Dim others (0..0.7) <input id="typoDim-main" type="number" min="0" max="0.7" step="0.05"></label>
          </div>
          <div class="settings-inline-row">
            <button id="typoResetMain" class="chip">Reset to Default</button>
            <button id="typoCopyMainToDisplay" class="chip">Copy ➜ Display</button>
            <button class="chip" data-typo-preset data-display="main" data-typo-preset-name="readable">Readable</button>
            <button class="chip" data-typo-preset data-display="main" data-typo-preset-name="studio">Studio</button>
            <button class="chip" data-typo-preset data-display="main" data-typo-preset-name="bigroom">Big Room</button>
          </div>
        </div>

        <div class="settings-card anim-in">
          <h4>External Display Typography</h4>
          <div class="settings-inline-row">
            <label>Font family <input id="typoFontFamily-display" placeholder='system-ui, "Segoe UI", Roboto, Arial, sans-serif'></label>
            <label>Size (px) <input id="typoFontSize-display" type="number" min="18" max="120"></label>
            <label>Line height <input id="typoLineHeight-display" type="number" min="1.1" max="2" step="0.01"></label>
            <label>Weight <input id="typoWeight-display" type="number" min="300" max="900" step="50"></label>
            <label>Letter spacing (em) <input id="typoLetter-display" type="number" min="-0.05" max="0.2" step="0.005"></label>
            <label>Word spacing (em) <input id="typoWord-display" type="number" min="0" max="0.5" step="0.01"></label>
            <label>Text color <input id="typoColor-display" type="text" placeholder="#f3f4f6"></label>
            <label>Background <input id="typoBg-display" type="text" placeholder="#05080c"></label>
            <div id="typoContrastWarn-display" class="settings-small" style="color:#ffb74d"></div>
            <label>Max line width (ch) <input id="typoMaxCh-display" type="number" min="20" max="90"></label>
            <label>Dim others (0..0.7) <input id="typoDim-display" type="number" min="0" max="0.7" step="0.05"></label>
          </div>
          <div class="settings-inline-row">
            <button id="typoResetDisplay" class="chip">Reset to Default</button>
            <button id="typoCopyDisplayToMain" class="chip">Copy ➜ Main</button>
            <button class="chip" data-typo-preset data-display="display" data-typo-preset-name="readable">Readable</button>
            <button class="chip" data-typo-preset data-display="display" data-typo-preset-name="studio">Studio</button>
            <button class="chip" data-typo-preset data-display="display" data-typo-preset-name="bigroom">Big Room</button>
          </div>
        </div>
      </div>
      <div class="settings-small">Changes apply live to the selected display and are persisted.</div>
      </section>

      <section class="settings-panel" data-settings-panel="media" data-tab-content="media" hidden>
        <h4>Microphone</h4>
      <div class="row">
        <label>Input device
          <select id="settingsMicSel" class="select-md"></select>
        </label>
      </div>
      <div class="row">
        <button id="settingsRequestMicBtn" class="chip" data-tp-request-mic="settings">Request mic</button>
        <button id="settingsReleaseMicBtn" class="chip">Release mic</button>
        <button id="settingsStartDbBtn" class="chip">Start dB meter</button>
        <button id="settingsStopDbBtn" class="chip">Stop dB meter</button>
      </div>

      <h4>Camera</h4>
      <div class="row">
        <label>Device
          <select id="settingsCamSel" class="select-md"></select>
        </label>
      </div>

      <h4>Hybrid Gate</h4>
      <div class="row">
        <label>Hybrid gate source
          <select id="hybridGate" class="select-md">
            <option value="db_or_vad">VAD or dB (default)</option>
            <option value="vad">VAD only</option>
            <option value="db">dB only</option>
            <option value="db_and_vad">VAD and dB</option>
          </select>
        </label>
        <a id="linkAsrSettings" href="#asrSettings" class="settings-link" style="margin-left:12px">ASR settings</a>
      </div>
      </section>

      <section class="settings-panel" data-settings-panel="recording" data-tab-content="recording" hidden>
        <h4>Recording</h4>

      <div class="settings-card anim-in">
        <h4>Auto-record</h4>
        <div class="row">
          <label><input type="checkbox" id="settingsAutoRecord"/> Auto-save camera + mic when Speech Sync runs</label>
        </div>
        <div class="row" id="autoRecordFolderRow">
          <span class="microcopy" style="color:#9fb4c9;font-size:12px" data-test-id="rec-folder-label">Folder: <span id="autoRecordFolderName">Not set</span></span>
          <button id="autoRecordPickBtn" class="chip" type="button">Change auto-save folder…</button>
          <button id="autoRecordClearBtn" class="chip" type="button">Clear</button>
        </div>
      </div>

      <div class="settings-card anim-in">
        <h4>Recorder integrations</h4>
        <div class="row settings-inline-row" id="recAdaptersRow">
          <div class="rec-list" style="display:flex;flex-wrap:wrap;gap:10px">
            <label class="tp-check"><input type="checkbox" id="recAdapterCore" checked/> Core recorder</label>
            <label class="tp-check"><input type="checkbox" id="recAdapterObs"/> OBS (WebSocket)</label>
          </div>
        </div>
        <div class="row settings-inline-row">
          <label class="tp-check"><input type="checkbox" id="recModeSingle"/> Single mode (one adapter at a time)</label>
          <button id="recAdaptersRefresh" class="chip btn-chip" type="button">Refresh status</button>
          <span id="recAdaptersHint" class="microcopy" style="color:#9fb4c9;font-size:12px">Pick which integrations to trigger when Auto-record is on.</span>
        </div>
      </div>

      <div class="settings-card anim-in">
        <h4>OBS (WebSocket)</h4>
        <div class="row">
          <label><input type="checkbox" id="settingsEnableObs" data-tp-obs-toggle/> Enable OBS</label>
          <span id="obsStatusText" class="badge muted" style="margin-left:auto">disconnected</span>
        </div>
        <form id="settingsObsCredsForm" class="settings-inline-row" autocomplete="off" novalidate onsubmit="return false;">
          <label>Host <input id="settingsObsHost" type="text" class="select-md" placeholder="127.0.0.1:4455"/></label>
          <label>Password <input id="settingsObsPassword" type="password" class="select-md" placeholder="••••••"/></label>
          <button type="submit" hidden aria-hidden="true"></button>
        </form>
        <div class="row gap">
          <button id="settingsObsTest" data-action="obs-test" class="chip btn-chip" type="button">Test connection</button>
          <span id="settingsObsTestMsg" class="obs-test-msg" role="status" aria-live="polite"></span>
        </div>
        <small class="muted">OBS ➜ Tools ➜ WebSocket Server Settings (default port 4455). Use this host and password.</small>
      </div>

      <div class="settings-card anim-in">
        <h4>Manual session control</h4>
        <div class="row gap">
          <button id="startRecBtn" class="btn primary" type="button">Start recording</button>
          <button id="stopRecBtn" class="btn" type="button">Stop recording</button>
        </div>
        <small class="muted">These buttons call the recorder registry so Bridge + OBS stay in sync.</small>
      </div>
      </section>

      <section class="settings-panel" data-settings-panel="advanced" data-tab-content="advanced" hidden>
        <h4>Advanced</h4>
        <div class="row">Advanced settings.</div>
        <div class="row gap">
          <button id="btnExportSettings" class="chip btn-chip" type="button">Export settings</button>
          <button id="btnImportSettings" class="chip btn-chip" type="button">Import settings</button>
        </div>
      </section>

      <section class="settings-panel" data-settings-panel="pricing" data-tab-content="pricing" hidden>
        <h4>Pricing</h4>
        <div class="settings-card anim-in">
          <p class="muted">Teleprompter Pro is currently in open preview. Billing controls will land here soon.</p>
          <ul class="muted" style="margin-left:16px">
            <li>No charges are applied during preview.</li>
            <li>All features remain available while we finalize plans.</li>
            <li>Saved recordings and settings stay intact.</li>
            <li>We’ll announce pricing before enabling billing.</li>
          </ul>
        </div>
      </section>

      <section class="settings-panel" data-settings-panel="about" data-tab-content="about" hidden>
        <h4>About</h4>
        <div class="settings-card anim-in">
          <p class="muted">Teleprompter Pro is built for live presenters, rehearsal, and remote production.</p>
          <ul class="muted" style="margin-left:16px">
            <li>Built-in recorder (core) with OBS WebSocket integration.</li>
            <li>Speech-driven scrolling with VAD/ASR hybrid modes.</li>
            <li>Typography controls for main and external display, including color tuning.</li>
            <li>HUD overlays for dB meter, speech notes, and recorder status.</li>
            <li>Script ingest helpers and validation to keep your script clean.</li>
          </ul>
          <p class="muted">Questions? Open the Help overlay or reach out to the team.</p>
        </div>
      </section>
    </div>
  `;

  return html;
}

export { };

// Append the ASR Calibration wizard card into the Settings UI (under Media tab if present)
export function addAsrWizardCard(root: HTMLElement) {
  try {
    if (!root) return;
    // Avoid duplicates
    if (root.querySelector('#asrSettings')) return;
    const container = (root.querySelector('[data-tab-content="media"]') || root) as HTMLElement;
    const sec = document.createElement('section');
    sec.className = 'settings-card';
    sec.id = 'asrSettings';
    sec.innerHTML = `
      <h3>ASR Input (Calibration)</h3>

      <div class="row">
        <label class="grow">Microphone <select id="asrDevice"></select></label>
        <button id="asrRefreshDevs" class="btn">Refresh</button>
        <button id="asrGrantPerm" class="btn">Grant mic access</button>
      </div>

      <div class="row">
        <label><input id="asrAEC" type="checkbox"> Echo cancellation</label>
        <label><input id="asrNS"  type="checkbox"> Noise suppression</label>
        <label><input id="asrAGC" type="checkbox"> Auto gain</label>
        <span id="asrFlagsBadge" class="badge muted" style="display:none;margin-left:auto;"></span>
      </div>

      <div class="row">
        <label class="grow">Profile label <input id="asrLabel" placeholder="Studio A • MV7 • no AEC"></label>
      </div>

      <div class="row">
        <div id="asrMeter" class="asr-meter"><div class="marker" aria-hidden="true"></div></div>
      </div>
      <div class="row spread">
        <div>Noise: <span id="asrNoise">–</span> dBFS</div>
        <div>Speech: <span id="asrSpeech">–</span> dBFS</div>
        <div>SNR: <span id="asrSnr">–</span> dB</div>
      </div>

      <div class="row gap">
        <button id="asrStartBtn" class="btn primary">Start calibration</button>
        <button id="asrPreviewBtn" class="btn">Preview (gate)</button>
        <button id="asrPreviewStop" class="btn">Stop preview</button>
        <button id="asrSaveBtn" class="btn success">Save profile</button>
      </div>
      <small class="muted">Step 1: Stay quiet for a few seconds so we can measure background noise. Step 2: Speak in your normal voice so we can set speech level.</small>
      <small class="muted">Tip: Use headphones; leave NS/AGC off for best timing. Enable AEC only if using speakers.</small>
    `;
    container.appendChild(sec);
  } catch {}
}

