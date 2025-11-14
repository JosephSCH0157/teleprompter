// sanitize.ts — prepares script or hypothesis text for matching
// Removes bracketed cues ([pause]/[beat]/[note]/etc) and normalizes punctuation
// so the matcher focuses on semantic tokens.

export function sanitizeForMatch(s: string): string {
  return String(s || '')
    .toLowerCase()
    .replace(/\[[^\]]+]/g, '')      // strip [pause]/[beat]/[note]/etc
    .replace(/[“”"']/g, '')          // remove quotes entirely
    .replace(/[—–]/g, '-')            // normalize dash variants
    .replace(/[^\w\s-]/g, '')       // drop other punctuation
    .replace(/\s+/g, ' ')            // collapse whitespace
    .trim();
}

// Convenience token helper built atop sanitizeForMatch
export function sanitizedTokens(s: string): string[] {
  return sanitizeForMatch(s)
    .split(' ')
    .filter(Boolean);
}

try { (window as any).sanitizeForMatch = sanitizeForMatch; } catch {}
