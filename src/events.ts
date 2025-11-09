// src/events.ts
// Lightweight event helper for type-safe CustomEvents

export function emit<T = unknown>(name: string, detail: T): void {
  // Using window ensures listeners in any module can subscribe.
  window.dispatchEvent(new CustomEvent<T>(name, { detail }));
}

export function on<T = unknown>(name: string, handler: (_detail: T) => void): () => void {
  const listener = (e: Event) => {
    const detail = (e as CustomEvent<T>).detail;
    handler(detail);
  };
  window.addEventListener(name, listener);
  return () => window.removeEventListener(name, listener);
}
