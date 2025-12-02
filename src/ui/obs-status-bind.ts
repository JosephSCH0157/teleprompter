import type { RecorderStatus } from '../state/recorder-settings';
import { subscribeRecorderSettings } from '../state/recorder-settings';

type CssState = 'obs-status-idle' | 'obs-status-busy' | 'obs-status-ok' | 'obs-status-error';

function computeLabel(enabled: boolean, status: RecorderStatus): { text: string; css: CssState } {
  if (!enabled) {
    return { text: 'disabled', css: 'obs-status-idle' };
  }

  switch (status) {
    case 'connecting':
      return { text: 'connecting…', css: 'obs-status-busy' };
    case 'connected':
      return { text: 'connected', css: 'obs-status-ok' };
    case 'error':
      return { text: 'error', css: 'obs-status-error' };
    default:
      return { text: 'disconnected', css: 'obs-status-idle' };
  }
}

export function bindObsStatusPills(): void {
  const roots: HTMLElement[] = [];
  const add = (el: HTMLElement | null) => {
    if (el && !roots.includes(el)) roots.push(el);
  };

  const scan = () => {
    add(document.getElementById('obsStatus') as HTMLElement | null);
    add(document.getElementById('obsStatusText') as HTMLElement | null);
    add(document.getElementById('obsConnStatus') as HTMLElement | null);
    document.querySelectorAll<HTMLElement>('.obs-status').forEach(add);
    document.querySelectorAll<HTMLElement>('[data-obs-status]').forEach(add);
    document.querySelectorAll<HTMLElement>('.obs-chip-label').forEach(add);
  };

  scan();

  if (roots.length === 0) {
    try { console.info('[OBS-STATUS] no status elements found; skipping bind'); } catch {}
    return;
  }

  try {
    const mo = new MutationObserver(() => scan());
    mo.observe(document.documentElement, { childList: true, subtree: true });
  } catch {}

  subscribeRecorderSettings((s) => {
    const { text, css } = computeLabel(s.enabled.obs, s.obsStatus);
    roots.forEach((el) => {
      const wantsPrefix = el.id === 'obsStatus' || el.classList.contains('chip');
      el.textContent = wantsPrefix ? `OBS: ${text}` : text;
      el.classList?.remove?.('obs-status-idle', 'obs-status-busy', 'obs-status-ok', 'obs-status-error');
      el.classList?.add?.(css);
    });
  });
}
