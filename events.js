// src/events.ts
// Lightweight event helper for type-safe CustomEvents
export function emit(name, detail) {
    // Using window ensures listeners in any module can subscribe.
    window.dispatchEvent(new CustomEvent(name, { detail }));
}
export function on(name, handler) {
    const listener = (e) => {
        const detail = e.detail;
        handler(detail);
    };
    window.addEventListener(name, listener);
    return () => window.removeEventListener(name, listener);
}
