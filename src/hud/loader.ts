/* eslint-disable @typescript-eslint/no-explicit-any */
const LS_KEY = 'tp_hud_speech_notes_v1';
const PROD_TOGGLE_KEY = 'tp_hud_prod';
type Note = { text: string; final: boolean; ts: number; sim?: number };
let notes: Note[] = [];
let filterMode: 'all' | 'finals' = 'all';

function save() { try { localStorage.setItem(LS_KEY, JSON.stringify(notes.slice(-500))); } catch {} }
function load() { try { const raw = localStorage.getItem(LS_KEY); notes = raw?JSON.parse(raw):[]; if(!Array.isArray(notes)) notes=[]; } catch { notes=[]; } }
function copyAll() {
  try { const body = notes.map(n=>`${new Date(n.ts).toISOString()}\t${n.final?'FINAL':'INT'}\t${(n.sim??0).toFixed(2)}\t${n.text}`).join('\n'); navigator.clipboard?.writeText(body).catch(()=>{}); } catch {}
}
function exportTxt() {
  try { const body = notes.map(n=>`${new Date(n.ts).toISOString()}\t${n.final?'FINAL':'INT'}\t${(n.sim??0).toFixed(2)}\t${n.text}`).join('\n'); const blob=new Blob([body],{type:'text/plain'}); const a=document.createElement('a'); a.download=`speech-notes-${Date.now()}.txt`; a.href=URL.createObjectURL(blob); a.click(); setTimeout(()=>{ try{URL.revokeObjectURL(a.href);}catch{} },1200); } catch {}
}
function shouldShowHud(){ try { const isDev=(window as any).__TP_DEV || /(?:[?&])dev=1/.test(location.search) || /#dev\b/.test(location.hash); if(isDev) return true; return localStorage.getItem(PROD_TOGGLE_KEY)==='1'; } catch { return false; } }

export function loadHudIfDev(){
  try {
    if(!shouldShowHud()) return;
    if(document.getElementById('tp-dev-hud')) return;
    load();
    const el=document.createElement('div'); el.id='tp-dev-hud';
    el.style.cssText='position:fixed;right:12px;bottom:12px;max-width:430px;width:min(92vw,430px);font:12px/1.4 system-ui;background:rgba(14,17,22,.88);color:#fff;padding:0;z-index:9999;border-radius:12px;box-shadow:0 8px 24px -4px #000c;backdrop-filter:blur(6px);display:flex;flex-direction:column;overflow:hidden;border:1px solid rgba(255,255,255,.08)';
    el.innerHTML=`<div style="display:flex;align-items:center;gap:.5rem;padding:.6rem .85rem;border-bottom:1px solid rgba(255,255,255,.07)"><strong style="font-weight:600">HUD · Speech</strong><span id="hudStatus" style="opacity:.65;margin-left:auto">idle</span><button id="hudClose" title="Hide HUD" style="all:unset;cursor:pointer;opacity:.6;padding:.25rem .4rem;border-radius:4px;">✕</button></div><div style="display:flex;gap:.75rem;align-items:center;padding:.45rem .85rem;border-bottom:1px solid rgba(255,255,255,.07);flex-wrap:wrap"><label style="display:flex;gap:.35rem;align-items:center;opacity:.85"><input id="hudFilterFinals" type="checkbox"> finals only</label><div style="margin-left:auto;display:flex;gap:.6rem;flex-wrap:wrap"><button id="hudCopy" title="Copy all" style="all:unset;cursor:pointer;opacity:.8">Copy</button><button id="hudExport" title="Export .txt" style="all:unset;cursor:pointer;opacity:.8">Export</button><button id="hudClear" title="Clear" style="all:unset;cursor:pointer;opacity:.8">Clear</button></div></div><div id="hudNotes" style="max-height:240px;overflow:auto;padding:.55rem .85rem"></div><div style="opacity:.45;font-size:10px;padding:.4rem .7rem;border-top:1px solid rgba(255,255,255,.06)">Enable prod HUD: localStorage.setItem('${PROD_TOGGLE_KEY}','1')</div>`;
    document.body.appendChild(el);
    const notesEl=document.getElementById('hudNotes');
    function render(list:Note[]){ try{ if(!notesEl) return; notesEl.innerHTML=''; }catch{}; const rows=list.filter(n=>filterMode==='all'||n.final); for(const n of rows.slice(-250)){ const row=document.createElement('div'); row.style.cssText='background:#121a22;border:1px solid #2a3b4a;padding:4px 6px;border-radius:5px;font-size:11px;white-space:pre-wrap;margin:0 0 .35rem'; const ts=new Date(n.ts); const hh=String(ts.getHours()).padStart(2,'0'); const mm=String(ts.getMinutes()).padStart(2,'0'); const ss=String(ts.getSeconds()).padStart(2,'0'); const sim=(n.sim!=null)?` ${(n.sim as number).toFixed(2)}`:''; row.textContent=`${n.final?'FINAL':'INT'}${sim} [${hh}:${mm}:${ss}] ${n.text}`; notesEl?.appendChild(row); } try{ (notesEl as any).scrollTop=notesEl?.scrollHeight||0; }catch{} }
    function addNote(note:Note){ try{ if(note.final && notes.length && notes[notes.length-1].final && notes[notes.length-1].text===note.text) return; }catch{} notes.push(note); save(); render(notes); }
    (window as any).__tpHudNotes={ addNote:(n:Note)=>addNote(n), list:()=>notes.slice(), clear:()=>{ notes=[]; save(); render(notes); }, setFilter:(m:'all'|'finals')=>{ filterMode=m; const cb=document.getElementById('hudFilterFinals') as HTMLInputElement; if(cb) cb.checked=(m==='finals'); render(notes); }, copyAll, exportTxt };
    const statusEl=document.getElementById('hudStatus');
    const filterCb=document.getElementById('hudFilterFinals') as HTMLInputElement | null; filterCb?.addEventListener('change',()=>{ filterMode=filterCb.checked?'finals':'all'; render(notes); });
    document.getElementById('hudExport')?.addEventListener('click',exportTxt);
    document.getElementById('hudCopy')?.addEventListener('click',copyAll);
    document.getElementById('hudClear')?.addEventListener('click',()=>{ notes=[]; save(); render(notes); });
    document.getElementById('hudClose')?.addEventListener('click',()=>{ try{ el.remove(); }catch{} });
    window.addEventListener('tp:speech:transcript',(e:any)=>{ const d=e?.detail as Note; if(!d) return; if(statusEl) statusEl.textContent=d.final?'final':'listening'; addNote(d); });
    render(notes);
  } catch {}
}

try { loadHudIfDev(); } catch {}
export { };

