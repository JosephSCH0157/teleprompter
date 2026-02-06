type AuditPhase = 'idle' | 'preroll' | 'live' | 'wrap' | 'stopped' | 'stopping' | string;

export type ScrollModeAuditWrite = {
  writer: string;
  from?: string | null;
  to?: string | null;
  phase?: AuditPhase | null;
  source?: string;
  via?: string;
  stack?: boolean;
};

const EXPECTED_WRITERS = new Set<string>([
  'ui/applyUiScrollMode',
  'features/scroll/mode-router',
  'scroll/mode-router',
  'state/app-store',
]);

const CONTINUOUS_MODES = new Set<string>(['timed', 'wpm', 'hybrid', 'asr']);
const FORBIDDEN_PHASES = new Set<string>(['idle', 'preroll']);
const RACE_WINDOW_MS = 150;
const TRANSITION_SUPPRESS_MS = 50;

type PendingWriter = { writer: string; meta?: Partial<ScrollModeAuditWrite> };
const writerStack: PendingWriter[] = [];

let lastWriteAt = 0;
let lastWriter = '';
let lastMode = '';
let lastPhase = '';

export function auditEnabled(): boolean {
  try {
    const w = window as any;
    if (w?.__TP_DEV || w?.__TP_DEV1 || w?.__tpDevMode) return true;
    if (w?.localStorage?.getItem?.('tp_dev_mode') === '1') return true;
    if (typeof location !== 'undefined' && location.search.includes('dev=1')) return true;
  } catch {}
  return false;
}

export function withScrollModeWriter<T>(
  writer: string,
  fn: () => T,
  meta?: Partial<ScrollModeAuditWrite>,
): T {
  if (!auditEnabled()) return fn();
  writerStack.push({ writer, meta });
  try {
    return fn();
  } finally {
    writerStack.pop();
  }
}

export function getScrollModeAuditContext(): PendingWriter | null {
  if (!auditEnabled()) return null;
  return writerStack.length ? writerStack[writerStack.length - 1] : null;
}

function isContinuousMode(mode: string): boolean {
  return CONTINUOUS_MODES.has(mode);
}

function normalize(value: string | null | undefined): string {
  return String(value || '').trim().toLowerCase();
}

function emitUnexpected(label: string, payload: Record<string, unknown>): void {
  try {
    console.warn(`[scroll-audit] UNEXPECTED ${label}`, payload);
  } catch {}
}

export function recordWindowSetterCall(
  name: string,
  detail?: Record<string, unknown>,
  withStack = false,
): void {
  if (!auditEnabled()) return;
  const payload: Record<string, unknown> = {
    name,
    detail: detail || {},
  };
  if (withStack) {
    try {
      payload.stack = new Error().stack;
    } catch {}
  }
  emitUnexpected('window-setter', payload);
}

export function recordScrollModeWrite(event: ScrollModeAuditWrite): void {
  if (!auditEnabled()) return;
  const now = Date.now();
  const writer = event.writer || 'unknown';
  const from = normalize(event.from);
  const to = normalize(event.to);
  if (!to || to === from) return;

  const phase = normalize(event.phase);
  const reasons: string[] = [];

  if (!EXPECTED_WRITERS.has(writer)) reasons.push('unexpected-writer');
  if (FORBIDDEN_PHASES.has(phase) && isContinuousMode(to)) reasons.push('forbidden-phase');
  const deltaMs = lastWriteAt ? now - lastWriteAt : 0;
  if (lastWriteAt && deltaMs < RACE_WINDOW_MS) reasons.push('rapid-write');

  if (reasons.length > 0) {
    const payload: Record<string, unknown> = {
      reasons,
      writer,
      from,
      to,
      phase: phase || 'unknown',
      deltaMs: lastWriteAt ? deltaMs : null,
      lastWriter: lastWriter || null,
      lastMode: lastMode || null,
      lastPhase: lastPhase || null,
    };
    if (event.source) payload.source = event.source;
    if (event.via) payload.via = event.via;
    if (event.stack) {
      try {
        payload.stack = new Error().stack;
      } catch {}
    }
    emitUnexpected('scrollMode-write', payload);
  }

  lastWriteAt = now;
  lastWriter = writer;
  lastMode = to;
  lastPhase = phase;
}

export function recordModeTransition(event: ScrollModeAuditWrite): void {
  if (!auditEnabled()) return;
  const now = Date.now();
  if (lastWriteAt && now - lastWriteAt < TRANSITION_SUPPRESS_MS) return;
  const from = normalize(event.from);
  const to = normalize(event.to);
  if (!to || to === from) return;
  const phase = normalize(event.phase);
  if (FORBIDDEN_PHASES.has(phase) && isContinuousMode(to)) {
    const payload: Record<string, unknown> = {
      reason: 'forbidden-phase',
      writer: event.writer,
      from,
      to,
      phase: phase || 'unknown',
    };
    if (event.source) payload.source = event.source;
    if (event.via) payload.via = event.via;
    if (event.stack) {
      try {
        payload.stack = new Error().stack;
      } catch {}
    }
    emitUnexpected('scrollMode-transition', payload);
  }
}
