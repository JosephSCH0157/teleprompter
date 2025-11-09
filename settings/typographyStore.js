import { DEFAULTS } from './schema';
const KEY = 'tp_typography_v1';
let state = (() => {
    try {
        return { ...DEFAULTS, ...JSON.parse(localStorage.getItem(KEY) || '{}') };
    }
    catch {
        return { ...DEFAULTS };
    }
})();
const subs = new Set();
export function getTypography(d) { return state[d]; }
export function setTypography(d, t) {
    state = { ...state, [d]: clampTypography({ ...state[d], ...t }) };
    try {
        localStorage.setItem(KEY, JSON.stringify(state));
    }
    catch { }
    subs.forEach(fn => { try {
        fn(d, state[d]);
    }
    catch { } });
    try {
        window.dispatchEvent(new CustomEvent('tp:typographyChanged', { detail: { display: d, settings: state[d] } }));
    }
    catch { }
}
export function onTypography(fn) { subs.add(fn); return () => subs.delete(fn); }
// Cross-window sync: reflect updates from other tabs/windows
try {
    window.addEventListener('storage', (e) => {
        if (e.key !== KEY)
            return;
        try {
            const next = JSON.parse(e.newValue || '{}');
            state = { ...state, ...next };
            Object.keys(state).forEach((_d) => {
                const d = _d;
                subs.forEach(fn => { try {
                    fn(d, state[d]);
                }
                catch { } });
            });
            try {
                window.dispatchEvent(new CustomEvent('tp:typographyChanged', { detail: { broadcast: true } }));
            }
            catch { }
        }
        catch { }
    });
}
catch { }
// Helper: clamp values to sane ranges
export function clampTypography(t) {
    const clamp = (n, min, max) => Math.min(max, Math.max(min, n));
    return {
        ...t,
        fontSizePx: clamp(t.fontSizePx, 24, 120),
        lineHeight: clamp(t.lineHeight, 1.2, 1.8),
        weight: clamp(t.weight, 300, 900),
        letterSpacingEm: clamp(t.letterSpacingEm, -0.03, 0.15),
        wordSpacingEm: clamp(t.wordSpacingEm, 0, 0.4),
        maxLineWidthCh: clamp(t.maxLineWidthCh, 24, 90),
        dimOthers: clamp(t.dimOthers, 0, 0.7),
    };
}
