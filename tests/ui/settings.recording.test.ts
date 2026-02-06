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
  const state: Record<string, unknown> = { autoRecord: false, recordAudioOnly: false };
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
      .mockReturnValue({ selected: ['core'], mode: 'single', recordingMode: 'av' } as any);
    jest.mocked(RecorderApi.setSelected).mockImplementation();
    jest.mocked(RecorderApi.setMode).mockImplementation();
    jest.mocked(RecorderApi.setRecordingMode).mockImplementation();
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
    expect(root.querySelector('#recEngineCore')).toBeTruthy();
    expect(root.querySelector('#recEngineObs')).toBeTruthy();
    expect(root.querySelector('#recModeAv')).toBeTruthy();
    expect(root.querySelector('#recModeAudio')).toBeTruthy();
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

  it('syncs audio-only toggle with store and stops the camera', () => {
    mountSettingsOverlay();
    const root = document.getElementById('settingsBody') as HTMLElement;
    (window as any).__tpCamera = { stopCamera: jest.fn() };
    wireSettingsDynamic(root);
    const chk = root.querySelector('#settingsAudioOnly') as HTMLInputElement;
    const hint = root.querySelector('#settingsAudioOnlyHint') as HTMLElement | null;

    store.set('recordAudioOnly', true);
    expect(chk.checked).toBe(true);
    expect(hint?.hidden).toBe(false);
    expect((window as any).__tpCamera.stopCamera).toHaveBeenCalled();

    chk.checked = false;
    chk.dispatchEvent(new Event('change', { bubbles: true }));
    expect(store.state.recordAudioOnly).toBe(false);
  });

  it('applies recorder adapter selections to registry', () => {
    mountSettingsOverlay();
    const root = document.getElementById('settingsBody') as HTMLElement;
    wireSettingsDynamic(root);
    const audioBtn = root.querySelector('#recModeAudio') as HTMLButtonElement;
    const obsBtn = root.querySelector('#recEngineObs') as HTMLButtonElement;

    audioBtn.click();
    expect(RecorderApi.setRecordingMode).toHaveBeenCalledWith('audio');

    obsBtn.click();
    expect(RecorderApi.setMode).toHaveBeenCalledWith('single');
    expect(RecorderApi.setSelected).toHaveBeenCalledWith(['obs']);
    expect(RecorderApi.setRecordingMode).toHaveBeenCalledWith('av');
  });
});
