(function(){
  // Display bridge: open/close display window and handle handshake; exposes window.__tpDisplay
  let displayWin = null;
  let displayReady = false;
  let displayHelloTimer = null;
  let displayHelloDeadline = 0;
  // ensure setStatus is defined to avoid ReferenceError; prefer window.setStatus if available
  const setStatus = (typeof window !== 'undefined' && typeof window.setStatus === 'function')
    ? window.setStatus.bind(window)
    : function(){};

  function openDisplay() {
    try {
      displayWin = window.open('display.html', 'TeleprompterDisplay', 'width=1000,height=700');
      if (!displayWin) { setStatus && setStatus('Pop-up blocked. Allow pop-ups and try again.'); document.getElementById('displayChip') && (document.getElementById('displayChip').textContent = 'Display: blocked'); return; }
      displayReady = false;
      const chip = (window.$id && window.$id('displayChip')) || document.getElementById('displayChip');
      if (chip) chip.textContent = 'Display: open';
      try { window.tpArmWatchdog && window.tpArmWatchdog(true); } catch {}
      const closeDisplayBtn = (window.$id && window.$id('closeDisplayBtn')) || document.getElementById('closeDisplayBtn'); if (closeDisplayBtn) closeDisplayBtn.disabled = true;
      if (displayHelloTimer) { clearInterval(displayHelloTimer); displayHelloTimer = null; }
      displayHelloDeadline = performance.now() + 3000;
      displayHelloTimer = setInterval(()=>{
        if (!displayWin || displayWin.closed || displayReady) { clearInterval(displayHelloTimer); displayHelloTimer = null; return; }
        if (performance.now() > displayHelloDeadline) { clearInterval(displayHelloTimer); displayHelloTimer = null; return; }
        try { sendToDisplay({ type: 'hello' }); } catch {}
      }, 300);
    } catch (e) { setStatus && setStatus('Unable to open display window: ' + (e && e.message)); }
  }

  function closeDisplay() {
    try { if (displayWin && !displayWin.closed) displayWin.close(); } catch {}
  displayWin = null; displayReady = false; const closeDisplayBtn2 = (window.$id && window.$id('closeDisplayBtn')) || document.getElementById('closeDisplayBtn'); if (closeDisplayBtn2) closeDisplayBtn2.disabled = true; const chip2 = (window.$id && window.$id('displayChip')) || document.getElementById('displayChip'); if (chip2) chip2.textContent = 'Display: closed'; try { window.tpArmWatchdog && window.tpArmWatchdog(false); } catch {}
  }

  function sendToDisplay(payload) {
    try {
      if (!displayWin || displayWin.closed) return;
      if (payload && payload.type === 'scroll') {
        const now = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
        const seq = (window.__tpScrollSeq ||= 0) + 1; window.__tpScrollSeq = seq;
        payload = { ...payload, seq, ts: now };
      }
      displayWin.postMessage(payload, '*');
    } catch {}
  }

  // message handler must be attached by the main runtime; provide helper to process incoming messages
  function handleMessage(e) {
    try {
      if (!displayWin || e.source !== displayWin) return;
      if (e.data === 'DISPLAY_READY' || e.data?.type === 'display-ready') {
        displayReady = true; if (displayHelloTimer) { clearInterval(displayHelloTimer); displayHelloTimer = null; }
  const chip3 = (window.$id && window.$id('displayChip')) || document.getElementById('displayChip'); if (chip3) chip3.textContent = 'Display: ready';
        // send initial render
        try { sendToDisplay({ type: 'render', html: document.getElementById('script')?.innerHTML, fontSize: document.getElementById('fontSize')?.value, lineHeight: document.getElementById('lineHeight')?.value }); } catch {}
      }
    } catch {}
  }

  try { window.__tpDisplay = window.__tpDisplay || {}; window.__tpDisplay.openDisplay = openDisplay; window.__tpDisplay.closeDisplay = closeDisplay; window.__tpDisplay.sendToDisplay = sendToDisplay; window.__tpDisplay.handleMessage = handleMessage; } catch {}
})();
