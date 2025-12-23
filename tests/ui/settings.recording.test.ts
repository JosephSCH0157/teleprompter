/**
 * Tests for recording-related Settings UI (auto-record + recorder adapters).
 */
import { mountSettingsOverlay } from '../../src/ui/settings';
import { wireSettingsDynamic } from '../../src/ui/settings/wire';
import * as AutoSsot from '../../src/state/auto-record-ssot';
import * as RecorderApi from '../../recorders';

jest.mock('../../src/state/auto-record-ssot');
jest.mock('../../recorders');

function setupStore() {
  const subs: Record<string, Array<(v: unknown) => void>> = {};
  const state: Record<string, unknown> = { autoRecord: false };
  return {
    state,
    set: (key: string, value: unknown) => {
      state[key] = value;
      (subs[key] || []).forEach((fn) => fn(value));
    },
    get: (key: string) => state[key],
    subscribe: (key: string, fn: (v: unknown) => void) => {
      subs[key] = subs[key] || [];
      subs[key].push(fn);
    },
  };
}

describe('Settings recording UI (TS overlay)', () => {
  let store: ReturnType<typeof setupStore>;

  beforeEach(() => {
    jest.resetAllMocks();
    jest.mocked(AutoSsot.getAutoRecordEnabled).mockReturnValue(false);
    jest.mocked(AutoSsot.setAutoRecordEnabled).mockImplementation(() => true);
    jest
      .mocked(RecorderApi.getSettings)
      .mockReturnValue({ selected: ['core'], mode: 'multi' } as any);
    jest.mocked(RecorderApi.setSelected).mockImplementation();
    jest.mocked(RecorderApi.setMode).mockImplementation();
    document.body.innerHTML = `
      <div id="settingsOverlay">
        <div id="settingsBody"></div>
      </div>
    `;
    store = setupStore();
    (window as any).__tpStore = store;
    (window as any).__tpMic = { populateDevices: jest.fn() };
    (window as any).__tpRecDir = {
      supported: () => true,
      init: jest.fn(),
      get: jest.fn(() => null),
      pick: jest.fn(async () => ({ name: 'RecFolder' })),
      clear: jest.fn(),
    };
  });

  it('renders auto-record and recorder cards after mount', () => {
    mountSettingsOverlay();
    const root = document.getElementById('settingsBody') as HTMLElement;
    expect(root.querySelector('#settingsAutoRecord')).toBeTruthy();
    expect(root.querySelector('#autoRecordFolderName')).toBeTruthy();
    expect(root.querySelector('#recAdapterCore')).toBeTruthy();
    expect(root.querySelector('#recAdapterObs')).toBeTruthy();
    expect(root.querySelector('#btnExportSettings')).toBeTruthy();
    expect(root.querySelector('#btnImportSettings')).toBeTruthy();
  });

  it('syncs auto-record checkbox from store and writes back on toggle', async () => {
    mountSettingsOverlay();
    const root = document.getElementById('settingsBody') as HTMLElement;
    wireSettingsDynamic(root);
    const chk = root.querySelector('#settingsAutoRecord') as HTMLInputElement;

    // Store → UI
    expect(chk.checked).toBe(false);
    store.set('autoRecord', true);
    expect(chk.checked).toBe(true);

    // UI → SSOT/setter
    chk.checked = false;
    chk.dispatchEvent(new Event('change', { bubbles: true }));
    expect(RecorderApi.setSelected).not.toHaveBeenCalled(); // sanity: only auto toggle here
    expect(AutoSsot.setAutoRecordEnabled).toHaveBeenCalledWith(false);
  });

  it('applies recorder adapter selections to registry', () => {
    mountSettingsOverlay();
    const root = document.getElementById('settingsBody') as HTMLElement;
    wireSettingsDynamic(root);
    const obsCb = root.querySelector('#recAdapterObs') as HTMLInputElement;
    const modeCb = root.querySelector('#recModeSingle') as HTMLInputElement;

    obsCb.checked = true;
    obsCb.dispatchEvent(new Event('change', { bubbles: true }));
    expect(RecorderApi.setSelected).toHaveBeenCalledWith(expect.arrayContaining(['core', 'obs']));

    modeCb.checked = true;
    modeCb.dispatchEvent(new Event('change', { bubbles: true }));
    expect(RecorderApi.setMode).toHaveBeenCalledWith('single');
  });
});
