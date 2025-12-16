// @ts-nocheck
export {};

// src/script/validate.ts
// Minimal validator for standard tags; returns a structured report used by tools-loader.

export function validateStandardTagsText(input = '') {
  const t = String(input || '');
  const problems = [];

  // Only allowed tags (including common cue markers)
  const badTag = t.match(/\[(?!\/?(?:s1|s2|note|beat|pause|reflective pause)\b)[^\]]+\]/i);
  if (badTag) problems.push('Unknown tag: ' + badTag[0]);

  // Speaker tags on their own lines
  if (/\[(?:s1|s2)\]\s*\S/.test(t)) problems.push('Opening [s1]/[s2] must be on its own line.');
  if (/\S\s*\[\/s[12]\]\s*$/im.test(t)) problems.push('Closing [/s1]/[/s2] must be on its own line.');

  // Notes must not be inside speakers
  if (/\[(s1|s2)\][\s\S]*?\[note\][\s\S]*?\[\/note\][\s\S]*?\[\/\1\]/i.test(t))
    problems.push('[note] blocks must be outside speaker sections.');

  // Balance with a simple stack
  const stack = [];
  const tagRe = /\[(\/)?(s1|s2|note)\]/gi;
  let m;
  while ((m = tagRe.exec(t))) {
    const closing = !!m[1];
    const tag = m[2].toLowerCase();
    if (!closing) {
      stack.push(tag);
    } else {
      if (!stack.length) {
        problems.push(`Unexpected closing [/${tag}]`);
        break;
      }
      const last = stack.pop();
      if (last !== tag) {
        problems.push(`Mismatched closing [/${tag}] (expected [/${last}])`);
        break;
      }
    }
  }
  if (stack.length) problems.push('Unclosed tag(s): ' + stack.join(', '));

  return { ok: problems.length === 0, report: problems.join('\n'), problems };
}
