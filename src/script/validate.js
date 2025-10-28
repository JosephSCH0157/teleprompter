// src/script/validate.js
// Minimal validator for standard tags; returns a structured report used by tools-loader.

export function validateStandardTagsText(input = '') {
  const t = String(input || '');
  const problems = [];

  // Only allowed tags
  const badTag = t.match(/\[(?!\/?(?:s1|s2|note)\b)[^\]]+\]/i);
  if (badTag) problems.push('Unknown tag: ' + badTag[0]);

  // Speaker tags on their own lines
  if (/\[(?:s1|s2)\]\s*\S/.test(t)) problems.push('Opening [s1]/[s2] must be on its own line.');
  if (/\S\s*\[\/s[12]\]\s*$/im.test(t)) problems.push('Closing [/s1]/[/s2] must be on its own line.');

  // Notes must not be inside speakers
  if (/\[(s1|s2)\][\s\S]*?\[note\][\s\S]*?\[\/note\][\s\S]*?\[\/\1\]/i.test(t))
    problems.push('[note] blocks must be outside speaker sections.');

  // Balance with a simple stack
  const re = /\[(\/?)(s1|s2|note)\]/gi;
  const stack = [];
  let m;
  while ((m = re.exec(t))) {
    const [, close, tag] = m;
    if (!close) stack.push(tag);
    else {
      const top = stack.pop();
      if (top !== tag) problems.push(`Mismatched closing [/${tag}] near index ${m.index}`);
    }
  }
  if (stack.length) problems.push('Unclosed tag(s): ' + stack.join(', '));

  const report = problems.length ? 'Markup issues:\n- ' + problems.join('\n- ') : 'Markup conforms to the standard.';
  return { report };
}
