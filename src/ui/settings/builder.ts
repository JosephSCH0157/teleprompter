export function buildSettingsContent(rootEl: HTMLElement | null) {
  if (!rootEl) return '';
  // Render a compact settings body with tab content placeholders.
  // The media tab contains mic device selector and mic controls which
  // will be wired to the TS mic API via `wireSettingsDynamic`.
  const html = `
    <div data-tab-content="general">
      <h4>General</h4>
      <div class="row">
        <label>Font size <input id="settingsFontSize" type="number" min="16" max="96" step="2" class="select-md" /></label>
        <label>Line height <input id="settingsLineHeight" type="number" min="1.1" max="2" step="0.05" class="select-md" /></label>
      </div>
      <div class="settings-small">Applies to both the main script and the external display.</div>
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
    </div>

    <div data-tab-content="recording" style="display:none">
      <h4>Recording</h4>
      <div class="row">Recording settings live here.</div>
    </div>

    <div data-tab-content="advanced" style="display:none">
      <h4>Advanced</h4>
      <div class="row">Advanced settings.</div>
    </div>
  `;

  return html;
}

export { };

