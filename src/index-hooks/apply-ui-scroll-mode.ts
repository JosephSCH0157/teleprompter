import { appStore } from '../state/app-store';
import { applyScrollModeUI } from '../ui/scrollMode';
import { computeAsrReadiness, type AsrWarnReason, type AsrNotReadyReason } from '../asr/readiness';
import { ensureMicAccess } from '../asr/mic-gate';
import { showToast } from '../ui/toasts';
import { getScrollBrain } from '../scroll/brain-access';
import type { ScrollMode as BrainMode } from '../scroll/scroll-brain';

type UiScrollMode = 'off' | 'auto' | 'asr' | 'step' | 'rehearsal' | 'wpm' | 'hybrid' | 'timed';
type ScrollModeSource = 'user' | 'boot' | 'store';

const ALLOWED_SCROLL_MODES: UiScrollMode[] = ['timed', 'wpm', 'hybrid', 'asr', 'step', 'rehearsal', 'auto', 'off'];
let lastStableUiMode: UiScrollMode = 'hybrid';
let asrRejectionToastShown = false;
let selectPrefersAsr = false;
let asrProbeToken = 0;

export function normalizeUiScrollMode(mode: string | null | undefined): UiScrollMode {
  const value = String(mode || '').trim().toLowerCase() as UiScrollMode;
  if (String(mode || '').toLowerCase() === 'manual') return 'hybrid';
  return (ALLOWED_SCROLL_MODES.includes(value) ? value : 'hybrid');
}

function setScrollModeSelectValue(mode: UiScrollMode): void {
  try {
    const el = document.getElementById('scrollMode') as HTMLSelectElement | null;
    if (!el) return;
    const normalized = normalizeUiScrollMode(mode);
    const asrOption = Array.from(el.options).find((o) => o.value === 'asr');
    const prefersAsr = selectPrefersAsr && !!asrOption && !asrOption.disabled;
    const target = prefersAsr ? 'asr' : normalized;
    if (Array.from(el.options).some((o) => o.value === target)) {
      el.value = target;
    }
  } catch {
    // ignore
  }
}

function setModeStatusLabel(mode: UiScrollMode): void {
  const el = document.getElementById('scrollModeStatus');
  if (!el) return;
  const m = String(mode || '').toLowerCase();
  let label = 'Manual';
  switch (m) {
    case 'timed':
      label = 'Timed';
      break;
    case 'wpm':
      label = 'WPM';
      break;
    case 'hybrid':
      label = 'Hybrid';
      break;
    case 'asr':
      label = 'ASR';
      break;
    case 'step':
      label = 'Step';
      break;
    case 'rehearsal':
      label = 'Rehearsal';
      break;
  }
  el.textContent = label;
}

function getSafeFallbackMode(): UiScrollMode {
  const candidate = normalizeUiScrollMode(lastStableUiMode);
  if (candidate === 'asr') return 'hybrid';
  return candidate;
}

export async function applyUiScrollMode(
  mode: UiScrollMode,
  opts: { skipStore?: boolean; allowToast?: boolean; source?: ScrollModeSource } = {},
) {
  const normalizedRequest = normalizeUiScrollMode(mode);
  const currentMode = ((window as any).__tpUiScrollMode as UiScrollMode | undefined) ?? lastStableUiMode;
  try {
    console.log('[mode] request', { from: currentMode, to: normalizedRequest, token: asrProbeToken });
  } catch {}

  const allowToast = opts.allowToast !== false;
  const source: ScrollModeSource = opts.source || 'user';
  const needsAsrProbe = normalizedRequest === 'asr' || normalizedRequest === 'hybrid';
  if (!needsAsrProbe) {
    asrProbeToken++;
    return applyModeNow(mode, opts);
  }

  const token = ++asrProbeToken;
  const micAccess = await ensureMicAccess();
  if (token !== asrProbeToken) return;
  if (!micAccess.allowed) {
    if (!asrRejectionToastShown && allowToast && source === 'user') {
      const toastMsg = "ASR needs mic access + calibration. Click 'Mic: Request' then 'Calibrate'.";
      try { showToast(toastMsg, { type: 'info' }); } catch {}
      asrRejectionToastShown = true;
    }
    return applyModeNow(getSafeFallbackMode(), opts);
  }
  return applyModeNow(mode, opts);
}

function applyModeNow(
  mode: UiScrollMode,
  opts: { skipStore?: boolean; allowToast?: boolean; source?: ScrollModeSource } = {},
) {
  const allowToast = opts.allowToast !== false;
  const source: ScrollModeSource = opts.source || 'user';
  let normalized = normalizeUiScrollMode(mode);
  let readiness: { ready: true; warn?: AsrWarnReason } | { ready: false; reason: AsrNotReadyReason } | null = null;
  if (normalized === 'asr') {
    readiness = computeAsrReadiness();
    if (!readiness.ready) {
      const fallback = getSafeFallbackMode();
      normalized = fallback;
      setScrollModeSelectValue(fallback);
      if (!asrRejectionToastShown && allowToast && source === 'user') {
        const toastMsg = "ASR needs mic access + calibration. Click 'Mic: Request' then 'Calibrate'.";
        try { showToast(toastMsg, { type: 'info' }); } catch {}
        asrRejectionToastShown = true;
      }
      try {
        console.debug('[Scroll Mode] ASR rejected', { reason: readiness.reason, fallback });
      } catch {}
      try { appStore.set?.('scrollMode', fallback as any); } catch {}
    }
  }
  if (normalized !== 'asr' || readiness?.ready) {
    lastStableUiMode = normalized;
    if (normalized !== 'asr') asrRejectionToastShown = false;
  }
  (window as any).__tpUiScrollMode = normalized;
  if (!opts.skipStore) {
    try { appStore.set?.('scrollMode', normalized); } catch {}
  }

  try { applyScrollModeUI(normalized as any); } catch {}
  try { setModeStatusLabel(normalized); } catch {}

  const brain = getScrollBrain();
  const asr = (window as any).__tpAsrMode as { setEnabled?(_v: boolean): void } | undefined;
  const setClampMode = (window as any).__tpSetClampMode as
    | ((_m: 'follow' | 'backtrack' | 'free') => void)
    | undefined;
  const auto = (window as any).__tpAuto as { setEnabled?(_v: boolean): void } | undefined;

  let brainMode: BrainMode = 'manual';
  let clampMode: 'follow' | 'backtrack' | 'free' = 'free';
  let asrEnabled = false;
  let autoEnabled = false;

  switch (normalized) {
    case 'off':
      brainMode = 'manual';
      clampMode = 'free';
      asrEnabled = false;
      autoEnabled = false;
      break;

    case 'timed':
    case 'wpm':
    case 'auto':
      brainMode = 'auto';
      clampMode = 'free';
      asrEnabled = false;
      autoEnabled = false;
      break;

    case 'hybrid':
      brainMode = 'hybrid';
      clampMode = 'follow';
      asrEnabled = false;
      autoEnabled = false;
      break;

    case 'asr':
      brainMode = 'asr';
      clampMode = 'follow';
      asrEnabled = true;
      autoEnabled = false;
      break;

    case 'step':
      brainMode = 'step';
      clampMode = 'free';
      asrEnabled = false;
      autoEnabled = false;
      break;

    case 'rehearsal':
      brainMode = 'rehearsal';
      clampMode = 'free';
      asrEnabled = false;
      autoEnabled = false;
      break;
  }
  selectPrefersAsr = asrEnabled;
  try { brain?.setMode(brainMode); } catch {}
  if (setClampMode) setClampMode(clampMode);
  if (asr && typeof asr.setEnabled === 'function') asr.setEnabled(asrEnabled);
  if (auto && typeof auto.setEnabled === 'function') auto.setEnabled(autoEnabled);
  try {
    console.log('[mode] applied', { ui: normalized, brain: brainMode });
  } catch {}
}
