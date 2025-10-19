// src/logic/format.ts
// Pure formatting logic extracted from the monolith's formatInlineMarkup
/**
 * Format inline markup into safe HTML. Dependencies (safeColor, roleStyle, escapeHtml)
 * are injected to keep this module pure and testable.
 */
export function formatInlineMarkup(text, deps) {
    const safeColor = deps?.safeColor || ((c) => (c || '').trim());
    const roleStyle = deps?.roleStyle || ((k) => '');
    const escapeHtml = deps?.escapeHtml ||
        ((s) => String(s).replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c] ?? '')));
    let s = escapeHtml(text);
    // basic
    s = s
        .replace(/\[b\]([\s\S]+?)\[\/b\]/gi, '<strong>$1<\/strong>')
        .replace(/\[i\]([\s\S]+?)\[\/i\]/gi, '<em>$1<\/em>')
        .replace(/\[u\]([\s\S]+?)\[\/u\]/gi, '<span class="u">$1<\/span>')
        .replace(/\[note\]([\s\S]+?)\[\/note\]/gi, '<div class="note">$1<\/div>');
    // color/bg
    s = s.replace(/\[color=([^\]]+)\]([\s\S]+?)\[\/color\]/gi, (_, col, inner) => {
        const c = safeColor(col);
        return c ? `<span style="color:${c}">${inner}</span>` : inner;
    });
    s = s.replace(/\[bg=([^\]]+)\]([\s\S]+?)\[\/bg\]/gi, (_, col, inner) => {
        const c = safeColor(col);
        return c
            ? `<span style="background:${c};padding:0 .15em;border-radius:.2em">${inner}</span>`
            : inner;
    });
    // roles
    s = s.replace(/\[s1\]([\s\S]+?)\[\/s1\]/gi, (_, inner) => `<span style="${roleStyle('s1')}">${inner}<\/span>`);
    s = s.replace(/\[s2\]([\s\S]+?)\[\/s2\]/gi, (_, inner) => `<span style="${roleStyle('s2')}">${inner}<\/span>`);
    s = s.replace(/\[(g1|g2)\]([\s\S]+?)\[\/\1\]/gi, '$2');
    s = s.replace(/\[speaker\s*=\s*(1|2)\]([\s\S]+?)\[\/speaker\]/gi, (_, idx, inner) => `<span style="${roleStyle('s' + idx)}">${inner}<\/span>`);
    s = s.replace(/\[guest\s*=\s*(1|2)\]([\s\S]+?)\[\/guest\]/gi, '$2');
    s = s.replace(/\[\/?(?:s1|s2|g1|g2)\]/gi, '');
    return s;
}
export default formatInlineMarkup;
