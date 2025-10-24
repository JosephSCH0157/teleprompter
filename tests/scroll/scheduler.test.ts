import { installScheduler, scheduler } from '../../src/scroll/scheduler';

describe('scroll scheduler', () => {
  beforeEach(() => {
    document.body.innerHTML = `
      <div id="viewer" style="height: 200px; overflow:auto"></div>
    `;
    const viewer = document.getElementById('viewer') as HTMLElement;
    // Simulate tall content
    Object.defineProperty(viewer, 'clientHeight', { value: 200 });
    Object.defineProperty(viewer, 'scrollHeight', { value: 2000 });

    // Spy on scrollTo
    (viewer as any).scrollTo = jest.fn();

    installScheduler();
    scheduler.setScroller(viewer);
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('coalesces multiple writes into a single rAF with the last value', () => {
    const viewer = document.getElementById('viewer') as any;
    scheduler.write(10);
    scheduler.write(500);
    scheduler.write(1500); // last one should win
    expect(viewer.scrollTo).not.toHaveBeenCalled();

    jest.advanceTimersByTime(17); // next frame
    expect(viewer.scrollTo).toHaveBeenCalledTimes(1);
    expect((viewer.scrollTo as jest.Mock).mock.calls[0][0]).toEqual({ top: 1500, behavior: 'auto' });
  });

  it('clamps to max scroll height', () => {
    const viewer = document.getElementById('viewer') as any;
    scheduler.write(999999);
    jest.advanceTimersByTime(17);
    const arg = (viewer.scrollTo as jest.Mock).mock.calls[0][0] as any;
    expect(arg.top).toBe(1800); // 2000 - 200
  });
});
