// src/render-script.ts
import { normalizeToStandardText, fallbackNormalizeText } from './script/normalize';

function escapeHtml(input: string): string {
  return String(input || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function formatInline(line: string): string {
  let html = escapeHtml(line);

  const replacements: Array<[RegExp, string]> = [
    [/\[b\](.+?)\[\/b\]/gi, '<strong>$1</strong>'],
    [/\[i\](.+?)\[\/i\]/gi, '<em>$1</em>'],
    [/\[u\](.+?)\[\/u\]/gi, '<span class="u">$1</span>'],
    [/\[note\](.+?)\[\/note\]/gi, '<span class="tp-note-inline">$1</span>'],
    [/\[color=([^\]]+)\](.+?)\[\/color\]/gi, '<span class="tp-inline fg" data-color="$1">$2</span>'],
    [/\[bg=([^\]]+)\](.+?)\[\/bg\]/gi, '<span class="tp-inline bg" data-color="$1">$2</span>'],
  ];

  for (const [pattern, replacement] of replacements) {
    html = html.replace(pattern, replacement);
  }

  return html;
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
  const root =
    container ||
    (document.querySelector('[data-script-view]') as HTMLElement | null) ||
    (document.querySelector('#script') as HTMLElement | null) ||
    (document.querySelector('.script') as HTMLElement | null);

  if (!root) {
    try { console.warn('[render] #script container not found'); } catch {}
    return;
  }

  const normalized = normalizeScript(text ?? '').replace(/\r\n/g, '\n');
  const lines = normalized.split('\n');
  const frag = document.createDocumentFragment();

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

    if (/^\[\s*(note|pause|beat|reflective pause)\s*\]$/i.test(trimmed)) {
      inNote = true;
      continue;
    }
    if (/^\[\/\s*(note|pause|beat|reflective pause)\s*\]$/i.test(trimmed)) {
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
}

// Expose globally for callers that expect window.renderScript
try {
  (window as any).renderScript = renderScript;
} catch {}
