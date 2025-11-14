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
    __tpHudNotes?: {
      addNote(n: { text: string; final: boolean; ts: number; sim?: number }): void;
      list(): { text: string; final: boolean; ts: number; sim?: number }[];
      clear(): void;
      setFilter(mode: 'all' | 'finals'): void;
      copyAll(): void;
      exportTxt(): void;
    };
    __tpRehearsal?: {
      enable?: () => void;
      disable?: () => void;
      isActive?: () => boolean;
      enterRehearsal?: () => void;
      exitRehearsal?: (withConfirm?: boolean) => boolean | void;
      isRehearsal?: () => boolean;
      enableRehearsal?: () => void;
      disableRehearsal?: () => void;
      isRehearsalActive?: () => boolean;
    };
  }
}

// Optional ambient chrome namespace (extension or injected environment)
// Declared loose to avoid forcing dependency on @types/chrome for builds that don't need it.
// Consumers should defensively guard for existence.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
declare const chrome: any;

export { };

