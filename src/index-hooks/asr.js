// src/scroll/scroller.ts
var displayScrollChannel = null;
var scrollEventTrackerInstalled = false;
function shouldLogScrollWrite() {
  if (typeof window === "undefined") return false;
  try {
    const w = window;
    if (w.__tpScrollDebug === true) return true;
    if (w.__tpScrollWriteDebug === true) return true;
    const qs = new URLSearchParams(window.location.search || "");
    if (qs.has("scrollDebug") || qs.has("scrollWriteDebug")) return true;
  } catch {
  }
  return false;
}
function readLineIndex(el) {
  if (!el) return null;
  const line = el.closest ? el.closest(".line") : null;
  if (!line) return null;
  const raw = line.dataset.i || line.dataset.index || line.dataset.lineIdx || line.dataset.line || line.getAttribute("data-line") || line.getAttribute("data-line-idx");
  if (raw != null && raw !== "") {
    const n = Number(raw);
    if (Number.isFinite(n)) return Math.max(0, Math.floor(n));
  }
  const id = line.id || "";
  const m = /^tp-line-(\d+)$/.exec(id);
  if (m) return Math.max(0, Number(m[1]));
  return null;
}
function computeAnchorLineIndex(scroller) {
  if (!scroller) return null;
  if (typeof document === "undefined" || typeof window === "undefined") return null;
  const rect = scroller.getBoundingClientRect();
  if (!rect.height || !rect.width) return null;
  const markerPct = typeof window.__TP_MARKER_PCT === "number" ? window.__TP_MARKER_PCT : 0.4;
  const markerY = rect.top + rect.height * markerPct;
  const markerX = rect.left + rect.width * 0.5;
  const hit = document.elementFromPoint(markerX, markerY);
  const hitIdx = readLineIndex(hit);
  if (hitIdx != null) return hitIdx;
  const lines = Array.from(scroller.querySelectorAll(".line"));
  if (!lines.length) return null;
  let bestIdx = null;
  let bestDist = Infinity;
  for (let i = 0; i < lines.length; i++) {
    const el = lines[i];
    const r = el.getBoundingClientRect();
    const y = r.top + r.height * 0.5;
    const d = Math.abs(y - markerY);
    if (d < bestDist) {
      bestDist = d;
      bestIdx = readLineIndex(el) ?? i;
    }
  }
  return bestIdx != null ? Math.max(0, Math.floor(bestIdx)) : null;
}
function isElementLike(node) {
  return !!node && typeof node === "object" && node.nodeType === 1;
}
function getDisplayViewerElement() {
  if (typeof window === "undefined") return null;
  try {
    const w = window;
    const direct = w.__tpDisplayViewerEl;
    if (isElementLike(direct)) return direct;
    const opener = w.opener;
    const viaOpener = opener && !opener.closed ? opener.__tpDisplayViewerEl : null;
    if (isElementLike(viaOpener)) return viaOpener;
  } catch {
  }
  return null;
}
function getScrollerEl(role = "main") {
  if (typeof document === "undefined") return null;
  if (role === "display") {
    return getDisplayViewerElement() || document.getElementById("wrap");
  }
  try {
    return document.querySelector("main#viewer.viewer, #viewer") || document.getElementById("viewer");
  } catch {
    return document.getElementById("viewer");
  }
}
function getScriptRoot() {
  try {
    return document.getElementById("script");
  } catch {
    return null;
  }
}
function getFallbackScroller() {
  try {
    return getScrollerEl("main") || getScrollerEl("display") || getScriptRoot() || document.getElementById("wrap");
  } catch {
    return null;
  }
}
function isScrollable(el) {
  if (!el) return false;
  if (el.scrollHeight - el.clientHeight > 2) return true;
  try {
    const st = getComputedStyle(el);
    return /(auto|scroll)/.test(st.overflowY || "");
  } catch {
    return false;
  }
}
function resolveActiveScroller(primary, fallback) {
  if (isScrollable(primary)) return primary;
  if (isScrollable(fallback)) return fallback;
  return primary || fallback;
}
function describeElement(el) {
  if (!el) return "none";
  const id = el.id ? `#${el.id}` : "";
  const cls = el.className ? `.${String(el.className).trim().split(/\s+/).join(".")}` : "";
  return `${el.tagName.toLowerCase()}${id}${cls}` || el.tagName.toLowerCase();
}
function getPrimaryScroller() {
  return getScrollerEl("main") || getScrollerEl("display");
}
function resolveViewerRole() {
  if (typeof window === "undefined") return "main";
  try {
    const explicit = String(window.__TP_VIEWER_ROLE || "").toLowerCase();
    if (explicit === "display") return "display";
    if (explicit === "main") return "main";
    const bodyRole = String(window.document?.body?.dataset?.viewerRole || "").toLowerCase();
    if (bodyRole === "display") return "display";
    if (bodyRole === "main") return "main";
    if (window.__TP_FORCE_DISPLAY) return "display";
    const path = String(window.location?.pathname || "").toLowerCase();
    if (path.includes("display")) return "display";
  } catch {
  }
  return "main";
}
function getRuntimeScroller(role = resolveViewerRole()) {
  if (typeof document === "undefined") return null;
  const root = getScriptRoot();
  if (role === "display") {
    const primary2 = getScrollerEl("display");
    const fallback2 = document.getElementById("wrap") || root;
    return resolveActiveScroller(primary2, fallback2);
  }
  const primary = getScrollerEl("main") || root;
  const fallback = root || getScrollerEl("display");
  return resolveActiveScroller(primary, fallback);
}
function isDisplayWindow() {
  if (typeof window === "undefined") return false;
  try {
    const params = new URLSearchParams(window.location.search || "");
    if (params.get("display") === "1") return true;
    const path = (window.location.pathname || "").toLowerCase();
    if (path.includes("display")) return true;
    if (window.__TP_FORCE_DISPLAY) return true;
  } catch {
  }
  return false;
}
function isDevScrollSync() {
  if (typeof window === "undefined") return false;
  try {
    const w = window;
    if (w.__tpScrollDebug || w.__tpScrollSyncDebug) return true;
    if (w.__TP_DEV || w.__TP_DEV1 || w.__tpDevMode) return true;
    if (w.localStorage?.getItem("tp_dev_mode") === "1") return true;
    const params = new URLSearchParams(window.location.search || "");
    if (params.has("scrollDebug") || params.has("dev") || params.has("debug")) return true;
  } catch {
  }
  return false;
}
function applyCanonicalScrollTop(topPx, opts = {}) {
  const scroller = opts.scroller || resolveActiveScroller(getPrimaryScroller(), getScriptRoot() || getFallbackScroller());
  if (!scroller) return 0;
  const max = Math.max(0, scroller.scrollHeight - scroller.clientHeight);
  const target = Math.max(0, Math.min(Number(topPx) || 0, max));
  const before = scroller.scrollTop || 0;
  try {
    scroller.scrollTop = target;
  } catch {
  }
  const after = scroller.scrollTop || target;
  const writerSource = opts.source ?? opts.reason ?? "programmatic";
  try {
    scroller.dataset.tpLastWriter = writerSource;
  } catch {
  }
  if (shouldLogScrollWrite()) {
    try {
      console.info("[SCROLL_WRITE_DETAIL]", {
        source: writerSource,
        reason: opts.reason,
        target: Math.round(target),
        before: Math.round(before),
        after: Math.round(after),
        scroller: describeElement(scroller)
      });
    } catch {
    }
  }
  try {
    let actualTop = target;
    try {
      actualTop = scroller.scrollTop || target;
    } catch {
    }
    const ratio = max > 0 ? actualTop / max : 0;
    const cursorLine = computeAnchorLineIndex(scroller);
    const payload = {
      type: "scroll",
      top: actualTop,
      ratio,
      anchorRatio: ratio,
      cursorLine: cursorLine ?? void 0
    };
    const send = window.sendToDisplay || window.__tpSendToDisplay || window.__tpDisplay?.sendToDisplay;
    if (typeof send === "function") {
      send(payload);
    } else {
      const displayWin = window.__tpDisplayWindow;
      if (displayWin && !displayWin.closed && typeof displayWin.postMessage === "function") {
        displayWin.postMessage(payload, "*");
      } else if (typeof BroadcastChannel !== "undefined") {
        if (!displayScrollChannel) {
          try {
            displayScrollChannel = new BroadcastChannel("tp_display");
          } catch {
          }
        }
        try {
          displayScrollChannel?.postMessage(payload);
        } catch {
        }
      }
    }
  } catch {
  }
  if (isDevScrollSync()) {
    try {
      console.debug("[SCROLL_SYNC]", {
        top: Math.round(target),
        scroller: describeElement(scroller),
        reason: opts.reason
      });
    } catch {
    }
  }
  return target;
}
if (typeof window !== "undefined") {
  try {
    const w = window;
    if (!isDisplayWindow()) {
      w.__tpScrollWrite = {
        scrollTo(top) {
          applyCanonicalScrollTop(top, { reason: "writer:scrollTo", source: "scroll-writer" });
        },
        scrollBy(delta) {
          const sc = resolveActiveScroller(getPrimaryScroller(), getScriptRoot() || getFallbackScroller());
          const cur = sc ? sc.scrollTop || 0 : 0;
          applyCanonicalScrollTop(cur + (Number(delta) || 0), { reason: "writer:scrollBy", source: "scroll-writer" });
        }
      };
    }
  } catch {
  }
}
if (typeof window !== "undefined") {
  try {
    if (!scrollEventTrackerInstalled) {
      const handler = (event) => {
        if (!shouldLogScrollWrite()) return;
        const target = event.target;
        if (!target) return;
        try {
          console.info("[SCROLL_EVENT]", {
            scrollTop: Math.round(target.scrollTop || 0),
            tpLastWriter: target.dataset.tpLastWriter ?? null,
            isTrusted: event.isTrusted,
            scroller: describeElement(target)
          });
        } catch {
        }
      };
      window.addEventListener("scroll", handler, { capture: true, passive: true });
      scrollEventTrackerInstalled = true;
    }
  } catch {
  }
}

// src/env/dev-log.ts
var MIN_LOG_LEVEL = 0;
var MAX_LOG_LEVEL = 3;
var DEFAULT_DEV_LOG_LEVEL = 1;
function clampLogLevel(value) {
  if (!Number.isFinite(value)) return MIN_LOG_LEVEL;
  return Math.max(MIN_LOG_LEVEL, Math.min(MAX_LOG_LEVEL, Math.floor(value)));
}
function parseLogLevelRaw(value) {
  if (value == null) return null;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return null;
  return clampLogLevel(parsed);
}
function isDevContext() {
  if (typeof window === "undefined") return false;
  try {
    const w = window;
    if (w.__TP_DEV || w.__TP_DEV1 || w.__tpDevMode) return true;
    const params = new URLSearchParams(window.location.search || "");
    if (params.has("dev") || params.has("debug") || params.has("dev1")) return true;
    if (window.localStorage?.getItem("tp_dev_mode") === "1") return true;
  } catch {
  }
  return false;
}
function getTpLogLevel() {
  if (typeof window === "undefined") return MIN_LOG_LEVEL;
  try {
    const w = window;
    const runtimeLevel = parseLogLevelRaw(w.__tpLogLevel);
    if (runtimeLevel != null) return runtimeLevel;
  } catch {
  }
  try {
    const stored = parseLogLevelRaw(window.localStorage?.getItem("tp_log_level"));
    if (stored != null) return stored;
  } catch {
  }
  try {
    const params = new URLSearchParams(window.location.search || "");
    const fromQuery = parseLogLevelRaw(params.get("tp_log_level")) ?? parseLogLevelRaw(params.get("logLevel")) ?? parseLogLevelRaw(params.get("log"));
    if (fromQuery != null) return fromQuery;
  } catch {
  }
  return isDevContext() ? DEFAULT_DEV_LOG_LEVEL : MIN_LOG_LEVEL;
}
function shouldLogLevel(minLevel) {
  return getTpLogLevel() >= clampLogLevel(minLevel);
}

// src/scroll/scroll-writer.ts
var cached = null;
var warned = false;
function shouldTraceWrites() {
  return shouldLogLevel(3);
}
function withWriteEnabled(reason, delta, fn) {
  const w = window;
  const prev = w.__tpScrollWriteActive;
  w.__tpScrollWriteActive = true;
  if (shouldTraceWrites()) {
    try {
      console.trace("[scroll-write]", reason, delta);
    } catch {
    }
  }
  try {
    return fn();
  } finally {
    w.__tpScrollWriteActive = prev;
  }
}
function readScrollTop(scroller) {
  return scroller.scrollTop || 0;
}
function getDeltaScroller() {
  return getRuntimeScroller(resolveViewerRole()) || getScrollerEl("main") || getScrollerEl("display") || getDisplayViewerElement() || document.getElementById("wrap");
}
function estimateDelta(targetTop) {
  try {
    const sc = getDeltaScroller();
    const cur = sc ? readScrollTop(sc) : 0;
    return (Number(targetTop) || 0) - (Number(cur) || 0);
  } catch {
    return Number(targetTop) || 0;
  }
}
function getScrollWriter() {
  if (cached) return cached;
  if (typeof window !== "undefined") {
    const maybe = window.__tpScrollWrite;
    if (typeof maybe === "function") {
      const fn = maybe;
      const getScroller = () => getRuntimeScroller(resolveViewerRole()) || getScrollerEl("main") || getScrollerEl("display") || getDisplayViewerElement();
      cached = {
        scrollTo(top) {
          try {
            const sc = getScroller();
            const cur = sc ? sc.scrollTop || 0 : 0;
            const next = Number(top) || 0;
            withWriteEnabled("scrollTo", next - cur, () => fn(next));
          } catch {
          }
        },
        scrollBy(delta) {
          try {
            const sc = getScroller();
            const cur = sc ? sc.scrollTop || 0 : 0;
            const d = Number(delta) || 0;
            withWriteEnabled("scrollBy", d, () => fn(cur + d));
          } catch {
          }
        },
        ensureVisible(_top, _paddingPx) {
        }
      };
      return cached;
    }
    if (maybe && typeof maybe === "object") {
      const w = maybe;
      if (typeof w.scrollTo === "function" && typeof w.scrollBy === "function") {
        const writerImpl = w;
        cached = {
          scrollTo(top, opts) {
            try {
              withWriteEnabled("scrollTo", estimateDelta(top), () => writerImpl.scrollTo(top, opts));
            } catch {
            }
          },
          scrollBy(delta, opts) {
            try {
              withWriteEnabled("scrollBy", Number(delta) || 0, () => writerImpl.scrollBy(delta, opts));
            } catch {
            }
          },
          ensureVisible(top, paddingPx = 80) {
            try {
              if (typeof writerImpl.ensureVisible === "function") {
                withWriteEnabled("ensureVisible", estimateDelta(top), () => writerImpl.ensureVisible(top, paddingPx));
              } else {
                const next = Math.max(0, top - paddingPx);
                withWriteEnabled("ensureVisible", estimateDelta(next), () => writerImpl.scrollTo(next, { behavior: "auto" }));
              }
            } catch {
            }
          }
        };
        return cached;
      }
    }
  }
  if (!warned) {
    if (typeof console !== "undefined" && typeof console.warn === "function") {
      try {
        console.warn("[scroll-writer] __tpScrollWrite missing or incomplete; scroll commands are no-ops.");
      } catch {
      }
    }
    warned = true;
  }
  cached = {
    scrollTo() {
    },
    scrollBy() {
    },
    ensureVisible() {
    }
  };
  return cached;
}

// src/scroll/audit.ts
var EXPECTED_WRITERS = /* @__PURE__ */ new Set([
  "ui/applyUiScrollMode",
  "features/scroll/mode-router",
  "scroll/mode-router",
  "state/app-store"
]);
var CONTINUOUS_MODES = /* @__PURE__ */ new Set(["timed", "wpm", "hybrid", "asr"]);
var FORBIDDEN_PHASES = /* @__PURE__ */ new Set(["idle", "preroll"]);
var RACE_WINDOW_MS = 150;
var writerStack = [];
var lastWriteAt = 0;
var lastWriter = "";
var lastMode = "";
var lastPhase = "";
function auditEnabled() {
  try {
    const w = window;
    if (w?.__TP_DEV || w?.__TP_DEV1 || w?.__tpDevMode) return true;
    if (w?.localStorage?.getItem?.("tp_dev_mode") === "1") return true;
    if (typeof location !== "undefined" && location.search.includes("dev=1")) return true;
  } catch {
  }
  return false;
}
function getScrollModeAuditContext() {
  if (!auditEnabled()) return null;
  return writerStack.length ? writerStack[writerStack.length - 1] : null;
}
function isContinuousMode(mode) {
  return CONTINUOUS_MODES.has(mode);
}
function normalize(value) {
  return String(value || "").trim().toLowerCase();
}
function emitUnexpected(label, payload) {
  try {
    console.warn(`[scroll-audit] UNEXPECTED ${label}`, payload);
  } catch {
  }
}
function recordScrollModeWrite(event) {
  if (!auditEnabled()) return;
  const now = Date.now();
  const writer = event.writer || "unknown";
  const from = normalize(event.from);
  const to = normalize(event.to);
  if (!to || to === from) return;
  const phase = normalize(event.phase);
  const reasons = [];
  if (!EXPECTED_WRITERS.has(writer)) reasons.push("unexpected-writer");
  if (FORBIDDEN_PHASES.has(phase) && isContinuousMode(to)) reasons.push("forbidden-phase");
  const deltaMs = lastWriteAt ? now - lastWriteAt : 0;
  if (lastWriteAt && deltaMs < RACE_WINDOW_MS) reasons.push("rapid-write");
  if (reasons.length > 0) {
    const payload = {
      reasons,
      writer,
      from,
      to,
      phase: phase || "unknown",
      deltaMs: lastWriteAt ? deltaMs : null,
      lastWriter: lastWriter || null,
      lastMode: lastMode || null,
      lastPhase: lastPhase || null
    };
    if (event.source) payload.source = event.source;
    if (event.via) payload.via = event.via;
    if (event.stack) {
      try {
        payload.stack = new Error().stack;
      } catch {
      }
    }
    emitUnexpected("scrollMode-write", payload);
  }
  lastWriteAt = now;
  lastWriter = writer;
  lastMode = to;
  lastPhase = phase;
}

// src/features/scroll/scroll-prefs.ts
var CANONICAL_KEY = "scrollMode";
var LEGACY_KEYS = ["tp_scroll_prefs_v1", "tp_scroll_mode_v1", "tp_scroll_mode"];
function normalizeMode(mode) {
  const v = String(mode || "").toLowerCase();
  if (v === "manual") return "step";
  const allowed = ["hybrid", "timed", "wpm", "asr", "step", "rehearsal"];
  return allowed.includes(v) ? v : null;
}
function safeParse(raw) {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return null;
    const normalized = normalizeMode(parsed.mode);
    if (!normalized) return null;
    return { mode: normalized };
  } catch {
    return null;
  }
}
function readLegacyMode(key, raw) {
  if (!raw) return null;
  if (key === "tp_scroll_prefs_v1") {
    return safeParse(raw)?.mode ?? null;
  }
  return normalizeMode(raw);
}
function cleanLegacyKeys(storage) {
  LEGACY_KEYS.forEach((key) => {
    try {
      storage.removeItem(key);
    } catch {
    }
  });
}
function migrateLegacyScrollMode() {
  if (typeof window === "undefined") return null;
  try {
    const storage = window.localStorage;
    const canonical = normalizeMode(storage.getItem(CANONICAL_KEY));
    if (canonical) {
      cleanLegacyKeys(storage);
      return canonical;
    }
    for (const key of LEGACY_KEYS) {
      const legacy = readLegacyMode(key, storage.getItem(key));
      if (legacy) {
        storage.setItem(CANONICAL_KEY, legacy);
        cleanLegacyKeys(storage);
        return legacy;
      }
    }
    cleanLegacyKeys(storage);
  } catch {
  }
  return null;
}
function loadScrollPrefs() {
  try {
    if (typeof window === "undefined") return null;
    const mode = migrateLegacyScrollMode();
    if (!mode) return null;
    return { mode };
  } catch {
    return null;
  }
}
function saveScrollPrefs(next) {
  try {
    if (typeof window === "undefined") return;
    const normalized = normalizeMode(next?.mode || null);
    if (!normalized) return;
    window.localStorage.setItem(CANONICAL_KEY, normalized);
    cleanLegacyKeys(window.localStorage);
  } catch {
  }
}

// src/state/app-store.ts
var IS_TEST = typeof process !== "undefined" && process.env && false;
var DEVICE_KEY = "tp_mic_device_v1";
var OBS_ENABLED_KEY = "tp_obs_enabled";
var OBS_HOST_KEY = "tp_obs_host";
var OBS_PASSWORD_KEY = "tp_obs_password";
var OBS_SCENE_KEY = "tp_obs_scene";
var OBS_RECONNECT_KEY = "tp_obs_reconnect";
var AUTO_RECORD_KEY = "tp_auto_record_on_start_v1";
var LEGACY_AUTO_RECORD_KEY = "tp_auto_record";
var PREROLL_SEC_KEY = "tp_preroll_seconds";
var DEV_HUD_KEY = "tp_dev_hud";
var SETTINGS_TAB_KEY = "tp_settings_tab";
var LEGACY_ASR_SETTINGS_KEY = "tp_asr_settings_v1";
var ASR_ENGINE_KEY = "tp_asr_engine_v1";
var ASR_LANG_KEY = "tp_asr_language_v1";
var ASR_INTERIM_KEY = "tp_asr_interim_v1";
var ASR_FILTER_KEY = "tp_asr_filter_v1";
var ASR_THRESHOLD_KEY = "tp_asr_threshold_v1";
var ASR_ENDPOINT_KEY = "tp_asr_endpoint_v1";
var ASR_PROFILES_KEY = "tp_asr_profiles_v1";
var ASR_ACTIVE_PROFILE_KEY = "tp_asr_active_profile_v1";
var SINGLE_MONITOR_READ_KEY = "tp_single_monitor_read_v1";
var ASR_CALM_MODE_KEY = "tp_asr_calm_mode_v1";
var ASR_TUNING_PROFILES_KEY = "tp_asr_tuning_profiles_v1";
var ASR_TUNING_ACTIVE_PROFILE_KEY = "tp_asr_tuning_active_profile_v1";
var SCROLL_MODE_KEY = "scrollMode";
var TIMED_SPEED_KEY = "tp_scroll_timed_speed_v1";
var WPM_TARGET_KEY = "tp_scroll_wpm_target_v1";
var WPM_BASEPX_KEY = "tp_scroll_wpm_basepx_v1";
var WPM_MINPX_KEY = "tp_scroll_wpm_minpx_v1";
var WPM_MAXPX_KEY = "tp_scroll_wpm_maxpx_v1";
var WPM_EWMA_KEY = "tp_scroll_wpm_ewma_v1";
var HYB_ATTACK_KEY = "tp_scroll_hybrid_attack_v1";
var HYB_RELEASE_KEY = "tp_scroll_hybrid_release_v1";
var HYB_IDLE_KEY = "tp_scroll_hybrid_idle_v1";
var STEP_PX_KEY = "tp_scroll_step_px_v1";
var REH_PUNCT_KEY = "tp_scroll_reh_punct_v1";
var REH_RESUME_KEY = "tp_scroll_reh_resume_v1";
var ALLOWED_PAGES = /* @__PURE__ */ new Set(["scripts"]);
var ALLOWED_OVERLAYS = /* @__PURE__ */ new Set(["none", "settings", "help", "shortcuts"]);
var HUD_ENABLED_KEY = "tp_hud_enabled_v1";
var HUD_SPEECH_NOTES_KEY = "tp_hud_speech_notes_v1";
var OVERLAY_KEY = "tp_overlay_v1";
var CAMERA_KEY = "tp_camera_enabled_v1";
var persistMap = {
  settingsTab: SETTINGS_TAB_KEY,
  micDevice: DEVICE_KEY,
  obsEnabled: OBS_ENABLED_KEY,
  obsScene: OBS_SCENE_KEY,
  obsReconnect: OBS_RECONNECT_KEY,
  obsHost: OBS_HOST_KEY,
  obsPassword: OBS_PASSWORD_KEY,
  autoRecord: AUTO_RECORD_KEY,
  prerollSeconds: PREROLL_SEC_KEY,
  devHud: DEV_HUD_KEY,
  hudEnabledByUser: HUD_ENABLED_KEY,
  hudSpeechNotesEnabledByUser: HUD_SPEECH_NOTES_KEY,
  overlay: OVERLAY_KEY,
  cameraEnabled: CAMERA_KEY,
  singleMonitorReadEnabled: SINGLE_MONITOR_READ_KEY,
  // Scroll router persistence
  scrollMode: SCROLL_MODE_KEY,
  timedSpeed: TIMED_SPEED_KEY,
  wpmTarget: WPM_TARGET_KEY,
  wpmBasePx: WPM_BASEPX_KEY,
  wpmMinPx: WPM_MINPX_KEY,
  wpmMaxPx: WPM_MAXPX_KEY,
  wpmEwmaSec: WPM_EWMA_KEY,
  hybridAttackMs: HYB_ATTACK_KEY,
  hybridReleaseMs: HYB_RELEASE_KEY,
  hybridIdleMs: HYB_IDLE_KEY,
  stepPx: STEP_PX_KEY,
  rehearsalPunct: REH_PUNCT_KEY,
  rehearsalResumeMs: REH_RESUME_KEY,
  "asr.engine": ASR_ENGINE_KEY,
  "asr.language": ASR_LANG_KEY,
  "asr.useInterimResults": ASR_INTERIM_KEY,
  "asr.threshold": ASR_THRESHOLD_KEY,
  "asr.endpointMs": ASR_ENDPOINT_KEY,
  "asr.filterFillers": ASR_FILTER_KEY,
  asrCalmModeEnabled: ASR_CALM_MODE_KEY,
  asrProfiles: ASR_PROFILES_KEY,
  asrActiveProfileId: ASR_ACTIVE_PROFILE_KEY,
  asrTuningProfiles: ASR_TUNING_PROFILES_KEY,
  asrTuningActiveProfileId: ASR_TUNING_ACTIVE_PROFILE_KEY
};
function parseJson(value) {
  if (!value) return null;
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}
function loadLegacyAsrSettings() {
  try {
    if (typeof window === "undefined") return null;
    const raw = window.localStorage.getItem(LEGACY_ASR_SETTINGS_KEY);
    return parseJson(raw);
  } catch {
    return null;
  }
}
function migrateAutoRecordFlag() {
  try {
    const current = localStorage.getItem(AUTO_RECORD_KEY);
    if (current !== null && typeof current !== "undefined") {
      if (localStorage.getItem(LEGACY_AUTO_RECORD_KEY) !== null) {
        try {
          localStorage.removeItem(LEGACY_AUTO_RECORD_KEY);
        } catch {
        }
      }
      return;
    }
    const legacy = localStorage.getItem(LEGACY_AUTO_RECORD_KEY);
    if (legacy !== null && typeof legacy !== "undefined") {
      localStorage.setItem(AUTO_RECORD_KEY, legacy === "1" ? "1" : "0");
      try {
        localStorage.removeItem(LEGACY_AUTO_RECORD_KEY);
      } catch {
      }
    }
  } catch {
  }
}
migrateAutoRecordFlag();
function normalizeScrollMode(mode) {
  const v = String(mode || "").trim().toLowerCase();
  if (!v) return "hybrid";
  if (v === "manual") return "step";
  return v;
}
function readAndMigrateScrollMode() {
  const legacyKeys = ["tp_scroll_mode", "tp_scroll_mode_v1", "tp_scroll_mode_v2", "tp_scroll_mode_backup"];
  try {
    const canonical = localStorage.getItem(SCROLL_MODE_KEY);
    if (canonical) {
      const norm = normalizeScrollMode(canonical);
      if (norm === "asr") {
        localStorage.setItem(SCROLL_MODE_KEY, "hybrid");
        try {
          localStorage.setItem("tp_asr_boot_fallback", "1");
        } catch {
        }
        legacyKeys.forEach((k) => {
          try {
            localStorage.removeItem(k);
          } catch {
          }
        });
        return "hybrid";
      }
      if (norm !== canonical) localStorage.setItem(SCROLL_MODE_KEY, norm);
      legacyKeys.forEach((k) => {
        try {
          localStorage.removeItem(k);
        } catch {
        }
      });
      return norm;
    }
    for (const k of legacyKeys) {
      const legacy = localStorage.getItem(k);
      if (legacy) {
        const norm = normalizeScrollMode(legacy);
        if (norm === "asr") {
          localStorage.setItem(SCROLL_MODE_KEY, "hybrid");
          try {
            localStorage.setItem("tp_asr_boot_fallback", "1");
          } catch {
          }
          try {
            localStorage.removeItem(k);
          } catch {
          }
          return "hybrid";
        }
        localStorage.setItem(SCROLL_MODE_KEY, norm);
        try {
          localStorage.removeItem(k);
        } catch {
        }
        return norm;
      }
    }
  } catch {
  }
  return "hybrid";
}
function buildInitialState() {
  const legacyAsrSettings = loadLegacyAsrSettings();
  return {
    // UI / Settings
    settingsTab: (() => {
      try {
        return localStorage.getItem(SETTINGS_TAB_KEY) || "general";
      } catch {
        return "general";
      }
    })(),
    micDevice: (() => {
      try {
        return localStorage.getItem(DEVICE_KEY) || "";
      } catch {
        return "";
      }
    })(),
    cameraEnabled: (() => {
      try {
        const raw = localStorage.getItem(CAMERA_KEY);
        if (raw == null) return false;
        return raw === "1";
      } catch {
        return false;
      }
    })(),
    cameraAvailable: false,
    micGranted: false,
    obsEnabled: (() => {
      try {
        return localStorage.getItem(OBS_ENABLED_KEY) === "1";
      } catch {
        return false;
      }
    })(),
    obsScene: (() => {
      try {
        return localStorage.getItem(OBS_SCENE_KEY) || "";
      } catch {
        return "";
      }
    })(),
    obsReconnect: (() => {
      try {
        return localStorage.getItem(OBS_RECONNECT_KEY) === "1";
      } catch {
        return false;
      }
    })(),
    autoRecord: (() => {
      try {
        return localStorage.getItem(AUTO_RECORD_KEY) === "1";
      } catch {
        return false;
      }
    })(),
    prerollSeconds: (() => {
      try {
        const n = parseInt(localStorage.getItem(PREROLL_SEC_KEY) || "3", 10);
        return isFinite(n) ? Math.max(0, Math.min(10, n)) : 3;
      } catch {
        return 3;
      }
    })(),
    devHud: (() => {
      try {
        return localStorage.getItem(DEV_HUD_KEY) === "1";
      } catch {
        return false;
      }
    })(),
    hudSupported: true,
    hudEnabledByUser: (() => {
      try {
        return localStorage.getItem(HUD_ENABLED_KEY) !== "0";
      } catch {
        return true;
      }
    })(),
    hudSpeechNotesEnabledByUser: (() => {
      try {
        return localStorage.getItem(HUD_SPEECH_NOTES_KEY) === "1";
      } catch {
        return false;
      }
    })(),
    singleMonitorReadEnabled: (() => {
      try {
        return localStorage.getItem(SINGLE_MONITOR_READ_KEY) === "1";
      } catch {
        return false;
      }
    })(),
    asrLive: false,
    "asr.engine": (() => {
      try {
        const raw = localStorage.getItem(ASR_ENGINE_KEY);
        if (raw) return raw;
        if (legacyAsrSettings?.engine && typeof legacyAsrSettings.engine === "string") {
          return legacyAsrSettings.engine;
        }
      } catch {
      }
      return "webspeech";
    })(),
    "asr.language": (() => {
      try {
        const raw = localStorage.getItem(ASR_LANG_KEY);
        if (raw) return raw;
        if (legacyAsrSettings?.lang && typeof legacyAsrSettings.lang === "string") {
          return legacyAsrSettings.lang;
        }
      } catch {
      }
      return "en-US";
    })(),
    "asr.useInterimResults": (() => {
      try {
        const raw = localStorage.getItem(ASR_INTERIM_KEY);
        if (raw !== null) return raw === "1";
        if (legacyAsrSettings?.interim !== void 0) return !!legacyAsrSettings.interim;
      } catch {
      }
      return true;
    })(),
    "asr.filterFillers": (() => {
      try {
        const raw = localStorage.getItem(ASR_FILTER_KEY);
        if (raw !== null) return raw === "1";
        if (legacyAsrSettings?.filterFillers !== void 0) return !!legacyAsrSettings.filterFillers;
      } catch {
      }
      return true;
    })(),
    "asr.threshold": (() => {
      try {
        const raw = localStorage.getItem(ASR_THRESHOLD_KEY);
        const num = Number(raw);
        if (raw !== null && !Number.isNaN(num)) return num;
        if (legacyAsrSettings?.threshold !== void 0) return Number(legacyAsrSettings.threshold) || 0.6;
      } catch {
      }
      return 0.6;
    })(),
    "asr.endpointMs": (() => {
      try {
        const raw = localStorage.getItem(ASR_ENDPOINT_KEY);
        const num = Number(raw);
        if (raw !== null && !Number.isNaN(num)) return num;
        if (legacyAsrSettings?.endpointMs !== void 0) return Number(legacyAsrSettings.endpointMs) || 700;
      } catch {
      }
      return 700;
    })(),
    asrCalmModeEnabled: (() => {
      try {
        const raw = localStorage.getItem(ASR_CALM_MODE_KEY);
        if (raw !== null) return raw === "1";
      } catch {
      }
      return false;
    })(),
    asrProfiles: (() => {
      try {
        const raw = localStorage.getItem(ASR_PROFILES_KEY);
        const parsed = parseJson(raw);
        if (parsed && typeof parsed === "object") return parsed;
      } catch {
      }
      return {};
    })(),
    asrActiveProfileId: (() => {
      try {
        const raw = localStorage.getItem(ASR_ACTIVE_PROFILE_KEY);
        if (raw) return raw;
      } catch {
      }
      return null;
    })(),
    asrTuningProfiles: (() => {
      try {
        const raw = localStorage.getItem(ASR_TUNING_PROFILES_KEY);
        const parsed = parseJson(raw);
        if (parsed && typeof parsed === "object") return parsed;
      } catch {
      }
      return {};
    })(),
    asrTuningActiveProfileId: (() => {
      try {
        const raw = localStorage.getItem(ASR_TUNING_ACTIVE_PROFILE_KEY);
        if (raw) return raw;
      } catch {
      }
      return null;
    })(),
    asrLastAppliedAt: 0,
    asrLastAppliedSummary: {},
    asrLastApplyOk: false,
    settingsSaveStatus: { state: "idle", at: 0 },
    overlay: (() => {
      try {
        const v = localStorage.getItem(OVERLAY_KEY) || "none";
        if (!ALLOWED_OVERLAYS.has(v)) {
          try {
            localStorage.removeItem(OVERLAY_KEY);
          } catch {
          }
          return "none";
        }
        return v;
      } catch {
        return "none";
      }
    })(),
    page: (() => {
      try {
        const v = "scripts";
        if (!ALLOWED_PAGES.has(v)) {
          return "scripts";
        }
        return v;
      } catch {
        return "scripts";
      }
    })(),
    obsHost: (() => {
      try {
        return localStorage.getItem(OBS_HOST_KEY) || "";
      } catch {
        return "";
      }
    })(),
    obsPassword: (() => {
      try {
        return localStorage.getItem(OBS_PASSWORD_KEY) || "";
      } catch {
        return "";
      }
    })(),
    // Scroll router (persisted)
    scrollMode: (() => {
      const fromPrefs = (() => {
        try {
          const prefs = loadScrollPrefs();
          if (prefs?.mode) return normalizeScrollMode(prefs.mode);
        } catch {
        }
        return null;
      })();
      if (fromPrefs === "asr") {
        try {
          localStorage.setItem("tp_asr_boot_fallback", "1");
        } catch {
        }
      }
      const migrated = readAndMigrateScrollMode();
      const chosen = normalizeScrollMode((fromPrefs === "asr" ? null : fromPrefs) || migrated);
      try {
        localStorage.setItem(SCROLL_MODE_KEY, chosen);
      } catch {
      }
      return chosen;
    })(),
    timedSpeed: (() => {
      try {
        const v = parseFloat(localStorage.getItem(TIMED_SPEED_KEY) || "");
        return isFinite(v) && v > 0 ? v : 25;
      } catch {
        return 25;
      }
    })(),
    wpmTarget: (() => {
      try {
        const v = parseInt(localStorage.getItem(WPM_TARGET_KEY) || "");
        return isFinite(v) && v >= 60 ? v : 180;
      } catch {
        return 180;
      }
    })(),
    wpmBasePx: (() => {
      try {
        const v = parseFloat(localStorage.getItem(WPM_BASEPX_KEY) || "");
        return isFinite(v) && v > 0 ? v : 25;
      } catch {
        return 25;
      }
    })(),
    wpmMinPx: (() => {
      try {
        const v = parseFloat(localStorage.getItem(WPM_MINPX_KEY) || "");
        return isFinite(v) && v > 0 ? v : 6;
      } catch {
        return 6;
      }
    })(),
    wpmMaxPx: (() => {
      try {
        const v = parseFloat(localStorage.getItem(WPM_MAXPX_KEY) || "");
        return isFinite(v) && v > 0 ? v : 200;
      } catch {
        return 200;
      }
    })(),
    wpmEwmaSec: (() => {
      try {
        const v = parseFloat(localStorage.getItem(WPM_EWMA_KEY) || "");
        return isFinite(v) && v > 0 ? v : 1;
      } catch {
        return 1;
      }
    })(),
    hybridAttackMs: (() => {
      try {
        const v = parseInt(localStorage.getItem(HYB_ATTACK_KEY) || "");
        return isFinite(v) && v >= 0 ? v : 120;
      } catch {
        return 120;
      }
    })(),
    hybridReleaseMs: (() => {
      try {
        const v = parseInt(localStorage.getItem(HYB_RELEASE_KEY) || "");
        return isFinite(v) && v >= 0 ? v : 250;
      } catch {
        return 250;
      }
    })(),
    hybridIdleMs: (() => {
      try {
        const v = parseInt(localStorage.getItem(HYB_IDLE_KEY) || "");
        return isFinite(v) && v >= 0 ? v : 1500;
      } catch {
        return 1500;
      }
    })(),
    stepPx: (() => {
      try {
        const v = parseInt(localStorage.getItem(STEP_PX_KEY) || "");
        return isFinite(v) && v > 0 ? v : 120;
      } catch {
        return 120;
      }
    })(),
    rehearsalPunct: (() => {
      try {
        const v = localStorage.getItem(REH_PUNCT_KEY);
        return v != null && v !== "" ? v : ".,;:?!";
      } catch {
        return ".,;:?!";
      }
    })(),
    rehearsalResumeMs: (() => {
      try {
        const v = parseInt(localStorage.getItem(REH_RESUME_KEY) || "");
        return isFinite(v) && v >= 100 ? v : 1e3;
      } catch {
        return 1e3;
      }
    })(),
    // transient session state (not persisted)
    obsUrl: "",
    obsPort: "",
    obsSecure: false
  };
}
function ensureExistingState() {
  if (IS_TEST) {
    try {
      delete window.__tpStore;
    } catch {
    }
    return {};
  }
  try {
    const existing = window.__tpStore;
    if (!existing || typeof existing !== "object") return {};
    const snapshot = typeof existing.getSnapshot === "function" ? existing.getSnapshot() : existing.state;
    if (snapshot && typeof snapshot === "object") return snapshot;
  } catch {
  }
  return {};
}
function sanitizeState(state) {
  if (!ALLOWED_PAGES.has(state.page)) {
    state.page = "scripts";
  }
  if (!ALLOWED_OVERLAYS.has(state.overlay)) {
    state.overlay = "none";
    try {
      localStorage.removeItem(OVERLAY_KEY);
    } catch {
    }
  }
  if (state.scrollMode === "manual") {
    state.scrollMode = "step";
  }
  if (!state.asrProfiles || typeof state.asrProfiles !== "object") {
    state.asrProfiles = {};
  }
  if (state.asrActiveProfileId && typeof state.asrActiveProfileId !== "string") {
    state.asrActiveProfileId = null;
  }
  if (!state.asrTuningProfiles || typeof state.asrTuningProfiles !== "object") {
    state.asrTuningProfiles = {};
  }
  if (state.asrTuningActiveProfileId && typeof state.asrTuningActiveProfileId !== "string") {
    state.asrTuningActiveProfileId = null;
  }
  if (typeof state.asrLastAppliedAt !== "number") {
    state.asrLastAppliedAt = 0;
  }
  if (!state.asrLastAppliedSummary || typeof state.asrLastAppliedSummary !== "object") {
    state.asrLastAppliedSummary = {};
  }
  if (typeof state.asrLastApplyOk !== "boolean") {
    state.asrLastApplyOk = false;
  }
  if (!state.settingsSaveStatus || typeof state.settingsSaveStatus !== "object") {
    state.settingsSaveStatus = { state: "idle", at: 0 };
  }
  return state;
}
function createAppStore(initial) {
  const subs = /* @__PURE__ */ Object.create(null);
  const baseState = buildInitialState();
  const state = sanitizeState(
    Object.assign(
      {},
      baseState,
      ensureExistingState(),
      initial || {}
    )
  );
  function notify(key, value) {
    try {
      const k = String(key);
      const fns = subs[k] || [];
      for (let i = 0; i < fns.length; i++) {
        try {
          fns[i](value);
        } catch {
        }
      }
    } catch {
    }
  }
  function get(key) {
    try {
      return state[key];
    } catch {
      return void 0;
    }
  }
  function set(key, value) {
    try {
      if (key === "page") {
        value = ALLOWED_PAGES.has(value) ? value : "scripts";
      }
      if (key === "overlay") {
        value = ALLOWED_OVERLAYS.has(value) ? value : "none";
      }
      const prev = state[key];
      if (prev === value) return value;
      state[key] = value;
      if (key === "scrollMode") {
        try {
          const ctx = getScrollModeAuditContext();
          recordScrollModeWrite({
            writer: ctx?.writer || "unknown",
            from: prev,
            to: value,
            phase: state["session.phase"],
            source: ctx?.meta?.source,
            via: ctx?.meta?.via,
            stack: !!ctx?.meta?.stack
          });
        } catch {
        }
      }
      try {
        const storageKey = persistMap[key];
        if (storageKey) {
          if (value === null || typeof value === "undefined") {
            localStorage.removeItem(storageKey);
          } else if (typeof value === "boolean") {
            localStorage.setItem(storageKey, value ? "1" : "0");
          } else if (typeof value === "object") {
            try {
              localStorage.setItem(storageKey, JSON.stringify(value));
            } catch {
            }
          } else {
            localStorage.setItem(storageKey, String(value));
          }
          if (key === "autoRecord") {
            try {
              localStorage.removeItem(LEGACY_AUTO_RECORD_KEY);
            } catch {
            }
          }
          if (key === "scrollMode") {
            saveScrollPrefs({ mode: String(value) });
          }
        }
      } catch {
      }
      notify(key, value);
      return value;
    } catch {
      return value;
    }
  }
  function subscribe(key, fn) {
    if (typeof fn !== "function") return () => {
    };
    const k = String(key);
    subs[k] = subs[k] || [];
    subs[k].push(fn);
    try {
      fn(state[key]);
    } catch {
    }
    return function unsubscribe() {
      try {
        subs[k] = (subs[k] || []).filter((x) => x !== fn);
      } catch {
      }
    };
  }
  function subscribeAll(map) {
    const unsubs = [];
    try {
      for (const k in map) {
        if (Object.prototype.hasOwnProperty.call(map, k)) {
          const key = k;
          const fn = map[key];
          if (fn) unsubs.push(subscribe(key, fn));
        }
      }
    } catch {
    }
    return function unsubscribeAll() {
      unsubs.forEach((u) => u && u());
    };
  }
  const appStore = {
    __tsOwned: true,
    get,
    set,
    subscribe,
    subscribeAll,
    state,
    getSnapshot: () => ({ ...state })
  };
  try {
    if (!IS_TEST) {
      const w = window;
      const existing = w.__tpStore;
      if (!existing || !existing.__tsOwned) {
        try {
          Object.defineProperty(w, "__tpStore", {
            value: appStore,
            writable: true,
            configurable: true,
            enumerable: true
          });
        } catch {
          w.__tpStore = appStore;
        }
      }
    }
  } catch {
  }
  return appStore;
}
var appStoreSingleton = createAppStore();

// src/index-hooks/asr-legacy.ts
var LEAP_CONFIRM_SCORE = 0.75;
var LEAP_CONFIRM_WINDOW_MS = 600;
var LEAP_SIZE = 4;
var LEAP_TUNING = {
  minScore: 0.68,
  // previously ~0.50 — require stronger similarity before deferring/confirming a +4 jump
  maxDistance: 4,
  // cap distance (retain existing +4 semantics)
  cooldownMs: 900,
  // block rapid back-to-back leap attempts
  minTokens: 3
  // ignore very short hypothesis fragments
};
var _lastLeapAt = 0;
var POST_COMMIT_FREEZE_MS = 250;
var DISPLAY_MIN_DR = 15e-4;
var NO_COMMIT_HOLD_MS = 1200;
var SILENCE_FREEZE_MS = 2500;
var VAD_PARTIAL_GRACE_MS = 400;
var __asrInstances = /* @__PURE__ */ new Set();
var RESCUE_JUMPS_ENABLED = false;
var scrollWriter = getScrollWriter();
function initAsrFeature() {
  try {
    console.info("[ASR] dev initAsrFeature()");
  } catch {
  }
  try {
    const existingBadge = document.getElementById("asrSpeedBadge");
    if (!existingBadge && !document.getElementById("asrChip")) {
      const s = document.createElement("span");
      s.id = "asrChip";
      s.className = "chip";
      s.textContent = "ASR: off";
      s.style.display = "none";
      document.body.appendChild(s);
    }
  } catch {
  }
  const normalize2 = (s) => {
    try {
      return String(s || "").toLowerCase().replace(/[^a-z0-9\s']/g, " ").replace(/\s+/g, " ").trim();
    } catch {
      return "";
    }
  };
  const COVERAGE_THRESHOLD = 0.45;
  const mountAsrChip = () => {
    try {
      let chip = document.getElementById("asrChip");
      if (!chip) {
        const old = document.getElementById("asrSpeedBadge");
        if (old && old.parentElement) {
          const repl = document.createElement("span");
          repl.id = "asrChip";
          repl.className = "chip";
          repl.textContent = "ASR: off";
          try {
            old.replaceWith(repl);
          } catch {
            try {
              old.parentElement.insertBefore(repl, old);
              old.remove();
            } catch {
            }
          }
          try {
            repl.dataset.asrMount = "badge";
          } catch {
          }
          chip = repl;
        }
      }
      if (!chip) {
        chip = document.createElement("span");
        chip.id = "asrChip";
        chip.className = "chip";
        chip.textContent = "ASR: off";
        chip.style.display = "none";
        document.body.appendChild(chip);
      }
      chip.setAttribute("aria-live", "polite");
      chip.setAttribute("aria-atomic", "true");
      const hijackBadgeIfPresent = () => {
        try {
          const badge = document.getElementById("asrSpeedBadge");
          if (badge && badge.isConnected) {
            if (badge === chip) return true;
            const host = badge.parentElement;
            const repl = chip;
            try {
              badge.replaceWith(repl);
            } catch {
              try {
                host.insertBefore(repl, badge);
                badge.remove();
              } catch {
              }
            }
            try {
              repl.dataset.asrMount = "badge";
              repl.style.display = "";
            } catch {
            }
            return true;
          }
        } catch {
        }
        return false;
      };
      if (!hijackBadgeIfPresent()) {
        try {
          const moBadge = new MutationObserver(() => {
            if (hijackBadgeIfPresent()) {
              try {
                moBadge.disconnect();
              } catch {
              }
            }
          });
          moBadge.observe(document.documentElement || document.body, { childList: true, subtree: true });
        } catch {
        }
      }
      const map = { idle: "off", ready: "ready", listening: "listening", running: "listening", error: "error" };
      window.addEventListener("asr:state", (e) => {
        try {
          const st = e?.detail?.state;
          chip.textContent = "ASR: " + (map[st] || st || "off");
        } catch {
        }
      });
      const attach = () => {
        if (chip && chip.isConnected && chip.dataset && chip.dataset.asrMount === "badge") {
          try {
            chip.style.display = "";
          } catch {
          }
          return true;
        }
        const host = document.querySelector("#topbarRight");
        if (host && host.isConnected) {
          try {
            host.appendChild(chip);
            chip.style.display = "";
            return true;
          } catch {
          }
        }
        return false;
      };
      if (!attach()) {
        let tries = 0;
        const t = setInterval(() => {
          tries++;
          if (attach() || tries > 20) clearInterval(t);
        }, 150);
        const mo = new MutationObserver(() => {
          if (attach()) {
            try {
              mo.disconnect();
            } catch {
            }
          }
        });
        mo.observe(document.documentElement || document.body, { childList: true, subtree: true });
      }
      return chip;
    } catch {
    }
    return null;
  };
  class WebSpeechEngine {
    constructor() {
      const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
      this.SR = SR || null;
      this.rec = null;
      this.listeners = /* @__PURE__ */ new Set();
      this.running = false;
      this._available = !!SR;
    }
    on(fn) {
      try {
        this.listeners.add(fn);
      } catch {
      }
    }
    off(fn) {
      try {
        this.listeners.delete(fn);
      } catch {
      }
    }
    emit(ev) {
      try {
        this.listeners.forEach((fn) => {
          try {
            fn(ev);
          } catch {
          }
        });
      } catch {
      }
    }
    async start(opts) {
      if (this.running) return;
      if (!this._available) {
        this.emit({ type: "ready" });
        return;
      }
      const rec = new this.SR();
      this.rec = rec;
      this.running = true;
      rec.lang = opts && opts.lang || "en-US";
      rec.interimResults = !!(opts && opts.interim !== false);
      rec.continuous = true;
      rec.onstart = () => {
        this.emit({ type: "ready" });
        this.emit({ type: "listening" });
      };
      rec.onerror = (e) => {
        this.emit({ type: "error", code: e?.error || "error", message: e?.message || "speech error" });
      };
      rec.onend = () => {
        this.running = false;
        this.emit({ type: "stopped" });
      };
      rec.onresult = (e) => {
        try {
          for (let i = e.resultIndex; i < e.results.length; i++) {
            const res = e.results[i];
            const txt = String(res[0]?.transcript || "");
            const conf = Number(res[0]?.confidence || (res.isFinal ? 1 : 0.5));
            this.emit({ type: res.isFinal ? "final" : "partial", text: txt, confidence: conf });
          }
        } catch {
        }
      };
      try {
        rec.start();
      } catch (err) {
        this.emit({ type: "error", code: "start", message: String(err && err.message || err) });
      }
    }
    async stop() {
      try {
        if (this.rec) this.rec.stop();
      } catch {
      } finally {
        this.running = false;
        this.emit({ type: "stopped" });
      }
    }
  }
  class AsrMode {
    constructor(opts) {
      this.opts = Object.assign({ rootSelector: "#scriptRoot, #script, body", lineSelector: ".line, p", markerOffsetPx: 140, windowSize: 6 }, opts || {});
      this.engine = null;
      this.state = "idle";
      this.currentIdx = 0;
      this.rescueCount = 0;
      this.lastIdx = -1;
      this.lastScore = 0;
      this.lastTs = 0;
      this.pending = null;
      this.freezeUntil = 0;
      this._leapPending = { idx: -1, ts: 0 };
      this._lastCommitAt = 0;
      this._lastVADAt = 0;
      this._lastPartialAt = 0;
      this._speaking = false;
      this._scrollAnim = null;
      this._nudgedAt = 0;
      this._nudgedAccepted = false;
      this._stats = { commits: 0, suppressed: { dup: 0, backwards: 0, leap: 0, freeze: 0 }, scoresSum: 0, gaps: [], tweenStepsSum: 0, tweenStepsN: 0 };
      this._telemetryTimer = null;
      this._stuckLastIdx = -1;
      this._stuckLastAt = 0;
      this._idleRescueMs = 3500;
      this._idleRescueTimer = setInterval(() => {
        try {
          if (this.state !== "running") return;
          const now = performance.now();
          const last = this._lastCommitAt || 0;
          if (last && now - last > this._idleRescueMs) {
            const all = this.getAllLineEls();
            if (all && all.length) {
              let rescueIdx = Math.min(this.currentIdx + 1, all.length - 1);
              rescueIdx = this.nextSpokenFrom(rescueIdx);
              if (rescueIdx !== this.currentIdx) {
                const detail = { index: rescueIdx, reason: "idle" };
                this.dispatch("asr:rescue", detail);
                try {
                  (window.HUD?.log || console.debug)?.("asr:rescue (idle)", { index: rescueIdx });
                } catch {
                }
                if (RESCUE_JUMPS_ENABLED) {
                  this.currentIdx = rescueIdx;
                  this.scrollToLine(rescueIdx);
                }
                this._lastCommitAt = now;
              }
            }
          }
        } catch {
        }
      }, 1e3);
      try {
        mountAsrChip();
      } catch {
      }
      try {
        __asrInstances.add(this);
      } catch {
      }
      try {
        window.addEventListener("tp:vad", (e) => {
          try {
            const speaking = !!(e && e.detail && e.detail.speaking);
            this._speaking = speaking;
            this._lastVADAt = performance.now();
            if (!speaking) {
              const due = this._lastVADAt + SILENCE_FREEZE_MS;
              setTimeout(() => {
                try {
                  const now = performance.now();
                  if (!this._speaking && now >= due && now - (this._lastPartialAt || 0) > VAD_PARTIAL_GRACE_MS) {
                    this.setState("ready");
                  }
                } catch {
                }
              }, SILENCE_FREEZE_MS + 10);
            }
          } catch {
          }
        });
      } catch {
      }
      try {
        const reset = () => {
          try {
            this.lastIdx = -1;
            this.lastScore = 0;
            this.lastTs = 0;
            this.pending = null;
            this._leapPending = { idx: -1, ts: 0 };
            this.dispatch("asr:rescue", { index: this.currentIdx, reason: "manual" });
            try {
              (window.HUD?.log || console.debug)?.("asr:rescue (manual)");
            } catch {
            }
            this._nudgedAt = performance.now();
            this._nudgedAccepted = false;
          } catch {
          }
        };
        let lastReset = 0;
        const maybeReset = () => {
          const now = performance.now();
          if (now - lastReset > 300) {
            lastReset = now;
            reset();
          }
        };
        window.addEventListener("wheel", maybeReset, { passive: true });
        window.addEventListener("keydown", (ev) => {
          try {
            const k = (ev && (ev.code || ev.key || "")).toString();
            if (/Arrow|Page|Home|End/.test(k)) maybeReset();
          } catch {
          }
        }, { capture: true });
        window.addEventListener("tp:manual-nudge", maybeReset);
      } catch {
      }
    }
    lineIsSilent(idx) {
      try {
        return !!document.querySelector(`.line[data-line-idx="${idx}"][data-silent="1"]`);
      } catch {
        return false;
      }
    }
    nextSpokenFrom(idx) {
      try {
        const total = this.getAllLineEls().length;
        let i = idx;
        while (i < total && this.lineIsSilent(i)) i++;
        return i;
      } catch {
        return idx;
      }
    }
    // Direct index commit (dev/test). Applies the same gating used by tryAdvance, but skips coverage.
    commitIndex(newIdx, bestScore = 1) {
      try {
        if (typeof newIdx !== "number" || !isFinite(newIdx)) return;
        if (newIdx < this.currentIdx) {
          try {
            this._stats.suppressed.backwards++;
          } catch {
          }
          return;
        }
        const delta = newIdx - this.currentIdx;
        if (!this._leapAllowed(delta, newIdx, bestScore)) return;
        if (!this.shouldCommit(newIdx, bestScore)) return;
        if (!this.gateLowConfidence(newIdx, bestScore)) return;
        newIdx = this.nextSpokenFrom(newIdx);
        this.currentIdx = newIdx;
        try {
          this.scrollToLine(newIdx, bestScore);
        } catch {
        }
        this.dispatch("asr:advance", { index: newIdx, score: bestScore });
        try {
          (window.HUD?.log || console.debug)?.("asr:advance(idx)", { index: newIdx, score: Number(bestScore).toFixed(2) });
        } catch {
        }
        try {
          this.freezeUntil = performance.now() + POST_COMMIT_FREEZE_MS;
        } catch {
        }
        try {
          const now = performance.now();
          if (this._lastCommitAt) {
            const gap = now - this._lastCommitAt;
            try {
              if (isFinite(gap)) this._stats.gaps.push(gap);
            } catch {
            }
          }
          this._lastCommitAt = now;
          try {
            this._stats.commits++;
            this._stats.scoresSum += Number(bestScore) || 0;
          } catch {
          }
        } catch {
        }
      } catch {
      }
    }
    getState() {
      return this.state;
    }
    async start() {
      if (this.state !== "idle") return;
      const bus = window.HUD && window.HUD.bus || window.__tpHud && window.__tpHud.bus || null;
      this._bus = bus;
      this._busHandlers = [];
      if (bus && typeof bus.on === "function") {
        if (this._bus === bus && this._busHandlers && this._busHandlers.length) {
          this.setState("listening");
          this.dispatch("asr:state", { state: "listening" });
          return;
        }
        const onPartial = (p) => {
          try {
            this.onEngineEvent({ type: "partial", text: String(p?.text || ""), confidence: 0.5 });
          } catch {
          }
        };
        const onFinal = (p) => {
          try {
            this.onEngineEvent({ type: "final", text: String(p?.text || ""), confidence: 1 });
          } catch {
          }
        };
        try {
          bus.on("speech:partial", onPartial);
          this._busHandlers.push(["speech:partial", onPartial]);
        } catch {
        }
        try {
          bus.on("speech:final", onFinal);
          this._busHandlers.push(["speech:final", onFinal]);
        } catch {
        }
        this.setState("listening");
        this.dispatch("asr:state", { state: "listening" });
        try {
          (window.HUD?.log || console.debug)?.("asr", { mode: "bus-follow" });
        } catch {
        }
        try {
          if (this._telemetryTimer) clearInterval(this._telemetryTimer);
        } catch {
        }
        try {
          this._telemetryTimer = setInterval(() => this._emitStats(), 5e3);
          try {
            this._telemetryTimer?.unref?.();
          } catch {
          }
        } catch {
        }
        return;
      }
      this.engine = new WebSpeechEngine();
      this.engine.on((e) => this.onEngineEvent(e));
      this.setState("ready");
      try {
        if (this._telemetryTimer) clearInterval(this._telemetryTimer);
      } catch {
      }
      try {
        this._telemetryTimer = setInterval(() => this._emitStats(), 5e3);
        try {
          this._telemetryTimer?.unref?.();
        } catch {
        }
      } catch {
      }
      await this.engine.start({ lang: "en-US", interim: true });
    }
    async stop() {
      try {
        if (this._bus && this._busHandlers && typeof this._bus.off === "function") {
          for (const [ev, fn] of this._busHandlers) {
            try {
              this._bus.off(ev, fn);
            } catch {
            }
          }
        }
      } catch {
      }
      this._bus = null;
      this._busHandlers = [];
      try {
        await this.engine?.stop?.();
      } catch {
      }
      this.setState("idle");
      this.dispatch("asr:state", { state: this.state });
      try {
        this._emitStats(true);
      } catch {
      }
      try {
        if (this._telemetryTimer) clearInterval(this._telemetryTimer);
      } catch {
      }
    }
    onEngineEvent(e) {
      if (e.type === "ready") this.setState("ready");
      if (e.type === "listening") this.setState("listening");
      if (e.type === "partial" || e.type === "final") {
        if (this.state !== "running") this.setState("running");
        const text = normalize2(e.text);
        if (e.type === "partial") {
          try {
            this._lastPartialAt = performance.now();
          } catch {
          }
        }
        this.tryAdvance(text, e.type === "final", Number(e.confidence || (e.type === "final" ? 1 : 0.5)));
      }
      if (e.type === "error") {
        this.setState("error");
        this.dispatch("asr:error", { code: e.code, message: e.message });
      }
      if (e.type === "stopped") {
        this.setState("idle");
      }
    }
    setState(s) {
      this.state = s;
      this.dispatch("asr:state", { state: s });
      try {
        (window.HUD?.log || console.debug)?.("asr:state", s);
      } catch {
      }
    }
    dispatch(name, detail) {
      try {
        window.dispatchEvent(new CustomEvent(name, { detail }));
      } catch {
      }
    }
    getAllLineEls() {
      const root = document.querySelector(this.opts.rootSelector) || document.body;
      const list = Array.from(root.querySelectorAll(this.opts.lineSelector));
      return list.length ? list : Array.from(document.querySelectorAll(".line, p"));
    }
    getWindow() {
      const els = this.getAllLineEls();
      const start2 = Math.max(0, Math.min(this.currentIdx, Math.max(0, els.length - 1)));
      const end = Math.max(start2, Math.min(els.length, start2 + this.opts.windowSize));
      const texts = els.slice(start2, end).map((el) => normalize2(el.textContent || ""));
      return { lines: texts, idx0: start2 };
    }
    shouldCommit(idx, score) {
      try {
        const now = performance.now();
        const sameIdx = idx === this.lastIdx;
        const scoreGain = (Number(score) || 0) - (Number(this.lastScore) || 0);
        if (this._nudgedAt && idx === this.currentIdx) {
          if (!this._nudgedAccepted) {
            this._nudgedAccepted = true;
            this.lastIdx = idx;
            this.lastScore = Number(score) || 0;
            this.lastTs = now;
            return true;
          }
          if (scoreGain < 0.1) {
            try {
              this._stats.suppressed.dup++;
            } catch {
            }
            return false;
          }
        }
        if (sameIdx && scoreGain < 0.12 && now - (this.lastTs || 0) < 350) {
          try {
            this._stats.suppressed.dup++;
          } catch {
          }
          return false;
        }
        this.lastIdx = idx;
        this.lastScore = Number(score) || 0;
        this.lastTs = now;
        return true;
      } catch {
        return true;
      }
    }
    gateLowConfidence(idx, score) {
      try {
        const now = performance.now();
        const LOW = 0.55, WINDOW = 1200;
        const s = Number(score) || 0;
        if (s >= LOW) {
          this.pending = null;
          return true;
        }
        const p = this.pending;
        if (!p || p.idx !== idx || now - p.ts > WINDOW) {
          this.pending = { idx, score: s, ts: now };
          return false;
        }
        this.pending = null;
        return true;
      } catch {
        return true;
      }
    }
    smoothScrollTo(scroller, top, ms = 160, score = 1) {
      try {
        if (this._scrollAnim && this._scrollAnim.cancel) this._scrollAnim.cancel();
      } catch {
      }
      const isWin = scroller === document.scrollingElement || scroller === document.body;
      const from = isWin ? window.scrollY || window.pageYOffset || 0 : scroller.scrollTop || 0;
      const delta = Number(top || 0) - Number(from || 0);
      try {
        const denom = isWin ? (document.documentElement?.scrollHeight || 0) - (window.innerHeight || 0) : (scroller.scrollHeight || 0) - (scroller.clientHeight || 0);
        if (denom > 0) {
          const rFrom = from / denom;
          const rTo = Number(top || 0) / denom;
          if (Math.abs(rTo - rFrom) < 2e-3) {
            try {
              this._stats.tweenStepsN++;
            } catch {
            }
            return 0;
          }
        }
      } catch {
      }
      let cancelled = false;
      let steps = Math.max(3, Math.min(5, Math.round(ms / 50)));
      const s = Number(score) || 0;
      if (s >= 0.85) steps = 5;
      else if (s >= 0.5 && s <= 0.6) steps = Math.min(steps, 3);
      try {
        this._stats.tweenStepsSum += steps;
        this._stats.tweenStepsN++;
      } catch {
      }
      let i = 0;
      const write = () => {
        if (cancelled) return;
        i++;
        const k = i / steps;
        const y = from + delta * (k < 0 ? 0 : k > 1 ? 1 : k);
        try {
          scrollWriter.scrollTo(y, { behavior: "auto" });
        } catch {
        }
        if (i < steps) requestAnimationFrame(write);
      };
      this._scrollAnim = { cancel: () => {
        cancelled = true;
      } };
      requestAnimationFrame(write);
      return steps;
    }
    _leapAllowed(delta, idx, score) {
      try {
        if (delta < LEAP_SIZE) return true;
        const now = performance.now();
        const s = Number(score) || 0;
        const tokenCount = this._lastHypTokensCount || 0;
        if (Math.abs(delta) > LEAP_TUNING.maxDistance) return false;
        if (s < LEAP_TUNING.minScore) {
          try {
            this._stats.suppressed.leap++;
          } catch {
          }
          ;
          return false;
        }
        if (tokenCount < LEAP_TUNING.minTokens) {
          try {
            this._stats.suppressed.leap++;
          } catch {
          }
          ;
          return false;
        }
        if (now - _lastLeapAt < LEAP_TUNING.cooldownMs) {
          try {
            this._stats.suppressed.leap++;
          } catch {
          }
          ;
          return false;
        }
        if (s >= LEAP_CONFIRM_SCORE) {
          this._leapPending = { idx: -1, ts: 0 };
          _lastLeapAt = now;
          try {
            (window.HUD?.log || console.debug)?.("asr:confirm leap \u2713", { d: "+" + delta });
          } catch {
          }
          return true;
        }
        if (this._leapPending && this._leapPending.idx === idx) {
          if (now - this._leapPending.ts <= LEAP_CONFIRM_WINDOW_MS) {
            this._leapPending = { idx: -1, ts: 0 };
            _lastLeapAt = now;
            try {
              (window.HUD?.log || console.debug)?.("asr:confirm leap \u2713", { d: "+" + delta });
            } catch {
            }
            return true;
          } else {
            try {
              (window.HUD?.log || console.debug)?.("asr:confirm expired");
            } catch {
            }
            try {
              this._stats.suppressed.leap++;
            } catch {
            }
          }
        }
        this._leapPending = { idx, ts: now };
        _lastLeapAt = now;
        try {
          (window.HUD?.log || console.debug)?.("asr:defer leap", { d: "+" + delta, score: s.toFixed(2) });
        } catch {
        }
        try {
          this._stats.suppressed.leap++;
        } catch {
        }
        return false;
      } catch {
        return true;
      }
    }
    tryAdvance(hyp, isFinal, confidence) {
      try {
        const now = performance.now();
        if (now < (this.freezeUntil || 0)) {
          const ms = Math.max(0, Math.round((this.freezeUntil || 0) - now));
          try {
            this._stats.suppressed.freeze++;
          } catch {
          }
          try {
            (window.HUD?.log || console.debug)?.("asr:drop freeze", { ms });
          } catch {
          }
          return;
        }
      } catch {
      }
      try {
        this._lastHypTokensCount = String(hyp || "").split(/\s+/).filter(Boolean).length;
      } catch {
        this._lastHypTokensCount = 0;
      }
      const { lines, idx0 } = this.getWindow();
      let bestIdx = -1, bestScore = 0;
      for (let i = 0; i < lines.length; i++) {
        const score = coverageScore(lines[i], hyp) * (confidence || 1);
        if (score > bestScore) {
          bestScore = score;
          bestIdx = i;
        }
      }
      const thr = Number(localStorage.getItem("tp_asr_threshold") || COVERAGE_THRESHOLD) || COVERAGE_THRESHOLD;
      if (bestIdx >= 0 && bestScore >= thr) {
        let newIdx = idx0 + bestIdx;
        if (newIdx < this.currentIdx) {
          try {
            this._stats.suppressed.backwards++;
          } catch {
          }
          return;
        }
        if (newIdx === this.currentIdx) {
        }
        const delta = newIdx - this.currentIdx;
        if (!this._leapAllowed(delta, newIdx, bestScore)) return;
        if (!this.shouldCommit(newIdx, bestScore)) return;
        if (!this.gateLowConfidence(newIdx, bestScore)) return;
        newIdx = this.nextSpokenFrom(newIdx);
        this.currentIdx = newIdx;
        this.scrollToLine(newIdx, bestScore);
        this.dispatch("asr:advance", { index: newIdx, score: bestScore });
        try {
          (window.HUD?.log || console.debug)?.("asr:advance", { index: newIdx, score: Number(bestScore).toFixed(2) });
        } catch {
        }
        try {
          this.freezeUntil = performance.now() + POST_COMMIT_FREEZE_MS;
        } catch {
        }
        try {
          const now = performance.now();
          if (this._lastCommitAt) {
            const gap = now - this._lastCommitAt;
            try {
              if (isFinite(gap)) this._stats.gaps.push(gap);
            } catch {
            }
          }
          this._lastCommitAt = now;
          try {
            this._stats.commits++;
            this._stats.scoresSum += Number(bestScore) || 0;
          } catch {
          }
        } catch {
        }
        try {
          const total = this.getAllLineEls().length;
          if (newIdx >= total - 1) {
            try {
              window.dispatchEvent(new CustomEvent("asr:stop"));
            } catch {
            }
          }
        } catch {
        }
        try {
          const now2 = performance.now();
          if (newIdx === this._stuckLastIdx) {
            if (now2 - this._stuckLastAt > 2500) {
              let rescueIdx = Math.min(newIdx + 1, this.getAllLineEls().length - 1);
              rescueIdx = this.nextSpokenFrom(rescueIdx);
              if (rescueIdx !== newIdx) {
                const detail = { index: rescueIdx, reason: "same-index" };
                this.dispatch("asr:rescue", detail);
                try {
                  (window.HUD?.log || console.debug)?.("asr:rescue (same-index)", { from: newIdx, to: rescueIdx });
                } catch {
                }
                if (RESCUE_JUMPS_ENABLED) {
                  this.currentIdx = rescueIdx;
                  this.scrollToLine(rescueIdx);
                }
              }
              this._stuckLastAt = now2;
            }
          } else {
            this._stuckLastIdx = newIdx;
            this._stuckLastAt = now2;
          }
        } catch {
        }
      } else if (isFinal) {
        this.rescueCount++;
        if (this.rescueCount <= 2) {
          let rIdx = Math.min(this.currentIdx + 1, this.getAllLineEls().length - 1);
          rIdx = this.nextSpokenFrom(rIdx);
          const detail = { index: rIdx, reason: "weak-final" };
          this.dispatch("asr:rescue", detail);
          try {
            (window.HUD?.log || console.debug)?.("asr:rescue", { index: rIdx });
          } catch {
          }
          if (RESCUE_JUMPS_ENABLED) {
            this.currentIdx = rIdx;
            this.scrollToLine(this.currentIdx);
          }
        }
      }
    }
    scrollToLine(idx, score = 1) {
      const els = this.getAllLineEls();
      const target = els[idx];
      if (!target) return;
      try {
        const ov = document.getElementById("countOverlay");
        if (ov) {
          const cs = getComputedStyle(ov);
          const visible = cs.display !== "none" && cs.visibility !== "hidden" && !ov.classList.contains("hidden");
          if (visible) return;
        }
      } catch {
      }
      const scroller = findScroller(target);
      const marker = this.opts.markerOffsetPx;
      const top = elementTopRelativeTo(target, scroller) - marker;
      try {
        const steps = this.smoothScrollTo(scroller, top, 160, score);
        if (typeof steps === "number") {
        }
      } catch {
      }
    }
    _emitStats(final = false) {
      try {
        const commits = this._stats.commits || 0;
        const avgScore = commits ? this._stats.scoresSum / commits : 0;
        const tweenStepsAvg = this._stats.tweenStepsN ? this._stats.tweenStepsSum / this._stats.tweenStepsN : 0;
        let p95GapMs = 0;
        if (this._stats.gaps && this._stats.gaps.length) {
          const arr = this._stats.gaps.slice().sort((a, b) => a - b);
          const idx = Math.min(arr.length - 1, Math.floor(arr.length * 0.95));
          p95GapMs = arr[idx] || 0;
        }
        const payload = {
          commits,
          suppressed: Object.assign({ dup: 0, backwards: 0, leap: 0, freeze: 0 }, this._stats.suppressed || {}),
          avgScore: Number(avgScore.toFixed(3)),
          p95GapMs: Math.round(p95GapMs),
          tweenStepsAvg: Number(tweenStepsAvg.toFixed(2))
        };
        window.dispatchEvent(new CustomEvent("asr:stats", { detail: payload }));
      } catch {
      }
      this._stats = { commits: 0, suppressed: { dup: 0, backwards: 0, leap: 0, freeze: 0 }, scoresSum: 0, gaps: [], tweenStepsSum: 0, tweenStepsN: 0 };
      if (final) {
        try {
          if (this._telemetryTimer) clearInterval(this._telemetryTimer);
        } catch {
        }
      }
    }
  }
  function coverageScore(line, hyp) {
    try {
      const A = new Set(String(line || "").split(" ").filter(Boolean));
      const B = new Set(String(hyp || "").split(" ").filter(Boolean));
      if (A.size === 0) return 0;
      let inter = 0;
      for (const w of A) if (B.has(w)) inter++;
      return inter / A.size;
    } catch {
      return 0;
    }
  }
  function findScroller(el) {
    let node = el?.parentElement;
    while (node) {
      try {
        const st = getComputedStyle(node);
        if (/(auto|scroll)/.test(st.overflowY || "")) return node;
      } catch {
      }
      node = node.parentElement;
    }
    return document.scrollingElement || document.body;
  }
  function elementTopRelativeTo(el, scroller) {
    const r1 = el.getBoundingClientRect();
    const isWin = scroller === document.scrollingElement || scroller === document.body;
    const r2 = isWin ? { top: 0 } : scroller.getBoundingClientRect();
    const scrollTop = isWin ? window.pageYOffset : scroller.scrollTop;
    return r1.top - r2.top + scrollTop;
  }
  let asrMode = null;
  let speechActive = false;
  let asrActive = false;
  let autoHeld = false;
  const getScrollMode = () => {
    try {
      const ov = typeof window.__tpModeOverride === "string" ? window.__tpModeOverride : null;
      if (ov) return String(ov).toLowerCase();
      const store = window.__tpStore || appStoreSingleton;
      const v = store?.get?.("scrollMode");
      if (typeof v === "string") return v.toLowerCase();
    } catch {
    }
    return "";
  };
  const wantASR = () => getScrollMode() === "asr";
  const setChipVisible = (on) => {
    try {
      const c = document.getElementById("asrChip");
      if (c) c.style.display = on ? "" : "none";
    } catch {
    }
  };
  const setChipState = (state) => {
    try {
      window.dispatchEvent(new CustomEvent("asr:state", { detail: { state } }));
    } catch {
    }
  };
  const holdAuto = () => {
    if (autoHeld) return;
    autoHeld = true;
    try {
      window.__scrollCtl?.stop?.();
    } catch {
    }
    try {
      (window.__tpAuto || window.Auto || window.__scrollCtl)?.setEnabled?.(false);
    } catch {
    }
    try {
      window.dispatchEvent(new CustomEvent("autoscroll:disable", { detail: "asr" }));
    } catch {
    }
  };
  const releaseAuto = () => {
    if (!autoHeld) return;
    autoHeld = false;
    try {
      window.dispatchEvent(new CustomEvent("autoscroll:enable", { detail: "asr" }));
    } catch {
    }
  };
  const ensureMode = async () => {
    if (!asrMode) asrMode = new AsrMode({});
    return asrMode;
  };
  const isSettingsHydrating = () => {
    try {
      return !!window.__tpSettingsHydrating;
    } catch {
      return false;
    }
  };
  const start = async () => {
    if (asrActive) return;
    if (isSettingsHydrating()) {
      try {
        console.debug("[ASR] start blocked during settings hydration");
      } catch {
      }
      return;
    }
    try {
      const m = await ensureMode();
      holdAuto();
      await m.start();
      asrActive = true;
    } catch (err) {
      asrActive = false;
      releaseAuto();
      try {
        console.warn("[ASR] start failed", err);
      } catch {
      }
    }
  };
  const stop = async () => {
    if (!asrActive) return;
    try {
      await asrMode?.stop?.();
    } finally {
      asrActive = false;
      releaseAuto();
    }
  };
  window.addEventListener("tp:speech-state", (ev) => {
    try {
      const d = ev?.detail || {};
      const on = d.running === true || typeof d.state === "string" && (d.state === "active" || d.state === "running");
      speechActive = !!on;
      try {
        window.dispatchEvent(new CustomEvent("asr:state", { detail: { state: on ? "listening" : "idle" } }));
      } catch {
      }
      try {
        if (asrMode && asrMode._speaking) {
          const due = asrMode._lastCommitAt + NO_COMMIT_HOLD_MS;
          if (performance.now() > due && asrMode.state === "running") {
          }
        }
      } catch {
      }
      if (speechActive && wantASR()) void start();
      else void stop();
    } catch {
    }
  });
  window.addEventListener("tp:mode", (ev) => {
    try {
      const m = ev && ev.detail && ev.detail.mode ? String(ev.detail.mode) : "";
      if (!m) return;
      try {
        window.__tpModeOverride = m;
      } catch {
      }
      if (speechActive) {
        wantASR() ? void start() : void stop();
      }
    } catch {
    }
  });
  try {
    const store = window.__tpStore || appStoreSingleton;
    store?.subscribe?.("scrollMode", () => {
      const isAsr = wantASR();
      if (isAsr) {
        try {
          mountAsrChip();
        } catch {
        }
        setChipVisible(true);
        setChipState(speechActive ? "listening" : "ready");
      } else {
        setChipState("idle");
        setChipVisible(false);
      }
      if (!speechActive) return;
      isAsr ? void start() : void stop();
    });
  } catch {
  }
  window.addEventListener("asr:toggle", (e) => {
    const armed = !!e?.detail?.armed;
    armed ? void start() : void stop();
  });
  window.addEventListener("asr:stop", () => {
    void stop();
  });
  window.addEventListener("tp:speech-result", (ev) => {
    try {
      if (!asrMode || !asrActive) return;
      const d = ev && ev.detail || {};
      const idx = Number(d.index);
      if (!isFinite(idx)) return;
      if (String(d.type || "").toLowerCase() !== "final") return;
      try {
        const cur = Number(asrMode.currentIdx || 0);
        const delta = idx - cur;
        if (delta > (LEAP_TUNING.maxDistance || LEAP_SIZE)) {
          asrMode.currentIdx = Math.max(0, idx - 1);
        }
      } catch {
      }
      try {
        asrMode.commitIndex?.(idx, Number(d.score || 1));
      } catch {
      }
    } catch {
    }
  });
  try {
    const body = document.body;
    speechActive = !!(body && (body.classList.contains("speech-listening") || body.classList.contains("listening"))) || window.speechOn === true;
    const isAsr = wantASR();
    if (isAsr) {
      try {
        mountAsrChip();
      } catch {
      }
      setChipVisible(true);
      setChipState(speechActive ? "listening" : "ready");
    } else {
      setChipVisible(false);
    }
    if (speechActive && isAsr) void start();
  } catch {
  }
}
var asr_legacy_default = initAsrFeature;
async function teardownASR() {
  try {
    for (const inst of Array.from(__asrInstances)) {
      try {
        await inst.stop?.();
      } catch {
      }
      try {
        inst._emitStats?.(true);
      } catch {
      }
      try {
        if (inst._telemetryTimer) clearInterval(inst._telemetryTimer);
      } catch {
      }
      try {
        inst._telemetryTimer?.unref?.();
      } catch {
      }
    }
  } catch {
  }
  try {
    __asrInstances.clear?.();
  } catch {
  }
}
try {
  if (typeof window !== "undefined") {
    window.__asrFinalizeForTests = teardownASR;
  }
} catch {
}
export {
  DISPLAY_MIN_DR,
  LEAP_CONFIRM_SCORE,
  LEAP_CONFIRM_WINDOW_MS,
  LEAP_SIZE,
  NO_COMMIT_HOLD_MS,
  POST_COMMIT_FREEZE_MS,
  SILENCE_FREEZE_MS,
  VAD_PARTIAL_GRACE_MS,
  asr_legacy_default as default,
  initAsrFeature,
  teardownASR
};
//# sourceMappingURL=asr.js.map
