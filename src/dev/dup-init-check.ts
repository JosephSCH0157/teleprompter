// Dev-only: track duplicate calls to common init/boot points.

interface InitLog {
  t: number;
  name: string;
  count: number;
  data?: unknown;
}

declare global {
  interface Window {
    __TP_INIT_COUNTS?: Record<string, number>;
    __TP_INIT_LOGS?: InitLog[];
    __tpRegisterInit?: (name: string, data?: unknown) => void;
  }
}

function isDev(): boolean {
  try {
    const url = String((typeof location !== 'undefined' && location.href) || '');
    const q = new URL(url).searchParams;
    if (q.has('ci') || q.has('dev')) return true;
  } catch {
    /* ignore */
  }
  try {
    if (typeof window !== 'undefined' && (window as any).__TP_DEV) return true;
  } catch {
    /* ignore */
  }
  try {
    if (typeof localStorage !== 'undefined' && localStorage.getItem('tp_ci') === '1') return true;
  } catch {
    /* ignore */
  }
  return false;
}

function emitSummary(counts: Record<string, number>) {
  try {
    const dups = Object.keys(counts)
      .filter((k) => counts[k] > 1)
      .map((k) => ({ name: k, count: counts[k] }));
    console.table(dups);
    console.log('[dup-init:summary]', JSON.stringify({ dups, total: Object.keys(counts).length }));
  } catch {
    /* ignore */
  }
}

export function installDupInitCheck(): void {
  if (!isDev()) return;
  const counts = (window.__TP_INIT_COUNTS = window.__TP_INIT_COUNTS || Object.create(null));
  const logs = (window.__TP_INIT_LOGS = window.__TP_INIT_LOGS || []);

  const register = (name: string, data?: unknown) => {
    try {
      counts[name] = (counts[name] || 0) + 1;
      const n = counts[name];
      logs.push({ t: Date.now(), name, count: n, data: data ?? null });
      if (n > 1) {
        console.warn('[dup-init]', name, 'called', n, 'times');
      } else {
        console.debug('[init]', name);
      }
    } catch {
      /* ignore */
    }
  };

  window.__tpRegisterInit = register;

  const scheduleEmit = () => {
    try {
      emitSummary(counts);
    } catch {
      /* ignore */
    }
  };
  try {
    window.addEventListener('load', () => setTimeout(scheduleEmit, 500));
  } catch {
    /* ignore */
  }
  setTimeout(scheduleEmit, 2500);
}

// Auto-install in dev when imported
try {
  installDupInitCheck();
} catch {
  /* ignore */
}
