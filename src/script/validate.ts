// @ts-nocheck
import {
  BLOCK_TAG_NAMES,
  CUE_TAG_NAMES,
  INLINE_ATTR_PATTERNS,
  SPEAKER_TAG_NAMES,
} from './tag-constants';

export {};

// src/script/validate.ts
// Minimal validator for standard tags; returns a structured report used by tools-loader.
export function validateStandardTagsText(input = '') {
  const t = String(input || '');
  const problems = [];

  const allowedTagPattern = [
    ...BLOCK_TAG_NAMES,
    ...CUE_TAG_NAMES,
    ...INLINE_ATTR_PATTERNS,
  ].join('|');
  const badTag = t.match(new RegExp(`\\[(?!\\/?(?:${allowedTagPattern})\\b)[^\\]]+\\]`, 'i'));
  if (badTag) problems.push('Unknown tag: ' + badTag[0]);

  const speakerPattern = SPEAKER_TAG_NAMES.join('|');
  if (new RegExp(`\\[(?:${speakerPattern})\\]\\s*\\S`, 'i').test(t))
    problems.push('Opening speaker tags must be on their own line.');
  if (new RegExp(`\\S\\s*\\[\\/(?:${speakerPattern})\\]\\s*$`, 'im').test(t))
    problems.push('Closing speaker tags must be on their own line.');

  // Notes must not be inside speakers
  if (new RegExp(`\\[(${speakerPattern})\\][\\s\\S]*?\\[note\\][\\s\\S]*?\\[\\/note\\][\\s\\S]*?\\[\\/\\1\\]`, 'i').test(t))
    problems.push('[note] blocks must be outside speaker sections.');

  // Balance with a simple stack
  const stack = [];
  const tagRe = new RegExp(`\\[(\\/)?(${BLOCK_TAG_NAMES.join('|')})\\]`, 'gi');
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
