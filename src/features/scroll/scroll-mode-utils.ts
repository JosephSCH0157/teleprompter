import type { ScrollMode } from './mode-router';

const ALLOWED_MODES: ScrollMode[] = ['timed', 'wpm', 'hybrid', 'asr', 'step', 'rehearsal', 'auto', 'off'];
const AUTO_ALLOWED: ScrollMode[] = ['timed', 'wpm', 'hybrid', 'auto'];

function sanitize(raw?: string | null): string {
  const value = String(raw || '').trim().toLowerCase();
  if (value === 'manual') return 'step';
  return value;
}

export function normalizeScrollMode(raw?: string | null): ScrollMode {
  const candidate = sanitize(raw);
  return (candidate === 'auto' || ALLOWED_MODES.includes(candidate as ScrollMode))
    ? (candidate as ScrollMode)
    : 'hybrid';
}

export function shouldAutoStartForMode(raw?: string | null): boolean {
  const mode = normalizeScrollMode(raw);
  return AUTO_ALLOWED.includes(mode);
}

export function isAsrMode(raw?: string | null): boolean {
  return normalizeScrollMode(raw) === 'asr';
}
