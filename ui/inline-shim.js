// ui/inline-shim.js
// Runtime JS shim providing window.applyInlineTags and window.stripNoteBlocks
// Mirrors src/renderer/inline.ts behavior for dev/CI without a TS build.
(function(){
  const NAMED = /^(white|black|red|green|blue|yellow|orange|purple|turquoise|teal|gray|grey|gold|silver)$/i;
  const HEX   = /^#([0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i;
  const escapeHtml = (s) => String(s||'').replace(/[&<>]/g, (c)=>({'&':'&amp;','<':'&lt;','>':'&gt;'}[c]));
  const safeColor = (s) => HEX.test(String(s||'')) || NAMED.test(String(s||''));
  function applyInlineTags(raw){
    let s = escapeHtml(raw);
    s = s.replace(/\[(pause|beat|reflective pause)\]/gi, (_m, cue) => `<span class="tp-cue" data-cue="${String(cue).toLowerCase()}">[${cue}]<\/span>`);
    s = s.replace(/\[b\]([\s\S]+?)\[\/b\]/gi, '<strong class="tp-b">$1<\/strong>');
    s = s.replace(/\[i\]([\s\S]+?)\[\/i\]/gi, '<em class="tp-i">$1<\/em>');
    s = s.replace(/\[u\]([\s\S]+?)\[\/u\]/gi, '<span class="tp-u">$1<\/span>');
    s = s.replace(/\[color=([#a-z0-9]+)\]([\s\S]+?)\[\/color\]/gi, (_m, col, inner) => safeColor(col) ? `<span class="tp-color" style="color:${col}">${inner}<\/span>` : inner);
    s = s.replace(/\[bg=([#a-z0-9]+)\]([\s\S]+?)\[\/bg\]/gi, (_m, bg, inner) => safeColor(bg) ? `<span class="tp-bg" style="background-color:${bg}">${inner}<\/span>` : inner);
    return s;
  }
  function stripNoteBlocks(raw){
    return String(raw||'').replace(/^\[note\]\s*$[\s\S]*?^\[\/note\]\s*$/gmi, '');
  }
  try { window.applyInlineTags = window.applyInlineTags || applyInlineTags; } catch {}
  try { window.stripNoteBlocks = window.stripNoteBlocks || stripNoteBlocks; } catch {}
})();
