// src/logic/format.ts
// Pure formatting logic extracted from the monolith's formatInlineMarkup

export type RoleStyleFn = (_key: string) => string;
export type SafeColorFn = (_c: string) => string;

/**
 * Format inline markup into safe HTML. Dependencies (safeColor, roleStyle, escapeHtml)
 * are injected to keep this module pure and testable.
 */
export function formatInlineMarkup(
  text: string,
  deps?: {
    safeColor?: SafeColorFn;
    roleStyle?: RoleStyleFn;
    escapeHtml?: (_s: string) => string;
  }
): string {
  const safeColor = deps?.safeColor || ((c: string) => (c || '').trim());
  const roleStyle = deps?.roleStyle || ((_k: string) => '');
  const escapeHtml =
    deps?.escapeHtml ||
    ((s: string) =>
      String(s).replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c] ?? '')));

  let out = escapeHtml(text);
  // basic
  out = out
    .replace(/\[b\]([\s\S]+?)\[\/b\]/gi, '<strong>$1<\/strong>')
    .replace(/\[i\]([\s\S]+?)\[\/i\]/gi, '<em>$1<\/em>')
    .replace(/\[u\]([\s\S]+?)\[\/u\]/gi, '<span class="u">$1<\/span>')
    .replace(/\[note\]([\s\S]+?)\[\/note\]/gi, '<div class="note">$1<\/div>');
  // color/bg
  out = out.replace(/\[color=([^\]]+)\]([\s\S]+?)\[\/color\]/gi, (_, col, inner) => {
    const c = safeColor(col);
    return c ? `<span style="color:${c}">${inner}</span>` : inner;
  });
  out = out.replace(/\[bg=([^\]]+)\]([\s\S]+?)\[\/bg\]/gi, (_, col, inner) => {
    const c = safeColor(col);
    return c
      ? `<span style="background:${c};padding:0 .15em;border-radius:.2em">${inner}</span>`
      : inner;
  });
  // roles
  out = out.replace(/\[s1\]([\s\S]+?)\[\/s1\]/gi, (_, inner) => `<span style="${roleStyle('s1')}">${inner}<\/span>`);
  out = out.replace(/\[s2\]([\s\S]+?)\[\/s2\]/gi, (_, inner) => `<span style="${roleStyle('s2')}">${inner}<\/span>`);
  out = out.replace(/\[(g1|g2)\]([\s\S]+?)\[\/\1\]/gi, '$2');
  out = out.replace(/\[speaker\s*=\s*(1|2)\]([\s\S]+?)\[\/speaker\]/gi, (_m, idx, inner) =>
    `<span style="${roleStyle('s' + idx)}">${inner}<\/span>`
  );
  out = out.replace(/\[guest\s*=\s*(1|2)\]([\s\S]+?)\[\/guest\]/gi, '$2');
  out = out.replace(/\[\/?(?:s1|s2|g1|g2)\]/gi, '');
  return out;
}

export default formatInlineMarkup;
