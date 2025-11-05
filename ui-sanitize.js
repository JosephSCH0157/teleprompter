// ui-sanitize.js
(function () {
  try {
    // De-dupe Settings overlays if some legacy path injected multiples
    const settings = document.querySelectorAll('#settingsOverlay');
    for (let i = 1; i < settings.length; i++) settings[i].remove();

    // De-dupe sidebar hints from older builds
    const hints = document.querySelectorAll('#sidebarMediaHint');
    for (let i = 1; i < hints.length; i++) hints[i].remove();

    // (Add any other one-liners you want to clean up here)
  } catch {}
})();
