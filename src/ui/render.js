// Minimal script renderer: converts editor text into .line elements inside #script

function getRoleColor(role) {
  try {
    const inp = document.getElementById('color-' + role);
    const v = (inp && 'value' in inp) ? String(inp.value || '').trim() : '';
    if (v) return v;
  } catch {}
  const DEF = { s1: '#2ea8ff', s2: '#ffd24a', g1: '#25d08a', g2: '#b36cff' };
  return DEF[role] || '#9fb4c9';
}

// Segmenter v2: preserves explicit newlines, performs sentence-edge splits,
// and isolates [pause]/[beat] cues onto their own tiny lines.
function segmentScript(raw = '') {
  const NL = String(raw || '').replace(/\r\n?/g, '\n');
  return NL
    .split(/\n+/)                                       // explicit newlines first
    .flatMap(block => block.split(/(?<=[.!?])\s+(?=[A-Z[])/)) // sentence-ish boundaries
    .flatMap(line => line.split(/(\[pause\]|\[beat\])/).filter(Boolean)) // isolate cues
    .map(s => s.trim())
    .filter(Boolean);
}

export function renderScript(text = '') {
  try {
    const host = document.getElementById('script');
    if (!host) return;
    let t = String(text || '');
    try { if (typeof window.stripNoteBlocks === 'function') t = window.stripNoteBlocks(t); } catch {}
    const lines = segmentScript(t);
    // Preserve current scroll position if the viewer is the scroller
    const viewer = document.getElementById('viewer');
    const scroller = viewer || document.scrollingElement || document.documentElement;
    const prevTop = scroller ? scroller.scrollTop : 0;

    // Render
    host.innerHTML = '';
    let curRole = null; // s1|s2|g1|g2 or null
    const fmt = (s) => {
      try { if (typeof window.formatInlineMarkup === 'function') return window.formatInlineMarkup(s); } catch {}
      // fallback escape only
      try { return String(s).replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c])); } catch { return String(s||''); }
    };
    for (let i = 0; i < lines.length; i++) {
      const raw = lines[i];
      const ln = String(raw || '');
      const tag = ln.trim().toLowerCase();
      const mOpen = tag.match(/^\[(s1|s2|g1|g2)\]$/);
      const mClose = tag.match(/^\[\/(s1|s2|g1|g2)\]$/);
      if (mOpen) { curRole = mOpen[1]; continue; }
      if (mClose) { if (curRole === mClose[1]) curRole = null; continue; }
      // Hide note lines entirely from the prompter surface
      if (/^\[note]/i.test(tag)) continue;
      if (ln.trim() === '') { // blank spacer line
        const div = document.createElement('div');
        div.className = 'line';
        try { div.classList.add('tp-line'); } catch {}
        try { div.dataset.tpLine = '1'; } catch {}
        div.textContent = '';
        host.appendChild(div);
        continue;
      }
      const div = document.createElement('div');
      div.className = 'line';
      try { div.classList.add('tp-line'); } catch {}
      try { div.dataset.tpLine = '1'; } catch {}
      // inline formatting (safe: formatter escapes first)
      div.innerHTML = fmt(ln);
      if (curRole) {
        try { div.style.color = getRoleColor(curRole); } catch {}
      }
      // Data index for downstream match / scroll alignment helpers
      try { div.dataset.lineIdx = String(i); } catch {}
      // Mark cue lines distinctly (optional styling hook)
      if (/^\[(pause|beat)]$/i.test(tag)) {
        try {
          div.dataset.cue = tag.replace(/\[|]/g,'');
          div.classList.add('tp-cue');
          div.dataset.silent = '1'; // mark cue lines as silent for ASR skip logic
          div.setAttribute('data-silent','1');
        } catch {}
      }
      host.appendChild(div);
    }

  // Nudge hydrator to update empty banner state
  try { document.dispatchEvent(new CustomEvent('tp:script-rendered')); } catch {}
  // Notify display-sync pipeline of content change
  try { window.dispatchEvent(new Event('tp:scriptChanged')); } catch {}

    // Restore scrollTop to avoid jumps on re-render
    if (scroller && typeof prevTop === 'number') scroller.scrollTop = prevTop;
  } catch {}
}

try { window.renderScript = renderScript; } catch {}

export default renderScript;
