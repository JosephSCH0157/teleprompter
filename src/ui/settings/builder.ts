export function buildSettingsContent(rootEl: HTMLElement | null) {
  if (!rootEl) return '';
  // Render a compact settings body with tab content placeholders.
  // The media tab contains mic device selector and mic controls which
  // will be wired to the TS mic API via `wireSettingsDynamic`.
  const html = `
    <div data-tab-content="general">
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
    </div>

    <div data-tab-content="media" style="display:none">
      <h4>Microphone</h4>
      <div class="row">
        <label>Input device
          <select id="settingsMicSel" class="select-md"></select>
        </label>
      </div>
      <div class="row">
        <button id="settingsRequestMicBtn" class="chip">Request mic</button>
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
    </div>

    <div data-tab-content="recording" style="display:none">
      <h4>Recording</h4>
      <div class="settings-card anim-in">
        <h4>OBS (WebSocket)</h4>
        <div class="row">
          <label><input type="checkbox" id="settingsEnableObs"/> Enable OBS</label>
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
    </div>

    <div data-tab-content="advanced" style="display:none">
      <h4>Advanced</h4>
      <div class="row">Advanced settings.</div>
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
      <small class="muted">Tip: Use headphones; leave NS/AGC off for best timing. Enable AEC only if using speakers.</small>
    `;
    container.appendChild(sec);
  } catch {}
}

