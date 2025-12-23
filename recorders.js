/* GENERATED FROM TypeScript - DO NOT EDIT. Edit recorders.ts / adapters/*.ts instead. */

// recorders-core.ts
function __tpReadAutoRecordPref() {
  try {
    if (typeof window !== "undefined") {
      const store = window.__tpStore;
      if (store && typeof store.get === "function") {
        const v = store.get("autoRecord");
        if (typeof v === "boolean") return v;
      }
    }
  } catch {
  }
  try {
    const doc = typeof document !== "undefined" ? document : null;
    if (doc) {
      const el = doc.getElementById("autoRecordToggle") || doc.getElementById("autoRecord");
      if (el) return !!el.checked;
    }
  } catch {
  }
  try {
    return localStorage.getItem("tp_auto_record_on_start_v1") === "1";
  } catch {
    return false;
  }
}
(function() {
  try {
    let getJSON2 = function(k, d) {
      try {
        const raw = localStorage.getItem(k);
        return raw ? JSON.parse(raw) : d;
      } catch {
        return d;
      }
    }, getCfg2 = function() {
      const a = getJSON2(LS.cfg, {});
      const b = getJSON2(LS.modern, {});
      const inner = b && b.configs || {};
      const merged = { ...inner, ...a };
      if (a && a.recording) merged.recording = a.recording;
      return merged;
    }, getSelectedAdapterId2 = function() {
      const cfg = getCfg2();
      try {
        return cfg.recording && cfg.recording.adapter || localStorage.getItem(LS.recAdapter) || DEFAULT_ADAPTER;
      } catch {
        return DEFAULT_ADAPTER;
      }
    }, wantsAuto2 = function() {
      return __tpReadAutoRecordPref();
    }, getAdapter2 = function(id) {
      if (typeof id === "string" && id.length > 0) {
        try {
          return get(id);
        } catch {
          return void 0;
        }
      }
      return getSelectedAdapterId2();
    }, bridgeCfg2 = function() {
      const cfg = getCfg2().bridge || {};
      return {
        mode: cfg.mode || "hotkey",
        baseUrl: String(cfg.baseUrl || "http://127.0.0.1:5723").replace(/\/+$/, ""),
        startHotkey: cfg.startHotkey || cfg.preset || "Ctrl+R",
        stopHotkey: cfg.stopHotkey || "",
        startUrl: cfg.startUrl || "",
        stopUrl: cfg.stopUrl || ""
      };
    }, getRecorderSurface2 = function() {
      try {
        const w = window;
        return w.__tpRecorder || w.__recorder || null;
      } catch {
        return null;
      }
    };
    var getJSON = getJSON2, getCfg = getCfg2, getSelectedAdapterId = getSelectedAdapterId2, wantsAuto = wantsAuto2, getAdapter = getAdapter2, bridgeCfg = bridgeCfg2, getRecorderSurface = getRecorderSurface2;
    if (typeof window === "undefined") return;
    const DEFAULT_ADAPTER = "recorder";
    const LS = {
      cfg: "configs",
      // whole app config blob (optional)
      recAdapter: "tp_rec_adapter",
      // 'obs' | 'bridge' | 'premiere'
      autoStart: "tp_auto_record_on_start_v1",
      modern: "tp_rec_settings_v1"
      // modern settings blob from registry (has .configs)
    };
    async function httpSend(url, body) {
      if (!url) throw new Error("Missing URL");
      const res = await fetch(url, {
        method: body ? "POST" : "GET",
        headers: body ? { "content-type": "application/json" } : void 0,
        body: body ? JSON.stringify(body) : void 0,
        mode: "no-cors"
      });
      try {
        return !!res.ok || true;
      } catch {
        return true;
      }
    }
    async function recorderStart() {
      const rec = getRecorderSurface2();
      if (!rec || typeof rec.start !== "function") return true;
      try {
        await rec.start();
        return true;
      } catch (err) {
        try {
          console.warn("[recorder] start failed", err);
        } catch {
        }
        return false;
      }
    }
    async function recorderStop() {
      const rec = getRecorderSurface2();
      if (!rec || typeof rec.stop !== "function") return true;
      try {
        await rec.stop();
        return true;
      } catch (err) {
        try {
          console.warn("[recorder] stop failed", err);
        } catch {
        }
        return false;
      }
    }
    async function bridgeStart() {
      const b = bridgeCfg2();
      if (b.mode === "http") {
        return httpSend(b.startUrl);
      }
      const url = b.baseUrl + "/send?keys=" + encodeURIComponent(b.startHotkey);
      try {
        return await httpSend(url);
      } catch {
        return httpSend(b.baseUrl + "/send", { keys: b.startHotkey });
      }
    }
    async function bridgeStop() {
      const b = bridgeCfg2();
      if (b.mode === "http") {
        return b.stopUrl ? httpSend(b.stopUrl) : true;
      }
      if (!b.stopHotkey) return true;
      const url = b.baseUrl + "/send?keys=" + encodeURIComponent(b.stopHotkey);
      try {
        return await httpSend(url);
      } catch {
        return httpSend(b.baseUrl + "/send", { keys: b.stopHotkey });
      }
    }
    async function obsStart() {
      try {
        if (window.__obsBridge && typeof window.__obsBridge.start === "function") {
          await window.__obsBridge.start();
          return true;
        }
      } catch {
      }
      try {
        if (window.__tpObs && typeof window.__tpObs.ensureRecording === "function") {
          return !!await window.__tpObs.ensureRecording(true);
        }
      } catch {
      }
      return false;
    }
    async function obsStop() {
      try {
        if (window.__obsBridge && typeof window.__obsBridge.stop === "function") {
          await window.__obsBridge.stop();
          return true;
        }
      } catch {
      }
      try {
        if (window.__tpObs && typeof window.__tpObs.ensureRecording === "function") {
          return !!await window.__tpObs.ensureRecording(false);
        }
      } catch {
      }
      return false;
    }
    async function premStart() {
      const p = getCfg2().premiere || {};
      const base = String(p.baseUrl || "http://127.0.0.1:5723").replace(/\/+$/, "");
      const hk = String(p.startHotkey || "Ctrl+R");
      const url = base + "/send?keys=" + encodeURIComponent(hk);
      try {
        return await httpSend(url);
      } catch {
        return httpSend(base + "/send", { keys: hk });
      }
    }
    async function premStop() {
      const p = getCfg2().premiere || {};
      const base = String(p.baseUrl || "http://127.0.0.1:5723").replace(/\/+$/, "");
      const hk = String(p.stopHotkey || "");
      if (!hk) return true;
      const url = base + "/send?keys=" + encodeURIComponent(hk);
      try {
        return await httpSend(url);
      } catch {
        return httpSend(base + "/send", { keys: hk });
      }
    }
    async function start2() {
      const a = getSelectedAdapterId2();
      try {
        window.__tpHud?.log?.("[rec]", "start", a);
      } catch {
      }
      if (a === "recorder") return recorderStart();
      if (a === "obs") return obsStart();
      if (a === "descript") return premStart();
      if (a === "premiere") return premStart();
      return bridgeStart();
    }
    async function stop2() {
      const a = getSelectedAdapterId2();
      try {
        window.__tpHud?.log?.("[rec]", "stop", a);
      } catch {
      }
      if (a === "recorder") return recorderStop();
      if (a === "obs") return obsStop();
      if (a === "descript") return premStop();
      if (a === "premiere") return premStop();
      return bridgeStop();
    }
    window.__tpRecording = { start: start2, stop: stop2, wantsAuto: wantsAuto2, getAdapter: getAdapter2 };
  } catch {
  }
})();
var registry = /* @__PURE__ */ new Map();
var LS_KEY = "tp_rec_settings_v1";
var defaultSettings = {
  mode: "multi",
  selected: ["obs", "descript"],
  preferObsHandoff: false,
  configs: {
    obs: { url: "ws://192.168.1.200:4455", password: "" },
    companion: { url: "http://127.0.0.1:8000", buttonId: "1.1" },
    bridge: { startUrl: "http://127.0.0.1:5723/record/start", stopUrl: "" },
    descript: { startHotkey: "Ctrl+R", via: "bridge" },
    capcut: { startHotkey: "Ctrl+R", via: "companion" },
    winmedia: { startHotkey: "Ctrl+R", via: "bridge" },
    premiere: { startHotkey: "Ctrl+R", stopHotkey: "", baseUrl: "http://127.0.0.1:5723" }
  },
  timeouts: { start: 3e3, stop: 3e3 },
  failPolicy: "continue"
};
var settings = JSON.parse(JSON.stringify(defaultSettings));
try {
  const raw = localStorage.getItem(LS_KEY);
  if (raw) {
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === "object") settings = { ...settings, ...parsed };
  } else {
    try {
      localStorage.setItem(LS_KEY, JSON.stringify(settings));
    } catch {
    }
  }
} catch {
}
function persistSettings() {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(settings));
    try {
      localStorage.setItem("tp_record_mode", String(settings.mode || "multi"));
    } catch {
    }
    try {
      localStorage.setItem("tp_adapters", JSON.stringify(Array.isArray(settings.selected) ? settings.selected : []));
    } catch {
    }
  } catch {
  }
}
function setSettings(next) {
  if (!next || typeof next !== "object") return;
  const prev = settings;
  settings = {
    ...prev,
    ..."mode" in next ? { mode: next.mode } : {},
    ..."selected" in next ? { selected: Array.isArray(next.selected) ? next.selected.slice() : prev.selected } : {},
    ..."preferObsHandoff" in next ? { preferObsHandoff: !!next.preferObsHandoff } : {},
    ..."configs" in next ? { configs: { ...prev.configs, ...next.configs || {} } } : {},
    ..."timeouts" in next ? { timeouts: { ...prev.timeouts, ...next.timeouts || {} } } : {},
    ..."failPolicy" in next ? { failPolicy: next.failPolicy } : {}
  };
  persistSettings();
  applyConfigs();
}
function getSettings() {
  return JSON.parse(JSON.stringify(settings));
}
function setSelected(ids) {
  setSettings({ selected: Array.isArray(ids) ? ids : [] });
}
function setMode(mode) {
  setSettings({ mode });
}
function setTimeouts(t) {
  setSettings({ timeouts: t });
}
function setFailPolicy(p) {
  setSettings({ failPolicy: p });
}
function applyConfigs() {
  for (const [id, a] of registry.entries()) {
    try {
      const cfg = settings.configs[id];
      if (cfg && typeof a.configure === "function") a.configure(cfg);
    } catch {
    }
  }
}
function callWithTimeout(promiseOrFn, ms = 0) {
  const p = typeof promiseOrFn === "function" ? promiseOrFn() : promiseOrFn;
  return Promise.race([
    Promise.resolve().then(() => p),
    new Promise((_, rej) => setTimeout(() => rej(new Error("timeout")), Math.max(0, ms || 0)))
  ]);
}
var _busy = false;
async function guarded(fn) {
  if (_busy) return { skipped: true };
  _busy = true;
  try {
    return await fn();
  } finally {
    _busy = false;
  }
}
function describeError(err) {
  if (err instanceof Error && typeof err.message === "string") return err.message;
  try {
    return String(err);
  } catch {
    return "error";
  }
}
var _recState = "idle";
var _recDetail = null;
var _recAdapter = null;
var __recEpoch = 0;
var __lastBridgeTap = 0;
var __recTimers = /* @__PURE__ */ new Set();
function setTrackedTimeout(fn, ms) {
  const h = setTimeout(() => {
    try {
      __recTimers.delete(h);
    } catch {
    }
    try {
      fn();
    } catch {
    }
  }, Math.max(0, ms || 0));
  try {
    __recTimers.add(h);
  } catch {
  }
  return h;
}
var _onObsDisconnectCb = null;
var _onObsRecordingStartedCb = null;
var __now = () => typeof performance !== "undefined" && performance.now ? performance.now() : Date.now();
var __sleep = (ms) => new Promise((resolve) => {
  setTrackedTimeout(() => resolve(), Math.max(0, ms || 0));
});
var __lastRecKey = "";
function _emitRecState(state, detail = null) {
  try {
    _recState = state;
    _recDetail = detail || null;
    if (typeof window !== "undefined") {
      try {
        window.__recState = { state, adapter: _recAdapter, detail: _recDetail, ts: Date.now() };
      } catch {
      }
      const payload = { adapter: _recAdapter, state, detail: _recDetail };
      try {
        const key = String(payload.adapter || "") + "|" + String(payload.state || "") + "|" + (payload.detail && payload.detail.fallback ? "F" : "");
        if (key === __lastRecKey) return;
        __lastRecKey = key;
      } catch {
      }
      window.dispatchEvent(new CustomEvent("rec:state", { detail: payload }));
      try {
        window.__tpHud?.log?.("[rec:state]", payload);
      } catch {
      }
    }
  } catch {
  }
}
function _isActiveState(s) {
  return s === "starting" || s === "recording";
}
function getRecState() {
  return { state: _recState, adapter: _recAdapter, detail: _recDetail };
}
function isNoRecordMode() {
  try {
    return !!(window.__tpNoRecord || typeof document !== "undefined" && document.body && document.body.classList && document.body.classList.contains("mode-rehearsal"));
  } catch {
    return false;
  }
}
function selectedIds() {
  const ids = Array.isArray(settings.selected) ? settings.selected.slice() : [];
  if (settings.mode === "single" && ids.length > 1) ids.length = 1;
  return ids.filter((id) => registry.has(id));
}
var __handoffTimer = null;
function clearHandoffTimer() {
  try {
    if (__handoffTimer) {
      clearInterval(__handoffTimer);
      __handoffTimer = null;
    }
  } catch {
  }
}
async function tryObsHandoffOnce(reason = "watchdog") {
  try {
    if (!settings?.preferObsHandoff) return false;
    if (_recState !== "recording" || _recAdapter !== "bridge") return false;
    const br = typeof window !== "undefined" ? window.__obsBridge || null : null;
    if (!br || typeof br.getRecordStatus !== "function") return false;
    let isRec = false;
    try {
      const s = await br.getRecordStatus();
      isRec = !!(s && (s.outputActive === true || s.recording === true));
    } catch {
    }
    if (!isRec) return false;
    const bridgeAdapter = registry.get("bridge");
    _emitRecState("stopping", { reason: "obs-handoff", via: reason });
    try {
      await bridgeAdapter?.stop?.();
    } catch {
    }
    _recAdapter = "obs";
    _emitRecState("recording", { handoff: true });
    clearHandoffTimer();
    return true;
  } catch {
    return false;
  }
}
function armObsHandoffWatchdog() {
  clearHandoffTimer();
  try {
    if (!settings?.preferObsHandoff) return;
    if (_recState === "recording" && _recAdapter === "bridge") {
      const t = setInterval(() => {
        tryObsHandoffOnce("watchdog");
      }, 1e3);
      try {
        const maybeTimer = t;
        if (maybeTimer && typeof maybeTimer.unref === "function") maybeTimer.unref();
      } catch {
      }
      __handoffTimer = t;
    }
  } catch {
  }
}
try {
  if (typeof window !== "undefined") {
    window.__recorder = window.__recorder || {};
    if (!window.__recorder.__finalizeForTests) {
      window.__recorder.__finalizeForTests = () => {
        try {
          clearHandoffTimer();
        } catch {
        }
        try {
          __recEpoch++;
        } catch {
        }
        try {
          if (__recStatsTimer) {
            clearInterval(__recStatsTimer);
            __recStatsTimer = null;
          }
        } catch {
        }
      };
    }
  }
} catch {
}
async function teardownRecorders() {
  try {
    __recEpoch++;
  } catch {
  }
  try {
    __lastBridgeTap = 0;
  } catch {
  }
  try {
    for (const h of Array.from(__recTimers)) {
      clearTimeout(h);
      __recTimers.delete(h);
    }
  } catch {
  }
  try {
    clearHandoffTimer();
  } catch {
  }
  try {
    if (__recStatsTimer) {
      clearInterval(__recStatsTimer);
      __recStatsTimer = null;
    }
  } catch {
  }
  try {
    const br = typeof window !== "undefined" ? window.__obsBridge : null;
    if (br) {
      if (typeof br.off === "function") {
        try {
          if (_onObsDisconnectCb && window.__tpObsDisconnectWired) {
            br.off("disconnect", _onObsDisconnectCb);
            window.__tpObsDisconnectWired = false;
          }
        } catch {
        }
        try {
          if (_onObsRecordingStartedCb && window.__tpObsHandoffWired) {
            br.off("recordingStarted", _onObsRecordingStartedCb);
            window.__tpObsHandoffWired = false;
          }
        } catch {
        }
      } else if (typeof br.removeListener === "function") {
        try {
          if (_onObsDisconnectCb && window.__tpObsDisconnectWired) {
            br.removeListener("disconnect", _onObsDisconnectCb);
            window.__tpObsDisconnectWired = false;
          }
        } catch {
        }
        try {
          if (_onObsRecordingStartedCb && window.__tpObsHandoffWired) {
            br.removeListener("recordingStarted", _onObsRecordingStartedCb);
            window.__tpObsHandoffWired = false;
          }
        } catch {
        }
      }
    }
  } catch {
  }
}
async function startObsWithConfirm({ timeoutMs = 1200, retryDelayMs = 500 } = {}) {
  const obs = typeof window !== "undefined" ? window.__obsBridge || null : null;
  const bridgeAdapter = registry.get("bridge");
  const epoch = __recEpoch;
  const isStale = () => epoch !== __recEpoch;
  try {
    window.__tpHud?.log?.("[rec] start obs");
  } catch {
  }
  try {
    _recAdapter = "obs";
    _emitRecState("starting");
  } catch {
  }
  let fallbackSent = false;
  const maybeTapBridge = async () => {
    const t = __now();
    if (t - __lastBridgeTap < 1200) return false;
    __lastBridgeTap = t;
    try {
      await bridgeAdapter?.start?.();
    } catch {
    }
    return true;
  };
  const confirm = async () => {
    try {
      const s = await obs?.getRecordStatus?.();
      return !!(s && s.outputActive === true);
    } catch {
      return false;
    }
  };
  const tryStart = async () => {
    try {
      if (obs && typeof obs.start === "function") await obs.start();
      else if (obs && typeof obs.startRecord === "function") await obs.startRecord();
    } catch {
    }
  };
  await tryStart();
  let ok = false;
  let deadline = __now() + timeoutMs;
  while (!ok && __now() < deadline) {
    if (isStale()) {
      try {
        window.__tpHud?.log?.("[rec] abort confirm (stale)");
      } catch {
      }
      return { ok: false, adapter: "obs", error: "stale" };
    }
    ok = await confirm();
    if (!ok) await __sleep(120);
  }
  if (!ok) {
    try {
      window.__tpHud?.log?.("[rec] retry");
    } catch {
    }
    await __sleep(Math.max(0, retryDelayMs));
    if (isStale()) {
      try {
        window.__tpHud?.log?.("[rec] abort retry (stale)");
      } catch {
      }
      return { ok: false, adapter: "obs", error: "stale" };
    }
    await tryStart();
    try {
      recStats.retries++;
    } catch {
    }
    ok = await confirm();
  }
  if (ok) {
    try {
      _recAdapter = "obs";
      _emitRecState("recording");
    } catch {
    }
    return { ok: true, adapter: "obs" };
  }
  const isBridgeAvailable = !!bridgeAdapter;
  if (!fallbackSent && isBridgeAvailable) {
    fallbackSent = true;
    if (isStale()) {
      try {
        window.__tpHud?.log?.("[rec] abort fallback (stale)");
      } catch {
      }
      return { ok: false, adapter: "obs", error: "stale" };
    }
    await maybeTapBridge();
    if (isStale()) {
      try {
        window.__tpHud?.log?.("[rec] abort fallback (stale-2)");
      } catch {
      }
      return { ok: false, adapter: "obs", error: "stale" };
    }
    try {
      window.__tpHud?.log?.("[rec] fallback bridge");
    } catch {
    }
    try {
      _recAdapter = "bridge";
      _emitRecState("recording", { fallback: true });
    } catch {
    }
    try {
      recStats.fallbacks++;
    } catch {
    }
    return { ok: true, adapter: "bridge", fallback: true };
  }
  try {
    window.__tpHud?.log?.("[rec] drop (start-timeout)");
  } catch {
  }
  try {
    _recAdapter = "obs";
    _emitRecState("error", { reason: "start-timeout" });
  } catch {
  }
  return { ok: false, adapter: "obs", error: "start-timeout" };
}
async function startSelected() {
  return guarded(async () => {
    if (isNoRecordMode()) {
      try {
        window.HUD?.log?.("rehearsal", { skip: "startSelected (no-record)" });
      } catch {
      }
      return { results: [], started: [] };
    }
    if (_recState === "stopping") {
      try {
        window.__tpHud?.log?.("[rec] busy (stopping)");
      } catch {
      }
      return { results: [], started: [], reason: "idempotent-start-while-stopping" };
    }
    if (_isActiveState(_recState)) {
      try {
        window.__tpHud?.log?.("[rec] already recording");
      } catch {
      }
      _emitRecState(_recState, { reason: "idempotent-start" });
      return { results: [], started: selectedIds() };
    }
    applyConfigs();
    try {
      ensureObsDisconnectFallback();
    } catch {
    }
    try {
      ensureObsRecordingStartedHandoff();
    } catch {
    }
    const ids = selectedIds();
    _recAdapter = settings.mode === "single" ? ids[0] || null : ids[0] || null;
    _emitRecState("starting");
    const t0 = __now();
    try {
      recStats.starts++;
    } catch {
    }
    const started = [];
    const actions = ids.map((id) => ({ id, a: registry.get(id) }));
    const doStart = async ({ id, a }) => {
      if (!a) return { id, ok: false, error: "missing" };
      try {
        const avail = await callWithTimeout(() => a.isAvailable(), settings.timeouts.start);
        if (!avail) return { id, ok: false, error: "unavailable" };
      } catch (e) {
        return { id, ok: false, error: describeError(e) };
      }
      try {
        if (id === "obs") {
          const res = await startObsWithConfirm({ timeoutMs: Math.min(2e3, settings.timeouts.start || 1500), retryDelayMs: 500 });
          if (res && res.ok === false && res.error === "stale") {
            return { id, ok: false, error: "stale" };
          }
          if (res && res.ok && res.adapter === "bridge" && res.fallback) {
          }
          if (res.ok) {
            started.push(id);
            return { id, ok: true, detail: res };
          }
          return { id, ok: false, error: res.error || "failed" };
        } else {
          await callWithTimeout(() => a.start(), settings.timeouts.start);
          started.push(id);
          return { id, ok: true };
        }
      } catch (e) {
        return { id, ok: false, error: describeError(e) };
      }
    };
    const results = [];
    if (settings.failPolicy === "abort-on-first-fail") {
      for (const act of actions) {
        const r = await doStart(act);
        results.push(r);
        if (!r.ok) break;
      }
    } else {
      const rs = await Promise.all(actions.map(doStart));
      results.push(...rs);
    }
    if (started.length) {
      try {
        window.__tpHud?.log?.("[rec] recording");
      } catch {
      }
      const anyFallback = results.find((r) => r && r.id === "obs" && r.detail && r.detail.fallback);
      if (anyFallback) {
        _recAdapter = "bridge";
        _emitRecState("recording", { fallback: true, via: "bridge" });
      } else {
        _emitRecState("recording");
      }
      try {
        recStats.startLat.push(Math.max(0, __now() - t0));
      } catch {
      }
    } else {
      _emitRecState("error", { results });
    }
    return { results, started };
  });
}
async function stopSelected() {
  __recEpoch++;
  __lastBridgeTap = 0;
  clearHandoffTimer();
  if (isNoRecordMode()) {
    try {
      window.HUD?.log?.("rehearsal", { note: "stopSelected (allowed during no-record)" });
    } catch {
    }
  }
  if (_recState === "idle" || _recState === "stopping") {
    _emitRecState("idle", { reason: "idempotent-stop" });
    return { results: [] };
  }
  try {
    window.__tpHud?.log?.("[rec] stop");
  } catch {
  }
  _emitRecState("stopping");
  const t0 = __now();
  const ids = selectedIds();
  const actions = ids.map((id) => ({ id, a: registry.get(id) })).filter((x) => !!x.a);
  const rs = await Promise.all(
    actions.map(async ({ id, a }) => {
      try {
        const avail = await callWithTimeout(() => a.isAvailable(), settings.timeouts.stop);
        if (!avail) return { id, ok: false, error: "unavailable" };
      } catch (e) {
        return { id, ok: false, error: describeError(e) };
      }
      try {
        await callWithTimeout(() => a.stop(), settings.timeouts.stop);
        return { id, ok: true };
      } catch (e) {
        return { id, ok: false, error: describeError(e) };
      }
    })
  );
  _emitRecState("idle");
  try {
    recStats.stopLat.push(Math.max(0, __now() - t0));
  } catch {
  }
  return { results: rs };
}
function register(adapter) {
  registry.set(adapter.id, adapter);
}
function get(id) {
  return registry.get(id);
}
function all() {
  return [...registry.values()];
}
var _builtInsInit = false;
async function initBuiltIns() {
  if (_builtInsInit) return;
  _builtInsInit = true;
  try {
    const adapters = [];
    const resolver = typeof window !== "undefined" && typeof window.__TP_ADDV === "function" ? window.__TP_ADDV.bind(window) : (p) => p;
    try {
      const m = await import(resolver("./adapters/bridge.js"));
      const a = m?.createBridgeAdapter?.();
      if (a) adapters.push(a);
    } catch {
    }
    try {
      const m = await import(resolver("./adapters/obs.js"));
      const a = m?.createOBSAdapter?.();
      if (a) adapters.push(a);
    } catch {
    }
    try {
      const m = await import(resolver("./adapters/hotkey.js"));
      const aPrem = m?.createHotkeyAdapter?.("premiere", "Adobe Premiere Pro");
      if (aPrem) adapters.push(aPrem);
    } catch {
    }
    try {
      if (typeof window !== "undefined" && window.__obsBridge) {
        const bridge = window.__obsBridge;
        const wrapper = {
          id: "obs",
          label: "OBS (WebSocket) - bridge",
          configure(cfg) {
            try {
              bridge.configure(cfg);
            } catch {
            }
          },
          async isAvailable() {
            try {
              return bridge.isConnected ? bridge.isConnected() : bridge.isConnected && bridge.isConnected();
            } catch {
              return !!bridge.isConnected && bridge.isConnected();
            }
          },
          async start() {
            return bridge.start();
          },
          async stop() {
            return bridge.stop();
          },
          async test() {
            return bridge.getRecordStatus();
          }
        };
        adapters.push(wrapper);
      }
    } catch {
    }
    for (const a of adapters) {
      try {
        register(a);
      } catch {
      }
    }
    applyConfigs();
    try {
      ensureObsDisconnectFallback();
    } catch {
    }
    try {
      ensureObsRecordingStartedHandoff();
    } catch {
    }
  } catch {
  }
}
try {
  initBuiltIns();
} catch {
}
function ensureObsDisconnectFallback() {
  try {
    if (typeof window === "undefined") return;
    const br = window.__obsBridge;
    if (!br || typeof br.on !== "function") return;
    if (window.__tpObsDisconnectWired) return;
    window.__tpObsDisconnectWired = true;
    _onObsDisconnectCb = async () => {
      try {
        const state = _recState;
        const bridgeAdapter = registry.get("bridge");
        const isAuto = __tpReadAutoRecordPref();
        try {
          recStats.disconnects++;
        } catch {
        }
        if (state === "starting") {
          await startObsWithConfirm({ timeoutMs: 900, retryDelayMs: 300 });
          return;
        }
        if (state === "recording") {
          _emitRecState("stopping", { reason: "disconnect" });
          if (isAuto && bridgeAdapter) {
            try {
              await bridgeAdapter.start?.();
            } catch {
            }
            try {
              window.dispatchEvent(new CustomEvent("rec:state", { detail: { adapter: "bridge", state: "recording", detail: { fallback: true, reason: "obs-disconnect" } } }));
            } catch {
            }
          } else {
            _emitRecState("idle", { reason: "disconnect" });
          }
        }
      } catch {
      }
    };
    br.on("disconnect", _onObsDisconnectCb);
  } catch {
  }
}
(function wireRecStateWatchdog() {
  try {
    if (typeof window === "undefined") return;
    if (window.__tpRecWatchdogWired) return;
    window.__tpRecWatchdogWired = true;
    window.addEventListener("rec:state", (e) => {
      try {
        const evt = e;
        const d = evt && evt.detail || {};
        if (d && d.state === "recording" && d.adapter === "bridge" && settings?.preferObsHandoff) {
          armObsHandoffWatchdog();
        }
        if (d && (d.state === "idle" || d.state === "stopping")) {
          clearHandoffTimer();
        }
      } catch {
      }
    });
  } catch {
  }
})();
function ensureObsRecordingStartedHandoff() {
  try {
    if (typeof window === "undefined") return;
    const br = window.__obsBridge;
    if (!br || typeof br.on !== "function") return;
    if (window.__tpObsHandoffWired) return;
    window.__tpObsHandoffWired = true;
    _onObsRecordingStartedCb = async () => {
      try {
        const prefer = !!(settings && settings.preferObsHandoff);
        if (_recState === "recording" && _recAdapter === "bridge") {
          if (!prefer) {
            try {
              window.__tpHud?.log?.("[rec] obs up (handoff disabled)");
            } catch {
            }
            return;
          }
          const bridgeAdapter = registry.get("bridge");
          _emitRecState("stopping", { reason: "obs-handoff" });
          try {
            await bridgeAdapter?.stop?.();
          } catch {
          }
          _recAdapter = "obs";
          _emitRecState("recording", { handoff: true });
        }
      } catch {
      }
    };
    br.on("recordingStarted", _onObsRecordingStartedCb);
  } catch {
  }
}
async function start() {
  return startSelected();
}
async function stop() {
  return stopSelected();
}
var recStats = { starts: 0, retries: 0, fallbacks: 0, disconnects: 0, startLat: [], stopLat: [] };
function p95(arr) {
  if (!arr || !arr.length) return 0;
  const a = arr.slice().sort((x, y) => x - y);
  const i = Math.min(a.length - 1, Math.floor(a.length * 0.95));
  return a[i] || 0;
}
function emitRecStats(_final = false) {
  try {
    const payload = {
      starts: recStats.starts | 0,
      retries: recStats.retries | 0,
      fallbacks: recStats.fallbacks | 0,
      disconnects: recStats.disconnects | 0,
      startP95Ms: Math.round(p95(recStats.startLat)),
      stopP95Ms: Math.round(p95(recStats.stopLat))
    };
    if (typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent("rec:stats", { detail: payload }));
    }
  } catch {
  }
}
var __recStatsTimer = null;
try {
  if (typeof window !== "undefined") {
    if (__recStatsTimer) clearInterval(__recStatsTimer);
    __recStatsTimer = setInterval(() => emitRecStats(false), 5e3);
    try {
      const maybeTimer = __recStatsTimer;
      if (maybeTimer && typeof maybeTimer.unref === "function") maybeTimer.unref();
    } catch {
    }
    window.addEventListener("beforeunload", () => emitRecStats(true));
  }
} catch {
}

// recorders-bridge-compat.ts
var recorder = {
  state: "disabled",
  async init() {
    return true;
  },
  async connect() {
    return true;
  },
  async disconnect() {
    return true;
  },
  setEnabled(_on) {
  }
};
function initCompat() {
  if (typeof window !== "undefined") {
    if (!window.__recorder) {
      window.__recorder = {
        get(name) {
          return name === "obs" ? recorder : null;
        }
      };
    }
    window.recorders = window.recorders || window.__recorder;
  }
  return typeof window !== "undefined" ? window.__recorder : { get: () => null };
}
var compatDefault = {
  init: initCompat,
  get(name) {
    return name === "obs" ? recorder : null;
  },
  // Also surface the modern API explicitly if anyone wants it
  recorder
};
var recorders_bridge_compat_default = compatDefault;
if (typeof window !== "undefined") {
  window.__recorder = window.__recorder || {
    get(name) {
      return name === "obs" ? recorder : null;
    }
  };
  window.recorders = window.recorders || window.__recorder;
}
try {
  if (typeof window !== "undefined") {
    initCompat();
    const api = window.__recorder;
    if (!api.start) api.start = () => startSelected();
    if (!api.stop) api.stop = () => stopSelected();
    if (!api.preflight) api.preflight = async (target = "obs") => {
      const issues = [];
      try {
        if (target === "obs") {
          const bridge = window.__obsBridge || null;
          if (!bridge) issues.push("OBS bridge missing");
          else {
            try {
              const st = await bridge.getRecordStatus();
              if (!st) issues.push("OBS not responding");
            } catch {
              issues.push("OBS GetRecordStatus failed");
            }
            try {
              if (typeof bridge.getRecordDirectory === "function") {
                const dir = await bridge.getRecordDirectory();
                if (!dir || !dir.recordDirectory) issues.push("Record directory unknown");
              }
            } catch {
            }
            try {
              const stats = await bridge.getStats();
              const bytes = stats?.recording?.freeDiskSpace || stats?.free_disk_space || null;
              const free = typeof bytes === "number" ? bytes : typeof bytes === "string" && /^\d+$/.test(bytes) ? Number(bytes) : null;
              if (free != null && free < 2 * 1024 * 1024 * 1024) issues.push("Low disk space (<2 GB)");
            } catch {
            }
          }
        }
      } catch {
      }
      return issues;
    };
    if (!api.getSettings) api.getSettings = () => getSettings();
    if (!api.setSettings) api.setSettings = (next) => setSettings(next);
    if (!api.setSelected) api.setSelected = (ids) => setSelected(ids);
    if (!api.setMode) api.setMode = (mode) => setMode(mode);
    if (!api.__finalizeForTests) api.__finalizeForTests = () => {
      try {
        clearHandoffTimer();
      } catch {
      }
    };
    window.recorders = window.recorders || api;
  }
} catch {
}
var _ws = null;
var _connecting = false;
var _identified = false;
var obsCfg = { host: "127.0.0.1", port: 4455, secure: false };
var _cfgBridge = {
  getUrl: () => "ws://127.0.0.1:4455",
  getPass: () => "",
  isEnabled: () => false,
  onStatus: (txt, ok) => console.log("[OBS]", txt, ok),
  onRecordState: () => {
  }
};
var _enabled = false;
function initBridge(opts = {}) {
  _cfgBridge = { ..._cfgBridge, ...opts };
  try {
    if (_cfgBridge.isEnabled()) connect();
  } catch {
  }
}
async function setEnabled(on) {
  try {
    _enabled = !!on;
    if (on) return await connect();
    await disconnect();
    return true;
  } catch (err) {
    try {
      console.warn("[OBS] setEnabled failed", err);
    } catch {
    }
    return false;
  }
}
async function reconfigure(cfg = {}) {
  try {
    if (cfg && typeof cfg === "object") {
      obsCfg = { ...obsCfg, ...cfg, port: Number(cfg.port) || obsCfg.port };
      if (cfg.password != null) {
        try {
          obsCfg.password = String(cfg.password || "");
        } catch {
        }
      }
      try {
        _cfgBridge.getPass = () => obsCfg.password || "";
      } catch {
      }
    }
    try {
      if (_ws) {
        try {
          _ws.close(1e3, "reconfig");
        } catch {
        }
        reconnectSoon(200);
      }
    } catch {
    }
  } catch {
  }
}
async function test() {
  try {
    return await connect({ testOnly: true });
  } catch {
    return false;
  }
}
async function disconnect() {
  try {
    _identified = false;
    _connecting = false;
    try {
      _ws && _ws.close(1e3, "manual");
    } catch {
    }
    _ws = null;
    try {
      _cfgBridge.onStatus?.("disconnected", false);
    } catch {
    }
  } catch {
  }
  return true;
}
var _reconnTimer = 0;
function reconnectSoon(ms = 400) {
  try {
    clearTimeout(_reconnTimer);
    _reconnTimer = setTrackedTimeout(() => {
      try {
        connect();
      } catch {
      }
    }, ms);
  } catch {
  }
}
async function connect({ testOnly = false, reason = "runtime" } = {}) {
  try {
    if (!window.__obsBridge || !window.__obsBridge.connect) {
      if (typeof window.__loadObsBridge === "function") {
        try {
          await window.__loadObsBridge();
        } catch {
        }
      }
    }
  } catch {
  }
  const bridge = typeof window !== "undefined" ? window.__obsBridge : null;
  if (!bridge || typeof bridge.connect !== "function") {
    try {
      console.warn("[OBS] connect: bridge unavailable");
    } catch {
    }
    try {
      _cfgBridge.onStatus?.("bridge unavailable", false);
    } catch {
    }
    return false;
  }
  try {
    _cfgBridge.isEnabled = () => _enabled === true;
    const res = await bridge.connect({ testOnly, reason });
    return typeof res === "boolean" ? res : !!res;
  } catch (err) {
    try {
      console.warn("[OBS] connect failed", err);
    } catch {
    }
    try {
      _cfgBridge.onStatus?.("connect failed", false);
    } catch {
    }
    return false;
  }
}
function isConnected() {
  return _identified;
}
function init({ getUrl, getPass, isEnabled, onStatus, onRecordState } = {}) {
  try {
    if (typeof onStatus === "function") onStatus("recorder loaded", true);
    if (getUrl || getPass) {
      try {
        setSettings({
          configs: {
            obs: {
              url: getUrl ? getUrl() : void 0,
              password: getPass ? getPass() : void 0
            }
          }
        });
      } catch {
      }
    }
    try {
      applyConfigs();
    } catch {
    }
    try {
      if (isEnabled && isEnabled()) {
        start();
      }
    } catch {
    }
    try {
      if (typeof initBridge === "function") {
        initBridge({ getUrl, getPass, isEnabled, onStatus, onRecordState });
      }
    } catch {
    }
    return true;
  } catch {
    return false;
  }
}
export {
  all,
  applyConfigs,
  clearHandoffTimer,
  connect,
  recorders_bridge_compat_default as default,
  disconnect,
  get,
  getRecState,
  getSettings,
  init,
  initBridge,
  initBuiltIns,
  initCompat,
  isConnected,
  reconfigure,
  register,
  setEnabled,
  setFailPolicy,
  setMode,
  setSelected,
  setSettings,
  setTimeouts,
  setTrackedTimeout,
  start,
  startSelected,
  stop,
  stopSelected,
  teardownRecorders,
  test
};
//# sourceMappingURL=recorders.js.map
