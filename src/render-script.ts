// src/render-script.ts
function escapeHtml(str: string): string {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function formatInline(line: string): string {
  let html = escapeHtml(line);
  // Basic inline tags
  html = html.replace(/\[b\](.*?)\[\/b\]/gi, '<strong>$1</strong>');
  html = html.replace(/\[i\](.*?)\[\/i\]/gi, '<em>$1</em>');
  html = html.replace(/\[u\](.*?)\[\/u\]/gi, '<span class="u">$1</span>');

  // Note blocks
  html = html.replace(/\[note\](.*?)\[\/note\]/gi, '<span class="note">$1</span>');

  // Speaker tags
  html = html.replace(/\[s1\](.*?)\[\/s1\]/gi, '<span class="speaker s1">$1</span>');
  html = html.replace(/\[s2\](.*?)\[\/s2\]/gi, '<span class="speaker s2">$1</span>');
  html = html.replace(/\[g1\](.*?)\[\/g1\]/gi, '<span class="speaker g1">$1</span>');
  html = html.replace(/\[g2\](.*?)\[\/g2\]/gi, '<span class="speaker g2">$1</span>');

  // Color tags
  html = html.replace(
    /\[color=([^\]]+)\](.*?)\[\/color\]/gi,
    '<span class="color" style="color:$1">$2</span>',
  );
  html = html.replace(
    /\[bg=([^\]]+)\](.*?)\[\/bg\]/gi,
    '<span class="bg" style="background:$1">$2</span>',
  );

  return html;
}

export function renderScript(text: string) {
  const root =
    (document.querySelector('[data-script-view]') as HTMLElement | null) ||
    (document.querySelector('#script') as HTMLElement | null) ||
    (document.querySelector('.script') as HTMLElement | null);

  if (!root) {
    try { console.warn('[render] #script container not found'); } catch {}
    return;
  }

  const lines = String(text ?? '').replace(/\r/g, '').split('\n');
  const frag = document.createDocumentFragment();

  // clear & (re)build
  try { root.textContent = ''; } catch {}
  for (let i = 0; i < lines.length; i++) {
    const div = document.createElement('div');
    div.className = 'line';
    (div as any).dataset.i = String(i);
    div.innerHTML = formatInline(lines[i]);
    frag.appendChild(div);
  }
  try { root.appendChild(frag); } catch {}

  try { (root as any).dataset.lineCount = String(lines.length); } catch {}
  try { document.dispatchEvent(new CustomEvent('tp:render:done', { detail: { lineCount: lines.length } })); } catch {}
  // Keep script container at the top without yanking the whole page
  try { (root as any).scrollTop = 0; } catch {}
}
