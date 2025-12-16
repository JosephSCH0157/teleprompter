// Shared tag definitions used across normalization and validation.
export const BLOCK_TAG_NAMES = ['s1', 's2', 'g1', 'g2', 'note'];
export const CUE_TAG_NAMES = ['pause', 'beat', 'reflective pause'];
export const INLINE_TAG_BASES = ['color', 'bg', 'speaker', 'guest', 'b', 'i'];
export const INLINE_TAG_NAMES = INLINE_TAG_BASES.flatMap((tag) => [tag, `/${tag}`]);
export const INLINE_ATTR_PATTERNS = [
  ...INLINE_TAG_BASES.map((tag) => `${tag}(?:=[^\\]]+)?`),
  ...INLINE_TAG_BASES.map((tag) => `/${tag}`),
];

export const SPEAKER_TAG_NAMES = BLOCK_TAG_NAMES.filter((tag) => tag !== 'note');
export const ALLOWED_NORMALIZED_TAG_NAMES = [
  ...BLOCK_TAG_NAMES,
  ...CUE_TAG_NAMES,
  ...INLINE_TAG_NAMES,
];
