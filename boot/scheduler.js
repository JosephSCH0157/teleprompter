let q = [];
let raf = 0;
export function requestWrite(fn) {
    q.push(fn);
    if (raf)
        return;
    raf = requestAnimationFrame(() => {
        const jobs = q;
        q = [];
        raf = 0;
        for (const j of jobs) {
            try {
                j();
            }
            catch { /* no-op */ }
        }
    });
}
export function hasPendingWrites() {
    return !!raf || q.length > 0;
}
// Optional install hook expected by boot.ts; keep minimal/no-op here.
export function installScrollScheduler() {
    try {
        // Provide a basic scroll writer using the same single-writer queue
        window.__tpScrollWrite = function (y) {
            try {
                const sc = document.getElementById('viewer') || document.scrollingElement || document.documentElement || document.body;
                if (!sc)
                    return;
                requestWrite(() => {
                    try {
                        sc.scrollTo ? sc.scrollTo({ top: y, behavior: 'auto' }) : (sc.scrollTop = y);
                    }
                    catch { }
                });
            }
            catch { }
        };
    }
    catch { }
}
