// src/welcome-script.ts
// Builds the default welcome script that introduces Teleprompter Pro features.

const WELCOME_TEMPLATE = `
[s1]Welcome to [b]Teleprompter Pro[/b][/s1]

[s2]Hey {{userName}}, this short script walks you through the HUD and timing cues.[/s2]

[s1]Use [s2]S1 & S2[/s2] to call out who is speaking and [g1]/[g2] tags for guests.[/s1]

[s1]Styling: [b]bold[/b], [i]italic[/i], [u]underline[/u], [color=#29b6f6]color[/color], and [bg=#222][color=#ffd400]backgrounds[/color][/bg].[/s1]

[s2]Pause cues: [pause], [beat], and [reflective pause] help you breathe during the read-aloud.[/s2]

[s1]Mic calibration is required for ASR/Hybrid - pick an active profile in the sidebar before arming the mic.[/s1]

[note]Notes stay hidden when you toggle "Hide Notes" in the script sidebar.[/note]
[note]Need a deeper dive? Open Help > How it Works for the full guide.[/note]
`.trim();

export function buildWelcomeScript(displayName: string): string {
  const safeName = String(displayName || '').trim() || 'there';
  return WELCOME_TEMPLATE.replace(/\{\{userName\}\}/g, safeName);
}
