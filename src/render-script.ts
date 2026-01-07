// src/render-script.ts
import { normalizeToStandardText, fallbackNormalizeText } from './script/normalize';
import { formatInlineMarkup } from './format-inline';
import { installScrollRouter, createAutoMotor } from './features/scroll/scroll-router';

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
        try {
          const auto = createAutoMotor();
          installScrollRouter({ auto, viewer: true, hostEl: root });
          try { (window as any).__tpAuto = auto; } catch {}
          viewerScrollRouterInstalled = true;
        } catch {}
      }
    } catch {}
  } catch {}

  let currentSpeaker: SpeakerKey | null = null;
  let devLineIndexWarningLogged = false;
  let inNote = false;

  try { root.textContent = ''; } catch {}
  let renderedLineIndex = 0;

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
      frag.appendChild(div);
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
    frag.appendChild(div);
    renderedLineIndex += 1;

    if (closeAfterLine) {
      currentSpeaker = null;
    }
  }

  try { root.appendChild(frag); } catch {}
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
