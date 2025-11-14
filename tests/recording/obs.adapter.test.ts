import { createOBSAdapter } from '../../adapters/obs';

describe('OBS adapter (smoke)', () => {
  const origWS = (global as any).WebSocket;
  beforeAll(() => {
    // Minimal presence so isAvailable() reports true
    (global as any).WebSocket = function DummyWS(this: any) {} as any;
  });
  afterAll(() => {
    (global as any).WebSocket = origWS;
  });

  test('factory returns adapter shape', async () => {
    const a = createOBSAdapter() as any;
    expect(a).toBeTruthy();
    expect(a.id).toBe('obs');
    expect(typeof a.isAvailable).toBe('function');
    expect(typeof a.start).toBe('function');
    expect(typeof a.stop).toBe('function');
    // isAvailable resolves based on WebSocket presence
    await expect(a.isAvailable()).resolves.toBe(true);
  });
});
