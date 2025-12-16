const STORAGE_KEY = 'tp_sample_idx';

export const SAMPLE_SCRIPTS: string[] = [
`[s1]
Welcome to Teleprompter Pro.
[/s1]

[s1]
Use roles.
[pause]
Use notes.
[beat]
And use colors like [color=#ff0]this[/color].
[/s1]

[note]
Try scrolling, pausing, and switching speakers to get a feel for the tool.
[/note]

[s2]
Now you're looking at Brad's section.
[reflective pause]
Short lines read easier.
[/s2]`,
];

function readStoredIndex(): number {
  if (typeof window === 'undefined') return -1;
  try {
    const raw = window.localStorage?.getItem?.(STORAGE_KEY);
    if (!raw) return -1;
    const parsed = parseInt(raw, 10);
    return Number.isNaN(parsed) ? -1 : parsed;
  } catch {
    return -1;
  }
}

function persistIndex(index: number): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage?.setItem?.(STORAGE_KEY, String(index));
  } catch {}
}

export function getNextSampleScript(): string {
  if (!SAMPLE_SCRIPTS.length) return '';
  const lastIndex = readStoredIndex();
  const nextIndex = (lastIndex + 1) % SAMPLE_SCRIPTS.length;
  persistIndex(nextIndex);
  return SAMPLE_SCRIPTS[nextIndex];
}
