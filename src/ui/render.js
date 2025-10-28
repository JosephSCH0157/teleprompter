// Minimal script renderer: converts editor text into .line elements inside #script

export function renderScript(text = '') {
  try {
    const host = document.getElementById('script');
    if (!host) return;
    const t = String(text || '');
    const lines = t.replace(/\r\n?/g, '\n').split('\n');
    // Preserve current scroll position if the viewer is the scroller
    const viewer = document.getElementById('viewer');
    const scroller = viewer || document.scrollingElement || document.documentElement;
    const prevTop = scroller ? scroller.scrollTop : 0;

    // Render
    host.innerHTML = '';
    for (const ln of lines) {
      if (ln.trim() === '') { // blank spacer line
        const div = document.createElement('div');
        div.className = 'line';
        div.textContent = '';
        host.appendChild(div);
        continue;
      }
      const div = document.createElement('div');
      div.className = 'line';
      div.textContent = ln;
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
