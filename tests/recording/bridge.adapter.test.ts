import { createBridgeAdapter } from '../../adapters/bridge';

describe('Bridge adapter (smoke)', () => {
  const origFetch = global.fetch as any;
  beforeEach(() => {
    (global as any).fetch = jest.fn(() => Promise.resolve({ ok: true }));
  });
  afterEach(() => {
    (global as any).fetch = origFetch;
    jest.clearAllMocks();
  });

  test('factory returns adapter shape', async () => {
    const a = createBridgeAdapter() as any;
    expect(a).toBeTruthy();
    expect(a.id).toBe('bridge');
    expect(typeof a.isAvailable).toBe('function');
    expect(typeof a.start).toBe('function');
    expect(typeof a.stop).toBe('function');
    await expect(a.isAvailable()).resolves.toBe(true);
  });

  test('start/stop trigger fetch to configured URLs', async () => {
    const a = createBridgeAdapter() as any;
    a.configure({ startUrl: 'http://127.0.0.1:5723/record/start', stopUrl: 'http://127.0.0.1:5723/record/stop' });

    await a.start();
    expect(global.fetch).toHaveBeenCalled();

    await a.stop();
    expect((global.fetch as any).mock.calls.length).toBeGreaterThanOrEqual(2);
  });
});
