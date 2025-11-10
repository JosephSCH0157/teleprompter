// asr-bridge-speech.js
(() => {
  let mode = null;
  let initP = null;

  // Optional: pause/resume your timed/Hybrid motor while ASR owns the scroll
  function disableAuto() {
    try {
      window.__tpAuto?.set?.(false);
      window.dispatchEvent(new CustomEvent('autoscroll:disable', { detail: 'asr' }));
    } catch {}
  }
  function enableAuto() {
    try {
      window.__tpAuto?.set?.(true);
      window.dispatchEvent(new CustomEvent('autoscroll:enable', { detail: 'asr' }));
    } catch {}
  }

  async function getMode() {
    if (mode) return mode;
    if (!initP) {
      initP = import('/dist/index-hooks/asr.js')
        .then(m => {
          // Use the same selectors you use for rendering lines
          const AsrMode = m.AsrMode || m.default?.AsrMode || m?.AsrMode;
          if (!AsrMode) throw new Error('AsrMode export not found');
          mode = new AsrMode({
            rootSelector: '#scriptRoot, #script, body',
            lineSelector: '.line, p',
            markerOffsetPx: 140,
            windowSize: 6
          });
          return mode;
        })
        .catch(err => {
          console.info('[ASR bridge] asr module not found; skipping', err);
          return null;
        });
    }
    return initP;
  }

  async function startASR() {
    const m = await getMode();
    if (!m) return;
    disableAuto();
    try {
      await m.start();
      console.log('[ASR bridge] started');
    } catch (e) {
      console.warn('[ASR bridge] start failed', e);
      enableAuto();
    }
  }

  async function stopASR() {
    try {
      await mode?.stop?.();
      console.log('[ASR bridge] stopped');
    } catch (e) {
      console.warn('[ASR bridge] stop failed', e);
    } finally {
      enableAuto();
    }
  }

  // Wire to your existing speech sync events
  window.addEventListener('speech', (e) => {
    try {
      const st = e?.detail?.state;
      if (st === 'start') startASR();
      if (st === 'stop')  stopASR();
    } catch {}
  });
  window.addEventListener('speech:start', startASR);
  window.addEventListener('speech:stop',  stopASR);

  // Handy manual hooks for Console
  window.__asrBridge = { start: startASR, stop: stopASR };
})();
