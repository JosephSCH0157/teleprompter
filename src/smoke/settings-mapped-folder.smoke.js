// Smoke probe: verify mapped-folder controls present in Settings panel.
(function(){
  const choose = document.querySelector('#chooseFolderBtn');
  const scripts = document.querySelector('#scriptSelect');
  const ok = !!choose && !!scripts;
  console.log('[settings-mapped-folder:smoke]', { ok, haveChoose: !!choose, haveScripts: !!scripts });
})();
