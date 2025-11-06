// src/renderer/inline.ts
// Tiny inline-tag renderer with safe escaping and limited color whitelist.

type _Mode = 'on'; // placeholder for future expansion

const NAMED = /^(white|black|red|green|blue|yellow|orange|purple|turquoise|teal|gray|grey|gold|silver)$/i;
const HEX   = /^#([0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i;

const escapeHtml = (s: string) =>
  String(s).replace(/[&<>]/g, (c) => ({'&':'&amp;','<':'&lt;','>':'&gt;'}[c] as string));

const safeColor = (s: string) => HEX.test(String(s)) || NAMED.test(String(s));

export function applyInlineTags(raw: string): string {
  let s = escapeHtml(String(raw || ''));

  // pacing cues (visible)
  s = s.replace(/\[(pause|beat|reflective pause)\]/gi, (_m, cue) =>
    `<span class="tp-cue" data-cue="${String(cue).toLowerCase()}">[${cue}]</span>`);

  // bold/italic/underline
  s = s.replace(/\[b\]([\s\S]+?)\[\/b\]/gi, '<strong class="tp-b">$1<\/strong>');
  s = s.replace(/\[i\]([\s\S]+?)\[\/i\]/gi, '<em class="tp-i">$1<\/em>');
  s = s.replace(/\[u\]([\s\S]+?)\[\/u\]/gi, '<span class="tp-u">$1<\/span>');

  // color
  s = s.replace(/\[color=([#a-z0-9]+)\]([\s\S]+?)\[\/color\]/gi, (_m, col, inner) =>
    safeColor(col) ? `<span class="tp-color" style="color:${col}">${inner}</span>` : inner);

  // background
  s = s.replace(/\[bg=([#a-z0-9]+)\]([\s\S]+?)\[\/bg\]/gi, (_m, bg, inner) =>
    safeColor(bg) ? `<span class="tp-bg" style="background-color:${bg}">${inner}</span>` : inner);

  return s;
}

/** Strip note blocks that are on their own lines */
export function stripNoteBlocks(raw: string): string {
  return String(raw || '').replace(/^\[note\]\s*$[\s\S]*?^\[\/note\]\s*$/gmi, '');
}

export default applyInlineTags;
