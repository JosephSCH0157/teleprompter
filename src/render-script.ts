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
    const rawLine = lines[i] ?? '';
    const trimmed = rawLine.trim();

    if (!trimmed) {
      const div = document.createElement('div');
      div.className = 'line line-empty';
      div.innerHTML = '&nbsp;';
      (div as any).dataset.i = String(i);
      frag.appendChild(div);
      continue;
    }

    const open = trimmed.match(/^\[\s*(s1|s2|guest1|guest2|g1|g2)\s*\]$/i);
    if (open) {
      const key = open[1].toLowerCase();
      currentSpeaker =
        key === 'g1' ? 'guest1' : key === 'g2' ? 'guest2' : (key as SpeakerKey);
      continue;
    }

    const close = trimmed.match(/^\[\/\s*(s1|s2|guest1|guest2|g1|g2)\s*\]$/i);
    if (close) {
      currentSpeaker = null;
      continue;
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
    frag.appendChild(div);
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
}
