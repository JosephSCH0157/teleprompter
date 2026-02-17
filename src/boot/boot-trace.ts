export type BootTraceEvent = {
  seq: number;
  t: number;
  tag: string;
  detail?: unknown;
};

const TRACE_KEY = '__tpBootTrace';
const ENABLE_KEY = '__tpBootTraceEnabled';
const SEQ_KEY = '__tpBootTraceSeq';

declare global {
  interface Window {
    __tpBootTrace?: BootTraceEvent[];
    __tpBootTraceEnabled?: boolean;
    __tpBootTraceSeq?: number;
    tpBootTraceGet?: () => BootTraceEvent[];
    tpBootTraceDump?: () => void;
    tpBootTraceExport?: () => string;
  }
}

function getNow(): number {
  try {
    if (typeof performance !== 'undefined' && typeof performance.now === 'function') {
      return performance.now();
    }
  } catch {
    // ignore
  }
  return Date.now();
}

function isEnabledFromEnv(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    const params = new URLSearchParams(window.location.search || '');
    if (params.get('boottrace') === '1') return true;
    if (params.get('boottrace') === '0') return false;
    if (params.get('dev') === '1' || params.has('dev')) return true;
  } catch {
    // ignore
  }
  try {
    const hash = String(window.location.hash || '').toLowerCase();
    if (hash.includes('boottrace=1')) return true;
    if (hash.includes('dev')) return true;
  } catch {
    // ignore
  }
  try {
    if (window.localStorage?.getItem('tp_dev_mode') === '1') return true;
  } catch {
    // ignore
  }
  try {
    const w = window as any;
    if (w.__TP_DEV || w.__TP_DEV1) return true;
  } catch {
    // ignore
  }
  return false;
}

function getStore(): BootTraceEvent[] {
  const w = window as any;
  const store = w[TRACE_KEY];
  if (Array.isArray(store)) return store;
  const created: BootTraceEvent[] = [];
  w[TRACE_KEY] = created;
  return created;
}

function nextSeq(): number {
  const w = window as any;
  const current = Number(w[SEQ_KEY]);
  const seq = Number.isFinite(current) ? current + 1 : 1;
  w[SEQ_KEY] = seq;
  return seq;
}

export function isBootTraceEnabled(): boolean {
  if (typeof window === 'undefined') return false;
  const w = window as any;
  if (typeof w[ENABLE_KEY] !== 'boolean') {
    w[ENABLE_KEY] = isEnabledFromEnv();
  }
  return !!w[ENABLE_KEY];
}

export function bootTrace(tag: string, detail?: unknown): void {
  if (typeof window === 'undefined') return;
  if (!isBootTraceEnabled()) return;
  try {
    const ev: BootTraceEvent = {
      seq: nextSeq(),
      t: getNow(),
      tag: String(tag || '').trim() || 'unknown',
      detail,
    };
    getStore().push(ev);
  } catch {
    // ignore tracing errors
  }
}

export function bootTraceGet(): BootTraceEvent[] {
  if (typeof window === 'undefined') return [];
  try {
    return getStore().slice().sort((a, b) => a.seq - b.seq);
  } catch {
    return [];
  }
}

export function bootTraceExport(): string {
  try {
    return JSON.stringify(bootTraceGet(), null, 2);
  } catch {
    return '[]';
  }
}

export function bootTraceDumpToConsole(): void {
  if (typeof window === 'undefined') return;
  if (!isBootTraceEnabled()) return;
  const events = bootTraceGet();
  try {
    console.groupCollapsed(`[BOOTTRACE] ${events.length} events`);
    for (const ev of events) {
      console.log(`${ev.t.toFixed(1)}ms`, ev.tag, ev.detail ?? '');
    }
    console.groupEnd();
  } catch {
    // ignore
  }
}

try {
  if (typeof window !== 'undefined') {
    if (typeof window.tpBootTraceGet !== 'function') window.tpBootTraceGet = bootTraceGet;
    if (typeof window.tpBootTraceDump !== 'function') window.tpBootTraceDump = bootTraceDumpToConsole;
    if (typeof window.tpBootTraceExport !== 'function') window.tpBootTraceExport = bootTraceExport;
  }
} catch {
  // ignore
}

