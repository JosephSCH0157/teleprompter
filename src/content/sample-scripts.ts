const STORAGE_KEY = 'tp_sample_idx';

export const SAMPLE_SCRIPTS: string[] = [
`[s1]
Welcome to Anvil.
[beat]
If you can hear me, the microphone is on.
If you can't hear me... the microphone is also on.
[pause]
It's just on in a way that refuses to participate.
[beat]
Today's episode is sponsored by:
"Windows Updates."
Windows Updates.
Because you didn't need that hour anyway.
[/s1]

[s2]
[pause]
I just watched the camera preview blink twice.
That means it's either working...
or it's about to take a coffee break.
[/s2]

[s1]
Correct.
[beat]
And if the script suddenly turns black and white,
that's not a bug.
That's a dramatic artistic choice.
[/s1]

[note]
Demonstrates speaker switching + cues.
[/note]`,

`[s1]
Alright.
[beat]
Before we begin, the teleprompter has requested a union meeting.
[pause]
It says it's tired of being blamed for "user error."
[/s1]

[s2]
[beat]
The teleprompter would like it noted:
It did not write your script.
It simply scrolls it with judgment.
[/s2]

[s1]
Exactly.
[pause]
So we're going to respect its boundaries today.
One script.
One renderer.
One source of truth.
[beat]
No side quests.
[/s1]

[s2]
And no "helpful" tabs that open eight other tabs.
[/s2]

[s1]
Especially not in Chrome.
[/s1]`,

`[s1]
Welcome back.
[pause]
This is "Road-Test Mode,"
where we verify everything works before we leave the driveway.
[beat]
Step one: can you see the words?
[/s1]

[s2]
Yes.
[/s2]

[s1]
Step two: can you see the colors?
[/s1]

[s2]
Yes.
And I feel emotionally supported by the purple [beat] boxes.
[/s2]

[s1]
Perfect.
[pause]
Step three: do not touch anything that says "experimental."
[/s1]

[s2]
Too late.
[/s2]

[s1]
[reflective pause]
Of course.
[/s1]`,
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
