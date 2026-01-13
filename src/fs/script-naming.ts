const INVALID_FILENAME_CHARS = /[<>:"/\\|?*\x00-\x1F]/g;

export function sanitizeScriptFilename(raw: string): string {
  const trimmed = String(raw || '').trim() || 'Untitled';
  const cleaned = trimmed.replace(INVALID_FILENAME_CHARS, '').trim() || 'Untitled';
  if (/\.(txt)$/i.test(cleaned)) {
    return cleaned;
  }
  return `${cleaned}.txt`;
}

export function scriptBaseName(filename: string): string {
  const idx = filename.lastIndexOf('.');
  if (idx > 0) {
    return filename.substring(0, idx);
  }
  return filename;
}
