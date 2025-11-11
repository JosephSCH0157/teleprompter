// src/core/settings-types.ts
export type Theme = 'light' | 'dark' | 'system';
export type StepSize = 'line' | 'block';

export interface Settings {
  // UI/Visual
  theme: Theme;              // UI theme
  fontSize: number;          // px
  lineHeight: number;        // unitless multiplier
  mirror: boolean;           // mirror the prompter
  colorize: boolean;         // color tags on/off
  hideNotes: boolean;        // [note] sections hidden in prompter
  hud: boolean;              // HUD overlays

  // Prompting behavior
  wpm: number;               // default words per minute target
  stepSize: StepSize;        // step scroll granularity
  autoStart: boolean;        // start scrolling on load (when allowed)

  // Audio/ASR (plumbed later)
  asrLang: string;           // BCP-47 language tag (e.g., "en-US")
}

export interface SettingsEnvelope {
  v: number;           // schema version
  data: Settings;
}

export const SETTINGS_VERSION = 1;

export const DEFAULT_SETTINGS: Settings = {
  theme: 'dark',
  fontSize: 28,
  lineHeight: 1.4,
  mirror: false,
  colorize: true,
  hideNotes: true,
  hud: true,
  wpm: 165,
  stepSize: 'line',
  autoStart: false,
  asrLang: 'en-US',
};

export function clampSettings(s: Partial<Settings>): Partial<Settings> {
  const o: Partial<Settings> = { ...s };
  if (typeof o.fontSize === 'number') o.fontSize = Math.min(72, Math.max(12, o.fontSize));
  if (typeof o.lineHeight === 'number') o.lineHeight = Math.min(2.0, Math.max(1.0, o.lineHeight));
  if (typeof o.wpm === 'number') o.wpm = Math.min(300, Math.max(60, o.wpm));
  if (o.theme && !['light','dark','system'].includes(o.theme)) delete (o as any).theme;
  if (o.stepSize && !['line','block'].includes(o.stepSize)) delete (o as any).stepSize;
  return o;
}
