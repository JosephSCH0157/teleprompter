import { createScrollModeRouter, type ScrollModeRouter } from '../../src/features/scroll/mode-router';

type SubCb = (v: unknown) => void;

class FakeStore {
  private map = new Map<string, unknown>();
  private subs = new Map<string, Set<SubCb>>();

  get(key: string): unknown { return this.map.get(key); }
  set(key: string, value: unknown): void {
    this.map.set(key, value);
    const set = this.subs.get(key);
    if (set) { for (const cb of [...set]) { try { cb(value); } catch {} } }
  }
  subscribe(key: string, cb: SubCb): () => void {
    const set = this.subs.get(key) || new Set<SubCb>();
    set.add(cb);
    this.subs.set(key, set);
    try { cb(this.get(key)); } catch {}
    return () => { try { set.delete(cb); } catch {} };
  }
}

function makeFakes() {
  const store = new FakeStore();
  const step = { enable: jest.fn(), disable: jest.fn(), isEnabled: jest.fn(() => false), stepLines: jest.fn(), stepBlock: jest.fn() };
  // Stateful rehearsal fake so router.disable() occurs only when active
  let rehActive = false;
  const rehearsal = {
    enable: jest.fn(() => { rehActive = true; }),
    disable: jest.fn(() => { rehActive = false; }),
    isActive: jest.fn(() => rehActive)
  };
  const auto = { setEnabled: jest.fn(), setMode: jest.fn() };
  return { store, step, rehearsal, auto };
}

describe('mode-router: basic toggling', () => {
  test('drives step and rehearsal based on store scrollMode', () => {
    const { store, step, rehearsal } = makeFakes();
    store.set('scrollMode', 'step'); // initial

    const router: ScrollModeRouter = createScrollModeRouter({ store, step, rehearsal });
    expect(router.getMode()).toBe('step');
    expect(step.enable).toHaveBeenCalledTimes(1);
    expect(step.disable).toHaveBeenCalledTimes(0);
    expect(rehearsal.enable).toHaveBeenCalledTimes(0);
    expect(rehearsal.disable).toHaveBeenCalledTimes(0);

    // Switch to rehearsal
    store.set('scrollMode', 'rehearsal');
    expect(rehearsal.enable).toHaveBeenCalledTimes(1);
    expect(step.disable).toHaveBeenCalledTimes(1);

    // Switch back to step
    store.set('scrollMode', 'step');
    expect(step.enable).toHaveBeenCalledTimes(2);
    expect(rehearsal.disable).toHaveBeenCalledTimes(1);
  });

  test('drives auto for auto/hybrid, off for others', () => {
    const { store, step, rehearsal, auto } = makeFakes();
    store.set('scrollMode', 'auto');

    const router: ScrollModeRouter = createScrollModeRouter({ store, step, rehearsal, auto });
    expect(router.getMode()).toBe('auto');
    expect(auto.setEnabled).toHaveBeenCalledWith(true);
    expect(auto.setMode).toHaveBeenCalledWith('auto');

    // Switch to hybrid
    store.set('scrollMode', 'hybrid');
    expect(router.getMode()).toBe('hybrid');
    expect(auto.setEnabled).toHaveBeenLastCalledWith(true);
    expect(auto.setMode).toHaveBeenLastCalledWith('hybrid');

    // Switch to step (auto off)
    store.set('scrollMode', 'step');
    expect(auto.setEnabled).toHaveBeenLastCalledWith(false);
  });
});
