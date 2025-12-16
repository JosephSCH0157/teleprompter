// @ts-nocheck
export {};

// src/script/validate.ts
// Minimal validator for standard tags; returns a structured report used by tools-loader.

const BLOCK_TAGS = ['s1', 's2', 'g1', 'g2', 'note'];
const CUE_TAGS = ['pause', 'beat', 'reflective pause'];
const SPEAKER_TAGS = ['s1', 's2', 'g1', 'g2'];

export function validateStandardTagsText(input = '') {
  const t = String(input || '');
  const problems = [];

  const allowedTagPattern = [...BLOCK_TAGS, ...CUE_TAGS].join('|');
  const badTag = t.match(new RegExp(`\\[(?!\\/?(?:${allowedTagPattern})\\b)[^\\]]+\\]`, 'i'));
  if (badTag) problems.push('Unknown tag: ' + badTag[0]);

  const speakerPattern = SPEAKER_TAGS.join('|');
  if (new RegExp(`\\[(?:${speakerPattern})\\]\\s*\\S`, 'i').test(t))
    problems.push('Opening speaker tags must be on their own line.');
  if (new RegExp(`\\S\\s*\\[\\/(?:${speakerPattern})\\]\\s*$`, 'im').test(t))
    problems.push('Closing speaker tags must be on their own line.');

  // Notes must not be inside speakers
  if (new RegExp(`\\[(${speakerPattern})\\][\\s\\S]*?\\[note\\][\\s\\S]*?\\[\\/note\\][\\s\\S]*?\\[\\/\\1\\]`, 'i').test(t))
    problems.push('[note] blocks must be outside speaker sections.');

  // Balance with a simple stack
  const stack = [];
  const tagRe = new RegExp(`\\[(\\/)?(${BLOCK_TAGS.join('|')})\\]`, 'gi');
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
