(function(){
  // Settings UI centralization: binds overlay and main panel to a single store
  const S = window.__tpStore;
  if (!S) {
    // Defer until store exists
    setTimeout(() => { try { if (window.__tpStore) init(); else init(); } catch {} }, 50);
    return;
  }

  function q(id) { return document.getElementById(id); }

  function init() {
    try {
      // Bind settings tab persistence
      const tabs = Array.from(document.querySelectorAll('#settingsTabs .settings-tab'));
      tabs.forEach(t => {
        t.addEventListener('click', () => {
          try { S.set('settingsTab', t.dataset.tab); } catch {}
        });
      });
      S.subscribe('settingsTab', tab => {
        try {
          tabs.forEach(t => t.classList.toggle('active', t.dataset.tab === tab));
          const sb = document.getElementById('settingsBody');
          if (sb) {
            // use existing setupSettingsTabs behavior lightly: show target card
            const cards = Array.from(sb.querySelectorAll('.settings-card'));
            cards.forEach(c => {
              const vis = c.dataset.tab === tab;
              if (vis) c.style.display = 'flex'; else c.style.display = 'none';
            });
          }
        } catch {}
      });

      // Mic device selector
      const settingsMicSel = q('settingsMicSel');
      const micDeviceSel = q('micDeviceSel') || q('micDevice') || q('micDeviceSel');
      if (settingsMicSel) {
        settingsMicSel.addEventListener('change', () => S.set('micDevice', settingsMicSel.value));
      }
      S.subscribe('micDevice', v => {
        try {
          if (settingsMicSel && settingsMicSel.value !== v) settingsMicSel.value = v || '';
          if (micDeviceSel && micDeviceSel.value !== v) micDeviceSel.value = v || '';
        } catch {}
      });

      // OBS enabled toggle: central write path
      const settingsEnableObs = q('settingsEnableObs');
      const mainEnableObs = q('enableObs');
      if (settingsEnableObs) settingsEnableObs.addEventListener('change', () => S.set('obsEnabled', !!settingsEnableObs.checked));
      if (mainEnableObs) mainEnableObs.addEventListener('change', () => S.set('obsEnabled', !!mainEnableObs.checked));
      S.subscribe('obsEnabled', v => {
        try {
          if (settingsEnableObs && settingsEnableObs.checked !== !!v) settingsEnableObs.checked = !!v;
          if (mainEnableObs && mainEnableObs.checked !== !!v) mainEnableObs.checked = !!v;
        } catch {}
      });

      // Auto-record toggle maps to a single key
      const autoRec = q('autoRecordToggle') || q('autoRecord');
      if (autoRec) autoRec.addEventListener('change', () => S.set('autoRecord', !!autoRec.checked));
      S.subscribe('autoRecord', v => { try { if (autoRec) autoRec.checked = !!v; } catch {} });

      // Mirror OBS URL/password live between settings overlay and main panel via input events
      const obsUrlS = q('settingsObsUrl');
      const mainUrl = q('obsUrl');
      const obsPassS = q('settingsObsPass');
      const mainPass = q('obsPassword');
      if (obsUrlS && mainUrl) {
        obsUrlS.addEventListener('input', () => { try { if (mainUrl.value !== obsUrlS.value) mainUrl.value = obsUrlS.value; } catch {} });
        mainUrl.addEventListener('input', () => { try { if (obsUrlS.value !== mainUrl.value) obsUrlS.value = mainUrl.value; } catch {} });
      }
      if (obsPassS && mainPass) {
        obsPassS.addEventListener('input', () => { try { if (mainPass.value !== obsPassS.value) mainPass.value = obsPassS.value; } catch {} });
        mainPass.addEventListener('input', () => { try { if (obsPassS.value !== mainPass.value) obsPassS.value = mainPass.value; } catch {} });
      }

      // Wire OBS toggle wiring behavior to use S.set('obsEnabled') as source-of-truth
      S.subscribe('obsEnabled', v => {
        try {
          const pill = document.getElementById('obsStatusText') || document.getElementById('obsStatus');
          if (pill) pill.textContent = v ? 'enabled' : 'disabled';
        } catch {}
      });

    } catch {}
  }

  // Run init when DOM is ready
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else setTimeout(init, 0);

})();
