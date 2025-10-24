// Minimal rAF polyfill for deterministic tests
// Using modern fake timers in tests to advance frames.
if (!('requestAnimationFrame' in globalThis)) {
  // @ts-ignore
  globalThis.requestAnimationFrame = (cb: FrameRequestCallback) => setTimeout(() => cb(performance.now()), 16) as unknown as number;
}
// @ts-ignore
globalThis.cancelAnimationFrame ||= ((id: number) => clearTimeout(id as any));
