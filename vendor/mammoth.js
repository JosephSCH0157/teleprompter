// Lightweight typed wrapper to ensure Mammoth (DOCX parser) is available.
// Returns the global `mammoth` object or null if loading failed.
export async function ensureMammoth() {
    try {
        const w = window;
        if (typeof w.mammoth !== 'undefined')
            return w.mammoth;
        // Try loading from CDN (unpkg). Keep minimal to avoid bundling.
        return await new Promise((resolve) => {
            try {
                const s = document.createElement('script');
                s.src = 'https://unpkg.com/mammoth/mammoth.browser.min.js';
                s.async = true;
                s.onload = () => resolve(window.mammoth || null);
                s.onerror = () => resolve(null);
                document.head.appendChild(s);
            }
            catch {
                resolve(null);
            }
        });
    }
    catch {
        return null;
    }
}
// Attach shim for legacy callers who expect window.ensureMammoth
try {
    window.ensureMammoth = window.ensureMammoth || ensureMammoth;
}
catch { }
export default ensureMammoth;
