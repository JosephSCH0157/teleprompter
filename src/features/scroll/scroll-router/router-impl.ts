// @ts-nocheck
export {};

import { getScrollWriter } from '../../../scroll/scroll-writer';
import { createTimedEngine } from '../../../scroll/autoscroll';
import { getScrollBrain } from '../../../scroll/brain-access';
import { createHybridWpmMotor } from '../hybrid-wpm-motor';
import { persistStoredAutoEnabled } from '../auto-state';
import { appStore } from '../../../state/app-store';

const isDevMode = (() => {
  let cache: boolean | null = null;
  return () => {
    if (cache !== null) return cache;
    try {
      if (typeof window === 'undefined') {
        cache = false;
        return cache;
      }
      const params = new URLSearchParams(window.location.search || '');
      if (params.has('dev')) {
        cache = true;
        return cache;
      }
      const storage = window.localStorage;
      if (storage?.getItem('tp_dev_mode') === '1') {
        cache = true;
        return cache;
      }
      const w = window as any;
      if (w.__TP_DEV || w.__TP_DEV1) {
        cache = true;
        return cache;
      }
    } catch {
      // ignore
    }
    cache = false;
    return cache;
  };
})();

;(globalThis as any).__tp_router_stamp = ((globalThis as any).__tp_router_stamp ?? 0) + 1;
try {
  console.warn('[ROUTER_STAMP]', (globalThis as any).__tp_router_stamp);
} catch {}
export const ROUTER_STAMP = (globalThis as any).__tp_router_stamp;

if (typeof window !== 'undefined') {
  try {
    (window as any).__tp_router_probe = 'scroll-router loaded';
    console.info('[router-probe] scroll-router loaded');
  } catch {
    // ignore
  }
}

const AUTO_INTENT_WIRE_STAMP = 'v2026-01-07c';
export const __AUTO_INTENT_WIRE_SENTINEL = 'scroll-router-wire-v1';
let autoIntentListenerWired = false;
let autoIntentProcessor: ((detail: any) => void) | null = null;
let pendingAutoIntentDetail: any | null = null;
let scrollerEl: HTMLElement | null = null;
let scrollWriteWarned = false;
let markHybridOffScriptFn: (() => void) | null = null;
let guardHandlerErrorLogged = false;
function warnScrollWrite(payload: Record<string, unknown>) {
  if (scrollWriteWarned) return;
  scrollWriteWarned = true;
  try {
    console.warn('[AUTO] SCROLL_WRITE_FAILED', payload);
  } catch {}
}
const nowMs = () =>
  (typeof performance !== 'undefined' && typeof performance.now === 'function')
    ? performance.now()
    : Date.now();

  function beginHybridLiveGraceWindow() {
    if (state2.mode !== "hybrid") return;
    const now = nowMs();
    seedHybridBaseSpeed();
    setHybridScale(RECOVERY_SCALE);
    liveGraceWindowEndsAt = now + LIVE_GRACE_MS;
  hybridSilence.lastSpeechAtMs = now;
  hybridSilence.pausedBySilence = false;
  clearHybridSilenceTimer();
  if (hybridWantedRunning) {
    armHybridSilenceTimer(LIVE_GRACE_MS);
  }
  const effectivePxps = Number.isFinite(hybridBasePxps) ? hybridBasePxps * hybridScale : 0;
  try {
    console.info("[HYBRID] live boot", {
      hybridBasePxps,
      phase: sessionPhase,
      hybridWantedRunning,
      lastSpeechAgeMs: 0,
      effectivePxps,
      scale: hybridScale,
      isSilent: false,
    });
  } catch {}
}

function onAutoIntent(e: Event) {
  const detail = (e as CustomEvent)?.detail || {};
  try {
    console.warn('[AUTO_INTENT] recv', { detail });
  } catch {}
  const hasProcessor = !!autoIntentProcessor;
  console.warn('[AUTO_INTENT] onAutoIntent route', { hasProcessor, buffered: !hasProcessor });
  if (!hasProcessor) {
    pendingAutoIntentDetail = detail;
    return;
  }
  try {
    console.warn('[AUTO_INTENT] onAutoIntent calling processor');
    autoIntentProcessor(detail);
  } catch {}
}

export function triggerWireAutoIntentListener(): void {
  try {
    console.warn('[AUTO_INTENT] triggerWireAutoIntentListener ENTER', __AUTO_INTENT_WIRE_SENTINEL);
  } catch {}
  try {
    console.warn('[AUTO_INTENT] TRIGGER body reached', { stamp: AUTO_INTENT_WIRE_STAMP, already: autoIntentListenerWired });
  } catch {}
    if (autoIntentListenerWired) {
      try {
        console.warn('[AUTO_INTENT] TRIGGER step=2 alreadyWired=true; skipping', { stamp: AUTO_INTENT_WIRE_STAMP });
      } catch {}
    } else {
      try { console.warn('[AUTO_INTENT] TRIGGER step=3 wiring now'); } catch {}
      autoIntentListenerWired = true;
      window.addEventListener('tp:auto:intent', onAutoIntent as EventListener);
      document.addEventListener('tp:auto:intent', onAutoIntent as EventListener);
    try {
      console.log(`[AUTO_INTENT] listener wired ${AUTO_INTENT_WIRE_STAMP}`, { target: 'window+document' });
    } catch {}
    try { console.warn('[AUTO_INTENT] TRIGGER step=4 wired ok'); } catch {}
    try {
      const counts = [
        (getEventListeners?.(window)?.['tp:auto:intent']?.length ?? 'noAPI'),
        (getEventListeners?.(document)?.['tp:auto:intent']?.length ?? 'noAPI'),
      ];
      console.warn('[AUTO_INTENT] TRIGGER step=5 post-wire sanity', { win: counts[0], doc: counts[1] });
    } catch {}
    try {
      window.dispatchEvent(
        new CustomEvent('tp:auto:intent', { detail: { enabled: false, reason: 'wire-selftest' } }),
      );
    } catch {}
    try { console.warn('[AUTO_INTENT] TRIGGER wired listeners (window+document)'); } catch {}
  }
  try {
    console.warn('[AUTO_INTENT] triggerWireAutoIntentListener EXIT', __AUTO_INTENT_WIRE_SENTINEL);
  } catch {}
}

// src/asr/v2/adapters/vad.ts
function createVadEventAdapter() {
  let ready = false;
  let error;
  const subs2 = /* @__PURE__ */ new Set();
  let unsub = null;
  function status() {
    return { kind: "vad", ready, error };
  }
  async function start() {
    try {
      if (unsub) return;
      const onEv = (e) => {
        try {
          const d = e?.detail || {};
          const f = { kind: "gate", speaking: !!d.speaking, rmsDbfs: Number(d.rmsDbfs) || -60 };
          subs2.forEach((fn) => {
            try {
              fn(f);
            } catch {
            }
          });
        } catch {
        }
      };
      const h = onEv;
      window.addEventListener("tp:vad", h);
      unsub = () => {
        try {
          window.removeEventListener("tp:vad", h);
        } catch {
        }
      };
      ready = true;
    } catch (e) {
      error = String(e?.message || e);
      ready = false;
    }
  }
  async function stop() {
    try {
      unsub?.();
      unsub = null;
    } catch {
    }
    ready = false;
  }
  function onFeature(fn) {
    subs2.add(fn);
    return () => subs2.delete(fn);
  }
  return { start, stop, onFeature, status };
}

// src/asr/v2/featureSynth.ts
function createFeatureSynth() {
  const TOK_WIN_MS = 5e3;
  let toks = [];
  let lastTokensKey = "";
  let speakingWanted = false;
  let speaking2 = false;
  let lastSpeakChange = 0;
  const ATTACK_MS = 80, RELEASE_MS = 300;
  let lastActivityMs = performance.now();
  let wpmEma;
  const ALPHA = 0.3;
  function dedupeKey(list) {
    return list.map((x) => x.text).join("|");
  }
  function wordsInWindow(now) {
    const start = now - TOK_WIN_MS;
    toks = toks.filter((t) => t.t >= start);
    let words = 0;
    for (const t of toks) {
      words += (t.text || "").trim().split(/\s+/).filter(Boolean).length;
    }
    return words;
  }
  function push(f) {
    const now = performance.now();
    if (f.kind === "tokens") {
      const key = dedupeKey(f.tokens);
      if (f.final || key !== lastTokensKey) {
        lastTokensKey = key;
        for (const tk of f.tokens) {
          toks.push({ text: tk.text, t: now });
        }
        lastActivityMs = now;
        speakingWanted = true;
      }
    } else if (f.kind === "gate") {
      speakingWanted = !!f.speaking;
      if (f.speaking) lastActivityMs = now;
    }
    if (speakingWanted && !speaking2) {
      if (now - lastSpeakChange >= ATTACK_MS) {
        speaking2 = true;
        lastSpeakChange = now;
      }
    } else if (!speakingWanted && speaking2) {
      if (now - lastSpeakChange >= RELEASE_MS) {
        speaking2 = false;
        lastSpeakChange = now;
      }
    }
    const words = wordsInWindow(now);
    const instWpm = words * 60 * (1e3 / TOK_WIN_MS);
    if (words > 0) {
      wpmEma = wpmEma == null ? instWpm : ALPHA * instWpm + (1 - ALPHA) * wpmEma;
    }
  }
  function getTempo() {
    const now = performance.now();
    const pauseMs = Math.max(0, now - lastActivityMs);
    return { wpm: wpmEma, pauseMs };
  }
  function getSpeaking() {
    return speaking2;
  }
  return { push, getTempo, getSpeaking };
}

// src/asr/v2/motor.ts
function createAutoMotor() {
  const brain = getScrollBrain();
  const timed = createTimedEngine(brain);
  let enabled = false;
  let currentSpeed = 0;
  let rafId: number | null = null;
  let lastTs = 0;
  let lastTickMoved = false;
  let carry = 0;

  function setEnabled(on) {
    try {
      if (on) {
        timed.enable();
      } else {
        timed.disable();
      }
      enabled = !!on;
    } catch {
    }
  }

  function setSpeed(pxs) {
    const next = typeof pxs === 'number' ? pxs : Number(pxs);
    currentSpeed = Number.isFinite(next) ? next : 0;
    try {
      timed.setSpeedPxPerSec(currentSpeed);
    } catch {
    }
  }

  function setVelocity(pxs) {
    setSpeed(pxs);
  }

  function toggle() {
    if (enabled) {
      stop();
    } else {
      start();
    }
  }

  function cancelTick() {
    if (rafId != null && typeof cancelAnimationFrame === 'function') {
      cancelAnimationFrame(rafId);
    }
    rafId = null;
  }

  function scheduleTick() {
    if (rafId != null) return;
    lastTs = typeof performance !== 'undefined' && typeof performance.now === 'function' ? performance.now() : Date.now();
    rafId = typeof requestAnimationFrame === 'function' ? requestAnimationFrame(motorTick) : null;
  }

  function motorTick(ts: number) {
    rafId = null;
    if (!enabled) return;
    const now = typeof performance !== 'undefined' && typeof performance.now === 'function' ? performance.now() : ts || Date.now();
    const dtSec = lastTs ? Math.max(0, (now - lastTs) / 1000) : 0;
    lastTs = now;
    const pxPerSec = currentSpeed;
    const el = scrollerEl;
    if (!el || !Number.isFinite(dtSec) || dtSec <= 0 || pxPerSec <= 0) {
      scheduleTick();
      return;
    }
    const style = getComputedStyle(el);
    if (!/(auto|scroll)/.test(style.overflowY || '')) {
      scheduleTick();
      return;
    }
    const room = Math.max(0, (el.scrollHeight || 0) - (el.clientHeight || 0));
    if (room <= 0) {
      scheduleTick();
      return;
    }
    carry += pxPerSec * dtSec;
    const step = Math.trunc(carry);
    if (step <= 0) {
      scheduleTick();
      return;
    }
    carry -= step;
    const before = el.scrollTop || 0;
    const next = Math.min(room, before + step);
    el.scrollTop = next;
    const after = el.scrollTop || 0;
    if (after > before) {
      lastTickMoved = true;
    } else {
      warnScrollWrite({
        id: el.id,
        className: el.className,
        before,
        after,
        room,
        overflowY: style.overflowY,
        position: style.position,
      });
    }
    scheduleTick();
  }

  function stop() {
    setEnabled(false);
    cancelTick();
  }

  function start() {
    if (enabled) return;
    setEnabled(true);
    lastTickMoved = false;
    carry = 0;
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        if (!enabled) return;
        scheduleTick();
      });
    });
  }

  function isRunning() {
    return enabled && lastTickMoved;
  }

  function getState() {
    return { enabled, speed: currentSpeed };
  }

  function tick(_now) {
    motorTick(_now);
  }

  return { setEnabled, setSpeed, setVelocity, stop, toggle, getState, tick, start, isRunning };
}

function logHybridPaceTelemetry(payload) {
  if (!isDevMode()) return;
  try {
    console.debug("[HYBRID_WPM]", payload);
  } catch {}
}

function convertWpmToPxPerSec(targetWpm: number) {
  try {
    const doc = document.documentElement;
    const cs = getComputedStyle(doc);
    const fsPx = parseFloat(cs.getPropertyValue("--tp-font-size")) || 56;
    const lhScale = parseFloat(cs.getPropertyValue("--tp-line-height")) || 1.4;
    const lineHeightPx = fsPx * lhScale;
    const wpl = parseFloat(localStorage.getItem("tp_wpl_hint") || "8") || 8;
    return (targetWpm / 60 / wpl) * lineHeightPx;
  } catch {
    return 0;
  }
}

// src/asr/v2/paceEngine.ts
function clamp(n, lo, hi) {
  return Math.min(hi, Math.max(lo, n));
}
function createPaceEngine() {
  let mode = "assist";
  let caps = {
    base: { minPxs: 8, maxPxs: 360 },
    final: { minPxs: 10, maxPxs: 220 },
    accelCap: 60,
    decayMs: 250,
  };
  let sens = 1;
  let _catchup = "off";
  let target = 0;
  let baseTarget = 0;
  let lastUpdate = performance.now();
  let lastWpm;
  const DEAD_WPM = 8;
  const ALPHA = 0.3;
  const SPEAKING_PXS = 45;
  function mapWpmToPxPerSec(wpm, doc) {
    try {
      const cs = getComputedStyle(doc.documentElement);
      const fsPx = parseFloat(cs.getPropertyValue("--tp-font-size")) || 56;
      const lhScale = parseFloat(cs.getPropertyValue("--tp-line-height")) || 1.4;
      const lineHeightPx = fsPx * lhScale;
      const wpl = parseFloat(localStorage.getItem("tp_wpl_hint") || "8") || 8;
      const linesPerSec = wpm / 60 / wpl;
      return linesPerSec * lineHeightPx;
    } catch {
      return wpm / 60 / 8 * (56 * 1.4);
    }
  }
  function setMode(m) {
    mode = m;
  }
  function setCaps(c) {
    const { base, final, minPxs, maxPxs, accelCap, decayMs } = c;
    if (base) {
      caps.base = { ...caps.base, ...base };
    }
    if (final) {
      caps.final = { ...caps.final, ...final };
    }
    if (typeof minPxs === "number") {
      caps.base.minPxs = minPxs;
      caps.final.minPxs = minPxs;
    }
    if (typeof maxPxs === "number") {
      caps.base.maxPxs = maxPxs;
      caps.final.maxPxs = maxPxs;
    }
    if (typeof accelCap === "number") caps.accelCap = accelCap;
    if (typeof decayMs === "number") caps.decayMs = decayMs;
  }
  function setSensitivity(mult) {
    sens = clamp(mult, 0.5, 1.5);
  }
  function setCatchupBias(level) {
    _catchup = level;
  }
  function consume(tempo, speaking2) {
    const now = performance.now();
    const dt = Math.max(1e-3, (now - lastUpdate) / 1e3);
    lastUpdate = now;
    if (mode === "vad") {
      const tgt = speaking2 ? SPEAKING_PXS : target * Math.pow(0.85, dt * (1e3 / caps.decayMs));
      const maxStep = caps.accelCap * dt;
      const next = target + clamp(tgt - target, -maxStep, maxStep);
      const nextBase = clamp(next, caps.base.minPxs, caps.base.maxPxs);
      baseTarget = nextBase;
      target = clamp(baseTarget, caps.final.minPxs, caps.final.maxPxs);
      return;
    }
    let wpm = tempo.wpm;
    if ((wpm == null || !isFinite(wpm)) && speaking2) {
      const baseline = parseFloat(localStorage.getItem("tp_baseline_wpm") || "120") || 120;
      wpm = baseline;
    }
    if (wpm == null || !isFinite(wpm)) return;
    if (!(lastWpm != null && Math.abs(wpm - lastWpm) < DEAD_WPM)) {
      lastWpm = wpm;
      const pxsRaw = mapWpmToPxPerSec(wpm, document) * sens;
      const smoothed = target === 0 ? pxsRaw : ALPHA * pxsRaw + (1 - ALPHA) * target;
      const maxStep = caps.accelCap * dt;
      const next = target + clamp(smoothed - target, -maxStep, maxStep);
      const nextBase = clamp(next, caps.base.minPxs, caps.base.maxPxs);
      baseTarget = nextBase;
      target = clamp(baseTarget, caps.final.minPxs, caps.final.maxPxs);
      logHybridPaceTelemetry({
        mode,
        wpm,
        pxsRaw: Number(pxsRaw.toFixed(2)),
        smoothed: Number(smoothed.toFixed(2)),
        baseTarget: Number(baseTarget.toFixed(2)),
        finalTarget: Number(target.toFixed(2)),
        baseCaps: { ...caps.base },
        finalCaps: { ...caps.final },
        accelCap: caps.accelCap,
      });
    }
  }
  function getTargetPxs() {
    return clamp(target, caps.final.minPxs, caps.final.maxPxs);
  }
  return { setMode, setCaps, setSensitivity, setCatchupBias, consume, getTargetPxs };
}

// src/asr/v2/orchestrator.ts
function createOrchestrator() {
  const synth = createFeatureSynth();
  const engine = createPaceEngine();
  const motor = createAutoMotor();
  let mode = "assist";
  let started = false;
  let adapter = null;
  let unsub = null;
  let asrErrUnsub = null;
  const errors = [];
  const ModeAliases = { wpm: "assist", asr: "assist", vad: "vad", align: "align", assist: "assist" };
  function setMode(m) {
    const norm = ModeAliases[m] || m;
    mode = norm;
    engine.setMode(mode);
  }
  function setGovernor(c) {
    engine.setCaps(c);
  }
  function setSensitivity(mult) {
    engine.setSensitivity(mult);
  }
  function setAlignStrategy(_s) {
  }
  function getStatus() {
    const tempo = synth.getTempo();
    return { mode, wpm: tempo.wpm, speaking: synth.getSpeaking(), targetPxs: engine.getTargetPxs(), errors: [...errors] };
  }
  async function start(a) {
    if (started) return;
    adapter = a;
    let restarts = 0;
    unsub = a.onFeature((f) => {
      try {
        synth.push(f);
        const tempo = synth.getTempo();
        const speaking2 = synth.getSpeaking();
        engine.consume(tempo, speaking2);
        const pxs = engine.getTargetPxs();
        try {
          motor.setVelocity(pxs);
        } catch {
        }
      } catch {
      }
    });
    await a.start();
    started = true;
    // Don't enable motor here - let applyGate() control it based on userEnabled and speechActive
    // This ensures proper pre-roll and speech lifecycle control
    // try {
    //   motor.setEnabled(true);
    // } catch {
    // }
    try {
      const onErr = () => {
        if (restarts++ === 0) {
          setTimeout(async () => {
            try {
              await adapter?.start();
              if (window.toast) window.toast("ASR restarted");
            } catch {
            }
          }, 300);
        } else {
          setMode("vad");
          try {
            if (window.toast) window.toast("ASR unstable \u2192 VAD fallback");
          } catch {
          }
        }
      };
      const h = onErr;
    window.addEventListener("tp:asr:error", h);
    asrErrUnsub = () => {
      try {
        window.removeEventListener("tp:asr:error", h);
        } catch {
        }
      };
    } catch {
    }
  }
  async function stop() {
    try {
      unsub?.();
      unsub = null;
    } catch {
    }
    try {
      await adapter?.stop();
    } catch {
    }
    try {
      asrErrUnsub?.();
      asrErrUnsub = null;
    } catch {
    }
    adapter = null;
    started = false;
  }
  return { start, stop, setMode, setGovernor, setSensitivity, setAlignStrategy, getStatus };
}

// src/settings/uiPrefs.ts
var KEY = "tp_ui_prefs_v1";
var state = (() => {
  try {
    const parsed = JSON.parse(localStorage.getItem(KEY) || "{}") || {};
    return { linkTypography: false, hybridGate: "db_or_vad", hybridUseProfileId: parsed.hybridUseProfileId || null, ...parsed };
  } catch {
    return { linkTypography: false, hybridGate: "db_or_vad", hybridUseProfileId: null };
  }
})();
var subs = /* @__PURE__ */ new Set();
var getUiPrefs = () => state;
var onUiPrefs = (fn) => (subs.add(fn), () => subs.delete(fn));

// src/features/scroll-router.ts
var LS_KEY = "scrollMode";
var LEGACY_LS_KEYS = ["tp_scroll_mode_v1", "tp_scroll_mode"];
var DEFAULTS = {
  mode: "hybrid",
  step: { holdCreep: 8 },
  hybrid: { attackMs: 150, releaseMs: 350, thresholdDb: -42, silenceStopMs: 1500 }
};
var state2 = { ...DEFAULTS };
var viewer = null;
function ensureViewerElement() {
  if (!viewer) {
    try {
      viewer = document.getElementById('viewer');
    } catch {
      viewer = null;
    }
  }
  return viewer;
}
function hasScrollableTarget() {
  const el = ensureViewerElement();
  if (!el) return false;
  try {
    return el.scrollHeight > el.clientHeight;
  } catch {
    return true;
  }
}
const scrollWriter = getScrollWriter();
const hybridMotor = createHybridWpmMotor({
  getWriter: () => scrollWriter,
  getScrollTop: () => (viewer ? (viewer.scrollTop || 0) : 0),
  getMaxScrollTop: () => (viewer ? Math.max(0, viewer.scrollHeight - viewer.clientHeight) : Number.POSITIVE_INFINITY),
  log: isDevMode() ? (evt, data) => {
    try { console.debug('[HybridMotor]', evt, data); } catch {}
  } : () => {},
});
try {
  (window as any).__tpHybridMotor = hybridMotor;
} catch {}
function refreshHybridWriter() {
  try {
    hybridMotor.setWriter(viewer ?? scrollerEl ?? null);
  } catch {}
}
const HYBRID_SILENCE_STOP_MS = 3000;
const LIVE_GRACE_MS = 1800;
const OFFSCRIPT_MILD = 0.75;
const OFFSCRIPT_DEEP = 0.55;
const RECOVERY_SCALE = 1;
const HYBRID_ON_SCRIPT_SIM = 0.32;
const HYBRID_OFFSCRIPT_MILD_SIM = 0.2;
const MIN_SPEECH_PXPS = 24;
const MIN_ACTIVE_SCALE = 0.65;
const HYBRID_BASELINE_FLOOR_PXPS = 24;
const OFFSCRIPT_EVIDENCE_THRESHOLD = 2;
const OFFSCRIPT_EVIDENCE_RESET_MS = 2200;
let lastHybridGateFingerprint: string | null = null;
let hybridBasePxps = 0;
let hybridScale = RECOVERY_SCALE;
let hybridBrakeState = { factor: 1, expiresAt: 0, reason: null as string | null };
let hybridAssistState = { boostPxps: 0, expiresAt: 0, reason: null as string | null };
let hybridEventRefreshTimer: number | null = null;
let hybridTargetHintState: { top: number; confidence: number; reason?: string; ts: number } | null = null;
let hybridWantedRunning = false;
let liveGraceWindowEndsAt: number | null = null;
let sliderTouchedThisSession = false;
let offScriptEvidence = 0;
let lastOffScriptEvidenceTs = 0;
let offScriptStreak = 0;
let onScriptStreak = 0;
var isHybridBypass = () => {
  try {
    return localStorage.getItem("tp_hybrid_bypass") === "1";
  } catch {
    return false;
  }
};
function persistMode() {
  try {
    localStorage.setItem(LS_KEY, state2.mode);
    LEGACY_LS_KEYS.forEach((k) => {
      try {
        localStorage.removeItem(k);
      } catch {
      }
    });
  } catch {
  }
}
function restoreMode() {
  try {
    const legacy = LEGACY_LS_KEYS.map((k) => {
      try {
        return localStorage.getItem(k);
      } catch {
        return null;
      }
    }).find(Boolean);
    const m = localStorage.getItem(LS_KEY) || legacy;
    if (m) {
      state2.mode = m;
      try {
        localStorage.setItem(LS_KEY, m);
        LEGACY_LS_KEYS.forEach((k) => {
          try {
            localStorage.removeItem(k);
          } catch {
          }
        });
      } catch {
      }
    }
  } catch {
  }
}
function findNextLine(offsetTop, dir) {
  if (!viewer) return null;
  const lines = viewer.querySelectorAll(".line");
  if (!lines || !lines.length) return null;
  const y = Number.isFinite(offsetTop) ? offsetTop : viewer.scrollTop;
  if (dir > 0) {
    for (let i = 0; i < lines.length; i++) {
      const el = lines[i];
      if (el.offsetTop > y + 2) return el;
    }
    return lines[lines.length - 1];
  } else {
    let prev = lines[0];
    for (let i = 0; i < lines.length; i++) {
      const el = lines[i];
      if (el.offsetTop >= y - 2) return prev;
      prev = el;
    }
    return prev;
  }
}
function stepOnce(dir) {
  if (!viewer) viewer = document.getElementById("viewer");
  if (!viewer) return;
  const next = findNextLine(viewer.scrollTop, dir);
  if (!next) return;
  const target = Math.max(0, next.offsetTop - 6);
  try {
    scrollWriter.scrollTo(target, { behavior: "auto" });
  } catch {
  }
}
var creepRaf = 0;
var creepLast = 0;
function holdCreepStart(pxPerSec = DEFAULTS.step.holdCreep, dir = 1) {
  if (!viewer) viewer = document.getElementById("viewer");
  if (!viewer) return;
  cancelAnimationFrame(creepRaf);
  creepLast = performance.now();
  const tick = (now) => {
    const dt = (now - creepLast) / 1e3;
    creepLast = now;
    try {
      scrollWriter.scrollBy(dir * pxPerSec * dt, { behavior: "auto" });
    } catch {
    }
    creepRaf = requestAnimationFrame(tick);
  };
  creepRaf = requestAnimationFrame(tick);
}
function holdCreepStop() {
  cancelAnimationFrame(creepRaf);
  creepRaf = 0;
}
var speaking = false;
var gateTimer;
function stopAllMotors(reason: string) {
  try {
    if (reason) {
      try { console.debug("[ScrollRouter] stopAllMotors", reason); } catch {}
    }
  } catch {}
  if (enabledNow) {
    try {
      auto.setEnabled?.(false);
      auto.stop?.();
    } catch {}
    enabledNow = false;
    emitMotorState("auto", false);
  }
  const wasHybridRunning = hybridMotor.isRunning();
  hybridMotor.stop();
  if (wasHybridRunning) {
    emitMotorState("hybridWpm", false);
  }
}
function setSpeaking(on, auto) {
  if (on === speaking) return;
  speaking = on;
  if (typeof auto.setEnabled === "function") auto.setEnabled(on);
  else auto.toggle();
}
function hybridHandleDb(db, auto) {
  if (state2.mode === 'hybrid') return;
  const { attackMs, releaseMs, thresholdDb } = DEFAULTS.hybrid;
  if (gateTimer) clearTimeout(gateTimer);
  if (db >= thresholdDb) gateTimer = setTimeout(() => setSpeaking(true, auto), attackMs);
  else gateTimer = setTimeout(() => setSpeaking(false, auto), releaseMs);
}
function applyMode(m) {
  const currentAutoEnabled = (() => {
    try {
      return !!opts.auto.getState?.().enabled;
    } catch {
      return false;
    }
  })();
  try {
    try { console.debug("[ScrollRouter] stopAllMotors", `mode switch to ${m}`); } catch {}
  } catch {}
  if (currentAutoEnabled) {
    try {
      auto.setEnabled?.(false);
      auto.stop?.();
    } catch {}
    enabledNow = false;
    emitMotorState("auto", false);
  }
  const wasHybridRunning = hybridMotor.isRunning();
  hybridMotor.stop();
  if (wasHybridRunning) {
    emitMotorState("hybridWpm", false);
  }
  if (m !== 'auto') {
    persistStoredAutoEnabled(false);
  }
  state2.mode = m;
  persistMode();
  viewer = document.getElementById("viewer");
  refreshHybridWriter();
  
  // Toggle UI controls based on mode
  try {
    const autoRow = document.querySelector('.row:has(#autoSpeed)');
    const wpmRow = document.getElementById('wpmRow');
    const speedLabel = document.querySelector('[data-scroll-speed-label]') as HTMLElement | null;
    const speedHint = document.querySelector('[data-scroll-speed-hint]') as HTMLElement | null;
    const speedInput = document.getElementById('autoSpeed') as HTMLInputElement | null;
    const modeExplain = document.querySelector('[data-scroll-mode-explain]') as HTMLElement | null;

    const isWpmLike = m === 'wpm' || m === 'hybrid';
    if (isWpmLike) {
      if (wpmRow) {
        wpmRow.classList.remove('visually-hidden');
        wpmRow.removeAttribute('aria-hidden');
      }
      if (autoRow) {
        autoRow.classList.add('visually-hidden');
        autoRow.setAttribute('aria-hidden', 'true');
      }
      if (m === 'wpm') {
        if (speedLabel) speedLabel.textContent = 'Target speed (WPM)';
        if (speedHint) speedHint.textContent = 'Scroll speed is driven purely by this WPM value.';
      } else {
        if (speedLabel) speedLabel.textContent = 'Baseline speed (WPM)';
        if (speedHint) speedHint.textContent = 'Hybrid (Performance): uses this WPM as a floor while ASR (Training) can pull the text ahead as you speak.';
      }
      if (speedInput) { speedInput.disabled = false; speedInput.dataset.mode = m; }
    } else {
      if (wpmRow) {
        wpmRow.classList.add('visually-hidden');
        wpmRow.setAttribute('aria-hidden', 'true');
      }
      if (autoRow) {
        autoRow.classList.remove('visually-hidden');
        autoRow.removeAttribute('aria-hidden');
      }

      if (m === 'asr') {
        if (speedLabel) speedLabel.textContent = 'Scroll speed';
        if (speedHint) speedHint.textContent = 'ASR (Training)-only: scroll position is driven by your voice; speed slider is ignored.';
        if (speedInput) { speedInput.disabled = true; speedInput.dataset.mode = 'asr'; }
      } else {
        if (speedLabel) speedLabel.textContent = 'Scroll speed';
        if (speedHint) speedHint.textContent = '';
        if (speedInput) { speedInput.disabled = false; speedInput.dataset.mode = m; }
      }
    }

    // Mode explanation text
    if (modeExplain) {
      switch (m) {
        case 'wpm':
          modeExplain.textContent = 'WPM: scrolls at a fixed words-per-minute target; good for solo reads.';
          break;
        case 'hybrid':
          modeExplain.textContent = 'Hybrid (Performance): PLL between your voice and the WPM baseline; ASR (Training) nudges while the baseline keeps moving.';
          break;
        case 'asr':
          modeExplain.textContent = 'ASR (Training): pure voice-locked mode - scroll position follows recognized speech; speed slider is ignored.';
          break;
        case 'timed':
          modeExplain.textContent = 'Timed: scrolls to hit your end time; useful for fixed-slot rehearsals.';
          break;
        default:
          modeExplain.textContent = '';
          break;
      }
    }
  } catch {
  }
}
function installScrollRouter(opts) {
  const { auto, viewer: viewerInstallFlag = false, hostEl = null } = opts;
  if (!viewer && hostEl) {
    viewer = hostEl;
  }
  if (hostEl instanceof HTMLElement) {
    scrollerEl = hostEl;
  }
  if (!scrollerEl) {
    scrollerEl = document.querySelector<HTMLElement>('#viewer') || document.querySelector<HTMLElement>('#script');
  }
  if (!scrollerEl) {
    const fallback = (document.scrollingElement as HTMLElement | null) || document.documentElement;
    scrollerEl = fallback;
  }
  refreshHybridWriter();
  function setProcessorAndFlush() {
    autoIntentProcessor = handleAutoIntent;
    console.warn('[AUTO_INTENT] processor assigned', { hasPending: !!pendingAutoIntentDetail });
    if (pendingAutoIntentDetail) {
      console.warn('[AUTO_INTENT] flushing pending', pendingAutoIntentDetail);
      try {
        handleAutoIntent(pendingAutoIntentDetail);
      } catch {
        // ignore
      }
      pendingAutoIntentDetail = null;
    }
  }
  setProcessorAndFlush();
  try {
    console.warn('[SCROLL_ROUTER] installScrollRouter ENTER', {
      viewerInstance: viewerInstallFlag,
      viewerEl: !!viewer,
      hostEl: hostEl ? (hostEl.id || hostEl.className || hostEl.tagName) : null,
      mode: state2.mode,
      autoIntentProcessorExists: !!autoIntentProcessor,
    });
  } catch {}
  try {
    window.__tpScrollRouterTsActive = true;
  } catch {
  }
  restoreMode();
  applyMode(state2.mode);
  emitScrollModeSnapshot("mode-change");
  if (state2.mode === "hybrid" || state2.mode === "wpm") {
    seedHybridBaseSpeed();
  }
  const orch = createOrchestrator();
  let orchRunning = false;
  let wpmUpdateInterval = null;
  
  // Update WPM display periodically when in WPM mode
  function updateWpmDisplay() {
    try {
      if (state2.mode !== 'wpm' || !orchRunning) return;
      const status = orch.getStatus();
      const wpmEl = document.getElementById('wpmPx');
      
      if (wpmEl && status) {
        const wpm = status.wpm;
        const pxs = status.targetPxs;
        
        if (wpm != null && isFinite(wpm) && pxs != null && isFinite(pxs)) {
          wpmEl.textContent = `≈ ${Math.round(wpm)} WPM → ${Math.round(pxs)} px/s`;
        } else {
          wpmEl.textContent = '≈ — WPM';
        }
      }
    } catch {
    }
  }
  
  async function ensureOrchestratorForMode() {
    try {
      const wantsOrchestrator =
        state2.mode === "wpm" ||
        state2.mode === "asr" ||
        (state2.mode === "hybrid" && hybridWantedRunning);
      if (wantsOrchestrator) {
        if (!orchRunning) {
          await orch.start(createVadEventAdapter());
          orch.setMode("assist");
          orchRunning = true;
          
          // Start WPM display updates for WPM mode
          if (state2.mode === "wpm") {
            if (wpmUpdateInterval) clearInterval(wpmUpdateInterval);
            wpmUpdateInterval = setInterval(updateWpmDisplay, 200);
          }
        }
      } else if (orchRunning) {
        await orch.stop();
        orchRunning = false;
        
        // Stop WPM display updates
        if (wpmUpdateInterval) {
          clearInterval(wpmUpdateInterval);
          wpmUpdateInterval = null;
        }
      }
    } catch {
    }
  }
  ensureOrchestratorForMode();
  
  // Initialize WPM target input from localStorage
  try {
    const wpmTargetInput = document.getElementById('wpmTarget');
    if (wpmTargetInput) {
      const stored = localStorage.getItem('tp_baseline_wpm');
      if (stored) {
        wpmTargetInput.value = stored;
      }
    }
  } catch {
  }
  
  let userEnabled = false;
  let userIntentOn = false;
  let dbGate = false;
  let vadGate = false;
  let gatePref = getUiPrefs().hybridGate;
  let speechActive = false;
  const hybridSilence = {
    lastSpeechAtMs: typeof performance !== 'undefined' ? performance.now() : Date.now(),
    pausedBySilence: false,
    timeoutId: null as number | null,
    erroredOnce: false,
    offScriptActive: false,
  };
  let sessionIntentOn = false;
  let sessionPhase = 'idle';
  const HYBRID_AUTO_STOP_FATAL_REASONS = new Set(['session', 'session-stop', 'user-toggle']);
  function isFatalAutoStopReason(reason?: string | null): boolean {
    if (!reason) return false;
    try {
      return HYBRID_AUTO_STOP_FATAL_REASONS.has(reason.toLowerCase());
    } catch {
      return true;
    }
  }
  function shouldIgnoreHybridStop(reason: string | undefined, enabled: boolean): boolean {
    if (enabled) return false;
    if (state2.mode !== "hybrid") return false;
    if (sessionPhase !== "live") return false;
    return !isFatalAutoStopReason(reason);
  }
  try {
    const storedPhase = appStore.get?.('session.phase');
    if (storedPhase) {
      sessionPhase = String(storedPhase);
    }
  } catch {
    // ignore
  }
  function setAutoIntentState(on: boolean, _reason?: string) {
    userIntentOn = on;
    userEnabled = on;
    hybridWantedRunning = on;
    sessionIntentOn = on;
    if (hybridWantedRunning && state2.mode === "hybrid") {
      seedHybridBaseSpeed();
      ensureOrchestratorForMode();
    }
    if (!hybridWantedRunning) {
      hybridSilence.pausedBySilence = false;
      clearHybridSilenceTimer();
    }
    persistStoredAutoEnabled(on);
    try { applyGate(); } catch {}
  }
  function handleAutoIntent(detail: any) {
    try {
      const enabled =
        typeof detail.enabled === 'boolean'
          ? detail.enabled
          : typeof detail.on === 'boolean'
            ? detail.on
            : undefined;
      if (typeof enabled !== 'boolean') return;
      const reasonRaw = typeof detail.reason === 'string' ? detail.reason : undefined;
      if (shouldIgnoreHybridStop(reasonRaw, enabled)) {
        try {
          console.info('[AUTO_INTENT] hybrid stop ignored (live, non-fatal reason)', { reason: reasonRaw });
        } catch {}
        return;
      }
      setAutoIntentState(enabled, reasonRaw);
      const brain = String(appStore.get('scrollBrain') || 'auto');
      const decision = enabled ? 'motor-start-request' : 'motor-stop-request';
      const pxPerSec = typeof getCurrentSpeed === 'function' ? getCurrentSpeed() : undefined;
      const currentPhase = String(appStore.get('session.phase') || sessionPhase);
      try {
        console.info(
          `[scroll-router] tp:auto:intent mode=${state2.mode} brain=${brain} phase=${sessionPhase} decision=${decision} userEnabled=${userEnabled}`,
        );
        console.warn(
          '[AUTO_INTENT]',
          'mode=', state2.mode,
          'enabled=', enabled,
          'pxPerSec=', pxPerSec,
          'sessionPhase=', currentPhase,
          'userEnabled=', userEnabled,
        );
      } catch {}
      const pxs = Number(pxPerSec) || 0;
      if (decision === 'motor-start-request') {
        try { auto.setSpeed?.(pxs); } catch {}
        try {
          if (!auto.isRunning?.()) {
            auto.start?.();
          }
        } catch {}
        try { auto.setEnabled?.(true); } catch {}
        enabledNow = true;
        try { emitMotorState('auto', true); } catch {}
        try { emitAutoState(); } catch {}
      } else {
        try { auto.setEnabled?.(false); } catch {}
        enabledNow = false;
        try { emitMotorState('auto', false); } catch {}
        try { emitAutoState(); } catch {}
      }
    } catch {}
  }
  autoIntentProcessor = (detail) => {
    console.warn('[AUTO_INTENT] PROCESS enter', {
      detail,
      mode: state2.mode,
      pxPerSec: typeof getCurrentSpeed === 'function' ? getCurrentSpeed() : undefined,
      sessionPhase,
    });
    try {
      handleAutoIntent(detail);
    } catch (err) {
      console.error('[AUTO_INTENT] PROCESS crash', err);
      throw err;
    }
  };
  console.warn('[AUTO_INTENT] processor assigned', { hasPending: !!pendingAutoIntentDetail });
  if (pendingAutoIntentDetail) {
    console.warn('[AUTO_INTENT] flushing pending', pendingAutoIntentDetail);
    try {
      handleAutoIntent(pendingAutoIntentDetail);
    } catch {
      // ignore
    }
    pendingAutoIntentDetail = null;
  }

  try { console.info('[scroll-router] tp:auto:intent listener installed'); } catch {}
  try {
    window.addEventListener("tp:speech-state", (e) => {
      try {
        const detail = (e as CustomEvent)?.detail || {};
        const running = !!(detail.running);
        const ts = typeof detail.ts === "number" ? detail.ts : nowMs();
        if (running) {
          noteHybridSpeechActivity(ts, { source: "speech-state" });
        }
      } catch {}
    });
  } catch {}
  let enabledNow = (() => {
    try {
      return !!opts.auto.getState?.().enabled;
    } catch {
      return false;
    }
  })();
  let silenceTimer;
  const chipEl = () => document.getElementById("autoChip");
  function emitAutoState(label = "Auto") {
    try {
      const chip = chipEl();
      const gate = userEnabled ? enabledNow ? "on" : "paused" : "manual";
      const speed = getCurrentSpeed();
      const payload = {
        mode: state2.mode,
        intentOn: !!userIntentOn,
        gate,
        speed,
        label,
        chip: (chip && chip.textContent || "").trim(),
      };
      try { (window.__tp_onAutoStateChange || null) && window.__tp_onAutoStateChange(payload); } catch {}
      try { document.dispatchEvent(new CustomEvent("tp:autoState", { detail: payload })); } catch {}
    } catch {}
  }
  function setAutoChip(state3, detail, label = "Auto") {
    const el = chipEl();
    if (!el) return;
    const stateLabel = state3 === "on" ? "On" : state3 === "paused" ? "Paused" : "Manual";
    el.textContent = `${label}: ${stateLabel}`;
    el.classList.remove("on", "paused", "manual");
    el.classList.add(state3);
    el.setAttribute("data-state", state3);
    if (detail) el.title = detail;
  }
  function emitMotorState(source, running) {
    try {
      const payload = { source, running };
      try {
        const handler = (window as any).__tp_onMotorStateChange;
        if (typeof handler === "function") handler(payload);
      } catch {}
      try { window.dispatchEvent(new CustomEvent("tp:motorState", { detail: payload })); } catch {}
      try { document.dispatchEvent(new CustomEvent("tp:motorState", { detail: payload })); } catch {}
      try { window.dispatchEvent(new CustomEvent("tp:motor:state", { detail: payload })); } catch {}
      try { document.dispatchEvent(new CustomEvent("tp:motor:state", { detail: payload })); } catch {}
      emitScrollModeSnapshot(`motor:${source}:${running ? "on" : "off"}`);
    } catch {}
  }

  function emitScrollModeSnapshot(reason: string) {
    try {
      const payload = {
        reason: reason || "state",
        mode: state2.mode,
        phase: sessionPhase,
        brain: String(appStore.get("scrollBrain") || "auto"),
        clamp: state2.mode === "hybrid" || state2.mode === "asr" ? "follow" : "free",
        userEnabled: !!userEnabled,
        sessionIntentOn: !!sessionIntentOn,
        autoRunning: typeof auto?.isRunning === "function" ? !!auto.isRunning() : false,
        hybridRunning: hybridMotor?.isRunning?.() ?? false,
        hybridWantedRunning: !!hybridWantedRunning,
        speechActive: !!speechActive,
        hybridPausedBySilence: !!hybridSilence.pausedBySilence,
      };
      try { (window as any).__tp_onScrollModeChange?.(payload); } catch {}
      try { window.dispatchEvent(new CustomEvent("tp:scroll:mode", { detail: payload })); } catch {}
      try { document.dispatchEvent(new CustomEvent("tp:scroll:mode", { detail: payload })); } catch {}
    } catch {}
  }

  function canRunHybridMotor() {
    try {
      const phase = appStore.get("session.phase");
      const allow = appStore.get("session.scrollAutoOnLive");
      if (phase !== "live") return false;
      return !!allow;
    } catch {
      return false;
    }
  }
  function clearHybridSilenceTimer() {
    if (hybridSilence.timeoutId != null) {
      try { window.clearTimeout(hybridSilence.timeoutId); } catch {}
      hybridSilence.timeoutId = null;
    }
  }
  function handleHybridSilenceTimeout() {
    hybridSilence.timeoutId = null;
    const now = nowMs();
    if (liveGraceWindowEndsAt != null && now >= liveGraceWindowEndsAt) {
      liveGraceWindowEndsAt = null;
    }
    if (liveGraceWindowEndsAt != null && now < liveGraceWindowEndsAt) {
      const delay = Math.max(0, liveGraceWindowEndsAt - now);
      armHybridSilenceTimer(delay || HYBRID_SILENCE_STOP_MS);
      return;
    }
    if (state2.mode !== "hybrid") return;
    const lastSpeechAgeMs = Math.max(0, now - hybridSilence.lastSpeechAtMs);
    const stillEligibleForSpeech =
      sessionPhase === "live" &&
      userEnabled &&
      hybridWantedRunning;
    if (stillEligibleForSpeech && lastSpeechAgeMs < HYBRID_SILENCE_STOP_MS) {
      const delay = Math.max(1, HYBRID_SILENCE_STOP_MS - lastSpeechAgeMs);
      armHybridSilenceTimer(delay);
      return;
    }
    if (!hybridMotor.isRunning()) return;
    hybridSilence.pausedBySilence = true;
    speechActive = false;
    hybridMotor.stop();
    emitMotorState("hybridWpm", false);
    emitHybridSafety();
    try { applyGate(); } catch {}
  }
  function armHybridSilenceTimer(delay: number = HYBRID_SILENCE_STOP_MS) {
    clearHybridSilenceTimer();
    if (state2.mode !== "hybrid" || !hybridWantedRunning) return;
    const nextDelay = Math.max(1, delay);
    hybridSilence.timeoutId = window.setTimeout(() => handleHybridSilenceTimeout(), nextDelay);
  }
  function ensureHybridMotorRunningForSpeech() {
    if (state2.mode !== "hybrid") return;
    if (sessionPhase !== "live") return;
    if (!userEnabled || !hybridWantedRunning) return;
    applyHybridVelocity(hybridSilence);
    if (!hybridMotor.isRunning()) {
      const startResult = hybridMotor.start();
      if (startResult.started) {
        emitMotorState("hybridWpm", true);
      }
    }
  }
  function startHybridMotorFromSpeedChange() {
    if (state2.mode !== "hybrid") return;
    if (sessionPhase !== "live") return;
    if (!userEnabled || !hybridWantedRunning) return;
    hybridSilence.pausedBySilence = false;
    clearHybridSilenceTimer();
    ensureHybridMotorRunningForSpeech();
    armHybridSilenceTimer();
  }
  function isLiveGraceActive(now = nowMs()) {
    return liveGraceWindowEndsAt != null && now < liveGraceWindowEndsAt;
  }
  function noteHybridSpeechActivity(ts?: number, opts?: { source?: string; noMatch?: boolean }) {
    const now = typeof ts === "number" ? ts : nowMs();
    speechActive = true;
    hybridSilence.lastSpeechAtMs = now;
    setHybridSilence2(now);
    liveGraceWindowEndsAt = null;
    const wasPausedBySilence = hybridSilence.pausedBySilence;
    hybridSilence.pausedBySilence = false;
    clearHybridSilenceTimer();
    if (isDevMode()) {
      const effectivePxps = Number.isFinite(hybridBasePxps) ? hybridBasePxps * hybridScale : 0;
      try {
        console.info('[HYBRID] speech activity', {
          source: opts?.source ?? 'unknown',
          noMatch: !!opts?.noMatch,
          pausedBySilence: wasPausedBySilence,
          offScriptActive: hybridSilence.offScriptActive,
          effectivePxPerSec: Number.isFinite(effectivePxps) ? Number(effectivePxps.toFixed(2)) : effectivePxps,
        });
      } catch {}
    }
    if (wasPausedBySilence) {
      emitHybridSafety();
    }
    if (state2.mode !== "hybrid" || !hybridWantedRunning) return;
    ensureHybridMotorRunningForSpeech();
    armHybridSilenceTimer();
    try { applyGate(); } catch {}
  }
  function determineHybridScaleFromDetail(detail: { bestSim?: number; sim?: number; score?: number; inBand?: boolean | number | string }) {
    const simRaw = detail.bestSim ?? detail.sim ?? detail.score;
    const sim = Number.isFinite(simRaw) ? Number(simRaw) : NaN;
    const inBandValue = detail.inBand;
    const inBand = inBandValue === 1 || inBandValue === true || inBandValue === "1";
    if (inBand) return RECOVERY_SCALE;
    if (!Number.isFinite(sim)) return null;
    if (sim >= HYBRID_ON_SCRIPT_SIM) return RECOVERY_SCALE;
    if (sim >= HYBRID_OFFSCRIPT_MILD_SIM) return OFFSCRIPT_MILD;
    return OFFSCRIPT_DEEP;
  }
  function updateHybridScaleFromDetail(detail: { bestSim?: number; sim?: number; score?: number; inBand?: boolean | number }) {
    if (state2.mode !== "hybrid" || !hybridWantedRunning) return;
    const nextScale = determineHybridScaleFromDetail(detail);
    if (nextScale == null) return;
    const now = nowMs();
    if (nextScale === RECOVERY_SCALE) {
      offScriptEvidence = 0;
      lastOffScriptEvidenceTs = 0;
      setHybridScale(RECOVERY_SCALE);
      return;
    }
    if (lastOffScriptEvidenceTs && now - lastOffScriptEvidenceTs > OFFSCRIPT_EVIDENCE_RESET_MS) {
      offScriptEvidence = 0;
    }
    lastOffScriptEvidenceTs = now;
    offScriptEvidence += 1;
    if (offScriptEvidence >= OFFSCRIPT_EVIDENCE_THRESHOLD) {
      offScriptEvidence = 0;
      setHybridScale(nextScale);
    }
  }
  function handleTranscriptEvent(detail: { timestamp?: number; source?: string; noMatch?: boolean; bestSim?: number; sim?: number; score?: number; inBand?: boolean | number }) {
    const now = typeof detail.timestamp === "number" ? detail.timestamp : nowMs();
    const isNoMatch = detail.noMatch === true;
    noteHybridSpeechActivity(now, { source: detail.source || "transcript", noMatch: isNoMatch });
    updateHybridScaleFromDetail(detail);
  }
  const handleHybridFatalOnce = (err: unknown) => {
    if (hybridSilence.erroredOnce) return;
    if (state2.mode !== "hybrid" || !hybridWantedRunning) return;
    hybridSilence.erroredOnce = true;
    try { console.error('[HYBRID] disabling due to handler error', err); } catch {}
    try { clearHybridSilenceTimer(); } catch {}
    try { hybridWantedRunning = false; } catch {}
    try { stopAllMotors('hybrid guard fatal'); } catch {}
    try { emitHybridSafety(); } catch {}
    try {
      applyMode('wpm');
      emitScrollModeSnapshot("mode-change");
    } catch {}
    try {
      if ((window as any).toast) {
        (window as any).toast('Hybrid disabled after runtime error');
      }
    } catch {}
  };
  try {
    window.addEventListener("tp:asr:sync", (ev) => {
      const detail = (ev as CustomEvent).detail || {};
      const ts = typeof detail.ts === "number" ? detail.ts : nowMs();
      if (state2.mode !== "hybrid") return;
      try {
        noteHybridSpeechActivity(ts, { source: "sync", noMatch: detail.noMatch === true });
      } catch (err) {
        handleHybridFatalOnce(err);
        return;
      }
      const simRaw = detail.bestSim ?? detail.sim ?? detail.score;
      const bestSim = Number.isFinite(simRaw) ? Number(simRaw) : NaN;
      const hasSim = Number.isFinite(bestSim);
      const bestIdxRaw = detail.bestIdx ?? detail.line;
      const bestIdx = Number.isFinite(bestIdxRaw) ? bestIdxRaw : -1;
      const currentIdxRaw = Number((window as any)?.currentIndex ?? -1);
      const currentIdx = Number.isFinite(currentIdxRaw) ? currentIdxRaw : -1;
      updateHybridScaleFromDetail(detail);
      if (isDevMode()) {
        try {
          console.info('[HYBRID] sync', {
            ts,
            bestSim: hasSim ? Number(bestSim.toFixed(3)) : null,
            bestIdx,
            currentIdx,
            noMatch,
            offScriptActive: hybridSilence.offScriptActive,
            pausedBySilence: hybridSilence.pausedBySilence,
            effectivePxPerSec: Number.isFinite(hybridBasePxps)
              ? Number((hybridBasePxps * hybridScale).toFixed(2))
              : 0,
          });
        } catch {}
      }
    });
  } catch {}
  try {
    window.addEventListener("tp:asr:guard", () => {
      try {
        markHybridOffScriptFn?.();
      } catch (err) {
        if (!guardHandlerErrorLogged) {
          guardHandlerErrorLogged = true;
          try {
            console.error('[HYBRID] guard handler failed', err);
          } catch {}
        }
      }
    });
  } catch {}
  try {
    window.addEventListener("tp:speech:transcript", (ev) => {
      try {
        const detail = (ev as CustomEvent).detail || {};
        handleTranscriptEvent(detail);
      } catch {}
    });
  } catch {}
  try {
    window.addEventListener("tp:hybrid:brake", handleHybridBrakeEvent);
    window.addEventListener("tp:hybrid:assist", handleHybridAssistEvent);
    window.addEventListener("tp:hybrid:targetHint", handleHybridTargetHintEvent);
    try { (window as any).__tpHybridListenersReady = true; } catch {}
  } catch {}
  function setHybridScale(nextScale: number) {
    if (nextScale === RECOVERY_SCALE) {
      offScriptEvidence = 0;
      lastOffScriptEvidenceTs = 0;
    }
    let clamped = Math.max(0, Math.min(nextScale, 1));
    if (speechActive && !hybridSilence.pausedBySilence && clamped < MIN_ACTIVE_SCALE) {
      clamped = MIN_ACTIVE_SCALE;
    }
    if (hybridScale === clamped) return false;
    hybridScale = clamped;
    hybridSilence.offScriptActive = clamped < RECOVERY_SCALE;
    applyHybridVelocity(hybridSilence);
    return true;
  }
  const HYBRID_EVENT_TTL_MIN = 20;
  const HYBRID_EVENT_TTL_MAX = 2000;
  const HYBRID_BRAKE_DEFAULT_TTL = 320;
  const HYBRID_ASSIST_DEFAULT_TTL = 320;
  const HYBRID_ASSIST_MAX_BOOST = 420;

  function getActiveBrakeFactor(now = nowMs()) {
    if (hybridBrakeState.expiresAt <= now) {
      if (hybridBrakeState.factor !== 1 || hybridBrakeState.expiresAt !== 0) {
        hybridBrakeState = { factor: 1, expiresAt: 0, reason: null };
      }
      return 1;
    }
    return hybridBrakeState.factor;
  }

  function getActiveAssistBoost(now = nowMs()) {
    if (hybridAssistState.expiresAt <= now) {
      if (hybridAssistState.boostPxps !== 0 || hybridAssistState.expiresAt !== 0) {
        hybridAssistState = { boostPxps: 0, expiresAt: 0, reason: null };
      }
      return 0;
    }
    return hybridAssistState.boostPxps;
  }

  function scheduleHybridVelocityRefresh() {
    if (hybridEventRefreshTimer != null) {
      try {
        window.clearTimeout(hybridEventRefreshTimer);
      } catch {
        // ignore
      }
      hybridEventRefreshTimer = null;
    }
    if (typeof window === "undefined") return;
    const now = nowMs();
    const candidates: number[] = [];
    if (hybridBrakeState.expiresAt > now) candidates.push(hybridBrakeState.expiresAt);
    if (hybridAssistState.expiresAt > now) candidates.push(hybridAssistState.expiresAt);
    if (!candidates.length) return;
    const nextExpiry = Math.min(...candidates);
    hybridEventRefreshTimer = window.setTimeout(() => {
      hybridEventRefreshTimer = null;
      if (state2.mode === "hybrid") {
        applyHybridVelocity(hybridSilence);
      }
    }, Math.max(10, nextExpiry - now));
  }

  function cancelHybridVelocityRefresh() {
    if (hybridEventRefreshTimer != null && typeof window !== "undefined") {
      try {
        window.clearTimeout(hybridEventRefreshTimer);
      } catch {
        // ignore
      }
    }
    hybridEventRefreshTimer = null;
    hybridBrakeState = { factor: 1, expiresAt: 0, reason: null };
    hybridAssistState = { boostPxps: 0, expiresAt: 0, reason: null };
    hybridTargetHintState = null;
  }

  function handleHybridBrakeEvent(ev: Event) {
    if (state2.mode !== "hybrid") return;
    const detail = (ev as CustomEvent)?.detail || {};
    const factorRaw = Number(detail.factor);
    const safeFactor = Number.isFinite(factorRaw) ? clamp(factorRaw, 0, 1) : 1;
    const ttlRaw = Number.isFinite(Number(detail.ttlMs)) ? Number(detail.ttlMs) : HYBRID_BRAKE_DEFAULT_TTL;
    const ttl = Math.max(HYBRID_EVENT_TTL_MIN, Math.min(HYBRID_EVENT_TTL_MAX, ttlRaw));
    hybridBrakeState = {
      factor: safeFactor,
      expiresAt: nowMs() + ttl,
      reason: typeof detail.reason === "string" ? detail.reason : null,
    };
    scheduleHybridVelocityRefresh();
    applyHybridVelocity(hybridSilence);
  }

  function handleHybridAssistEvent(ev: Event) {
    if (state2.mode !== "hybrid") return;
    const detail = (ev as CustomEvent)?.detail || {};
    const boostRaw = Number.isFinite(Number(detail.boostPxps)) ? Number(detail.boostPxps) : 0;
    const boost = boostRaw > 0 ? Math.min(HYBRID_ASSIST_MAX_BOOST, boostRaw) : 0;
    const ttlRaw = Number.isFinite(Number(detail.ttlMs)) ? Number(detail.ttlMs) : HYBRID_ASSIST_DEFAULT_TTL;
    const ttl = Math.max(HYBRID_EVENT_TTL_MIN, Math.min(HYBRID_EVENT_TTL_MAX, ttlRaw));
    if (boost <= 0) {
      hybridAssistState = { boostPxps: 0, expiresAt: 0, reason: null };
    } else {
      hybridAssistState = {
        boostPxps: boost,
        expiresAt: nowMs() + ttl,
        reason: typeof detail.reason === "string" ? detail.reason : null,
      };
    }
    scheduleHybridVelocityRefresh();
    applyHybridVelocity(hybridSilence);
  }

  function handleHybridTargetHintEvent(ev: Event) {
    const detail = (ev as CustomEvent)?.detail || {};
    const top = Number(detail.targetTop);
    if (!Number.isFinite(top)) return;
    const confidenceRaw = Number.isFinite(Number(detail.confidence)) ? Number(detail.confidence) : 0;
    const confidence = Math.max(0, Math.min(1, confidenceRaw));
    hybridTargetHintState = {
      top,
      confidence,
      reason: typeof detail.reason === "string" ? detail.reason : undefined,
      ts: nowMs(),
    };
  }
  function applyHybridVelocity(silenceState = hybridSilence) {
    const candidateBase = Number.isFinite(hybridBasePxps) ? hybridBasePxps : 0;
    const base = candidateBase > 0 ? candidateBase : HYBRID_BASELINE_FLOOR_PXPS;
    // Hybrid should never "look dead". Even deep off-script should still visibly creep.
    // If speech is active (or we're inside live grace), enforce a stronger visible floor.
    const now = nowMs();
    const inLiveGrace = isLiveGraceActive(now);
    const speechRecent = now - silenceState.lastSpeechAtMs <= 500;
    const wantVisibleFloor = inLiveGrace || speechRecent;

    const brakeFactor = getActiveBrakeFactor(now);
    const assistBoost = getActiveAssistBoost(now);
    const rawEffective = base * hybridScale * brakeFactor;
    const floor = wantVisibleFloor ? MIN_SPEECH_PXPS : HYBRID_BASELINE_FLOOR_PXPS;
    const effective = Math.max(rawEffective, floor);
    const velocity = Math.max(0, effective + assistBoost);

    hybridMotor.setVelocityPxPerSec(velocity);
    emitHybridSafety();
    scheduleHybridVelocityRefresh();
  }
  function _markHybridOffScript() {
    if (state2.mode !== "hybrid") return;
    const changed = setHybridScale(OFFSCRIPT_DEEP);
    if (!changed) emitHybridSafety();
  }
  markHybridOffScriptFn = _markHybridOffScript;
  function emitHybridSafety() {
    try {
    const payload = {
      pausedBySilence: hybridSilence.pausedBySilence,
      offScriptStreak,
      onScriptStreak,
      scale: hybridScale,
      lastSpeechAtMs: hybridSilence.lastSpeechAtMs,
      targetHint: hybridTargetHintState ?? undefined,
      hybridSilenceStamp: hybridSilence2,
    };
      if (typeof window !== "undefined") {
        window.dispatchEvent(new CustomEvent("tp:hybridSafety", { detail: payload }));
      }
    } catch {}
  }
  function resetHybridSafetyState() {
    offScriptStreak = 0;
    onScriptStreak = 0;
    hybridSilence.pausedBySilence = false;
    clearHybridSilenceTimer();
    setHybridScale(RECOVERY_SCALE);
    cancelHybridVelocityRefresh();
    emitHybridSafety();
  }
  const AUTO_MIN = 1;
  const AUTO_MAX = 60;
  const AUTO_STEP_FINE = 1;
  const AUTO_STEP_COARSE = 5;
  const getStoredSpeed = () => {
    try {
      const raw = localStorage.getItem("tp_auto_speed");
      const v = raw != null ? parseFloat(raw) : NaN;
      if (!Number.isFinite(v)) return 21;
      return Math.min(AUTO_MAX, Math.max(AUTO_MIN, v));
    } catch {
      return 21;
    }
  };
  const getCurrentSpeed = () => {
    try {
      const fromApi = auto?.getState?.().speed;
      if (typeof fromApi === "number" && Number.isFinite(fromApi)) {
        return Math.min(AUTO_MAX, Math.max(AUTO_MIN, fromApi));
      }
    } catch {}
    return getStoredSpeed();
  };
  const setSpeed = (next) => {
    const clamped = Math.min(AUTO_MAX, Math.max(AUTO_MIN, Number(next) || 0));
    try { auto?.setSpeed?.(clamped); } catch {}
    try { localStorage.setItem("tp_auto_speed", String(clamped)); } catch {}
    return clamped;
  };
  const nudgeSpeed = (delta) => setSpeed(getCurrentSpeed() + delta);
  setSpeed(getStoredSpeed());

  function getStoredBaselineWpmPx(): number | null {
    try {
      const stored = localStorage.getItem("tp_baseline_wpm");
      const wpm = stored ? parseFloat(stored) : NaN;
      if (Number.isFinite(wpm) && wpm > 0) {
        const px = convertWpmToPxPerSec(wpm);
        if (px > 0) return px;
      }
    } catch {}
    return null;
  }
  function getSliderBaselinePx(): number | null {
    try {
      const sliderInput = document.getElementById("wpmTarget") as HTMLInputElement | null;
      const sliderVal = sliderInput ? Number(sliderInput.value) : NaN;
      if (Number.isFinite(sliderVal) && sliderVal > 0) {
        const px = convertWpmToPxPerSec(sliderVal);
        if (px > 0) return px;
      }
    } catch {}
    return null;
  }
  function getLastKnownAutoSpeed(): number | null {
    try {
      let pxFromAuto: number | undefined;
      if (typeof auto?.getState === "function") {
        pxFromAuto = auto.getState()?.speed;
      }
      const px = Number(pxFromAuto ?? getStoredSpeed());
      if (Number.isFinite(px) && px > 0) return px;
    } catch {}
    return null;
  }
  function resolveHybridSeedPx(): number {
    const slider = getSliderBaselinePx();
    if (slider && Number.isFinite(slider) && slider > 0) {
      sliderTouchedThisSession = true;
      return slider;
    }
    const stored = getStoredBaselineWpmPx();
    if (stored && Number.isFinite(stored) && stored > 0) {
      return stored;
    }
    if (!sliderTouchedThisSession) {
      const auto = getLastKnownAutoSpeed();
      if (auto && Number.isFinite(auto) && auto > 0) {
        return auto;
      }
    }
    return HYBRID_BASELINE_FLOOR_PXPS;
  }

  let hybridSilence2 = 0;
  function setHybridSilence2(v: number) {
    hybridSilence2 = Number.isFinite(v) ? v : 0;
  }

  function logHybridBaselineState(source: string) {
    if (!isDevMode()) return;
    try {
      const base = Number.isFinite(hybridBasePxps) ? hybridBasePxps : 0;
      const scale = Number.isFinite(hybridScale) ? hybridScale : 0;
      const effective = base * scale;
      const fmt = (value: number) => (Number.isFinite(value) ? value.toFixed(1) : '0.0');
      console.info(`[HYBRID] baseline=${fmt(base)} scale=${fmt(scale)} effective=${fmt(effective)} source=${source}`);
    } catch {}
  }
  function setHybridBasePxps(nextPxps: number): number {
    const candidate = Number.isFinite(nextPxps) && nextPxps > 0 ? nextPxps : HYBRID_BASELINE_FLOOR_PXPS;
    if (hybridBasePxps === candidate) return candidate;
    const prev = hybridBasePxps;
    hybridBasePxps = candidate;
    if (isDevMode()) {
      try {
        const fmt = (value: number) => (Number.isFinite(value) ? value.toFixed(1) : '0.0');
        console.info(`[HYBRID] baseline updated from WPM: ${fmt(prev)} → ${fmt(candidate)}`);
      } catch {}
    }
    applyHybridVelocity(hybridSilence);
    return candidate;
  }

  function seedHybridBaseSpeed(): number {
    const base = resolveHybridSeedPx();
    setHybridBasePxps(base);
    return hybridBasePxps;
  }

  try {
    if (typeof window !== 'undefined') {
      const w = window as any;
      if (!w.__scrollCtl) w.__scrollCtl = {};
      w.__scrollCtl.setSpeed = (next: number) => {
        try { setSpeed(next); } catch {}
      };
      w.__scrollCtl.stopAutoCatchup = () => {
        try { auto?.stop?.(); } catch {}
      };
    }
  } catch {}

  try {
    window.addEventListener('tp:autoSpeed', (ev) => {
      try {
        if (state2.mode === 'hybrid') return;
        const detail = (ev as CustomEvent)?.detail || {};
        const raw = detail.pxPerSec ?? detail.px ?? detail.speed ?? detail.value;
        const pxs = Number(raw);
        if (!Number.isFinite(pxs)) return;
        setSpeed(pxs);
      } catch {}
    });
  } catch {}
  function applyGate() {
    if (state2.mode !== "hybrid") {
      if (silenceTimer) {
        try { clearTimeout(silenceTimer); } catch {}
        silenceTimer = void 0;
      }
      if (hybridMotor.isRunning()) {
        hybridMotor.stop();
        emitMotorState("hybridWpm", false);
      }
      clearHybridSilenceTimer();
      resetHybridSafetyState();
      const viewerReady = hasScrollableTarget();
      const sessionBlocked = !sessionIntentOn && !userEnabled;
      let autoBlocked = "blocked:sessionOff";
      if (sessionBlocked) {
        autoBlocked = "blocked:sessionOff";
      } else if (!userEnabled) {
        autoBlocked = "blocked:userIntentOff";
      } else if (!viewerReady) {
        autoBlocked = "blocked:noScrollTarget";
      } else if (!Number.isFinite(autoPxPerSec) || autoPxPerSec <= 0) {
        autoBlocked = "blocked:pxZero";
      } else {
        autoBlocked = "none";
      }
      const want = autoBlocked === "none";
      const prevEnabled = enabledNow;
      const action = want
        ? prevEnabled
          ? "MOTOR_ALREADY_RUNNING"
          : "MOTOR_START"
        : prevEnabled
          ? "MOTOR_STOP"
          : "MOTOR_IGNORED_OFF";
      try {
        console.info(
          `[scroll-router] ${action} mode=${state2.mode} sessionPhase=${sessionPhase} sessionIntent=${sessionIntentOn} pxPerSec=${autoPxPerSec} blocked=${autoBlocked}`,
        );
      } catch {}
      if (typeof auto.setEnabled === "function") auto.setEnabled(want);
      enabledNow = want;
      const detail2 = `Mode: ${state2.mode} \u2022 Session:${sessionPhase} \u2022 Intent:${sessionIntentOn ? "on" : "off"} \u2022 User:${userEnabled ? "On" : "Off"}`;
      setAutoChip(userEnabled ? (enabledNow ? "on" : "paused") : "manual", detail2);
      emitMotorState("auto", enabledNow);
      try { emitAutoState(); } catch {}
      lastHybridGateFingerprint = null;
      return;
    }
    const computeGateWanted = () => {
      switch (gatePref) {
        case "db":
          return dbGate;
        case "vad":
          return vadGate;
        case "db_and_vad":
          return dbGate && vadGate;
        case "db_or_vad":
        default:
          return dbGate || vadGate;
      }
    };
    if (enabledNow) {
      try {
        auto.setEnabled?.(false);
        auto.stop?.();
      } catch {}
      enabledNow = false;
      emitMotorState("auto", false);
    }
    const now = nowMs();
    const gateWanted = computeGateWanted();
    const phaseAllowed = canRunHybridMotor();
    const baseHybridPxPerSec = Number.isFinite(hybridBasePxps) ? Math.max(0, hybridBasePxps) : 0;
    const lastSpeechAgeMs = Math.max(0, now - hybridSilence.lastSpeechAtMs);
    const liveGraceActive = isLiveGraceActive(now);
    const isSilent = !liveGraceActive && lastSpeechAgeMs >= HYBRID_SILENCE_STOP_MS;
    const speechAllowed = !isSilent;
    const gateSatisfied = isHybridBypass() ? true : gateWanted;
    const wantEnabled =
      hybridWantedRunning &&
      userEnabled &&
      phaseAllowed &&
      (speechAllowed || gateSatisfied);
    let hybridBlockedReason = "none";
    if (!userEnabled) {
      hybridBlockedReason = "blocked:userOff";
    } else if (!phaseAllowed) {
      hybridBlockedReason = "blocked:livePhase";
    } else if (!speechAllowed && !gateSatisfied) {
      hybridBlockedReason = "blocked:hybridGate";
    }
    const silencePaused = hybridSilence.pausedBySilence || isSilent;
    hybridSilence.pausedBySilence = silencePaused;
    if (silencePaused) {
      hybridBlockedReason = "blocked:silence";
    }
    const hybridRunning = hybridMotor.isRunning();
    let effectivePxPerSec = silencePaused ? 0 : baseHybridPxPerSec * hybridScale;
    if (!silencePaused && (!Number.isFinite(effectivePxPerSec) || effectivePxPerSec <= 0)) {
      const fallback = Math.max(1, Number.isFinite(baseHybridPxPerSec) ? baseHybridPxPerSec : 1);
      effectivePxPerSec = fallback;
      try {
        console.warn("[HYBRID] bad pxps; clamped", { hybridBasePxps, hybridScale, effectivePxPerSec });
      } catch {}
    }
    if (!silencePaused) {
      effectivePxPerSec = Math.max(effectivePxPerSec, MIN_SPEECH_PXPS);
    }
    const shouldRunHybrid = wantEnabled && !silencePaused && effectivePxPerSec >= 1;
    const viewerEl = viewer;
    const guardSlowActive = hybridSilence.offScriptActive;
    const snap = {
      mode: state2.mode,
      phase: sessionPhase,
      hybridWantedRunning,
      asrEnabled: speechActive,
      lastSpeechAgeMs,
      liveGraceActive,
      isSilent,
      pausedBySilence: silencePaused,
      offScript: hybridSilence.offScriptActive,
      basePxps: hybridBasePxps,
      scale: hybridScale,
      effectivePxps: effectivePxPerSec,
      sessionIntentOn,
      userEnabled,
      gatePref,
      gateWanted,
      phaseAllowed,
      blocked: hybridBlockedReason,
      viewer: {
        has: !!viewerEl,
        top: viewerEl?.scrollTop ?? -1,
        h: viewerEl?.clientHeight ?? -1,
        sh: viewerEl?.scrollHeight ?? -1,
        max: viewerEl ? Math.max(0, viewerEl.scrollHeight - viewerEl.clientHeight) : -1,
      },
      motor: {
        has: !!hybridMotor,
        running: hybridRunning,
        movedRecently: hybridMotor.movedRecently(),
      },
    };
    const fingerprintParts = [
      state2.mode,
      sessionPhase,
      hybridWantedRunning ? "1" : "0",
      userEnabled ? "1" : "0",
      speechActive ? "1" : "0",
      gatePref,
      gateWanted ? "1" : "0",
      phaseAllowed ? "1" : "0",
      guardSlowActive ? "1" : "0",
      silencePaused ? "1" : "0",
      hybridRunning ? "1" : "0",
      shouldRunHybrid ? "1" : "0",
      Number.isFinite(effectivePxPerSec) ? effectivePxPerSec.toFixed(1) : "0",
      Number.isFinite(hybridBasePxps) ? hybridBasePxps.toFixed(0) : "0",
    ];
    const gateFingerprint = fingerprintParts.join("|");
    if (gateFingerprint !== lastHybridGateFingerprint) {
      lastHybridGateFingerprint = gateFingerprint;
      try {
        console.warn("[HYBRID] gate", snap);
      } catch {}
    }
    if (silencePaused) {
      if (silenceTimer) {
        try { clearTimeout(silenceTimer); } catch {}
        silenceTimer = void 0;
      }
      if (hybridRunning) {
        hybridMotor.stop();
        emitMotorState("hybridWpm", false);
        clearHybridSilenceTimer();
        emitHybridSafety();
      }
    } else if (shouldRunHybrid) {
      if (silenceTimer) {
        try { clearTimeout(silenceTimer); } catch {}
        silenceTimer = void 0;
      }
      hybridMotor.setVelocityPxPerSec(effectivePxPerSec);
      if (!hybridRunning) {
        try {
          console.info('[HYBRID] shouldRun true starting motor', {
            isRunningBefore: hybridRunning,
            pxPerSec: effectivePxPerSec,
            viewer: viewer ? (viewer.id || viewer.tagName || viewer.className) : null,
            scrollWriter: !!scrollWriter,
          });
        } catch {}
        const startResult = hybridMotor.start();
        if (!startResult.started) {
          try {
            console.debug('[HYBRID] start suppressed', startResult);
          } catch {}
        }
      }
      armHybridSilenceTimer();
    } else if (hybridRunning) {
      if (silenceTimer) {
        try { clearTimeout(silenceTimer); } catch {}
        silenceTimer = void 0;
      }
      hybridMotor.stop();
      emitMotorState("hybridWpm", false);
      clearHybridSilenceTimer();
    }
    const detail = `Mode: Hybrid \u2022 Pref: ${gatePref} \u2022 User: ${userEnabled ? "On" : "Off"} \u2022 Phase:${phaseAllowed ? "live" : "blocked"} \u2022 Speech:${speechActive ? "1" : "0"} \u2022 dB:${dbGate ? "1" : "0"} \u2022 VAD:${vadGate ? "1" : "0"}`;
    const chipState = userEnabled ? (hybridMotor.isRunning() ? "on" : "paused") : "manual";
    setAutoChip(chipState, detail, "Motor");
    emitMotorState("hybridWpm", hybridMotor.isRunning());
  }
  onUiPrefs((p) => {
    gatePref = p.hybridGate;
    applyGate();
  });
  try {
    if (typeof appStore.subscribe === "function") {
      appStore.subscribe("session.phase", (phase) => {
        const prevPhase = sessionPhase;
        sessionPhase = String(phase || "idle");
        if (sessionPhase !== "live") {
          stopAllMotors("phase change");
        } else if (prevPhase !== "live") {
          beginHybridLiveGraceWindow();
        }
        applyGate();
        emitScrollModeSnapshot(`phase:${sessionPhase}`);
      });
      appStore.subscribe("session.scrollAutoOnLive", () => {
        applyGate();
      });
    }
  } catch {}
  function applyWpmBaselinePx(pxs: number, source: string) {
    if (!Number.isFinite(pxs) || pxs <= 0) return;
    sliderTouchedThisSession = true;
    setHybridBasePxps(pxs);
    startHybridMotorFromSpeedChange();
    logHybridBaselineState(source);
    if (state2.mode === "wpm") {
      try { auto.setSpeed?.(pxs); } catch {}
    }
  }

  try {
    document.addEventListener("change", (e) => {
      const t = e.target;
      // Handle WPM target changes
        if (t?.id === "wpmTarget") {
          try {
          const val = Number(t.value);
        if (isFinite(val) && val > 0) {
            localStorage.setItem('tp_baseline_wpm', String(val));
            const pxs = convertWpmToPxPerSec(val);
            applyWpmBaselinePx(pxs, 'slider-change');
            if (state2.mode === 'wpm') {
              try {
                if (orchRunning) {
                  const status = orch.getStatus();
                  const detectedWpm = status.wpm;
                  if (detectedWpm && isFinite(detectedWpm) && detectedWpm > 0) {
                    const sensitivity = val / detectedWpm;
                    orch.setSensitivity(sensitivity);
                  } else {
                    orch.setSensitivity(1.0);
                  }
                }
              } catch {
              }
            }
            }
          } catch {
          }
        }
    }, { capture: true });
    
  // (Removed v1.7.1: dev-only polling shim for legacy select pokes — SSOT stable)

  // Also handle input event for real-time WPM target updates
    document.addEventListener("input", (e) => {
      const t = e.target;
      if (t?.id === "wpmTarget") {
        try {
          const val = Number(t.value);
        if (isFinite(val) && val > 0) {
            localStorage.setItem('tp_baseline_wpm', String(val));
            const pxs = convertWpmToPxPerSec(val);
            applyWpmBaselinePx(pxs, 'slider-input');
            if (state2.mode === 'wpm') {
              try {
                if (orchRunning) {
                  const status = orch.getStatus();
                  const detectedWpm = status.wpm;
                  if (detectedWpm && isFinite(detectedWpm) && detectedWpm > 0) {
                    const sensitivity = val / detectedWpm;
                    orch.setSensitivity(sensitivity);
                  } else {
                    orch.setSensitivity(1.0);
                  }
                }
              } catch {
              }
            }
          }
        } catch {
        }
      }
    }, { capture: true });
  } catch {
  }
  try {
    window.addEventListener("tp:wpm:change", (ev) => {
      try {
        const detail = (ev as CustomEvent).detail || {};
        const pxs = Number(detail.pxPerSec);
        if (!Number.isFinite(pxs)) return;
        applyWpmBaselinePx(pxs, 'tp:wpm:change');
      } catch {
      }
    });
  } catch {
  }
  try {
    window.addEventListener("tp:asr:silence", (ev) => {
      try {
        const detail = (ev as CustomEvent).detail || {};
        const silent = !!detail.silent;
        const ts = typeof detail.ts === "number" ? detail.ts : nowMs();
        if (silent) {
          hybridSilence.lastSpeechAtMs = ts - HYBRID_SILENCE_STOP_MS - 1;
          hybridSilence.pausedBySilence = true;
          clearHybridSilenceTimer();
          handleHybridSilenceTimeout();
        } else {
          noteHybridSpeechActivity(ts, { source: "silence" });
        }
      } catch {}
    });
  } catch {
  }
  try {
    window.addEventListener("tp:preroll:done", () => {
      try {
        if (state2.mode !== "hybrid") return;
        if (!hybridWantedRunning) return;
        if (sessionPhase !== "live") return;
        seedHybridBaseSpeed();
        const now = nowMs();
        liveGraceWindowEndsAt = null;
        hybridSilence.lastSpeechAtMs = now;
        hybridSilence.pausedBySilence = false;
        setHybridScale(RECOVERY_SCALE);
        applyHybridVelocity(hybridSilence);
        if (!hybridMotor.isRunning()) {
          hybridMotor.start();
          emitMotorState("hybridWpm", true);
        }
        armHybridSilenceTimer(HYBRID_SILENCE_STOP_MS);
        emitHybridSafety();
        applyGate();
        if (isDevMode()) {
          try {
            console.info('[HYBRID] preroll done baseline kick', {
              hybridBasePxps,
              scale: hybridScale,
            });
          } catch {}
        }
      } catch {}
    });
  } catch {}
  try {
    document.addEventListener("keydown", (e) => {
      // In Rehearsal Mode, block router key behaviors (wheel-only)
      try { if (window.__TP_REHEARSAL) return; } catch {}
      // Always support PageUp/PageDown stepping one line for usability and CI probe,
      // even when not in explicit step mode.
      if (e.key === "PageDown") {
        e.preventDefault();
        stepOnce(1);
        return;
      }
      if (e.key === "PageUp") {
        e.preventDefault();
        stepOnce(-1);
        return;
      }
      // The press-and-hold creep behavior remains exclusive to step mode (Space bar)
      if (state2.mode === "step" && e.key === " ") {
        e.preventDefault();
        holdCreepStart(DEFAULTS.step.holdCreep, 1);
      }
    }, { capture: true });
    document.addEventListener("keyup", (e) => {
      try { if (window.__TP_REHEARSAL) return; } catch {}
      if (state2.mode !== "step") return;
      if (e.key === " ") {
        e.preventDefault();
        holdCreepStop();
      }
    }, { capture: true });
  } catch {
  }
  try {
    window.addEventListener("tp:db", (e) => {
      const db = e && e.detail && typeof e.detail.db === "number" ? e.detail.db : -60;
      hybridHandleDb(db, auto);
      dbGate = db >= DEFAULTS.hybrid.thresholdDb;
      applyGate();
    });
    window.addEventListener("tp:vad", (e) => {
      const speaking = !!(e && e.detail && e.detail.speaking);
      vadGate = speaking;
      if (speaking) {
        noteHybridSpeechActivity(nowMs(), { source: "vad" });
      }
      applyGate();
    });
  } catch {
  }
  // Allow external intent control (e.g., speech start/stop) to flip user intent deterministically
  try {
    window.addEventListener("tp:autoIntent", (e) => {
      try {
        const detail = (e as CustomEvent)?.detail || {};
        const on = !!(detail.on ?? detail.enabled);
        setAutoIntentState(on);
      } catch {}
    });
    try { console.info('[scroll-router] tp:autoIntent listener installed'); } catch {}
    const pending = (window as any).__tpAutoIntentPending;
    if (typeof pending === "boolean") {
      setAutoIntentState(pending);
      try {
        delete (window as any).__tpAutoIntentPending;
      } catch {}
    }
  } catch {}
  try {
      window.addEventListener("tp:session:intent", (e) => {
      try {
        const detail = (e as CustomEvent)?.detail || {};
        const active = detail.active === true;
        try {
          console.info(
            `[scroll-router] tp:session:intent active=${active} mode=${detail.mode || state2.mode} reason=${detail.reason || 'unknown'}`,
          );
        } catch {}
        setAutoIntentState(active);
      } catch {}
    });
    try { console.info('[scroll-router] tp:session:intent listener installed'); } catch {}
  } catch {}
  if (state2.mode === "hybrid" || state2.mode === "wpm") {
    userEnabled = true;
    hybridWantedRunning = true;
    try {
      if (state2.mode === "wpm") {
        const baselineWpm = parseFloat(localStorage.getItem("tp_baseline_wpm") || "120") || 120;
        const pxs = convertWpmToPxPerSec(baselineWpm);
        auto.setSpeed?.(pxs);
      } else {
        auto.setSpeed?.(getStoredSpeed());
      }
      seedHybridBaseSpeed();
      ensureOrchestratorForMode();
    } catch {}
    applyGate();
  } else {
    applyGate();
  }
  if (state2.mode === "wpm" || state2.mode === "asr") ensureOrchestratorForMode();
  try {
    document.addEventListener("keydown", (e) => {
      try {
        const target = e.target;
        if (!target) return;
        const tag = (target.tagName || "").toUpperCase();
        if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || tag === "BUTTON" || target.isContentEditable) return;
        if (e.ctrlKey || e.metaKey || e.altKey) return;
        const wantUp = e.key === "+" || e.code === "NumpadAdd" || e.key === "ArrowUp";
        const wantDown = e.key === "-" || e.code === "NumpadSubtract" || e.key === "ArrowDown";
        if (!wantUp && !wantDown) return;
        e.preventDefault();
        const step = wantUp ? AUTO_STEP_FINE : -AUTO_STEP_FINE;
        const delta = e.shiftKey ? step * AUTO_STEP_COARSE : step;
        const next = nudgeSpeed(delta);
        try { window.__scrollCtl?.setSpeed?.(next); } catch {}
        // Best-effort viewport nudge so hotkeys have visible effect even when auto is Off/paused
        try {
          const deltaPx = wantUp ? -24 : 24;
          scrollWriter.scrollBy(deltaPx, { behavior: "auto" });
        } catch {}
      } catch {
      }
    }, { capture: true });
  } catch {
  }
}

export {
    installScrollRouter,
    createAutoMotor,
};
