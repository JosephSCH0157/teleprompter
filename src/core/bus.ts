// Tiny app bus so features talk without globals
export type BusHandler<T = unknown> = (detail: T) => void;

export const bus = new EventTarget();

export function emit<T = unknown>(type: string, detail?: T): boolean {
  return bus.dispatchEvent(new CustomEvent<T>(type, { detail }));
}

export function on<T = unknown>(type: string, fn: BusHandler<T>): () => void {
  const h = (e: Event): void => {
    const evt = e as CustomEvent<T>;
    fn(evt.detail);
  };
  bus.addEventListener(type, h as EventListener);
  return () => bus.removeEventListener(type, h as EventListener);
}
