import { getTypography, onTypography } from '../settings/typographyStore';
export function applyTypographyTo(win, id) {
    const doc = win.document;
    const root = doc.documentElement;
    const t = getTypography(id);
    setVars(root.style, t);
    // live updates
    const off = onTypography((d, s) => {
        if (d !== id)
            return;
        setVars(root.style, s);
        // notify scroll engine to recompute line metrics
        try {
            win.dispatchEvent(new Event('tp:lineMetricsDirty'));
        }
        catch { }
    });
    return off;
    function setVars(style, x) {
        try {
            style.setProperty('--tp-font-family', x.fontFamily);
            style.setProperty('--tp-font-size', `${x.fontSizePx}px`);
            style.setProperty('--tp-line-height', String(x.lineHeight));
            style.setProperty('--tp-weight', String(x.weight));
            style.setProperty('--tp-letter-spacing', `${x.letterSpacingEm}em`);
            style.setProperty('--tp-word-spacing', `${x.wordSpacingEm}em`);
            style.setProperty('--tp-fg', x.color);
            style.setProperty('--tp-bg', x.background);
            style.setProperty('--tp-maxch', String(x.maxLineWidthCh));
            style.setProperty('--tp-dim', String(x.dimOthers));
        }
        catch { }
    }
}
export default applyTypographyTo;
