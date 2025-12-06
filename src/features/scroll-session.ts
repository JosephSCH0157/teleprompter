import { appStore } from '../state/app-store';
import { getSession, type SessionPhase } from '../state/session';

function startAutoScroll(): void {
  try {
    const auto: any = (window as any).__tpAuto;
    if (auto && typeof auto.startFromPreroll === 'function') {
      auto.startFromPreroll({ source: 'session' });
      return;
    }
    if (typeof (window as any).startAutoScroll === 'function') {
      (window as any).startAutoScroll();
      return;
    }
    if (auto && typeof auto.setEnabled === 'function') {
      auto.setEnabled(true);
    }
  } catch {
    // ignore
  }
}

function stopAutoScroll(): void {
  try {
    const auto: any = (window as any).__tpAuto;
    if (typeof (window as any).stopAutoScroll === 'function') {
      (window as any).stopAutoScroll();
      return;
    }
    if (auto && typeof auto.setEnabled === 'function') {
      auto.setEnabled(false);
    }
  } catch {
    // ignore
  }
}

function maybeStartOnLive(phase: SessionPhase): void {
  if (phase !== 'live') {
    try { console.debug('[scroll-session] stopping auto-scroll for phase', phase); } catch {}
    stopAutoScroll();
    return;
  }

  const session = getSession();
  if (!session.scrollAutoOnLive) return;
  startAutoScroll();
}

export function initScrollSessionRouter(): void {
  try {
    appStore.subscribe('session.phase', (p) =>
      maybeStartOnLive(p as SessionPhase),
    );
  } catch {
    // ignore
  }

  try {
    window.addEventListener('tp:preroll:done', (ev) => {
      const session = getSession();
      const detail = (ev as CustomEvent)?.detail || {};

      try {
        console.debug('[scroll-session] preroll done', {
          phase: session.phase,
          scrollAutoOnLive: session.scrollAutoOnLive,
          mode: appStore.get('scrollMode'),
          detail,
        });
      } catch {
        // ignore
      }

      if (session.phase !== 'live') return;
      if (!session.scrollAutoOnLive) {
        try { console.debug('[scroll-session] auto-scroll disabled for this mode'); } catch {}
        return;
      }
      startAutoScroll();
    });
  } catch {
    // ignore
  }
}
