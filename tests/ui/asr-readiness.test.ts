/** @jest-environment jsdom */

import { computeAsrReadiness } from '../../src/asr/readiness';
import { appStore } from '../../src/state/app-store';
import { upsertProfile, setActiveProfile, getAsrState } from '../../src/asr/store';

function setAsrProfile() {
  const profile = {
    id: 'dev1',
    label: 'Test Mic',
    capture: { sampleRateHz: 48000, channelCount: 1, echoCancellation: false, noiseSuppression: false, autoGainControl: false, deviceId: 'mic-1' },
    cal: { noiseRmsDbfs: -50, noisePeakDbfs: -40, speechRmsDbfs: -20, speechPeakDbfs: -10, snrDb: 30 },
    vad: { tonDb: -40, toffDb: -50, attackMs: 50, releaseMs: 200 },
    filters: {},
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
  upsertProfile(profile as any);
  setActiveProfile(profile.id as any);
}

describe('ASR readiness gating', () => {
  beforeEach(() => {
    localStorage.clear();
    const state = getAsrState();
    state.activeProfileId = undefined as any;
    Object.keys(state.profiles || {}).forEach((k) => { delete (state.profiles as any)[k]; });
    appStore.set('micGranted', false as any);
    appStore.set('micDevice', '' as any);
  });

  test('returns NO_PERMISSION when mic not granted', () => {
    appStore.set('micGranted', false as any);
    const res = computeAsrReadiness();
    expect(res.ready).toBe(false);
    if (!res.ready) expect(res.reason).toBe('NO_PERMISSION');
  });

  test('returns NO_DEVICE when granted but no device', () => {
    appStore.set('micGranted', true as any);
    appStore.set('micDevice', '' as any);
    const res = computeAsrReadiness();
    expect(res.ready).toBe(false);
    if (!res.ready) expect(res.reason).toBe('NO_DEVICE');
  });

  test('warns when device present but no calibration', () => {
    appStore.set('micGranted', true as any);
    appStore.set('micDevice', 'mic-1' as any);
    const res = computeAsrReadiness();
    expect(res.ready).toBe(true);
    if (res.ready) expect(res.warn).toBe('NOT_CALIBRATED');
  });

  test('ready with calibrated profile and device', () => {
    setAsrProfile();
    appStore.set('micGranted', true as any);
    appStore.set('micDevice', 'mic-1' as any);
    const res = computeAsrReadiness();
    expect(res.ready).toBe(true);
    if (res.ready) expect(res.warn).toBeUndefined();
  });
});
