import { initScrollModeRouter, type ScrollMode, type SessionState } from './scroll/mode-router';
import { getAutoScrollApi } from './scroll/auto-adapter';
import { appStore } from '../state/app-store';
function bindAutoControls() {
  // Intentionally left empty; auto controls are owned by autoscroll.ts bindings.
}

function bindRouterControls() {
  try {
    const auto = getAutoScrollApi();
    const scrollModeSource = {
      get(): ScrollMode {
        const raw = String(appStore.get?.('scrollMode') ?? '').trim().toLowerCase();
        const allowed: ScrollMode[] = ['timed', 'wpm', 'hybrid', 'asr', 'step', 'rehearsal', 'auto'];
        return (allowed.includes(raw as ScrollMode) ? (raw as ScrollMode) : 'hybrid');
      },
      subscribe(cb: (mode: ScrollMode) => void) {
        appStore.subscribe?.('scrollMode', () => cb(this.get()));
      },
    };
    const sessionSource = {
      get(): SessionState {
        const phase = (appStore.get?.('session.phase') as string) || 'idle';
        return {
          state: phase === 'live' ? 'live' : 'idle',
          scrollAutoOnLive: !!appStore.get?.('session.scrollAutoOnLive'),
        };
      },
      subscribe(cb: (sess: SessionState) => void) {
        appStore.subscribe?.('session.phase', () => cb(this.get()));
        appStore.subscribe?.('session.scrollAutoOnLive', () => cb(this.get()));
      },
    };

    initScrollModeRouter({
      auto,
      asr: null,
      step: null,
      session: sessionSource,
      scrollMode: scrollModeSource,
    });
    (window as any).__tpScrollMode = { setMode: (m: ScrollMode) => appStore.set?.('scrollMode', m), getMode: () => appStore.get?.('scrollMode') };
  } catch {}
}

export function initScrollFeature() {
  bindAutoControls();
  bindRouterControls();
}

// Back-compat alias kept for legacy callers
export const initScroll = initScrollFeature;
