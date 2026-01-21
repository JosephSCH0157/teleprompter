export function buildSettingsContent(rootEl: HTMLElement | null) {
  if (!rootEl) return '';
  // Render a compact settings body with tab content placeholders.
  // The media tab contains mic device selector and mic controls which
  // will be wired to the TS mic API via `wireSettingsDynamic`.
  try { console.info('[settings-builder] renderSettingsBody TS v2025-12-07'); } catch {}
  const html = `
    <div class="settings-body-root" data-settings-source="ts-builder-2025-12-07">
    <div id="settingsTabs" class="settings-tabs" role="tablist">
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
            <button id="typoCopyMainToDisplay" class="chip">Copy ??? Display</button>
            <button class="chip" data-typo-preset data-display="main" data-typo-preset-name="readable">Readable</button>
            <button class="chip" data-typo-preset data-display="main" data-typo-preset-name="studio">Studio</button>
            <button class="chip" data-typo-preset data-display="main" data-typo-preset-name="bigroom">Big Room</button>
          </div>
        </div>

        <div class="settings-card anim-in">
          <h4>External Display Typography</h4>
          <div class="settings-inline-row" id="typographyPresetsRow">
            <span class="microcopy" style="color:#9fb4c9;font-size:12px">Presets:</span>
            <button type="button" class="chip btn-chip" data-typo-preset="default" aria-pressed="false">Default</button>
            <button type="button" class="chip btn-chip" data-typo-preset="easyRead" aria-pressed="false">EasyRead</button>
            <button type="button" class="chip btn-chip" data-typo-preset="smoothComfort" aria-pressed="false">SmoothComfort</button>
            <label class="microcopy" style="margin-left:auto;display:flex;gap:8px;align-items:center;color:#9fb4c9;font-size:12px">
              <input type="checkbox" id="typoPresetApplyBoth" />
              Apply to main too
            </label>
          </div>
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
            <button id="typoCopyDisplayToMain" class="chip">Copy ??? Main</button>
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

      <section class="settings-card asr anim-in" id="asrSettingsCard">
        <h4>ASR (speech-to-text)</h4>
        <div class="settings-grid" style="gap:8px;grid-template-columns: repeat(auto-fit,minmax(160px,1fr));">
          <label>Engine
            <select id="asrEngine" title="Choose how Anvil listens to your voice. Different engines trade off speed, accuracy, and privacy.">
              <option value="webspeech">Web Speech (browser)</option>
              <option value="vosk">Offline (WASM)</option>
              <option value="whisper">Server (Whisper bridge)</option>
            </select>
          </label>
          <label>Language
            <input id="asrLang" type="text" placeholder="en-US" title="Language you'll speak during recording so ASR can interpret correctly.">
          </label>
          <label><input id="asrInterim" type="checkbox" title="Show partial speech results before a sentence finishes for faster scroll response."> Use interim results</label>
          <label><input id="asrFillers" type="checkbox" title="Remove filler words like um/uh/like so scroll aligns better with your script."> Filter filler words</label>
          <label>Threshold
            <input id="asrThresh" type="number" step="0.01" min="0" max="1" title="Minimum confidence before ASR accepts words. Higher = cleaner/slower; lower = more responsive/noisier.">
          </label>
          <label>Endpointing (ms)
            <input id="asrEndMs" type="number" min="200" step="50" title="How long ASR waits after silence before finalizing a phrase. Lower reacts faster; higher is smoother but delayed.">
          </label>
        </div>
        <div class="settings-small asr-status-lines" style="margin-top:8px;display:flex;flex-direction:column;gap:4px;">
          <span id="asrSaveStatus" aria-live="polite"></span>
          <span id="asrAppliedStatus" aria-live="polite"></span>
        </div>
      </section>

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
          <button id="autoRecordPickBtn" class="chip" type="button">Change auto-save folder</button>
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
          <span id="obsStatusText" class="badge muted obs-status" style="margin-left:auto">disconnected</span>
        </div>
        <form id="settingsObsCredsForm" class="settings-inline-row" autocomplete="off" novalidate onsubmit="return false;">
          <label>Host <input id="settingsObsHost" type="text" class="select-md" placeholder="127.0.0.1:4455" autocomplete="off"/></label>
          <label>Password <input id="settingsObsPassword" type="password" class="select-md" placeholder="********" autocomplete="current-password"/></label>
          <button type="submit" hidden aria-hidden="true"></button>
        </form>
        <div class="row gap">
          <button id="settingsObsTest" data-action="obs-test" class="chip btn-chip" type="button">Test connection</button>
          <span id="settingsObsTestMsg" class="obs-test-msg" role="status" aria-live="polite"></span>
        </div>
        <small class="muted">OBS ??? Tools ??? WebSocket Server Settings (default port 4455). Use this host and password.</small>
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
      <div class="settings-card anim-in">
        <h4>Anvil Teleprompter</h4>
        <p>Professional teleprompting for podcasters and creators who read out loud.</p>
        <p>
          Anvil is built for real-world recording — not influencer scripts, not AI voices, not gimmicks.
          It stays with you as you speak, adapts when you pause or speed up, and keeps your delivery natural.
        </p>
        <h5>Pricing</h5>
        <div class="row gap">
          <div class="settings-value">
            <strong>$15</strong>
            <span>/ month</span>
          </div>
          <div class="settings-meta">Cancel anytime</div>
        </div>
        <div class="row gap">
          <div class="settings-value">
            <strong>$40</strong>
            <span>/ quarter</span>
          </div>
          <div class="settings-meta">3 months · Save $5</div>
        </div>
        <p><strong>What’s included</strong></p>
        <ul>
          <li>Speech-synced & Hybrid scrolling keeps you in rhythm without rigid pacing.</li>
          <li>Manual, WPM, and Hybrid modes so you can pick the workflow that fits now.</li>
          <li>Mirrored display support for tablets, monitors, or teleprompter glass.</li>
          <li>Recording controls & OBS integration — stay in flow while managing takes.</li>
          <li>Script formatting & validation with pacing cues/safety checks.</li>
          <li>Ongoing updates included — improvements ship with your subscription.</li>
        </ul>
        <p><strong>What this subscription covers</strong></p>
        <p>
          This plan includes Anvil only. Other tools in the Podcaster’s Forge ecosystem (script writing,
          editing, publishing) are not included at this time and may become separate offers in the future.
        </p>
        <p><strong>Built for real voices</strong></p>
        <p>
          Anvil doesn’t try to sound like you. It doesn’t replace you. It helps you deliver — smoothly,
          confidently, and naturally. If you record podcasts, videos, or long-form spoken content,
          Anvil is built for the way you actually work.
        </p>
        <p><strong>Ready to get started?</strong></p>
        <p>
          Start with Anvil.
        </p>
      </div>
      </section>

      <section class="settings-panel" data-settings-panel="about" data-tab-content="about" hidden>
        <div class="settings-card anim-in" data-tab="about">
          <h4>About Anvil</h4>
          <div class="settings-small">
            <p>
              Anvil is a core tool in the Podcaster's Forge - a focused teleprompter and recording companion
              built for creators who want fewer tabs, less chaos, and total control when the camera is on.
            </p>
            <p>
              Anvil is designed to stay out of your way.
              No cloud lock-in. No jittery scrolling. No surprise behavior mid-take.
            </p>
            <p>
              Just a calm, predictable tool that does exactly what you expect - every time.
            </p>
            <p><strong>What Anvil Does Well</strong></p>
            <ul>
              <li>Smooth, deterministic scroll control that stays locked and readable.</li>
              <li>Typography and color tuning optimized for on-camera delivery.</li>
              <li>Scripts stay local, portable, and easy to swap during sessions.</li>
              <li>Mirrored display support for confidence monitors.</li>
              <li>OBS integration to keep recording perfectly in sync.</li>
              <li>Built with a TypeScript-first, single-runtime architecture for long-term stability.</li>
            </ul>
            <p>
              Anvil is part of a larger Forge ecosystem designed to take creators from
              idea to script to recording to publishing without duct-taped workflows or mental overhead.
            </p>
            <p><strong>Support Development</strong></p>
            <p>
              If Anvil has saved you at least one cup of coffee's worth of time, you can support ongoing
              development here:
              <a href="https://buymeacoffee.com/podcastersforge"
                 class="settings-link"
                 target="_blank"
                 rel="noopener noreferrer">
                buymeacoffee.com/podcastersforge
              </a>
            </p>
            <p>
              Support helps fund continued work on Anvil and the rest of the Podcaster's Forge toolchain.
            </p>
            <p id="aboutVersion">Version: Anvil 2.0</p>
          </div>
        </div>
      </section>
    </div>
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

      <div class="row" style="gap:8px;align-items:center;">
        <label class="grow">Profile
          <select id="asrProfileSelect"></select>
        </label>
        <button id="asrProfileLoad" class="chip btn-chip" type="button">Load profile</button>
      </div>
      <small class="muted">Choose a saved ASR profile to restore calibration values.</small>

      <div class="row">
        <label><input id="asrAEC" type="checkbox"> Echo cancellation</label>
        <label><input id="asrNS"  type="checkbox"> Noise suppression</label>
        <label><input id="asrAGC" type="checkbox"> Auto gain</label>
        <span id="asrFlagsBadge" class="badge muted" style="display:none;margin-left:auto;"></span>
      </div>

      <div class="row">
        <label class="grow">Profile label <input id="asrLabel" placeholder="Studio A | MV7 | no AEC"></label>
      </div>

      <div class="row">
        <div id="asrMeter" class="asr-meter"><div class="marker" aria-hidden="true"></div></div>
      </div>
      <div class="row spread">
        <div>Noise: <span id="asrNoise">--</span> dBFS</div>
        <div>Speech: <span id="asrSpeech">--</span> dBFS</div>
        <div>SNR: <span id="asrSnr">--</span> dB</div>
      </div>

      <div class="row gap">
        <button id="asrStartBtn" class="btn primary">Start calibration</button>
        <button id="asrCalibBtn" type="button" hidden aria-hidden="true">Calibrate (hidden)</button>
        <button id="asrPreviewBtn" class="btn">Preview (gate)</button>
        <button id="asrPreviewStop" class="btn">Stop preview</button>
        <button id="asrSaveBtn" class="btn success">Save profile</button>
      </div>
      <div
        class="asr-status-banner"
        data-calibration-status
        id="asrCalStatus"
        hidden
      >
        Click ???Start calibration??? to begin. We???ll ask you to stay quiet, then speak in your normal voice.
      </div>
      <small class="muted">Tip: Use headphones; leave NS/AGC off for best timing. Enable AEC only if using speakers.</small>
    `;
    container.appendChild(sec);
  } catch {}
}
