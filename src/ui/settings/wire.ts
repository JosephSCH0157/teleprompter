export function wireSettingsDynamic(rootEl: HTMLElement | null) {
  if (!rootEl) return;
  // attach a minimal mutation observer to demonstrate wiring
  try {
    const obs = new MutationObserver(() => {});
    obs.observe(rootEl, { childList: true, subtree: true, attributes: true });
  } catch {}

  // Wire media controls to TS mic API if available
  try {
    const micApi = (window as any).__tpMic;
    // Populate devices on open
    try { if (typeof micApi?.populateDevices === 'function') micApi.populateDevices(); } catch {}

    const reqBtn = document.getElementById('settingsRequestMicBtn');
    const relBtn = document.getElementById('settingsReleaseMicBtn');
    const startDb = document.getElementById('settingsStartDbBtn');
    const stopDb = document.getElementById('settingsStopDbBtn');

    if (reqBtn) reqBtn.addEventListener('click', async () => { try { if (micApi && typeof micApi.requestMic === 'function') await micApi.requestMic(); } catch (e) { console.warn(e); } });
    if (relBtn) relBtn.addEventListener('click', () => { try { if (micApi && typeof micApi.releaseMic === 'function') micApi.releaseMic(); } catch (e) { console.warn(e); } });
    if (startDb) startDb.addEventListener('click', () => { try { const api = (window as any).__tpMic; if (api && typeof api.startDbMeter === 'function') { const s = (api as any).__lastStream as MediaStream | undefined; if (s) api.startDbMeter(s); else console.warn('no known stream to start dB meter'); } } catch (e) { console.warn(e); } });
    if (stopDb) stopDb.addEventListener('click', () => { try { const api = (window as any).__tpMic; if (api && typeof api.clearBars === 'function') api.clearBars(document.getElementById('dbMeterTop')); } catch (e) { console.warn(e); } });
  } catch {}
}

export { };

