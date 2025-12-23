// src/format-inline.ts
// Inline markup → HTML for the viewer/display.
// Mirrors legacy behavior so tags like [s1]...[/s1] and [color=#f80]...[/color] render correctly.

export type SpeakerKey = 's1' | 's2' | 'g1' | 'g2';

interface RoleDef {
  name: string;
  color: string;
}

const ROLE_DEFAULTS: Record<SpeakerKey, RoleDef> = {
  // Match legacy Speaker defaults; still defer to CSS vars when provided.
  s1: { name: 'S1', color: 'var(--s1-color, #60a5fa)' }, // Joe light blue
  s2: { name: 'S2', color: 'var(--s2-color, #facc15)' }, // Brad yellow
  g1: { name: 'G1', color: 'var(--g1-color, #34d399)' }, // Guest 1 green
  g2: { name: 'G2', color: 'var(--g2-color, #f472b6)' }, // Guest 2 pink
};

// In the monolith this is hydrated from localStorage/settings; use defaults for now.
let ROLES: Record<SpeakerKey, RoleDef> = { ...ROLE_DEFAULTS };

function escapeHtml(s: unknown): string {
  return String(s).replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]!));
}

function safeColor(c: unknown): string {
  const s = String(c ?? '').trim();
  if (/^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(s)) return s;
  if (/^rgba?\(/i.test(s)) return s;
  if (/^[a-z]{3,20}$/i.test(s)) return s; // simple keyword
  return '';
}

function roleStyle(key: string): string {
  const k = (key.toLowerCase() as SpeakerKey) in ROLES ? (key.toLowerCase() as SpeakerKey) : 's1';
  const item = ROLES[k];
  return `color:${item.color}; font-size:inherit; line-height:inherit;`;
}

/**
 * Apply inline markup:
 * - [b]/[i]/[u]
 * - [note]…[/note]
 * - [color=...]/[bg=...]
 * - [s1]/[s2]/[g1]/[g2]
 * - [speaker=1]/[speaker=2]
 * - strip any stray [s1]/[/s1]/etc that remain
 */
export function formatInlineMarkup(text: string): string {
  let s = escapeHtml(text);

  // Basic inline styles
  s = s
    .replace(/\[b\]([\s\S]+?)\[\/b\]/gi, '<strong>$1</strong>')
    .replace(/\[i\]([\s\S]+?)\[\/i\]/gi, '<em>$1</em>')
    .replace(/\[u\]([\s\S]+?)\[\/u\]/gi, '<span class="u">$1</span>')
    .replace(/\[note\]([\s\S]+?)\[\/note\]/gi, '<div class="note">$1</div>');

  // Colors
  s = s.replace(/\[color=([^\]]+)\]([\s\S]+?)\[\/color\]/gi, (_m, col, inner) => {
    const c = safeColor(col);
    return c ? `<span style="color:${c}">${inner}</span>` : inner;
  });

  // Background highlight
  s = s.replace(/\[bg=([^\]]+)\]([\s\S]+?)\[\/bg\]/gi, (_m, col, inner) => {
    const c = safeColor(col);
    return c
      ? `<span style="background:${c};padding:0 .15em;border-radius:.2em">${inner}</span>`
      : inner;
  });

  // Speaker blocks
  s = s.replace(/\[s1\]([\s\S]+?)\[\/s1\]/gi, (_m, inner) => `<span style="${roleStyle('s1')}">${inner}</span>`);
  s = s.replace(/\[s2\]([\s\S]+?)\[\/s2\]/gi, (_m, inner) => `<span style="${roleStyle('s2')}">${inner}</span>`);

  // Guest blocks (pass-through for now)
  s = s.replace(/\[(g1|g2)\]([\s\S]+?)\[\/\1\]/gi, '$2');

  // Generic speaker/guest
  s = s.replace(/\[speaker\s*=\s*(1|2)\]([\s\S]+?)\[\/speaker\]/gi, (_m, idx, inner) => {
    return `<span style="${roleStyle('s' + String(idx))}">${inner}</span>`;
  });
  s = s.replace(/\[guest\s*=\s*(1|2)\]([\s\S]+?)\[\/guest\]/gi, '$2');

  // Strip any leftover tags
  s = s.replace(/\[\/?(?:s1|s2|g1|g2)\]/gi, '');

  // Highlight pacing cues so they feel rendered
  s = s.replace(/\[(pause|beat|reflective pause)\]/gi, (_m, cue) => {
    const normalized = String(cue || '').toLowerCase();
    return `<span class="tp-cue" data-cue="${normalized}">[${cue}]</span>`;
  });

  return s;
}

// Optional: expose to window for legacy callers/devtools
try {
  (window as any).formatInlineMarkup = formatInlineMarkup;
} catch {
  // non-browser
}
