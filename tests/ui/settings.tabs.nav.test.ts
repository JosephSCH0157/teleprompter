import { ensureSettingsTabsWiring } from '../../src/wiring/ui-binds';

// Keyboard navigation tests for Settings tabs wiring.
// Verifies ArrowRight / ArrowLeft / Home / End behavior, wrap-around, focus, and panel visibility.

function activeTabNames(root: HTMLElement) {
  const tabs = Array.from(root.querySelectorAll<HTMLElement>('[role="tab"], .settings-tab'));
  return tabs.filter(t => t.classList.contains('active')).map(t => t.dataset.tab || t.id.replace(/^tab-/, ''));
}

function visiblePanels(root: HTMLElement) {
  const panels = Array.from(root.querySelectorAll<HTMLElement>('[role="tabpanel"]'));
  return panels.filter(p => !p.hasAttribute('hidden')).map(p => p.getAttribute('data-tabpanel'));
}

describe('Settings tabs keyboard navigation', () => {
  let overlay: HTMLElement;
  let tablist: HTMLElement;
  let tabs: HTMLElement[];

  beforeEach(() => {
    document.body.innerHTML = `
      <div id="settingsOverlay" data-overlay="settings">
        <div id="settingsTabs" role="tablist">
          <button class="settings-tab" data-tab="general">General</button>
          <button class="settings-tab" data-tab="media">Media</button>
          <button class="settings-tab" data-tab="advanced">Advanced</button>
        </div>
        <div class="settings-card" data-tab="general">G</div>
        <div class="settings-card" data-tab="media">M</div>
        <div class="settings-card" data-tab="advanced">A</div>
      </div>
    `;
    overlay = document.getElementById('settingsOverlay') as HTMLElement;
    tablist = document.getElementById('settingsTabs') as HTMLElement;
    ensureSettingsTabsWiring();
    tabs = Array.from(tablist.querySelectorAll<HTMLElement>('.settings-tab'));
    // Focus initial active tab for key events.
    const active = tabs.find(t => t.classList.contains('active')) || tabs[0];
    active.focus();
  });

  function press(key: string) {
    const ev = new KeyboardEvent('keydown', { key, bubbles: true });
    tablist.dispatchEvent(ev);
  }

  function expectActive(name: string) {
    const actives = activeTabNames(overlay);
    expect(actives).toEqual([name]);
    expect((overlay as any).dataset.activeTab).toBe(name);
    // Only matching panel visible
    const visible = visiblePanels(overlay);
    expect(visible).toEqual([name]);
    const activeTab = tabs.find(t => (t.dataset.tab || '') === name) as HTMLElement;
    expect(document.activeElement).toBe(activeTab); // focus moved
    expect(activeTab.getAttribute('aria-selected')).toBe('true');
  }

  it('ArrowRight cycles forward', () => {
    expectActive('general');
    press('ArrowRight');
    expectActive('media');
    press('ArrowRight');
    expectActive('advanced');
  });

  it('ArrowLeft cycles backward', () => {
    // Move to last first
    press('ArrowLeft'); // wrap from first to last
    expectActive('advanced');
    press('ArrowLeft');
    expectActive('media');
    press('ArrowLeft');
    expectActive('general');
  });

  it('Home jumps to first; End jumps to last', () => {
    // Move somewhere else
    press('ArrowRight');
    expectActive('media');
    press('Home');
    expectActive('general');
    press('End');
    expectActive('advanced');
  });

  it('Wrap-around forward from last goes to first', () => {
    // Go to last
    press('End');
    expectActive('advanced');
    press('ArrowRight');
    expectActive('general');
  });

  it('Wrap-around backward from first goes to last', () => {
    expectActive('general');
    press('ArrowLeft');
    expectActive('advanced');
  });
});
