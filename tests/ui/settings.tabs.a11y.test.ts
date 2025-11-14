/**
 * Verifies each tab has aria-controls pointing at an existing [role="tabpanel"].
 * Uses the same wiring helpers the app uses.
 */
import { JSDOM } from 'jsdom';

function htmlFixture() {
  return `
    <div id="settingsOverlay" role="dialog" data-overlay="settings" hidden>
      <div id="settingsTabs" role="tablist">
        <button class="settings-tab" data-tab="general">General</button>
        <button class="settings-tab" data-tab="media">Media</button>
        <button class="settings-tab" data-tab="recording">Recording</button>
        <button class="settings-tab" data-tab="advanced">Advanced</button>
      </div>
      <div class="settings-card" data-tab="general"></div>
      <div class="settings-card" data-tab="media"></div>
      <div class="settings-card" data-tab="recording"></div>
      <div class="settings-card" data-tab="advanced"></div>
    </div>`;
}

function adoptWindow(win: any) {
  (global as any).window = win;
  (global as any).document = win.document;
  // copy enumerable props to global to mimic browser env
  Object.getOwnPropertyNames(win).forEach((key) => {
    if (!(key in global)) {
      // @ts-ignore
      (global as any)[key] = win[key];
    }
  });
}

test('each tab has aria-controls wired to an existing tabpanel', async () => {
  const dom = new JSDOM(`<!doctype html><body>${htmlFixture()}</body>`, { url: 'http://local/' });
  adoptWindow(dom.window as any);

  // open + wire like runtime
  jest.resetModules();
  const mod = await import('../../src/wiring/ui-binds');
  // Re-inject fixture in case module bootstraps touched DOM
  document.body.innerHTML = htmlFixture();
  mod.toggleOverlay('settings', true);
  mod.ensureSettingsTabsWiring();

  const overlayEl = document.getElementById('settingsOverlay') as HTMLElement;
  const tabs = Array.from(overlayEl.querySelectorAll<HTMLElement>('[role="tab"]'));
  
  expect(tabs.length).toBe(4);

  tabs.forEach(tab => {
    const controls = tab.getAttribute('aria-controls');
    expect(controls).toBeTruthy();
    const panel = document.getElementById(controls!);
    expect(panel).toBeTruthy();
    expect(panel!.getAttribute('role')).toBe('tabpanel');
  });
});
