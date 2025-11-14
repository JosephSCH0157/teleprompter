(function () {
  const seen = [];
  const orig = window.dispatchEvent;
  window.dispatchEvent = function (ev) {
    try {
      if (ev && ev.type === 'tp:mode') {
        const ok = !!(ev.detail && ev.detail.ssot === true);
        seen.push({ ok, detail: ev.detail });
      }
    } catch {}
    return orig.call(this, ev);
  };

  // Give boot a tick
  setTimeout(() => {
    const bad = seen.filter(x => !x.ok);
    (window.HUD || console).log('mode:ssot-guard', { ok: bad.length === 0, badCount: bad.length });
  }, 0);
})();
