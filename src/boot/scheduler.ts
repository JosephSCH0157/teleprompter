// Single-writer DOM scheduler (TypeScript version, no emit in repo)
type Job = () => void;
let q: Job[] = [];
let raf = 0 as number;

export function requestWrite(fn: Job) {
  q.push(fn);
  if (raf) return;
  raf = requestAnimationFrame(() => {
    const jobs = q; q = []; raf = 0;
    for (const j of jobs) {
      try { j(); } catch { /* no-op */ }
    }
  });
}

export function hasPendingWrites(): boolean {
  return !!raf || q.length > 0;
}

// Optional install hook expected by boot.ts; keep minimal/no-op here.
export function installScrollScheduler(): void {
  try {
    // Provide a basic scroll writer using the same single-writer queue
    (window as any).__tpScrollWrite = function(y: number){
      try {
        const sc: any = document.getElementById('viewer') || document.scrollingElement || document.documentElement || document.body;
        if (!sc) return;
        requestWrite(() => {
          try { sc.scrollTo ? sc.scrollTo({ top: y, behavior: 'auto' }) : (sc.scrollTop = y); } catch {}
        });
      } catch {}
    };
  } catch {}
}
