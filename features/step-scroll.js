// Step-by-line / Step-by-block scroller for the Teleprompter viewer.
// Non-invasive: uses existing #viewer, marker %, and scroll helpers if present.
function getViewer() {
    return document.getElementById('viewer');
}
function getMarkerPct(cfg) {
    const fromWin = window.__TP_MARKER_PCT;
    return typeof cfg?.markerPct === 'number'
        ? cfg.markerPct
        : typeof fromWin === 'number'
            ? fromWin
            : 0.4;
}
// Prefer existing scroll helpers if loaded (coalesced requestScroll/scrollToEl)
function getScrollHelpers() {
    const w = window;
    return w.__scrollHelpers || null;
}
function scrollToEl(el, offsetPx) {
    const sh = getScrollHelpers();
    if (sh?.scrollToEl) {
        sh.scrollToEl(el, offsetPx);
    }
    else {
        const sc = getViewer();
        if (!sc)
            return;
        const y = (el.offsetTop || 0) - offsetPx;
        const max = Math.max(0, sc.scrollHeight - sc.clientHeight);
        sc.scrollTop = Math.max(0, Math.min(y, max));
    }
}
function scrollByPx(px) {
    const sc = getViewer();
    if (!sc)
        return;
    const max = Math.max(0, sc.scrollHeight - sc.clientHeight);
    const next = Math.max(0, Math.min(sc.scrollTop + px, max));
    const sh = getScrollHelpers();
    if (sh?.requestScroll)
        sh.requestScroll(next);
    else
        sc.scrollTop = next;
    // Mirror to display if available
    try {
        const top = window.__lastScrollTarget ?? next;
        const ratio = max ? top / max : 0;
        window.sendToDisplay?.({ type: 'scroll', top, ratio });
    }
    catch { }
}
// Current anchor paragraph: prefer IO anchor, else .current/.active, else first <p>
function currentAnchor(scriptRoot) {
    const w = window;
    try {
        const vis = w.__anchorObs?.mostVisibleEl?.();
        if (vis)
            return vis;
    }
    catch { }
    return (scriptRoot.querySelector('p.current, p.active') || scriptRoot.querySelector('p'));
}
function markerOffsetPx(viewer, markerPct) {
    return Math.round(viewer.clientHeight * markerPct);
}
// Estimate a line height from the current anchor (fallback to viewer paragraph)
function estimateLineHeight(el) {
    const sample = el || document.querySelector('#viewer p');
    const lh = sample ? parseFloat(getComputedStyle(sample).lineHeight || '0') : 0;
    return Math.max(14, Math.floor(lh || 20));
}
// Block stepping: jump to next/prev "spoken" paragraph inside #script, skipping notes
function nextSpokenParagraph(from, dir, root, spokenSel, noteSel) {
    const stepFn = (node) => {
        if (!node)
            return null;
        return dir > 0 ? (node.nextElementSibling || null) : (node.previousElementSibling || null);
    };
    let p = from;
    while ((p = stepFn(p))) {
        if (!(p instanceof HTMLElement))
            continue;
        if (!p.matches('p'))
            continue;
        if (noteSel && p.matches(noteSel))
            continue;
        if (spokenSel && !p.matches(spokenSel))
            continue;
        return p;
    }
    return null;
}
export function installStepScroll(cfg = {}) {
    const stepLinesN = cfg.stepLines ?? 1;
    const pageLinesN = cfg.pageLines ?? 4;
    const spokenSel = cfg.spokenSelector ?? 'p:not([data-note="1"]):not(.note)';
    const noteSel = cfg.noteSelector ?? 'p[data-note="1"], p.note';
    const enableF = cfg.enableFKeys ?? true;
    let mode = 'off';
    const root = document.getElementById('script') ||
        document.querySelector('#viewer .script') ||
        document.body;
    function stepLinesFn(sign, count = stepLinesN) {
        const viewer = getViewer();
        if (!viewer)
            return;
        // Rehearsal Mode: disable pedal / keyboard driven stepping (wheel only)
        try {
            if (window.__TP_REHEARSAL)
                return;
        }
        catch { }
        const anchor = currentAnchor(root);
        const lh = estimateLineHeight(anchor);
        scrollByPx(sign * count * lh);
    }
    function stepBlockFn(sign) {
        const viewer = getViewer();
        if (!viewer)
            return;
        // Rehearsal Mode: disable block jumps
        try {
            if (window.__TP_REHEARSAL)
                return;
        }
        catch { }
        const markerPct = getMarkerPct(cfg);
        const offset = markerOffsetPx(viewer, markerPct);
        const anchor = currentAnchor(root);
        if (!anchor)
            return;
        const target = nextSpokenParagraph(anchor, sign, root, spokenSel, noteSel) || anchor;
        scrollToEl(target, offset);
    }
    const onKey = (e) => {
        if (mode !== 'on')
            return;
        // Rehearsal Mode: block all key-driven stepping (already blocked globally, belt & suspenders)
        try {
            if (window.__TP_REHEARSAL)
                return;
        }
        catch { }
        // Central typing guard: rely on global helper if present
        try {
            if (window.isTyping?.() || e.__tpTyping)
                return;
        }
        catch { }
        // Do not fight auto-scroll / catch-up if they are active
        try {
            window.__scrollCtl?.stopAutoCatchup?.();
        }
        catch { }
        try {
            window.stopAutoScroll?.();
        }
        catch { }
        const key = e.key;
        // Optional pedal mapping: F13/F14 as ArrowUp/ArrowDown
        const isPedalUp = enableF && (e.code === 'F13');
        const isPedalDown = enableF && (e.code === 'F14');
        if (key === 'ArrowUp' || isPedalUp) {
            // eslint-disable-next-line no-restricted-syntax -- prevent default scroll, we handle step movement
            e.preventDefault();
            e.shiftKey ? stepBlockFn(-1) : stepLinesFn(-1);
        }
        else if (key === 'ArrowDown' || isPedalDown) {
            // eslint-disable-next-line no-restricted-syntax -- prevent default scroll, we handle step movement
            e.preventDefault();
            e.shiftKey ? stepBlockFn(+1) : stepLinesFn(+1);
        }
        else if (key === 'PageUp') {
            // eslint-disable-next-line no-restricted-syntax -- prevent default scroll, we handle step movement
            e.preventDefault();
            stepLinesFn(-1, pageLinesN);
        }
        else if (key === 'PageDown') {
            // eslint-disable-next-line no-restricted-syntax -- prevent default scroll, we handle step movement
            e.preventDefault();
            stepLinesFn(+1, pageLinesN);
        }
        else if (key === 'Home') {
            const v = getViewer();
            if (!v)
                return;
            v.scrollTop = 0;
        }
        else if (key === 'End') {
            const v = getViewer();
            if (!v)
                return;
            v.scrollTop = Math.max(0, v.scrollHeight - v.clientHeight);
        }
    };
    function enable() {
        if (mode === 'on')
            return;
        mode = 'on';
        document.addEventListener('keydown', onKey, { capture: true });
    }
    function disable() {
        if (mode === 'off')
            return;
        mode = 'off';
        document.removeEventListener('keydown', onKey, { capture: true });
    }
    // Optional tiny UI chips if host page doesn’t add them
    (function ensureButtons() {
        try {
            const bar = document.getElementById('topbar') || document.querySelector('.topbar') || null;
            if (!bar || bar.querySelector('[data-step-ui]'))
                return;
            const wrap = document.createElement('div');
            wrap.setAttribute('data-step-ui', '1');
            wrap.style.cssText = 'display:inline-flex;gap:.4rem;margin-left:.5rem;';
            const mkBtn = (label, dir) => {
                const b = document.createElement('button');
                b.className = 'btn-chip';
                b.textContent = label;
                b.title = 'Click = 1 line; Shift+Click = 1 block';
                b.addEventListener('click', (ev) => (ev.shiftKey ? stepBlockFn(dir) : stepLinesFn(dir)));
                return b;
            };
            wrap.appendChild(mkBtn('▲ Step', -1));
            wrap.appendChild(mkBtn('▼ Step', +1));
            bar.appendChild(wrap);
        }
        catch { }
    })();
    // Expose for debug/tests
    try {
        window.__tpStep = { enable, disable, stepLines: stepLinesFn, stepBlock: stepBlockFn };
    }
    catch { }
    return { enable, disable, isEnabled: () => mode === 'on', stepLines: stepLinesFn, stepBlock: stepBlockFn };
}
