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

export function renderScript(text = '') {
  try {
    const host = document.getElementById('script');
    if (!host) return;
    let t = String(text || '');
    try { if (typeof window.stripNoteBlocks === 'function') t = window.stripNoteBlocks(t); } catch {}
    const lines = t.replace(/\r\n?/g, '\n').split('\n');
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
    for (const raw of lines) {
      const ln = String(raw || '');
      const tag = ln.trim().toLowerCase();
      const mOpen = tag.match(/^\[(s1|s2|g1|g2)\]$/);
      const mClose = tag.match(/^\[\/(s1|s2|g1|g2)\]$/);
      if (mOpen) { curRole = mOpen[1]; continue; }
      if (mClose) { if (curRole === mClose[1]) curRole = null; continue; }
      if (ln.trim() === '') { // blank spacer line
        const div = document.createElement('div');
        div.className = 'line';
        div.textContent = '';
        host.appendChild(div);
        continue;
      }
      const div = document.createElement('div');
      div.className = 'line';
      // inline formatting (safe: formatter escapes first)
      div.innerHTML = fmt(ln);
      if (curRole) {
        try { div.style.color = getRoleColor(curRole); } catch {}
      }
      host.appendChild(div);
    }

    // Nudge hydrator to update empty banner state
    try { document.dispatchEvent(new CustomEvent('tp:script-rendered')); } catch {}

    // Restore scrollTop to avoid jumps on re-render
    if (scroller && typeof prevTop === 'number') scroller.scrollTop = prevTop;
  } catch {}
}

try { window.renderScript = renderScript; } catch {}

export default renderScript;
