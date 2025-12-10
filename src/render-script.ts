// src/render-script.ts
import { normalizeToStandardText, fallbackNormalizeText } from './script/normalize';
import { formatInlineMarkup } from './format-inline';
import { pushDisplaySnapshot } from './features/display-sync';
import { pushDisplaySnapshot } from './features/display-sync';

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

export function renderScript(text: string, container?: HTMLElement | null): void {
  const raw = String(text ?? '');
  try { (window as any).__tpRawScript = raw; } catch {}

  const root =
    container ||
    (document.querySelector('#viewer') as HTMLElement | null) ||
    (document.querySelector('[data-role="viewer"]') as HTMLElement | null) ||
    (document.querySelector('[data-script-view]') as HTMLElement | null) ||
    (document.querySelector('#script') as HTMLElement | null) ||
    (document.querySelector('.script') as HTMLElement | null);

  if (!root) {
    try { console.warn('[render] #script container not found'); } catch {}
    return;
  }

  const normalized = normalizeScript(raw).replace(/\r\n/g, '\n');
  const lines = normalized.split('\n');
  const frag = document.createDocumentFragment();

  // Set a top padding equal to the marker offset so the first line sits on the marker line
  try {
    const markerPct =
      typeof (window as any).__TP_MARKER_PCT === 'number' ? (window as any).__TP_MARKER_PCT : 0.4;
    const h = root.clientHeight || window.innerHeight || 0;
    const markerOffset = Math.max(0, Math.round(h * markerPct));
    root.style.paddingTop = `${markerOffset}px`;
    // scroll-padding helps browsers honor alignment when using scrollTo with behavior
    (root as any).style.scrollPaddingTop = `${markerOffset}px`;
  } catch {}

  let currentSpeaker: SpeakerKey | null = null;
  let inNote = false;

  try { root.textContent = ''; } catch {}

  for (let i = 0; i < lines.length; i++) {
    let rawLine = lines[i] ?? '';
    let trimmed = rawLine.trim();

    if (!trimmed) {
      const div = document.createElement('div');
      div.className = 'line line-empty';
      div.innerHTML = '&nbsp;';
      (div as any).dataset.i = String(i);
      frag.appendChild(div);
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
    (div as any).dataset.i = String(i);

    if (currentSpeaker) {
      div.className += ` ${SPEAKER_CLASS[currentSpeaker]}`;
    }

    const html = formatInline(rawLine);
    div.innerHTML = html || '&nbsp;';
    applyInlineColors(div);
    frag.appendChild(div);

    if (closeAfterLine) {
      currentSpeaker = null;
    }
  }

  try { root.appendChild(frag); } catch {}
  try { (root as any).dataset.lineCount = String(lines.length); } catch {}
  try { root.scrollTop = 0; } catch {}

  // Snap the first line to the marker offset so the top aligns with the active line marker
  try {
    const firstLine = root.querySelector('.line') as HTMLElement | null;
    if (firstLine) {
      root.scrollTo({ top: 0, behavior: 'auto' });
    }
  } catch {}

  try {
    const evt = new CustomEvent('tp:render:done', { detail: { lineCount: lines.length } });
    root.dispatchEvent(evt);
    document.dispatchEvent(evt);
  } catch {
    // ignore
  }

  // Notify observers (e.g., display mirror) that content changed
  try {
    document.dispatchEvent(new CustomEvent('tp:script-rendered', { detail: { lineCount: lines.length } }));
  } catch {}
  // Notify listeners (e.g., display sync) that script content changed
  try { window.dispatchEvent(new CustomEvent('tp:scriptChanged', { detail: { lineCount: lines.length } })); } catch {}

  // Mirror to display window (tp_display channel + postMessage fallback)
  try { pushDisplaySnapshot(raw); } catch {}
}

// Expose globally for callers that expect window.renderScript
try {
  (window as any).renderScript = renderScript;
} catch {}
