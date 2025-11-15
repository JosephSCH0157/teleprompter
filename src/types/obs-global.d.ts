// src/types/obs-global.d.ts
export { };

declare global {
  interface Window {
    obs?: {
      test?: () => void | Promise<void>;
      connect?: (...args: any[]) => any;
      configure?: (...args: any[]) => any;
    };
    __tpSmoke?: { obsTestRan?: boolean };
  }
}
