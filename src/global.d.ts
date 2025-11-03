declare global {
  interface Window {
    __TP_DEV?: boolean;
    __TP_ADDV?: ((p: string) => string) | string;
    __TP_QUIET?: boolean;
    __TP_BOOT_TRACE?: Array<{ t: number; m: string }>;
    APP_VERSION?: string;
    tpMarkInitDone?: (reason?: string) => void;
    tpMarkInitRunning?: () => void;
    __tp_has_script?: boolean;
  }
}

export { };

