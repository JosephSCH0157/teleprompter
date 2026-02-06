interface Window {
  __TP_DEV?: boolean;
  __TP_CALM?: boolean;
  __tpScrollWrite?: import('./scroll/scroll-writer').ScrollWriter | ((top: number) => void);
  __tpScrollWriter?: typeof import('./scroll/scroll-writer');
  __tpAuto?: {
    set?: (on: boolean) => void;
    setEnabled?: (on: boolean) => void;
    setMode?: (mode: string) => void;
    setStepPx?: (px: number) => void;
    setSpeed?: (pxPerSec: number) => void;
    rebase?: (top?: number) => void;
    getState?: () => { enabled: boolean; speed: number };
    startFromPreroll?: () => void;
  };
  __tpMatcher?: { matchBatch?: Function };
  HUD?: any;
  __tpObsBridge?: any;
  _initCore?: Function;
  __lastScrollTarget?: any;
}

declare const __TP_DEV: boolean | undefined;
declare const __TP_CALM: boolean | undefined;

export { };

