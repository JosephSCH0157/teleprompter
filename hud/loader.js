const LS_KEY = 'tp_hud_notes_v1'; // neutral key name (no "speech")
const LEGACY_LS_KEYS = ['tp_hud_speech_notes_v1']; // migrate on load
const PROD_TOGGLE_KEY = 'tp_hud_prod';
let notes = [];
let filterMode = 'all';
function markHudWireActive() { try {
    if (!window.__tpHudWireActive) {
        window.__tpHudWireActive = true;
    }
}
catch { } }
function announceHudReady() { try {
    if (window.__tpHudReadyOnce)
        return;
    window.__tpHudReadyOnce = true;
    document.dispatchEvent(new CustomEvent('hud:ready'));
}
catch { } }
markHudWireActive();
function save() { try {
    localStorage.setItem(LS_KEY, JSON.stringify(notes.slice(-500)));
}
catch { } }
function load() {
    try {
        const raw = localStorage.getItem(LS_KEY);
        if (raw) {
            notes = JSON.parse(raw) || [];
        }
        // one-time migration from legacy keys
        if (!raw) {
            for (const k of LEGACY_LS_KEYS) {
                const legacy = localStorage.getItem(k);
                if (legacy) {
                    notes = JSON.parse(legacy) || [];
                    try {
                        localStorage.setItem(LS_KEY, JSON.stringify(notes));
                    }
                    catch { }
                    break;
                }
            }
        }
        if (!Array.isArray(notes))
            notes = [];
    }
    catch {
        notes = [];
    }
}
function copyAll() {
    try {
        const body = notes.map(n => `${new Date(n.ts).toISOString()}\t${n.final ? 'FINAL' : 'INT'}\t${(n.sim ?? 0).toFixed(2)}\t${n.text}`).join('\n');
        navigator.clipboard?.writeText(body).catch(() => { });
    }
    catch { }
}
function exportTxt() {
    try {
        const body = notes.map(n => `${new Date(n.ts).toISOString()}\t${n.final ? 'FINAL' : 'INT'}\t${(n.sim ?? 0).toFixed(2)}\t${n.text}`).join('\n');
        const blob = new Blob([body], { type: 'text/plain' });
        const a = document.createElement('a');
        a.download = `captions-notes-${Date.now()}.txt`;
        a.href = URL.createObjectURL(blob);
        a.click();
        setTimeout(() => { try {
            URL.revokeObjectURL(a.href);
        }
        catch { } }, 1200);
    }
    catch { }
}
function shouldShowHud() {
    try {
        const isDev = window.__TP_DEV === 1 || localStorage.getItem('tp_dev_mode') === '1' || /(?:[?&])dev=1/.test(location.search) || /#dev\b/.test(location.hash);
        const isProdOptIn = localStorage.getItem(PROD_TOGGLE_KEY) === '1';
        return !!(isDev || isProdOptIn);
    }
    catch {
        return false;
    }
}
export function loadHudIfDev() {
    try {
        if (!shouldShowHud()) {
            try {
                console.info('[HUD] Captions HUD is off. Enable dev mode or set tp_hud_prod=1.');
            }
            catch { }
            return;
        }
        if (document.getElementById('tp-dev-hud'))
            return;
        load();
        const el = document.createElement('div');
        el.id = 'tp-dev-hud';
        el.style.cssText = 'position:fixed;right:12px;bottom:12px;max-width:520px;background:rgba(14,17,22,.88);color:#fff;padding:0;z-index:9999;border-radius:12px;font:12px/1.35 system-ui,Segoe UI,Roboto,sans-serif;box-shadow:0 8px 24px rgba(0,0,0,.35);backdrop-filter:saturate(1.1) blur(6px);display:flex;flex-direction:column;overflow:hidden;border:1px solid rgba(255,255,255,.08)';
        el.innerHTML = `
      <div style="display:flex;align-items:center;gap:.75rem;padding:.6rem .8rem;border-bottom:1px solid rgba(255,255,255,.08)">
        <strong>Captions HUD</strong>
        <span id="hudSpeechStatus" style="opacity:.85">session —</span>
        <label style="margin-left:.5rem;opacity:.85"><input id="hudFilterFinals" type="checkbox" /> finals only</label>
        <div style="margin-left:auto;display:flex;gap:.6rem;flex-wrap:wrap">
          <button id="hudCopy" title="Copy all" style="all:unset;cursor:pointer;opacity:.8">Copy</button>
          <button id="hudExport" title="Export .txt" style="all:unset;cursor:pointer;opacity:.8">Export</button>
          <button id="hudClear" title="Clear" style="all:unset;cursor:pointer;opacity:.8">Clear</button>
          <button id="hudClose" title="Hide HUD" style="all:unset;cursor:pointer;opacity:.6">✕</button>
        </div>
      </div>
      <div id="hudNotes" style="max-height:40vh;overflow:auto;padding:.6rem .8rem"></div>
      <div id="hudStatus" style="padding:.4rem .8rem;opacity:.75;border-top:1px solid rgba(255,255,255,.08)">idle</div>
      <div style="padding:.4rem .8rem;opacity:.55;font-size:10px">Tip: Dev mode or set <code>localStorage.setItem('${PROD_TOGGLE_KEY}','1')</code></div>
    `;
        document.body.appendChild(el);
        const notesEl = document.getElementById('hudNotes');
        function render(list) {
            try {
                if (!notesEl)
                    return;
                notesEl.innerHTML = '';
            }
            catch { }
            ;
            const rows = list.filter(n => filterMode === 'all' || n.final);
            for (const n of rows.slice(-250)) {
                const row = document.createElement('div');
                row.style.cssText = 'background:#121a22;border:1px solid #2a3b4a;padding:4px 6px;border-radius:5px;font-size:11px;white-space:pre-wrap;margin:0 0 .35rem;display:flex;gap:.4rem;align-items:flex-start';
                const ts = new Date(n.ts);
                const hh = String(ts.getHours()).padStart(2, '0');
                const mm = String(ts.getMinutes()).padStart(2, '0');
                const ss = String(ts.getSeconds()).padStart(2, '0');
                const sim = (n.sim != null) ? ` ${n.sim.toFixed(2)}` : '';
                const prefix = `${n.final ? 'FINAL' : 'INT'}${sim} [${hh}:${mm}:${ss}] `;
                const tagMatch = /^\s*(bug|todo|idea|q)\s*:\s*/i.exec(n.text);
                const tag = tagMatch?.[1]?.toLowerCase();
                const body = n.text.replace(/^\s*(bug|todo|idea|q)\s*:\s*/i, '');
                // Text content assembled without tag prefix
                const textSpan = document.createElement('span');
                textSpan.textContent = `${prefix}${body}`;
                if (tag) {
                    const badge = document.createElement('span');
                    badge.textContent = tag.toUpperCase();
                    badge.style.cssText = 'display:inline-block;margin-right:.2rem;padding:.1rem .35rem;border-radius:.4rem;font-weight:700;font-size:.8em;opacity:.9;white-space:nowrap;flex:none';
                    const colors = { bug: '#ff6b6b', todo: '#ffd166', idea: '#06d6a0', q: '#4dabf7' };
                    badge.style.background = colors[tag] || 'rgba(255,255,255,.15)';
                    row.appendChild(badge);
                }
                row.appendChild(textSpan);
                notesEl?.appendChild(row);
            }
            try {
                notesEl.scrollTop = notesEl?.scrollHeight || 0;
            }
            catch { }
        }
        function addNote(note) { try {
            if (note.final && notes.length && notes[notes.length - 1].final && notes[notes.length - 1].text === note.text)
                return;
        }
        catch { } notes.push(note); save(); render(notes); }
        window.__tpHudNotes = { addNote: (n) => addNote(n), list: () => notes.slice(), clear: () => { notes = []; save(); render(notes); }, setFilter: (m) => { filterMode = m; const cb = document.getElementById('hudFilterFinals'); if (cb)
                cb.checked = (m === 'finals'); render(notes); }, copyAll, exportTxt };
        try {
            window.__tpSpeechNotesHud = {
                addNote: (text, final = false) => addNote({ text, final, ts: Date.now() }),
                dumpState: () => ({
                    notes: notes.slice(),
                    filterMode,
                    hudVisible: !!document.getElementById('tp-dev-hud'),
                    savingEnabled: true,
                }),
            };
        }
        catch { }
        const statusEl = document.getElementById('hudStatus');
        // Show current session id in the top bar and update on session start
        try {
            const sess = localStorage.getItem('tp_hud_session') || '—';
            const sessEl = document.getElementById('hudSpeechStatus');
            if (sessEl)
                sessEl.textContent = `session ${sess}`;
            window.addEventListener('tp:session:start', (e) => {
                try {
                    const sid = e?.detail?.sid || localStorage.getItem('tp_hud_session') || '—';
                    if (sessEl)
                        sessEl.textContent = `session ${sid}`;
                }
                catch { }
            });
        }
        catch { }
        const filterCb = document.getElementById('hudFilterFinals');
        filterCb?.addEventListener('change', () => { filterMode = filterCb.checked ? 'finals' : 'all'; render(notes); });
        document.getElementById('hudExport')?.addEventListener('click', exportTxt);
        document.getElementById('hudCopy')?.addEventListener('click', copyAll);
        document.getElementById('hudClear')?.addEventListener('click', () => { notes = []; save(); render(notes); });
        document.getElementById('hudClose')?.addEventListener('click', () => { try {
            el.remove();
        }
        catch { } });
        // ---- Event bridge: prefer captions, still accept legacy speech events ----
        const onTx = (d) => {
            try {
                const text = String(d?.text ?? '').trim();
                if (!text)
                    return;
                const note = {
                    text,
                    final: !!(d?.final),
                    ts: typeof d?.timestamp === 'number' ? d.timestamp : (typeof d?.ts === 'number' ? d.ts : (typeof d?.t === 'number' ? d.t : Date.now())),
                    sim: typeof d?.confidence === 'number' ? d.confidence : (typeof d?.sim === 'number' ? d.sim : undefined)
                };
                if (statusEl)
                    statusEl.textContent = note.final ? 'final' : 'listening';
                addNote(note);
            }
            catch { }
        };
        window.addEventListener('tp:captions:transcript', (e) => onTx(e?.detail));
        window.addEventListener('tp:speech:transcript', (e) => onTx(e?.detail)); // legacy alias
        window.addEventListener('tp:captions:state', (e) => { try {
            const s = e?.detail?.state;
            if (s && statusEl)
                statusEl.textContent = String(s);
        }
        catch { } });
        window.addEventListener('tp:speech:state', (e) => { try {
            const s = e?.detail?.state;
            if (s && statusEl)
                statusEl.textContent = String(s);
        }
        catch { } });
        // Listen to bus events for speech transcripts (works in all modes)
        try {
            const bus = window.HUD?.bus || window.__tpHud?.bus;
            if (bus && bus.on) {
                bus.on('speech:partial', (d) => {
                    if (!d || !d.text)
                        return;
                    if (statusEl)
                        statusEl.textContent = 'listening';
                    addNote({ text: d.text, final: false, ts: d.t || performance.now(), sim: d.sim });
                });
                bus.on('speech:final', (d) => {
                    if (!d || !d.text)
                        return;
            announceHudReady();
                    if (statusEl)
                        statusEl.textContent = 'final';
                    addNote({ text: d.text, final: true, ts: d.t || performance.now(), sim: d.sim });

        try { loadHudIfDev(); }
        catch { }
        try { announceHudReady(); }
        catch { }
        catch { }
        render(notes);
    }
    catch { }
}
try {
    loadHudIfDev();
}
catch { }
