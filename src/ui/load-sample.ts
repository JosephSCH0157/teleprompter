// Simple, explicit wiring for the "Load sample text" button.
const SAMPLE_TEXT = [
  '[s1]',
  '[b]Lorem ipsum dolor[/b] sit amet, [i]consectetur[/i] [u]adipiscing[/u] elit. [note]Stage cue: smile and pause.[/note]',
  'Cras justo odio, dapibus ac facilisis in, egestas eget quam.',
  '[/s1]',
  '',
  '[s2]',
  '[color=#ffcc00]Vestibulum[/color] [bg=#112233]ante[/bg] ipsum primis in faucibus orci luctus et ultrices posuere cubilia curae;',
  'Integer posuere erat a ante venenatis dapibus posuere velit aliquet.',
  '[/s2]',
  '',
  '[g1]',
  'Curabitur [b]non nulla[/b] sit amet nisl tempus convallis quis ac lectus. Donec sollicitudin molestie malesuada.',
  'Maecenas faucibus mollis interdum.',
  '[/g1]',
  '',
  '[g2]',
  'Aenean eu leo quam. Pellentesque ornare sem lacinia quam venenatis vestibulum. [i]Etiam porta sem malesuada[/i] magna mollis euismod.',
  '[bg=#003344][color=#a4e8ff]Quisque[/color][/bg] sit amet est a [u]libero[/u] mollis tristique.',
  '[/g2]',
].join('\n');

function applySample(ed: HTMLTextAreaElement | HTMLInputElement): void {
  try {
    (ed as any).value = SAMPLE_TEXT;
    try { ed.dispatchEvent(new Event('input', { bubbles: true })); } catch {}
    try { if (typeof (window as any).renderScript === 'function') (window as any).renderScript((ed as any).value); } catch {}
    try { window.dispatchEvent(new CustomEvent('tp:script-rendered', { detail: { from: 'load-sample' } })); } catch {}
  } catch {}
}

export function bindLoadSample(doc: Document = document): void {
  const wire = () => {
    const btn = (doc.getElementById('loadSample') ||
      doc.querySelector('[data-action="load-sample"]')) as HTMLElement | null;
    const ed = doc.getElementById('editor') as HTMLTextAreaElement | HTMLInputElement | null;
    if (!btn || !ed) return false;
    if (btn.dataset.sampleWired === '1') return true;
    btn.dataset.sampleWired = '1';
    btn.addEventListener('click', (e) => {
      try { e.preventDefault(); e.stopImmediatePropagation?.(); } catch {}
      applySample(ed);
    }, { capture: true });
    return true;
  };

  if (wire()) return;

  try {
    const mo = new MutationObserver(() => {
      if (wire()) mo.disconnect();
    });
    mo.observe(doc.documentElement, { childList: true, subtree: true });
  } catch {}
}

export {};
