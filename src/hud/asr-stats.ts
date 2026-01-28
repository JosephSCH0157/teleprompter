import type { AppStore } from '../state/app-store';
import type { HudBus } from './speech-notes-hud';
import type { AsrThresholds } from '../asr/asr-thresholds';
import { getActiveAsrTuningProfile } from '../asr/tuning-store';
import { getAsrDriverThresholds } from '../asr/asr-threshold-store';
import {
  subscribeSpeakerBindings,
  subscribeActiveSpeaker,
  getSpeakerBindings,
  getProfileById,
  getSpeakerProfiles,
} from '../ui/speaker-profiles-store';
import type { SpeakerSlot } from '../types/speaker-profiles';

export interface AsrStatsHudOptions {
  root?: HTMLElement | null;
  bus?: HudBus | null;
  store?: AppStore | null;
}

export interface AsrStatsHudApi {
  destroy(): void;
}

const HUD_ID = 'asrStatsHud';
const TEXT_ID = 'asrStatsText';
const META_ID = 'asrStatsMeta';

function isDev(): boolean {
  try {
    if ((window as any).__TP_DEV) return true;
    if (/([?#]).*dev=1/.test(location.href)) return true;
    return localStorage.getItem('tp_dev_mode') === '1';
  } catch {
    return false;
  }
}

function ensureHudRoot(root?: HTMLElement | null): HTMLElement | null {
  if (root) return root;
  try {
    return document.getElementById('hud-root');
  } catch {
    return null;
  }
}

export function initAsrStatsHud(opts: AsrStatsHudOptions = {}): AsrStatsHudApi | null {
  const { bus = null } = opts;
  if (!isDev()) return null;

  const root = ensureHudRoot(opts.root);
  if (!root) return null;

  let panel = document.getElementById(HUD_ID) as HTMLElement | null;
  if (!panel) {
    panel = document.createElement('div');
    panel.id = HUD_ID;
    panel.style.cssText = [
      'font:12px/1.3 system-ui,Segoe UI,Roboto,Arial,sans-serif',
      'color:#9fb4c9',
      'background:rgba(255,255,255,0.04)',
      'border:1px solid rgba(255,255,255,0.08)',
      'border-radius:8px',
      'padding:6px 8px',
      'margin:4px 0',
      'pointer-events:auto',
      'max-width:320px',
    ].join(';');
    const strong = document.createElement('strong');
    strong.textContent = 'ASR';
    strong.style.marginRight = '6px';
    panel.appendChild(strong);
    const span = document.createElement('span');
    span.id = TEXT_ID;
    span.textContent = '…';
    panel.appendChild(span);

    const meta = document.createElement('div');
    meta.id = META_ID;
    meta.style.cssText = 'margin-top:4px;color:#c9d7e6;font-size:11px;';
    panel.appendChild(meta);

    const btn = document.createElement('button');
    btn.type = 'button';
    btn.textContent = 'dB:on';
    btn.title = 'Toggle HUD dB breadcrumbs';
    btn.style.cssText =
      'margin-left:8px;font:inherit;color:#e6eef8;background:transparent;border:1px solid rgba(255,255,255,0.15);border-radius:6px;padding:2px 6px;cursor:pointer';
    const syncBtn = () => {
      try {
        const off = localStorage.getItem('tp_hud_quiet_db') === '1';
        btn.textContent = off ? 'dB:off' : 'dB:on';
      } catch {
        /* ignore */
      }
    };
    btn.addEventListener('click', () => {
      try {
        const off = localStorage.getItem('tp_hud_quiet_db') === '1';
        localStorage.setItem('tp_hud_quiet_db', off ? '0' : '1');
        if (typeof (window as any).setHudQuietDb === 'function') (window as any).setHudQuietDb(!off);
      } catch {
        /* ignore */
      }
      syncBtn();
    });
    syncBtn();
    try {
      const pe = getComputedStyle(root).pointerEvents;
      if (pe && pe.toLowerCase() === 'none') btn.style.display = 'none';
    } catch {
      /* ignore */
    }
    panel.appendChild(btn);

    root.appendChild(panel);
    try {
      root.classList.remove('hidden');
      root.removeAttribute('aria-hidden');
      root.removeAttribute('inert');
    } catch {
      /* ignore */
    }
  }

  const textEl = document.getElementById(TEXT_ID) as HTMLElement | null;
  const metaEl = document.getElementById(META_ID) as HTMLElement | null;
  const fmt = (v: unknown, n = 2) => {
    try {
      return typeof v === 'number' && isFinite(v) ? v.toFixed(n) : String(v);
    } catch {
      return String(v);
    }
  };

  const handleStats = (payload: any) => {
    try {
      const d = payload?.detail ?? payload ?? {};
      const sup = d.suppressed || {};
      const msg = `commits ${d.commits || 0} · avg ${fmt(d.avgScore, 2)} · p95 ${d.p95GapMs | 0}ms · tween ${fmt(
        d.tweenStepsAvg,
        1,
      )} · sup d:${sup.dup || 0} b:${sup.backwards || 0} l:${sup.leap || 0} f:${sup.freeze || 0}`;
      if (textEl) textEl.textContent = msg;
    } catch {
      /* ignore */
    }
  };

  const onWindowStats = (e: Event) => handleStats((e as CustomEvent<any>)?.detail ?? {});

  window.addEventListener('asr:stats', onWindowStats);
  const onAsrSummary = (e: Event) => {
    try {
      const d = (e as CustomEvent<any>)?.detail ?? {};
      handleStats({
        detail: {
          commits: d.commitCount ?? 0,
          avgScore: d.avgScore,
          p95GapMs: d.p95GapMs,
          tweenStepsAvg: d.tweenStepsAvg,
          suppressed: d.suppressed || {},
        },
      });
    } catch {
      /* ignore */
    }
  };
  window.addEventListener('tp:asr:summary', onAsrSummary);

  let profileLabel = (() => {
    try {
      const profile = getActiveAsrTuningProfile();
      return profile?.label || profile?.id || 'reading';
    } catch {
      return 'reading';
    }
  })();
  let guardText = '';
  let thresholdLabel = '';
  let speakerBindingLabel = '';
  let activeSlot: SpeakerSlot | null = null;
  let activeSpeakerLabel = '';
  const refreshMeta = () => {
    if (!metaEl) return;
    const segments = [`profile ${profileLabel}`];
    if (thresholdLabel) segments.push(thresholdLabel);
    if (guardText) segments.push(guardText);
    if (activeSpeakerLabel) segments.push(activeSpeakerLabel);
    if (speakerBindingLabel) segments.push(speakerBindingLabel);
    metaEl.textContent = segments.join(' | ');
  };
  refreshMeta();

  const buildThresholdLabel = (values: AsrThresholds) => {
    const toFixed = (n: number, prec = 2) => (Number.isFinite(n) ? n.toFixed(prec) : '?');
    const parts = [
      `cand=${toFixed(values.candidateMinSim)}`,
      `final=${toFixed(values.commitFinalMinSim)}`,
      `interim=${toFixed(values.commitInterimMinSim)}`,
      `stick=${toFixed(values.stickinessDelta)}`,
      `tie=${toFixed(values.tieDelta)}`,
      `anchor=${toFixed(values.anchorMinSim)}`,
      `anchorStreak=${Number.isFinite(values.anchorStreakNeeded) ? values.anchorStreakNeeded : '?'}`,
      `anchorJump=${Number.isFinite(values.maxAnchorJumpLines) ? values.maxAnchorJumpLines : '?'}`,
      `streak=${Number.isFinite(values.interimStreakNeeded) ? values.interimStreakNeeded : '?'}`,
      `max=${Number.isFinite(values.maxJumpsPerSecond) ? values.maxJumpsPerSecond : '?'}`,
    ];
    return `thresholds ${parts.join(' ')}`;
  };
  const handleThresholds = (payload: any) => {
    try {
      const detail = payload?.detail ?? payload ?? {};
      if (!detail || typeof detail !== 'object') return;
      thresholdLabel = buildThresholdLabel(detail as AsrThresholds);
      refreshMeta();
    } catch {
      /* ignore */
    }
  };
  handleThresholds({ detail: getAsrDriverThresholds() });

  const buildSpeakerBindingLabel = (bindings: Record<SpeakerSlot, string | null>) => {
    const profiles = getSpeakerProfiles();
    const parts: string[] = [];
    for (const slot of ['s1', 's2', 'g1', 'g2'] as const) {
      const profileId = bindings[slot];
      if (!profileId) continue;
      const profile = profiles.find((item) => item.id === profileId);
      parts.push(`${slot.toUpperCase()}=${profile ? profile.name : 'Custom'}`);
    }
    return parts.length ? `speakers ${parts.join(', ')}` : '';
  };

  const updateActiveSpeakerInfo = (bindings?: Record<SpeakerSlot, string | null>) => {
    if (!activeSlot) {
      activeSpeakerLabel = '';
      return;
    }
    const lookup = bindings || getSpeakerBindings();
    const profileId = lookup[activeSlot];
    const profile = getProfileById(profileId || null);
    const slotLabel = activeSlot.toUpperCase();
    activeSpeakerLabel = `active ${slotLabel}${profile ? ` (${profile.name})` : ''}`;
  };

  const handleSpeakerBindings = (bindings: Record<SpeakerSlot, string | null>) => {
    speakerBindingLabel = buildSpeakerBindingLabel(bindings);
    updateActiveSpeakerInfo(bindings);
    refreshMeta();
  };
  const unsubscribeBindings = subscribeSpeakerBindings(handleSpeakerBindings);
  const unsubscribeActiveSlot = subscribeActiveSpeaker((slot) => {
    activeSlot = slot;
    updateActiveSpeakerInfo();
    refreshMeta();
  });

  const handleGuard = (payload: any) => {
    try {
      const detail = payload?.detail ?? payload ?? {};
      const text = typeof detail.text === 'string' ? detail.text : '';
      if (!text) return;
      guardText = text;
      refreshMeta();
    } catch {
      /* ignore */
    }
  };

  const handleTuning = () => {
    try {
      const profile = getActiveAsrTuningProfile();
      profileLabel = profile?.label || profile?.id || 'reading';
      refreshMeta();
    } catch {
      /* ignore */
    }
  };

  window.addEventListener('tp:asr:guard', handleGuard as EventListener);
  window.addEventListener('tp:asr:thresholds', handleThresholds as EventListener);
  window.addEventListener('tp:asr:tuning', handleTuning as EventListener);
  try {
    bus?.on('asr:stats', handleStats);
    bus?.on('asr:guard', handleGuard);
    bus?.on('asr:thresholds', handleThresholds);
  } catch {
    /* ignore */
  }

  const destroy = () => {
    window.removeEventListener('asr:stats', onWindowStats);
    window.removeEventListener('tp:asr:summary', onAsrSummary);
    window.removeEventListener('tp:asr:guard', handleGuard as EventListener);
    window.removeEventListener('tp:asr:thresholds', handleThresholds as EventListener);
    window.removeEventListener('tp:asr:tuning', handleTuning as EventListener);
    try {
      bus?.off?.('asr:stats', handleStats);
      bus?.off?.('asr:guard', handleGuard);
      bus?.off?.('asr:thresholds', handleThresholds);
    } catch {
      /* ignore */
    }
    try {
      const line = document.getElementById(HUD_ID);
      if (line) line.remove();
    } catch {
      /* ignore */
    }
    try {
      unsubscribeBindings();
      unsubscribeActiveSlot();
    } catch {
      /* ignore */
    }
  };

  try {
    (window as any).__tpAsrStatsHud = { panel, destroy };
  } catch {
    /* ignore */
  }
  return { destroy };
}
