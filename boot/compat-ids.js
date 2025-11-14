// Central ID alias + helpers used by both TS and legacy JS.
// Load this very early (before wiring UI).
// Canonical -> alternates (from your crawl)
window.__TP_ID_ALIASES = {
    settingsRequestMicBtn: ['settingsReqMic', 'micBtn'],
    settingsReleaseMicBtn: ['releaseMicBtn'],
    settingsStartDbBtn: ['startDbBtn'],
    settingsStopDbBtn: ['stopDbBtn'],
    settingsMicSel: ['micDeviceSel'],
    settingsCamSel: ['camDevice'],
    obsStatusText: ['obsStatus'],
    dbMeterTop: ['dbMeter'],
    normalizeTopBtn: ['normalizeBtn'],
    displayChip: [],
    closeDisplayBtn: [],
    viewer: [],
    shortcutsOverlay: [],
};
// tolerant element fetcher (first match wins)
window.$id = function $id(...ids) {
    for (const id of ids) {
        const direct = document.getElementById(id);
        if (direct)
            return direct;
        const alts = window.__TP_ID_ALIASES?.[id];
        if (alts) {
            for (const alt of alts) {
                const el = document.getElementById(alt);
                if (el)
                    return el;
            }
        }
    }
    return null;
};
// de-duped binder to avoid double listeners during mixed wiring
window.$bindOnce = function $bindOnce(el, type, handler, key) {
    if (!el)
        return;
    const k = `__tpBound_${type}_${key}`;
    // @ts-ignore index assignment
    if (el[k])
        return;
    el.addEventListener(type, handler);
    // @ts-ignore
    el[k] = true;
};
export {};
