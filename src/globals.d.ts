interface Window {
  __TP_DEV?: boolean;
  __TP_CALM?: boolean;
  __tpScrollWrite?: import('./scroll/scroll-writer').ScrollWriter | ((top: number) => void);
  __tpMatcher?: { matchBatch?: Function };
  HUD?: any;
  __tpObsBridge?: any;
  _initCore?: Function;
  __lastScrollTarget?: any;
}

declare const __TP_DEV: boolean | undefined;
declare const __TP_CALM: boolean | undefined;

export { };

