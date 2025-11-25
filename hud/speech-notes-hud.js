// src/hud/speech-notes-hud.ts
var HUD_ID = "tp-speech-notes-hud";
var LS_KEY = "tp_hud_speech_notes_v1";
function isDevSession() {
  try {
    if (window.__TP_DEV) return true;
    const sp = new URLSearchParams(location.search);
    if (sp.get("dev") === "1") return true;
    if (/#dev\b/i.test(location.hash)) return true;
  } catch (e) {
  }
  return false;
}
function savingEnabled() {
  try {
    return localStorage.getItem("tp_hud_save") === "1";
  } catch (e) {
    return false;
  }
}
function prodHudOptIn() {
  try {
    return localStorage.getItem("tp_hud_prod") === "1";
  } catch (e) {
    return false;
  }
}
function redactPII(s) {
  if (!s) return s;
  return String(s).replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "[EMAIL]").replace(/\b(?:\+?1[-.\s]?)?(?:\(?\d{3}\)?[-.\s]?)\d{3}[-.\s]?\d{4}\b/g, "[PHONE]").replace(/\b\d{3}-\d{2}-\d{4}\b/g, "[SSN]").replace(/\b(?:\d[ -]*?){13,19}\b/g, "[CARD]");
}
function inRehearsal() {
  try {
    return !!document.body.classList.contains("mode-rehearsal");
  } catch (e) {
    return false;
  }
}
function currentMode(store) {
  try {
    const s = store || window.__tpStore;
    if (s && typeof s.get === "function") {
      const scrollMode = s.get("scrollMode");
      if (scrollMode != null) return String(scrollMode).toLowerCase();
      const legacyMode = s.get("mode");
      if (legacyMode != null) return String(legacyMode).toLowerCase();
    }
    const router = window.__tpScrollMode;
    if (router && typeof router.getMode === "function") {
      const mode = router.getMode();
      if (mode != null) return String(mode).toLowerCase();
    }
    if (typeof router === "string") return router.toLowerCase();
  } catch (e) {
  }
  return "";
}
function micActive(store) {
  var _a, _b, _c, _d;
  try {
    return !!((_b = (_a = window.__tpMic) == null ? void 0 : _a.isOpen) == null ? void 0 : _b.call(_a));
  } catch (e) {
  }
  try {
    return !!((_d = (_c = store || window.__tpStore) == null ? void 0 : _c.get) == null ? void 0 : _d.call(_c, "micEnabled"));
  } catch (e) {
  }
  return false;
}
function initSpeechNotesHud(options = {}) {
  const { bus = null, store = null } = options;
  if (!isDevSession() && !prodHudOptIn()) return null;
  if (document.getElementById(HUD_ID)) return null;
  const root = options.root || document.body;
  if (!root) return null;
  const panel = document.createElement("div");
  panel.id = HUD_ID;
  panel.style.cssText = [
    "position:fixed",
    "right:12px",
    "bottom:12px",
    "z-index:2147482000",
    "background:rgba(16,16,24,.92)",
    "color:#fff",
    "border-radius:10px",
    "border:1px solid rgba(255,255,255,.12)",
    "max-width:520px",
    "width:min(90vw,520px)",
    "max-height:50vh",
    "display:flex",
    "flex-direction:column",
    "overflow:hidden",
    "font:12px/1.4 system-ui,Segoe UI,Roboto,Arial,sans-serif",
    "box-shadow:0 10px 30px rgba(0,0,0,.4)"
  ].join(";");
  panel.innerHTML = `
    <div style="display:flex;gap:.5rem;align-items:center;padding:.5rem .75rem;background:rgba(0,0,0,.25);border-bottom:1px solid rgba(255,255,255,.08)">
      <strong>Speech A\xBB Notes</strong>
      <span id="snStatus" style="opacity:.8;margin-left:auto">idle</span>
      <label style="display:flex;align-items:center;gap:.35rem;margin-left:12px;opacity:.9;user-select:none">
        <input id="snFinalsOnly" type="checkbox"> finals-only
      </label>
      <button id="snCopy" style="all:unset;cursor:pointer;opacity:.85;margin-left:10px">Copy</button>
      <button id="snExport" style="all:unset;cursor:pointer;opacity:.85;margin-left:6px">Export</button>
      <button id="snClear" style="all:unset;cursor:pointer;opacity:.85;margin-left:6px">Clear</button>
      <button id="snClose" style="all:unset;cursor:pointer;opacity:.85;margin-left:6px">A\xD7</button>
    </div>
    <div id="snList" style="overflow:auto;padding:.5rem .75rem;display:grid;gap:.4rem;background:rgba(0,0,0,.15)"></div>
  `;
  root.appendChild(panel);
  const $ = (id) => document.getElementById(id);
  const listEl = $("snList");
  const finalsChk = $("snFinalsOnly");
  const statusEl = $("snStatus");
  let notes = [];
  try {
    notes = JSON.parse(localStorage.getItem(LS_KEY) || "[]");
  } catch (e) {
    notes = [];
  }
  if (!savingEnabled()) notes = [];
  const save = () => {
    if (!savingEnabled()) return;
    try {
      localStorage.setItem(LS_KEY, JSON.stringify(notes));
    } catch (e) {
    }
  };
  const render = () => {
    if (!listEl) return;
    const finalsOnly = !!(finalsChk && finalsChk.checked);
    listEl.innerHTML = "";
    const frag = document.createDocumentFragment();
    for (const n of notes) {
      if (finalsOnly && !n.final) continue;
      const row = document.createElement("div");
      row.style.cssText = "white-space:pre-wrap;background:#0b0d18;border:1px solid #2b2f3a;border-radius:8px;padding:6px 8px;opacity:" + (n.final ? "1" : ".9");
      const ts = new Date(n.ts || Date.now()).toLocaleTimeString();
      const sim = typeof n.sim === "number" ? `  [~${n.sim.toFixed(2)}]` : "";
      row.textContent = `${ts}${n.final ? " (final)" : ""}${sim} \u2013 ${n.text}`;
      frag.appendChild(row);
    }
    listEl.appendChild(frag);
    listEl.scrollTop = listEl.scrollHeight;
  };
  const addNote = (payload) => {
    let text = String((payload == null ? void 0 : payload.text) || "").trim();
    if (!text) return;
    text = redactPII(text);
    const item = { text, final: !!payload.final, ts: Date.now(), sim: payload.sim };
    const last = notes[notes.length - 1];
    if (last && last.final && item.final && last.text === item.text) return;
    notes.push(item);
    if (notes.length > 500) notes.shift();
    save();
    render();
  };
  const clear = () => {
    notes = [];
    save();
    render();
  };
  const buildExportBody = (finalsOnly) => notes.filter((n) => finalsOnly ? n.final : true).map((n) => {
    var _a;
    return `${new Date(n.ts).toISOString()}	${n.final ? "final" : "interim"}	${(_a = n.sim) != null ? _a : ""}	${redactPII(n.text)}`;
  }).join("\n");
  const copyAll = () => {
    const finalsOnly = !!(finalsChk && finalsChk.checked);
    const body = buildExportBody(finalsOnly);
    try {
      navigator.clipboard.writeText(body);
    } catch (e) {
    }
  };
  const exportTxt = () => {
    const finalsOnly = !!(finalsChk && finalsChk.checked);
    const body = buildExportBody(finalsOnly);
    const blob = new Blob([body], { type: "text/plain" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `speech-notes_${Date.now()}.txt`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 0);
  };
  let captureOn = false;
  const canCapture = () => {
    if (inRehearsal()) return false;
    if (!captureOn) return false;
    const m = currentMode(store);
    if (m !== "asr" && m !== "hybrid") return false;
    return true;
  };
  const captureGateReason = () => {
    if (inRehearsal()) return "rehearsal-mode";
    if (!captureOn) return "speech-idle";
    const m = currentMode(store);
    if (m !== "asr" && m !== "hybrid") return `mode-${m || "unknown"}`;
    return "ok";
  };
  const updateStatus = () => {
    if (!statusEl) return;
    const m = currentMode(store);
    const on = canCapture();
    const persist = savingEnabled() ? " \u2022 save=ON" : " \u2022 save=OFF";
    statusEl.textContent = on ? `listening (${m})${persist}` : `idle${persist}`;
  };
  const clearBtn = $("snClear");
  const copyBtn = $("snCopy");
  const exportBtn = $("snExport");
  const closeBtn = $("snClose");
  if (clearBtn) clearBtn.onclick = clear;
  if (copyBtn) copyBtn.onclick = copyAll;
  if (exportBtn) exportBtn.onclick = exportTxt;
  if (closeBtn) closeBtn.onclick = () => panel.remove();
  if (finalsChk) finalsChk.onchange = render;
  const onSpeechState = (e) => {
    const detail = (e == null ? void 0 : e.detail) || {};
    captureOn = !!detail.running;
    updateStatus();
  };
  const onTranscript = (e) => {
    var _a;
    const detail = (e == null ? void 0 : e.detail) || {};
    try {
      console.debug("[speech-notes] onTranscript", { text: detail.text, final: !!detail.final });
    } catch (e2) {
    }
    if (canCapture()) {
      addNote(detail);
    } else {
      const reason = captureGateReason();
      try {
        console.warn("[speech-notes] blocked", { reason, text: detail.text || "", final: !!detail.final });
      } catch (e2) {
      }
      try {
        (_a = bus == null ? void 0 : bus.log) == null ? void 0 : _a.call(bus, "speech-notes:gate", { reason, text: detail.text || "", final: !!detail.final });
      } catch (e2) {
      }
    }
  };
  const onPartial = (p) => {
    if (canCapture()) addNote(p);
  };
  const onFinal = (p) => {
    if (canCapture()) addNote(p);
  };
  window.addEventListener("tp:speech-state", onSpeechState, true);
  window.addEventListener("tp:scroll:mode", updateStatus, true);
  window.addEventListener("tp:speech:transcript", onTranscript, true);
  const onSpeechToggle = (on) => {
    captureOn = !!on;
    updateStatus();
  };
  try {
    bus == null ? void 0 : bus.on("speech:toggle", onSpeechToggle);
    bus == null ? void 0 : bus.on("speech:partial", onPartial);
    bus == null ? void 0 : bus.on("speech:final", onFinal);
  } catch (e) {
  }
  render();
  updateStatus();
  const show = () => {
    panel.style.display = "";
  };
  const hide = () => {
    panel.style.display = "none";
  };
  const toggle = () => {
    panel.style.display = panel.style.display === "none" ? "" : "none";
  };
  const destroy = () => {
    var _a, _b, _c;
    hide();
    window.removeEventListener("tp:speech-state", onSpeechState, true);
    window.removeEventListener("tp:scroll:mode", updateStatus, true);
    window.removeEventListener("tp:speech:transcript", onTranscript, true);
    try {
      (_a = bus == null ? void 0 : bus.off) == null ? void 0 : _a.call(bus, "speech:toggle", onSpeechToggle);
      (_b = bus == null ? void 0 : bus.off) == null ? void 0 : _b.call(bus, "speech:partial", onPartial);
      (_c = bus == null ? void 0 : bus.off) == null ? void 0 : _c.call(bus, "speech:final", onFinal);
    } catch (e) {
    }
  };
  try {
    window.__tpSpeechNotesHud = {
      canCapture,
      captureGateReason,
      dumpState: () => ({
        captureOn,
        mode: currentMode(store),
        micActive: micActive(store),
        rehearsal: inRehearsal(),
        saving: savingEnabled(),
        statusText: (statusEl == null ? void 0 : statusEl.textContent) || ""
      }),
      addNote: (text, final = false) => addNote({ text, final }),
      show,
      hide,
      toggle
    };
  } catch (e) {
  }
  return { show, hide, toggle, destroy };
}
export {
  initSpeechNotesHud
};
