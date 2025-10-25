// Shared TS types to start the migration

export interface BootTraceEntry {
  t: number;
  m: string;
}

export interface AppBootOptions {
  DEV: boolean;
  CALM: boolean;
  QUIET: boolean;
  ADDV: string;
}

export type CoreInit = () => Promise<void>;
