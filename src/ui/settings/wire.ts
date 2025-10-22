export function wireSettingsDynamic(rootEl: HTMLElement | null) {
  if (!rootEl) return;
  // attach a minimal mutation observer to demonstrate wiring
  try {
    const obs = new MutationObserver(() => {});
    obs.observe(rootEl, { childList: true, subtree: true, attributes: true });
  } catch {}
}

export {};
