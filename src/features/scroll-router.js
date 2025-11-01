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
  const Auto = window.__tpAuto || window.Auto || {};
  function setEnabled(on) {
    try {
      (Auto.setEnabled ?? Auto.toggle)?.(on);
    } catch {
    }
  }
  function setVelocity(pxs) {
    try {
      Auto.setSpeed?.(pxs);
    } catch {
    }
  }
  function tick(_now) {
  }
  return { setEnabled, setVelocity, tick };
}

// src/asr/v2/paceEngine.ts
function clamp(n, lo, hi) {
  return Math.min(hi, Math.max(lo, n));
}
function createPaceEngine() {
  let mode = "assist";
  let caps = { minPxs: 10, maxPxs: 220, accelCap: 60, decayMs: 250 };
  let sens = 1;
  let _catchup = "off";
  let target = 0;
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
    caps = { ...caps, ...c };
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
      target = clamp(next, caps.minPxs, caps.maxPxs);
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
      target = clamp(next, caps.minPxs, caps.maxPxs);
    }
  }
  function getTargetPxs() {
    return clamp(target, caps.minPxs, caps.maxPxs);
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
    try {
      motor.setEnabled(true);
    } catch {
    }
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
var DEFAULTS = {
  mode: "hybrid",
  step: { holdCreep: 8 },
  hybrid: { attackMs: 150, releaseMs: 350, thresholdDb: -42, silenceStopMs: 1500 }
};
var state2 = { ...DEFAULTS };
var viewer = null;
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
  } catch {
  }
}
function restoreMode() {
  try {
    const m = localStorage.getItem(LS_KEY);
    if (m) state2.mode = m;
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
  viewer.scrollTop = Math.max(0, next.offsetTop - 6);
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
      if (viewer) viewer.scrollTop += dir * pxPerSec * dt;
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
function setSpeaking(on, auto) {
  if (on === speaking) return;
  speaking = on;
  if (typeof auto.setEnabled === "function") auto.setEnabled(on);
  else auto.toggle();
}
function hybridHandleDb(db, auto) {
  const { attackMs, releaseMs, thresholdDb } = DEFAULTS.hybrid;
  if (gateTimer) clearTimeout(gateTimer);
  if (db >= thresholdDb) gateTimer = setTimeout(() => setSpeaking(true, auto), attackMs);
  else gateTimer = setTimeout(() => setSpeaking(false, auto), releaseMs);
}
function applyMode(m) {
  state2.mode = m;
  persistMode();
  viewer = document.getElementById("viewer");
  try {
    const sel = document.getElementById("scrollMode");
    if (sel && sel.value !== m) sel.value = m;
  } catch {
  }
}
function installScrollRouter(opts) {
  try {
    window.__tpScrollRouterTsActive = true;
  } catch {
  }
  const { auto } = opts;
  restoreMode();
  applyMode(state2.mode);
  const orch = createOrchestrator();
  let orchRunning = false;
  async function ensureOrchestratorForMode() {
    try {
      if (state2.mode === "wpm" || state2.mode === "asr") {
        if (!orchRunning) {
          await orch.start(createVadEventAdapter());
          orch.setMode("assist");
          orchRunning = true;
        }
      } else if (orchRunning) {
        await orch.stop();
        orchRunning = false;
      }
    } catch {
    }
  }
  ensureOrchestratorForMode();
  let userEnabled = false;
  let dbGate = false;
  let vadGate = false;
  let gatePref = getUiPrefs().hybridGate;
  let speechActive = false;
  try {
    window.addEventListener("tp:speech-state", (e) => {
      try {
        const running = !!(e && e.detail && e.detail.running);
        speechActive = running;
        applyGate();
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
  function emitAutoState() {
    try {
      const btn = document.getElementById("autoToggle");
      const chip = chipEl();
      const st = (btn && btn.getAttribute && btn.getAttribute("data-state")) || "";
      const gate = st === "on" ? "on" : st === "paused" ? "paused" : "manual";
      const speed = (auto && typeof (auto.getState || {}).call === "function")
        ? (auto.getState().speed)
        : (function(){ try { return Number(localStorage.getItem("tp_auto_speed")||"0")||0; } catch { return 0; } })();
      const payload = {
        intentOn: !!userEnabled,
        gate,
        speed,
        label: (btn && btn.textContent || "").trim(),
        chip: (chip && chip.textContent || "").trim(),
      };
      try { (window.__tp_onAutoStateChange || null) && window.__tp_onAutoStateChange(payload); } catch {}
      try { document.dispatchEvent(new CustomEvent("tp:autoState", { detail: payload })); } catch {}
    } catch {}
  }
  function setAutoChip(state3, detail) {
    const el = chipEl();
    if (!el) return;
    el.textContent = `Auto: ${state3 === "on" ? "On" : state3 === "paused" ? "Paused" : "Manual"}`;
    el.classList.remove("on", "paused", "manual");
    el.classList.add(state3);
    el.setAttribute("data-state", state3);
    if (detail) el.title = detail;
  }
  const getStoredSpeed = () => {
    try {
      return Number(localStorage.getItem("tp_auto_speed") || "60") || 60;
    } catch {
      return 60;
    }
  };
  function applyGate() {
    if (state2.mode !== "hybrid") {
      if (silenceTimer) {
        try { clearTimeout(silenceTimer); } catch {}
        silenceTimer = void 0;
      }
      const want = !!userEnabled && !!speechActive;
      if (typeof auto.setEnabled === "function") auto.setEnabled(want);
      enabledNow = want;
      const detail2 = `Mode: ${state2.mode} \u2022 User: ${userEnabled ? "On" : "Off"} \u2022 Speech:${speechActive ? "1" : "0"}`;
      setAutoChip(userEnabled ? (enabledNow ? "on" : "paused") : "manual", detail2);
      try {
        const btn = document.getElementById("autoToggle");
        if (btn) {
          const s = getStoredSpeed();
          if (!userEnabled) { btn.textContent = "Auto-scroll: Off"; btn.setAttribute("data-state", "off"); }
          else if (enabledNow) { btn.textContent = `Auto-scroll: On \u2014 ${s} px/s`; btn.setAttribute("data-state", "on"); }
          else { btn.textContent = `Auto-scroll: Paused \u2014 ${s} px/s`; btn.setAttribute("data-state", "paused"); }
          btn.setAttribute("aria-pressed", String(!!userEnabled));
        }
      } catch {}
      try { emitAutoState(); } catch {}
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
  const gateWanted = computeGateWanted();
  const wantEnabled = userEnabled && speechActive && (isHybridBypass() ? true : gateWanted);
  const dueToGateSilence = userEnabled && speechActive && !isHybridBypass() && !gateWanted;
    if (wantEnabled) {
      if (silenceTimer) {
        try {
          clearTimeout(silenceTimer);
        } catch {
        }
        silenceTimer = void 0;
      }
      if (!enabledNow) {
        try {
          auto.setEnabled?.(true);
        } catch {
        }
        enabledNow = true;
      }
    } else {
      if (dueToGateSilence && enabledNow) {
        if (silenceTimer) {
          try {
            clearTimeout(silenceTimer);
          } catch {
          }
        }
        silenceTimer = setTimeout(() => {
          try {
            const stillGateWanted = computeGateWanted();
            const stillWantEnabled = userEnabled && (isHybridBypass() ? true : stillGateWanted);
            if (!stillWantEnabled && enabledNow) {
              try {
                auto.setEnabled?.(false);
              } catch {
              }
              enabledNow = false;
              const s2 = getStoredSpeed();
              const detail3 = `Mode: Hybrid \u2022 Pref: ${gatePref} \u2022 User: ${userEnabled ? "On" : "Off"} \u2022 dB:${dbGate ? "1" : "0"} \u2022 VAD:${vadGate ? "1" : "0"}`;
              setAutoChip(userEnabled ? "paused" : "manual", detail3);
              try {
                const btn2 = document.getElementById("autoToggle");
                if (btn2) {
                  if (userEnabled) {
                    btn2.textContent = `Auto-scroll: Paused \u2014 ${s2} px/s`;
                    btn2.setAttribute("data-state", "paused");
                  } else {
                    btn2.textContent = "Auto-scroll: Off";
                    btn2.setAttribute("data-state", "off");
                  }
                  btn2.setAttribute("aria-pressed", String(!!userEnabled));
                }
              } catch {}
              try {
                emitAutoState();
              } catch {}
            }
          } catch {}
          silenceTimer = void 0;
        }, DEFAULTS.hybrid.silenceStopMs);
      } else {
        if (silenceTimer) {
          try {
            clearTimeout(silenceTimer);
          } catch {
          }
          silenceTimer = void 0;
        }
        if (enabledNow) {
          try {
            auto.setEnabled?.(false);
          } catch {
          }
          enabledNow = false;
        }
      }
    }
  const detail = `Mode: Hybrid \u2022 Pref: ${gatePref} \u2022 User: ${userEnabled ? "On" : "Off"} \u2022 Speech:${speechActive ? "1" : "0"} \u2022 dB:${dbGate ? "1" : "0"} \u2022 VAD:${vadGate ? "1" : "0"}`;
    setAutoChip(userEnabled ? enabledNow ? "on" : "paused" : "manual", detail);
    try {
      const btn = document.getElementById("autoToggle");
      if (btn) {
        const s = getStoredSpeed();
        if (!userEnabled) {
          btn.textContent = "Auto-scroll: Off";
          btn.setAttribute("data-state", "off");
        } else if (enabledNow) {
          btn.textContent = `Auto-scroll: On \u2014 ${s} px/s`;
          btn.setAttribute("data-state", "on");
        } else {
          btn.textContent = `Auto-scroll: Paused \u2014 ${s} px/s`;
          btn.setAttribute("data-state", "paused");
        }
        btn.setAttribute("aria-pressed", String(!!userEnabled));
      }
    } catch {
    }
    try { emitAutoState(); } catch {}
  }
  onUiPrefs((p) => {
    gatePref = p.hybridGate;
    applyGate();
  });
  try {
    document.addEventListener("change", (e) => {
      const t = e.target;
      if (t?.id === "scrollMode") {
        const modeVal = t.value;
        applyMode(modeVal);
        applyGate();
        ensureOrchestratorForMode();
      }
    }, { capture: true });
    const modeSel = document.getElementById("scrollMode");
    modeSel?.setAttribute("aria-live", "polite");
  } catch {
  }
  try {
    document.addEventListener("keydown", (e) => {
      // Always support PageUp/PageDown stepping one line for usability and CI probe,
      // even when not in explicit step mode.
      if (e.key === "PageDown") {
        // eslint-disable-next-line no-restricted-syntax
        e.preventDefault();
        stepOnce(1);
        return;
      }
      if (e.key === "PageUp") {
        // eslint-disable-next-line no-restricted-syntax
        e.preventDefault();
        stepOnce(-1);
        return;
      }
      // The press-and-hold creep behavior remains exclusive to step mode (Space bar)
      if (state2.mode === "step" && e.key === " ") {
        // eslint-disable-next-line no-restricted-syntax
        e.preventDefault();
        holdCreepStart(DEFAULTS.step.holdCreep, 1);
      }
    }, { capture: true });
    document.addEventListener("keyup", (e) => {
      if (state2.mode !== "step") return;
      if (e.key === " ") {
        // eslint-disable-next-line no-restricted-syntax
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
      vadGate = !!(e && e.detail && e.detail.speaking);
      applyGate();
    });
  } catch {
  }
  // Allow external intent control (e.g., speech start/stop) to flip user intent deterministically
  try {
    window.addEventListener("tp:autoIntent", (e) => {
      try {
        const on = !!(e && e.detail && (e.detail.on ?? e.detail.enabled));
        userEnabled = !!on;
        applyGate();
      } catch {}
    });
  } catch {}
  try {
    document.addEventListener("click", (ev) => {
      const t = ev.target;
      if (t?.id === "autoToggle") {
        const was = userEnabled;
        userEnabled = !userEnabled;
        if (!was && userEnabled) {
          try {
            auto.setSpeed?.(getStoredSpeed());
          } catch {
          }
          try {
            window.__scrollCtl?.setSpeed?.(getStoredSpeed());
          } catch {
          }
        }
        applyGate();
      }
    }, { capture: true });
  } catch {
  }
  if (state2.mode === "hybrid") {
    userEnabled = true;
    try {
      auto.setSpeed?.(getStoredSpeed());
    } catch {
    }
    try {
      const btn = document.getElementById("autoToggle");
      if (btn) {
        btn.dataset.state = "on";
        btn.textContent = `Auto-scroll: On \u2014 ${getStoredSpeed()} px/s`;
      }
    } catch {
    }
    applyGate();
  } else {
    applyGate();
  }
  if (state2.mode === "wpm" || state2.mode === "asr") ensureOrchestratorForMode();
  try {
    document.addEventListener("tp:autoSpeed", (e) => {
      const btn = document.getElementById("autoToggle");
      if (!btn) return;
      const ds = btn.dataset?.state || "";
      const s = e && e.detail && typeof e.detail.speed === "number" ? e.detail.speed : getStoredSpeed();
      if (ds === "on") btn.textContent = `Auto-scroll: On \u2014 ${s} px/s`;
      if (ds === "paused") btn.textContent = `Auto-scroll: Paused \u2014 ${s} px/s`;
      try { emitAutoState(); } catch {}
    });
  } catch {
  }
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
        // eslint-disable-next-line no-restricted-syntax
        e.preventDefault();
        const cur = Number(auto?.getState?.().speed) || getStoredSpeed();
        const next = cur + (wantUp ? 5 : -5);
        auto?.setSpeed?.(next);
        // Best-effort viewport nudge so hotkeys have visible effect even when auto is Off/paused
        try {
          const vp = document.getElementById("viewer") || document.scrollingElement || document.documentElement;
          const deltaPx = wantUp ? -24 : 24;
          if (vp) vp.scrollTop = Math.max(0, (vp.scrollTop || 0) + deltaPx);
        } catch {}
      } catch {
      }
    }, { capture: true });
  } catch {
  }
}
export {
  installScrollRouter
};
