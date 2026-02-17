// Centralized dev log-level helpers.
// Levels:
// 0 = silent
// 1 = normal dev (state transitions + warnings/errors)
// 2 = verbose probes
// 3 = trace/stack heavy diagnostics

const MIN_LOG_LEVEL = 0;
const MAX_LOG_LEVEL = 3;
const DEFAULT_DEV_LOG_LEVEL = 1;

const tagLastAt = new Map<string, number>();

function clampLogLevel(value: number): number {
  if (!Number.isFinite(value)) return MIN_LOG_LEVEL;
  return Math.max(MIN_LOG_LEVEL, Math.min(MAX_LOG_LEVEL, Math.floor(value)));
}

function parseLogLevelRaw(value: unknown): number | null {
  if (value == null) return null;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return null;
  return clampLogLevel(parsed);
}

function isDevContext(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    const w = window as any;
    if (w.__TP_DEV || w.__TP_DEV1 || w.__tpDevMode) return true;
    const params = new URLSearchParams(window.location.search || '');
    if (params.has('dev') || params.has('debug') || params.has('dev1')) return true;
    if (window.localStorage?.getItem('tp_dev_mode') === '1') return true;
  } catch {
    // ignore
  }
  return false;
}

export function getTpLogLevel(): number {
  if (typeof window === 'undefined') return MIN_LOG_LEVEL;
  try {
    const w = window as any;
    const runtimeLevel = parseLogLevelRaw(w.__tpLogLevel);
    if (runtimeLevel != null) return runtimeLevel;
  } catch {
    // ignore
  }
  try {
    const stored = parseLogLevelRaw(window.localStorage?.getItem('tp_log_level'));
    if (stored != null) return stored;
  } catch {
    // ignore
  }
  try {
    const params = new URLSearchParams(window.location.search || '');
    const fromQuery =
      parseLogLevelRaw(params.get('tp_log_level')) ??
      parseLogLevelRaw(params.get('logLevel')) ??
      parseLogLevelRaw(params.get('log'));
    if (fromQuery != null) return fromQuery;
  } catch {
    // ignore
  }
  return isDevContext() ? DEFAULT_DEV_LOG_LEVEL : MIN_LOG_LEVEL;
}

export function shouldLogLevel(minLevel: number): boolean {
  return getTpLogLevel() >= clampLogLevel(minLevel);
}

export function shouldLogTag(
  tag: string,
  minLevel = 2,
  throttleMs = 500,
): boolean {
  if (!shouldLogLevel(minLevel)) return false;
  const throttle = Math.max(0, Math.floor(throttleMs));
  if (!tag || throttle <= 0) return true;
  const now = Date.now();
  const last = tagLastAt.get(tag) ?? 0;
  if (now - last < throttle) return false;
  tagLastAt.set(tag, now);
  return true;
}

