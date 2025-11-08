export function loadHudIfDev() {
  try {
    const params = new URLSearchParams(location.search);
    const dev = (window as any).__TP_DEV || params.get('dev') === '1';
    if (!dev) return;
    // Avoid duplicate
    if (document.getElementById('tp-dev-hud')) return;
    const el = document.createElement('div');
    el.id = 'tp-dev-hud';
    el.style.cssText = 'position:fixed;right:8px;bottom:8px;max-width:340px;font:12px/1.4 system-ui;background:rgba(0,0,0,0.65);color:#fff;padding:8px 10px;z-index:9999;border-radius:8px;box-shadow:0 2px 10px -2px #000;backdrop-filter:blur(4px);display:flex;flex-direction:column;gap:6px;';
    el.innerHTML = '<div style="font-weight:600;display:flex;align-items:center;justify-content:space-between;">HUD <span id="hudStatus" style="opacity:.7;font-weight:400;">speech: idle</span></div>' +
      '<div id="hudNotes" style="max-height:160px;overflow:auto;display:flex;flex-direction:column;gap:4px;"></div>' +
      '<div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:4px;">' +
        '<button id="hudExport" style="flex:1;min-width:90px;cursor:pointer;background:#1e2832;color:#fff;border:1px solid #3a4a5c;border-radius:6px;padding:4px 6px;font:11px system-ui;">Export</button>' +
        '<button id="hudClear" style="flex:1;min-width:90px;cursor:pointer;background:#32201e;color:#fff;border:1px solid #5c3a3a;border-radius:6px;padding:4px 6px;font:11px system-ui;">Clear</button>' +
      '</div>' +
      '<div style="opacity:.5;font-size:10px;">Final recognized speech will appear here for quick test notes.</div>';
    document.body.appendChild(el);

    // Persistence helpers
    const LS_KEY = 'tp_hud_speech_notes_v1';
    function loadNotes(): any[] {
      try { const raw = localStorage.getItem(LS_KEY); if (!raw) return []; const arr = JSON.parse(raw); return Array.isArray(arr)?arr:[]; } catch { return []; }
    }
    function saveNotes(list: any[]) { try { localStorage.setItem(LS_KEY, JSON.stringify(list.slice(-200))); } catch {} }

    const notesEl = document.getElementById('hudNotes')!;
    function render(list: any[]) {
      try { notesEl.innerHTML=''; } catch {}
      for (const n of list) {
        const row = document.createElement('div');
        row.style.cssText='background:#121a22;border:1px solid #2a3b4a;padding:4px 6px;border-radius:5px;font-size:11px;white-space:pre-wrap;';
        const ts = new Date(n.ts||Date.now());
        const hh = String(ts.getHours()).padStart(2,'0');
        const mm = String(ts.getMinutes()).padStart(2,'0');
        const ss = String(ts.getSeconds()).padStart(2,'0');
        row.textContent = `[${hh}:${mm}:${ss}] ${n.text}`;
        notesEl.appendChild(row);
      }
    }
    let notes = loadNotes();
    render(notes);

    // Add note programmatically
    function addNote(text: string) {
      if (!text || !text.trim()) return;
      try { if (notes.length && notes[notes.length-1].text === text.trim()) return; } catch {}
      notes.push({ text: text.trim(), ts: Date.now() });
      saveNotes(notes);
      render(notes);
    }
    (window as any).__tpHudNotes = { addNote, list: ()=>notes.slice(), clear: ()=>{ notes=[]; saveNotes(notes); render(notes); } };

    // Listen for speech transcripts
    document.addEventListener('tp:speech:transcript', (e: any) => {
      try {
        const d = e?.detail || {};
        const statusEl = document.getElementById('hudStatus');
        if (statusEl) statusEl.textContent = d.final ? 'speech: final' : 'speech: listening';
        if (d.final) addNote(d.text||'');
      } catch {}
    }, { capture: true });

    // Export button
    document.getElementById('hudExport')?.addEventListener('click', () => {
      try {
        const blob = new Blob([notes.map(n=>`[${new Date(n.ts).toISOString()}] ${n.text}`).join('\n')], { type: 'text/plain' });
        const a = document.createElement('a');
        a.download = 'speech-notes.txt';
        a.href = URL.createObjectURL(blob);
        a.click();
        setTimeout(()=>{ try { URL.revokeObjectURL(a.href); } catch {} }, 4000);
      } catch {}
    });

    // Clear button
    document.getElementById('hudClear')?.addEventListener('click', () => {
      try { (window as any).__tpHudNotes.clear(); } catch {}
    });
  } catch {}
}

// Auto-run if dev
try { loadHudIfDev(); } catch {}

export { };

