// Ambient types for the dynamic speech orchestrator bundle loaded at runtime.
export { };

type AnyFn = (...args: any[]) => any;

type RecognizerLike = {
  start?: AnyFn;
  stop?: AnyFn;
  abort?: AnyFn;
  on?: AnyFn;
};

declare module '/speech/orchestrator.js' {
  export function startOrchestrator(): Promise<RecognizerLike | void> | RecognizerLike | void;
}
