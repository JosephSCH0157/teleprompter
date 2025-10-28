(function(){
  // Settings UI centralization: binds overlay and main panel; tolerates no-store mode
  const S = window.__tpStore;
  const hasStore = !!S;

  function q(id) { return document.getElementById(id); }

  function showTab(tab){
    try {
      const tabs = Array.from(document.querySelectorAll('#settingsTabs .settings-tab'));
      tabs.forEach(t => t.classList.toggle('active', t.dataset.tab === tab));
      const sb = document.getElementById('settingsBody');
      if (!sb) return;
      const cards = Array.from(sb.querySelectorAll('[data-tab-content]'));
      cards.forEach(c => { c.style.display = (c.getAttribute('data-tab-content') === tab) ? '' : 'none'; });
    } catch {}
  }

  function init() {
    try {
      // Bind settings tab persistence
      const tabs = Array.from(document.querySelectorAll('#settingsTabs .settings-tab'));
      tabs.forEach(t => {
        t.addEventListener('click', () => {
          const tab = t.dataset.tab;
          if (!tab) return;
          if (hasStore) { try { S.set('settingsTab', tab); } catch {} }
          else showTab(tab);
        });
      });
      if (hasStore && typeof S.subscribe === 'function') {
        S.subscribe('settingsTab', tab => { try { if (tab) showTab(tab); } catch {} });
      }
      // Ensure a default tab is visible on first open
      const active = (document.querySelector('#settingsTabs .settings-tab.active')||null);
      showTab(active && active.getAttribute('data-tab') || 'general');

      // Mic device selector
      const settingsMicSel = q('settingsMicSel');
      const micDeviceSel = q('micDeviceSel') || q('micDevice') || q('micDeviceSel');
      if (settingsMicSel) {
        settingsMicSel.addEventListener('change', () => S.set('micDevice', settingsMicSel.value));
      }
      if (hasStore && typeof S.subscribe === 'function') {
        S.subscribe('micDevice', v => {
          try {
            if (settingsMicSel && settingsMicSel.value !== v) settingsMicSel.value = v || '';
            if (micDeviceSel && micDeviceSel.value !== v) micDeviceSel.value = v || '';
          } catch {}
        });
      }

      // OBS enabled toggle: central write path
      const settingsEnableObs = q('settingsEnableObs');
      const mainEnableObs = q('enableObs');
      if (settingsEnableObs && hasStore) settingsEnableObs.addEventListener('change', () => S.set('obsEnabled', !!settingsEnableObs.checked));
      if (mainEnableObs && hasStore) mainEnableObs.addEventListener('change', () => S.set('obsEnabled', !!mainEnableObs.checked));
      if (hasStore && typeof S.subscribe === 'function') {
        S.subscribe('obsEnabled', v => {
          try {
            if (settingsEnableObs && settingsEnableObs.checked !== !!v) settingsEnableObs.checked = !!v;
            if (mainEnableObs && mainEnableObs.checked !== !!v) mainEnableObs.checked = !!v;
          } catch {}
        });
      }

      // Auto-record toggle maps to a single key
      const autoRec = q('autoRecordToggle') || q('autoRecord');
      if (autoRec && hasStore) autoRec.addEventListener('change', () => S.set('autoRecord', !!autoRec.checked));
      if (hasStore && typeof S.subscribe === 'function') {
        S.subscribe('autoRecord', v => { try { if (autoRec) autoRec.checked = !!v; } catch {} });
      }

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
      if (hasStore && typeof S.subscribe === 'function') {
        S.subscribe('obsEnabled', v => {
          try {
            const pill = document.getElementById('obsStatusText') || document.getElementById('obsStatus');
            if (pill) pill.textContent = v ? 'enabled' : 'disabled';
          } catch {}
        });
      }

    } catch {}
  }

  // Run init when DOM is ready
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else setTimeout(init, 0);

})();
