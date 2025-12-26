// Central ID alias + helpers used by both TS and legacy JS.
// Load this very early (before wiring UI).

declare global {
  interface Window {
    $id?: <T extends HTMLElement = HTMLElement>(..._ids: string[]) => T | null;
    $bindOnce?: (_el: EventTarget | null, _type: string, _handler: EventListener, _key: string) => void;
    __TP_ID_ALIASES?: Record<string, string[]>;
    getViewer2?: () => HTMLElement | null;
  }
}

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
} as const;

// tolerant element fetcher (first match wins)
window.$id = function $id<T extends HTMLElement = HTMLElement>(...ids: string[]): T | null {
  for (const id of ids) {
    const direct = document.getElementById(id);
    if (direct) return direct as T;
    const alts = window.__TP_ID_ALIASES?.[id];
    if (alts) {
      for (const alt of alts) {
        const el = document.getElementById(alt);
        if (el) return el as T;
      }
    }
  }
  return null;
};

// de-duped binder to avoid double listeners during mixed wiring
window.$bindOnce = function $bindOnce(el, type, handler, key) {
  if (!el) return;
  const k = `__tpBound_${type}_${key}`;
  // @ts-ignore index assignment
  if ((el as any)[k]) return;
  el.addEventListener(type, handler);
  // @ts-ignore
  (el as any)[k] = true;
};

// Legacy global getter used by older step-scroll bridges.
try {
  if (typeof window.getViewer2 !== 'function') {
    window.getViewer2 = () => document.getElementById('viewer');
  }
} catch {
  // ignore
}

export { };

