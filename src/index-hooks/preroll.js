// Central preroll event hooks: session-driven orchestration only
// Legacy preroll hook – now only logs for debugging.
try {
  window.addEventListener('tp:preroll:done', (ev) => {
    const detail = ev && (ev as CustomEvent)?.detail ? (ev as CustomEvent).detail : {};
    try {
      console.debug('[PREROLL] done (legacy hook, no-op)', detail);
    } catch {}
  });
} catch {}
