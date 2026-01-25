const noop = () => undefined;

export function createRecognizer() {
  return {
    start: noop,
    stop: noop,
    abort: noop,
    on: noop,
    onend: null,
    onerror: null,
  };
}
