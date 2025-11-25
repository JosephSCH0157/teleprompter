// src/render-script.ts
export function renderScript(text: string) {
  const root =
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
    div.textContent = lines[i];
    frag.appendChild(div);
  }
  try { root.appendChild(frag); } catch {}

  try { (root as any).dataset.lineCount = String(lines.length); } catch {}
  try { document.dispatchEvent(new CustomEvent('tp:render:done', { detail: { lineCount: lines.length } })); } catch {}
  // Keep script container at the top without yanking the whole page
  try { (root as any).scrollTop = 0; } catch {}
}
