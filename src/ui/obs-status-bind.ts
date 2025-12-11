import type { RecorderStatus } from '../state/recorder-settings';
import { subscribeRecorderSettings } from '../state/recorder-settings';

type PillState = 'obs-pill--off' | 'obs-pill--pending' | 'obs-pill--on' | 'obs-pill--error';

function computeLabel(enabled: boolean, status: RecorderStatus): { text: string; css: PillState } {
  if (!enabled) {
    return { text: 'Disabled', css: 'obs-pill--off' };
  }

  if (status === 'connecting') return { text: 'Connecting…', css: 'obs-pill--pending' };
  if (status === 'connected') return { text: 'Connected', css: 'obs-pill--on' };
  if (status === 'error') return { text: 'Error', css: 'obs-pill--error' };
  return { text: 'Enabled', css: 'obs-pill--pending' };
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
      const base = ['obs-pill'];
      const existing = (el.className || '')
        .split(' ')
        .map((c) => c.trim())
        .filter(Boolean)
        .filter((c) => !c.startsWith('obs-status-') && !c.startsWith('obs-pill--'));
      base.push(...existing, css);
      el.className = base.join(' ');
    });
  });
}
