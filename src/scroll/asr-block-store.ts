import type { AsrBlockMetaV1 } from './asr-block-index';

let blockEls: HTMLElement[] = [];
let blockMeta: AsrBlockMetaV1 | null = null;

function isDevMode(): boolean {
  try {
    const qs = new URLSearchParams(String(location.search || ''));
    if (qs.has('dev') || qs.get('dev') === '1') return true;
    if (qs.has('dev1') || qs.get('dev1') === '1') return true;
    if (qs.has('ci') || qs.get('ci') === '1') return true;
    if ((window as any).__TP_DEV || (window as any).__TP_DEV1) return true;
    if (localStorage.getItem('tp_dev_mode') === '1') return true;
  } catch {}
  return false;
}

export function setAsrBlocks(nextEls: HTMLElement[], meta: AsrBlockMetaV1): void {
  blockEls = Array.isArray(nextEls) ? nextEls : [];
  blockMeta = meta || null;
  const payload = {
    ready: true,
    blockCount: blockEls.length,
    schemaVersion: Number((meta as any)?.schemaVersion || 1),
    source: (meta as any)?.source || 'render',
  };
  try {
    (window as any).__tpAsrBlocksReady = true;
    (window as any).__tpAsrBlockCount = blockEls.length;
  } catch {}
  try { window.dispatchEvent(new CustomEvent('tp:asr:blocks-ready', { detail: payload })); } catch {}
  try { document.dispatchEvent(new CustomEvent('tp:asr:blocks-ready', { detail: payload })); } catch {}
  if (isDevMode()) {
    try { console.debug('[asr-block-store] blocks ready', payload); } catch {}
  }
}

export function getAsrBlockElements(): HTMLElement[] {
  return blockEls;
}

export function getAsrBlockIndex(): AsrBlockMetaV1 | null {
  return blockMeta;
}
