// Smoke probe: verify mapped-folder controls present in Settings panel.
 (function runMappedFolderSmokeWhenReady() {
  const start = performance.now();
  const MAX = 4000;
  const selectors = {
    choose: '#chooseFolderBtn, [data-testid="choose-folder"], button[data-action="choose-folder"]',
    scripts: '#scriptSelect, select[data-role="script-picker"]',
  };

  const w = window;
  if (w.__tpMappedFolderSmokeInstalled) return;
  w.__tpMappedFolderSmokeInstalled = true;
  let active = true;
  let scheduled = false;
  const check = () => {
    if (!active) return;
    const choose = document.querySelector(selectors.choose);
    const scripts = document.querySelector(selectors.scripts);
    const haveChoose = !!choose;
    const haveScripts = !!(scripts && scripts.querySelectorAll('option').length > 0);
    const ok = haveChoose || haveScripts;
    console.log('[settings-mapped-folder:smoke]', { ok, haveChoose, haveScripts });
    if (haveChoose || performance.now() - start > MAX) {
      active = false;
      return;
    }
    schedule();
  };

  const schedule = () => {
    if (!active || scheduled) return;
    scheduled = true;
    requestAnimationFrame(() => {
      scheduled = false;
      check();
    });
  };
  if (document.readyState === 'loading') {
    document.addEventListener('tp:settings-folder:ready', schedule, { once: true });
    document.addEventListener('tp:settings:rendered', schedule, { once: true });
    document.addEventListener('DOMContentLoaded', schedule, { once: true });
  } else {
    schedule();
  }
})();
