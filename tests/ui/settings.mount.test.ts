import { mountSettingsOverlay } from '../../src/ui/settings';

describe('Settings mount', () => {
  beforeEach(() => {
    document.body.innerHTML = `
      <div id="settingsOverlay"><div id="settingsBody"></div></div>
    `;
    (window as any).__tpMic = { populateDevices: jest.fn() };
  });

  it('mounts into #settingsBody without throwing', () => {
    const root = document.getElementById('settingsBody') as HTMLElement;
    expect(() => mountSettingsOverlay(root)).not.toThrow();
    expect(root.childNodes.length).toBeGreaterThan(0);
  });
});
