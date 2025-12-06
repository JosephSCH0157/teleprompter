import { appStore } from '../state/app-store';
import { type SessionPhase } from '../state/session';

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
    stopAutoScroll();
    return;
  }

  const shouldAuto = !!appStore.get('session.scrollAutoOnLive');
  if (!shouldAuto) return;
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
    window.addEventListener('tp:preroll:done', () => {
      maybeStartOnLive('live');
    });
  } catch {
    // ignore
  }
}
