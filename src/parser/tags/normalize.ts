export function normalizeTags(text: string) {
  // Minimal normalization: trim and normalize line endings
  return String(text || '').replace(/\r\n/g, '\n').trim();
}

export { };

