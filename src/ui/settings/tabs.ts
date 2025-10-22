export function setupSettingsTabs(rootEl: HTMLElement | null) {
  if (!rootEl) return;
  // Basic tab setup: click handlers on [data-tab]
  try {
    rootEl.querySelectorAll('[data-tab]').forEach((el) => {
      el.addEventListener('click', (ev) => {
        const t = (ev.currentTarget as HTMLElement).getAttribute('data-tab');
        if (!t) return;
        rootEl.querySelectorAll('[data-tab-content]').forEach((c) => (c as HTMLElement).style.display = 'none');
        const sel = rootEl.querySelector(`[data-tab-content="${t}"]`) as HTMLElement | null;
        if (sel) sel.style.display = '';
      });
    });
  } catch {}
}

export {};
