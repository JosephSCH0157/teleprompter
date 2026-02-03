// src/render-script.ts
import { normalizeToStandardText, fallbackNormalizeText } from './script/normalize';
import { formatInlineMarkup } from './format-inline';
import { installScrollRouter, createAutoMotor, ROUTER_STAMP } from './features/scroll/scroll-router';
import {
  ASR_MIN_CHARS_PER_BLOCK,
  ASR_MIN_SENTENCES_PER_BLOCK,
  ASR_MAX_CHARS_PER_BLOCK,
  ASR_MAX_SENTENCES_PER_BLOCK,
  type AsrBlockMetaV1,
  type AsrBlockUnit,
} from './scroll/asr-block-index';
import { setAsrBlocks } from './scroll/asr-block-store';

try { console.warn('[ROUTER_STAMP] render-script', ROUTER_STAMP); } catch {}

function _escapeHtml(input: string): string {
  return String(input || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function formatInline(line: string): string {
  return formatInlineMarkup(line);
}

type SpeakerKey = 's1' | 's2' | 'guest1' | 'guest2';

const SPEAKER_CLASS: Record<SpeakerKey, string> = {
  s1: 'speaker-s1',
  s2: 'speaker-s2',
  guest1: 'speaker-guest1',
  guest2: 'speaker-guest2',
};

function normalizeScript(raw: string): string {
  try {
    const txt = normalizeToStandardText(raw);
    if (txt) return txt;
  } catch {
    // ignore
  }
  try {
    const txt = fallbackNormalizeText(raw);
    if (txt) return txt;
  } catch {
    // ignore
  }
  return String(raw || '');
}

function applyInlineColors(scope: HTMLElement): void {
  try {
    scope.querySelectorAll<HTMLElement>('[data-color]').forEach((el) => {
      const color = el.dataset.color || '';
      if (!color) return;
      if (el.classList.contains('fg')) {
        el.style.color = color;
      }
      if (el.classList.contains('bg')) {
        el.style.backgroundColor = color;
      }
    });
  } catch {
    // ignore
  }
}

function resolveSpeakerTag(tag: string): SpeakerKey | null {
  const t = tag.toLowerCase();
  if (t === 's1') return 's1';
  if (t === 's2') return 's2';
  if (t === 'g1' || t === 'guest1') return 'guest1';
  if (t === 'g2' || t === 'guest2') return 'guest2';
  return null;
}

let viewerScrollRouterInstalled = false;

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

function normalizeAsrText(input: string): string {
  const raw = String(input || '');
  const stripped = raw
    .replace(/\[[^\]]+\]/g, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return stripped.toLowerCase();
}

function countSentences(text: string): number {
  const t = String(text || '').trim();
  if (!t) return 0;
  const cleaned = t.replace(/\.{3,}/g, '.');
  const matches = cleaned.match(/[.!?]+/g);
  if (!matches || matches.length === 0) return 1;
  return matches.length;
}

function chunkAsrUnits(units: AsrBlockUnit[]) {
  const blocks: Array<{
    blockIdx: number;
    unitStart: number;
    unitEnd: number;
    sentenceCount: number;
    charCount: number;
  }> = [];
  const warnings: string[] = [];
  if (!units.length) return { blocks, warnings };

  let start = 0;
  let sentences = 0;
  let chars = 0;

  const closeBlock = (endIdx: number) => {
    const blockIdx = blocks.length;
    blocks.push({
      blockIdx,
      unitStart: start,
      unitEnd: endIdx,
      sentenceCount: sentences,
      charCount: chars,
    });
  };

  for (let i = 0; i < units.length; i++) {
    const unit = units[i];
    sentences += unit.sentenceCount;
    chars += unit.charCount;

    if (unit.charCount >= ASR_MAX_CHARS_PER_BLOCK) {
      warnings.push(`Unit ${i} oversized (${unit.charCount} chars)`);
    }

    const meetsMin =
      sentences >= ASR_MIN_SENTENCES_PER_BLOCK &&
      chars >= ASR_MIN_CHARS_PER_BLOCK;
    const meetsMax =
      sentences >= ASR_MAX_SENTENCES_PER_BLOCK ||
      chars >= ASR_MAX_CHARS_PER_BLOCK;

    if (meetsMin || meetsMax) {
      closeBlock(i);
      start = i + 1;
      sentences = 0;
      chars = 0;
    }
  }

  if (start < units.length) {
    closeBlock(units.length - 1);
  }

  return { blocks, warnings };
}

export function renderScript(text: string, container?: HTMLElement | null): void {
  const raw = String(text ?? '');
  try { (window as any).__tpRawScript = raw; } catch {}

  // Prefer the dedicated script container so we never nuke sibling UI (e.g., camera overlay).
  // Fall back to viewer wrappers only if no script element exists.
  const root =
    container ||
    (document.getElementById('script') as HTMLElement | null) ||
    (document.querySelector('.script') as HTMLElement | null) ||
    (document.querySelector('#viewer') as HTMLElement | null) ||
    (document.querySelector('[data-role="viewer"]') as HTMLElement | null) ||
    (document.querySelector('[data-script-view]') as HTMLElement | null);

  if (!root) {
    try { console.warn('[render] #script container not found'); } catch {}
    return;
  }

  const normalized = normalizeScript(raw).replace(/\r\n/g, '\n');
  const lines = normalized.split('\n');
  const frag = document.createDocumentFragment();
  const viewer = (root.id === 'viewer' ? root : (root.closest('#viewer') as HTMLElement | null)) || null;

  // Set a top padding equal to the marker offset so the first line sits on the marker line
  try {
    const markerPct =
      typeof (window as any).__TP_MARKER_PCT === 'number' ? (window as any).__TP_MARKER_PCT : 0.4;
    const host = viewer || root;
    const h = host.clientHeight || window.innerHeight || 0;
    const markerOffset = Math.max(0, Math.round(h * markerPct));
    try { root.style.paddingTop = `${markerOffset}px`; } catch {}
    try { root.style.scrollPaddingTop = ''; } catch {}
    if (viewer) {
      // scroll-padding keeps scrollTo alignment without shifting the marker element
      viewer.style.paddingTop = '0px';
      viewer.style.scrollPaddingTop = `${markerOffset}px`;
      const viewerHeight = viewer.clientHeight || 0;
      if (viewerHeight > 0 && markerOffset > viewerHeight * 2) {
        try { console.warn('[MARKER] insane offset', { markerOffset, viewerHeight }); } catch {}
      }
    }
    try {
      const padTarget = root.id ? `#${root.id}` : (root.className ? `.${root.className}` : root.tagName.toLowerCase());
      const scrollPadTarget = viewer
        ? (viewer.id ? `#${viewer.id}` : (viewer.className ? `.${viewer.className}` : viewer.tagName.toLowerCase()))
        : 'none';
      console.info([
        '[MARKER_PADDING]',
        `markerPct=${markerPct}`,
        `hostH=${Math.round(h)}`,
        `markerOffset=${markerOffset}`,
        `paddingTop=${padTarget}`,
        `scrollPaddingTop=${scrollPadTarget}`,
      ].join(' '));
      if (!viewerScrollRouterInstalled && viewer) {
        try { console.warn('[SCROLL_ROUTER] render-script installing router now'); } catch {}
        const auto = createAutoMotor();
        const viewerEl = document.getElementById('viewer') as HTMLElement | null;
        const hostEl = viewerEl || root;
        const mode =
          (window as any).__tpCurrentScrollMode ||
          (window as any).__tpScrollMode ||
          'unknown';
        const viewerInfo = viewerEl
          ? `${viewerEl.id || 'no-id'} ${viewerEl.className || 'no-class'}`
          : 'no-viewer';
        const hybridMotorInit = !!auto;
        const listenersWired = !!(window as any).__tpHybridListenersReady;
        try {
          console.warn('[SCROLL_ROUTER] install debug', {
            mode,
            viewer: viewerInfo.trim(),
            hybridMotorInit,
            listenersWired,
          });
        } catch {}
        try { console.info('ABOUT TO CALL installScrollRouter'); } catch {}
        try {
          installScrollRouter({ auto, viewer: !!viewerEl, hostEl });
          try { console.info('RETURNED FROM installScrollRouter'); } catch {}
          try { (window as any).__tpAuto = auto; } catch {}
          viewerScrollRouterInstalled = true;
        } catch (error) {
          try {
            const errObj = error instanceof Error ? error : new Error(String(error));
            console.error('[SCROLL_ROUTER] install failure context', {
              mode,
              viewer: viewerInfo.trim(),
              hybridMotorInit,
              listenersWired,
            });
            console.error('[SCROLL_ROUTER] INSTALL FAILED', errObj);
            if (errObj.stack) {
              console.error(errObj.stack);
            }
          } catch {}
        }
      }
    } catch {}
  } catch {}

  let currentSpeaker: SpeakerKey | null = null;
  let devLineIndexWarningLogged = false;
  let inNote = false;

  try { root.textContent = ''; } catch {}
  let renderedLineIndex = 0;
  const nodeEntries: Array<{ el: HTMLElement; unitIdx: number | null }> = [];
  const asrUnits: AsrBlockUnit[] = [];
  const asrUnitEls: HTMLElement[] = [];

  for (let i = 0; i < lines.length; i++) {
    let rawLine = lines[i] ?? '';
    let trimmed = rawLine.trim();

    if (!trimmed) {
      const div = document.createElement('div');
      div.className = 'line line-empty';
      div.innerHTML = '&nbsp;';
      const renderIdx = String(renderedLineIndex);
      div.id = `tp-line-${renderIdx}`;
      (div as any).dataset.i = renderIdx;
      (div as any).dataset.index = renderIdx;
      (div as any).dataset.line = renderIdx;
      (div as any).dataset.lineIdx = renderIdx;
      (div as any).dataset.rawLine = String(i);
      nodeEntries.push({ el: div, unitIdx: null });
      renderedLineIndex += 1;
      continue;
    }

    const openSolo = trimmed.match(/^\[\s*(s1|s2|guest1|guest2|g1|g2)\s*\]$/i);
    if (openSolo) {
      const key = resolveSpeakerTag(openSolo[1]);
      if (key) currentSpeaker = key;
      continue;
    }

    const closeSolo = trimmed.match(/^\[\/\s*(s1|s2|guest1|guest2|g1|g2)\s*\]$/i);
    if (closeSolo) {
      currentSpeaker = null;
      continue;
    }

    // Inline leading opening tag with content after it
    const leadingOpen = rawLine.match(/^\s*\[\s*(s1|s2|guest1|guest2|g1|g2)\s*\]\s*/i);
    if (leadingOpen) {
      const key = resolveSpeakerTag(leadingOpen[1]);
      if (key) currentSpeaker = key;
      rawLine = rawLine.slice(leadingOpen[0].length);
      trimmed = rawLine.trim();
    }

    // Inline trailing closing tag after content
    let closeAfterLine = false;
    const trailingClose = rawLine.match(/\s*\[\s*\/\s*(s1|s2|guest1|guest2|g1|g2)\s*\]\s*$/i);
    if (trailingClose) {
      closeAfterLine = true;
      rawLine = rawLine.slice(0, rawLine.length - trailingClose[0].length);
      trimmed = rawLine.trim();
    }

    // Only [note] blocks are hidden; pacing cues like [pause]/[beat] should render normally
    if (/^\[\s*note\s*\]$/i.test(trimmed)) {
      inNote = true;
      continue;
    }
    if (/^\[\/\s*note\s*\]$/i.test(trimmed)) {
      inNote = false;
      continue;
    }
    if (inNote) {
      continue;
    }

    const div = document.createElement('div');
    div.className = 'line';
    const renderIdx = String(renderedLineIndex);
    div.id = `tp-line-${renderIdx}`;
    (div as any).dataset.i = renderIdx;
    (div as any).dataset.index = renderIdx;
    (div as any).dataset.line = renderIdx;
    (div as any).dataset.lineIdx = renderIdx;
    (div as any).dataset.rawLine = String(i);

    if (currentSpeaker) {
      div.classList.add(SPEAKER_CLASS[currentSpeaker]);
      (div as any).dataset.speaker = currentSpeaker;
    }

    const html = formatInline(rawLine);
    div.innerHTML = html || '&nbsp;';
    applyInlineColors(div);

    const textNorm = normalizeAsrText(rawLine);
    const unitIdx = textNorm
      ? (() => {
          const sentenceCount = countSentences(textNorm);
          const charCount = textNorm.length;
          const unit: AsrBlockUnit = {
            textNorm,
            sentenceCount,
            charCount,
          };
          const idx = asrUnits.length;
          asrUnits.push(unit);
          asrUnitEls.push(div);
          return idx;
        })()
      : null;

    nodeEntries.push({ el: div, unitIdx });
    renderedLineIndex += 1;

    if (closeAfterLine) {
      currentSpeaker = null;
    }
  }

  const { blocks, warnings } = chunkAsrUnits(asrUnits);
  const unitToBlock = new Array(asrUnits.length).fill(0);
  blocks.forEach((b) => {
    for (let u = b.unitStart; u <= b.unitEnd; u++) unitToBlock[u] = b.blockIdx;
  });

  const blockEls: HTMLElement[] = [];
  const appendedBlocks = new Set<number>();
  const ensureBlock = (idx: number) => {
    if (blockEls[idx]) return blockEls[idx];
    const el = document.createElement('div');
    el.className = 'tp-asr-block';
    (el as any).dataset.tpBlock = String(idx);
    blockEls[idx] = el;
    if (!appendedBlocks.has(idx)) {
      frag.appendChild(el);
      appendedBlocks.add(idx);
    }
    return el;
  };

  let lastBlockIdx = -1;
  for (const entry of nodeEntries) {
    let bIdx = 0;
    if (blocks.length) {
      if (entry.unitIdx != null) {
        bIdx = unitToBlock[entry.unitIdx] ?? 0;
      } else {
        bIdx = lastBlockIdx >= 0 ? lastBlockIdx : 0;
      }
    }
    const blockEl = ensureBlock(bIdx);
    blockEl.appendChild(entry.el);
    lastBlockIdx = bIdx;
  }

  // If there were no units but nodes exist, ensure a single block wrapper exists.
  if (!blocks.length && nodeEntries.length && !blockEls.length) {
    const blockEl = ensureBlock(0);
    for (const entry of nodeEntries) blockEl.appendChild(entry.el);
  }

  try { root.appendChild(frag); } catch {}
  try {
    const meta: AsrBlockMetaV1 = {
      schemaVersion: 1,
      blockCount: blockEls.length,
      createdAt: isDevMode() ? Date.now() : 0,
      source: 'render',
      units: blocks.map((b) => ({
        blockIdx: b.blockIdx,
        unitStart: b.unitStart,
        unitEnd: b.unitEnd,
        sentenceCount: b.sentenceCount,
        charCount: b.charCount,
      })),
      warnings: warnings.length ? warnings : undefined,
    };
    setAsrBlocks(blockEls, meta);
  } catch {}

  if (isDevMode()) {
    try {
      let ok = true;
      if (!blockEls.length) ok = false;
      for (let i = 0; i < blockEls.length; i++) {
        const el = blockEls[i];
        if (!el || el.dataset.tpBlock !== String(i)) {
          ok = false;
          break;
        }
      }
      if (!ok) {
        try { (window as any).__tpAsrBlocksReady = false; } catch {}
        console.error('[render] ASR block index invalid', {
          blocks: blockEls.length,
          warnings,
        });
      }
    } catch {}
  }
  try {
    const placeholder = viewer?.querySelector<HTMLElement>('.empty-msg');
    if (placeholder) placeholder.remove();
  } catch {}
  try { (root as any).dataset.lineCount = String(renderedLineIndex); } catch {}
  try { root.scrollTop = 0; } catch {}

  try {
    if ((window as any).__TP_DEV || (window as any).__TP_DEV1) {
      const lineEls = Array.from(root.querySelectorAll<HTMLElement>('.line[data-line]'));
      const maxLineIdx = lineEls.reduce((max, el) => {
        const idx = Number(el.dataset.line ?? -1);
        return Number.isFinite(idx) ? Math.max(max, idx) : max;
      }, -1);
      if (lineEls.length && maxLineIdx !== lineEls.length - 1 && !devLineIndexWarningLogged) {
        devLineIndexWarningLogged = true;
        console.warn('[render] line index mismatch', {
          rendered: lineEls.length,
          maxLineIdx,
        });
      }
      if (lineEls.length && lineEls.every((el) => !el.dataset.speaker)) {
        console.info('[render] no speaker markers applied to rendered lines', {
          lineCount: lineEls.length,
        });
      }
    }
  } catch {}

  // Snap the first line to the marker offset so the top aligns with the active line marker
  try {
    const firstLine = root.querySelector('.line') as HTMLElement | null;
    if (firstLine) {
      root.scrollTo({ top: 0, behavior: 'auto' });
    }
  } catch {}

  try {
    const evt = new CustomEvent('tp:render:done', { detail: { lineCount: renderedLineIndex } });
    root.dispatchEvent(evt);
    document.dispatchEvent(evt);
  } catch {
    // ignore
  }

  // Notify observers (e.g., display mirror) that content changed
  try {
    document.dispatchEvent(new CustomEvent('tp:script-rendered', { detail: { lineCount: renderedLineIndex } }));
  } catch {}
  // Notify listeners (e.g., display sync) that script content changed
  try { window.dispatchEvent(new CustomEvent('tp:scriptChanged', { detail: { lineCount: renderedLineIndex } })); } catch {}

}

// Expose globally for callers that expect window.renderScript
try {
  (window as any).renderScript = renderScript;
} catch {}
