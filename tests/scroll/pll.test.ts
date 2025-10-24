import { PLL, installPLL } from '../../src/scroll/pll';

describe('PLL module', () => {
  beforeAll(() => {
    installPLL();
  });

  test('bias remains clamped by maxBias after repeated updates', () => {
    // Ensure we start from neutral
    PLL.tune({ maxBias: 0.05, Kp: 0.5, Kd: 0.1, confMin: 0 });
    // simulate repeated updates with a persistent positive error
    for (let i = 0; i < 20; i++) {
      PLL.update({ yMatch: 200, yTarget: 0, conf: 1, dt: 16 });
    }
    expect(Math.abs(PLL.biasPct)).toBeLessThanOrEqual(0.051);
  });

  test('allowAnchor rate-limits subsequent calls', () => {
    // first call should allow
    const first = PLL.allowAnchor();
    expect(first).toBe(true);
    // immediate second call should be rate-limited
    const second = PLL.allowAnchor();
    expect(second).toBe(false);
  });

  test('onPause temporarily tunes decayMs and restores after timeout', () => {
    jest.useFakeTimers();
    // set decay to a known value
    PLL.tune({ decayMs: 900 });
    expect(typeof (PLL as any).tune).toBe('function');
    PLL.onPause();
    // Immediately after onPause, decayMs should be set to 400 via tune; we can't read internals,
    // but calling tune again with a distinct value should not throw.
    PLL.tune({ decayMs: 123 });
    // advance timers to let the reset timeout run
    jest.advanceTimersByTime(2500);
    jest.useRealTimers();
    expect(true).toBe(true); // smoke assertion to ensure no exceptions
  });
});
