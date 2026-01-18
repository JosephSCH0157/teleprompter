// src/profile/profile-schema.ts
// Teleprompter/Anvil user profile schema (v1)

export const PROFILE_SCHEMA_VERSION = 1 as const;

export type ThemeMode = "dark" | "light" | "system";
export type ScrollMode = "timed" | "wpm" | "asr" | "hybrid" | "off";
export type WindowRole = "main" | "display";
export type HighlightMode = "off" | "line" | "block";
export type HexColor = `#${string}`;

export interface TpProfileV1 {
  version: 1;

  identity: {
    userId?: string;
    displayName?: string;
  };

  ui: {
    theme: ThemeMode;

    panels: {
      settingsOpen: boolean;
      speakersOpen: boolean;
      helpOpen: boolean;
      hudOpen: boolean;
    };

    windows: Record<
      WindowRole,
      {
        typography: {
          fontSizePx: number;
          lineHeight: number;
          letterSpacingEm: number;
          maxLineWidthPx: number | null;
        };
        layout: {
          markerY: number; // 0..1
          paddingTopPx: number;
          paddingBottomPx: number;
        };
        highlight: {
          mode: HighlightMode;
          color: HexColor;
          intensity: number; // 0..1
        };
      }
    >;

    scriptView: {
      showPacingCues: boolean;
      hideNotes: boolean;
      showSpeakerTags: boolean;
    };
  };

  scroll: {
    mode: ScrollMode;

    wpm: {
      value: number;
      min: number;
      max: number;
      wplHint: number;
    };

    timed: {
      pxPerSec: number;
      minPxPerSec: number;
      maxPxPerSec: number;
    };

    hybrid: {
      ctrlEnabled: boolean;
      sensitivity: number;
      assistMax: number;
      brakeMin: number;
      confMin: number;
    };

    behavior: {
      autoStartOnLive: boolean;
      autoStopOnEnd: boolean;
    };
  };

  asr: {
    language: string;
    preferredMicDeviceId: string | null;

    tuning: {
      confidenceFloor: number; // 0..1
      lagCompMs: number;
      winBackLines: number;
      winAheadLines: number;
    };
  };

  workflow: {
    lastSpeakerProfileId: string | null;

    lastScript: {
      folderKey: string | null;
      fileKey: string | null;
      reopenOnBoot: boolean;
    };
  };

  integrations: {
    obs: {
      enabled: boolean;
      websocketUrl: string;
      password: string | null;
      sceneName: string | null;
      sourceName: string | null;
      autoRecord: boolean;
    };
  };

  dev: {
    logVerbosity: "quiet" | "normal" | "loud";
    hybridLogThrottleMs: number;
  };
}

export type AnyProfile = Record<string, unknown>;

export type DeepPartial<T> = {
  [K in keyof T]?: T[K] extends (infer U)[]
    ? DeepPartial<U>[]
    : T[K] extends object
      ? DeepPartial<T[K]>
      : T[K];
};

export function profilePatch(p: DeepPartial<TpProfileV1>): DeepPartial<TpProfileV1> {
  return p;
}

export function defaultProfileV1(): TpProfileV1 {
  return {
    version: 1,
    identity: {},
    ui: {
      theme: "dark",
      panels: {
        settingsOpen: false,
        speakersOpen: false,
        helpOpen: false,
        hudOpen: false,
      },
      windows: {
        main: {
          typography: {
            fontSizePx: 56,
            lineHeight: 1.4,
            letterSpacingEm: 0,
            maxLineWidthPx: null,
          },
          layout: { markerY: 0.33, paddingTopPx: 16, paddingBottomPx: 16 },
          highlight: { mode: "line", color: "#ffd400", intensity: 0.35 },
        },
        display: {
          typography: {
            fontSizePx: 56,
            lineHeight: 1.4,
            letterSpacingEm: 0,
            maxLineWidthPx: null,
          },
          layout: { markerY: 0.33, paddingTopPx: 16, paddingBottomPx: 16 },
          highlight: { mode: "line", color: "#ffd400", intensity: 0.35 },
        },
      },
      scriptView: {
        showPacingCues: true,
        hideNotes: true,
        showSpeakerTags: true,
      },
    },
    scroll: {
      mode: "wpm",
      wpm: { value: 140, min: 60, max: 260, wplHint: 8 },
      timed: { pxPerSec: 40, minPxPerSec: 5, maxPxPerSec: 220 },
      hybrid: {
        ctrlEnabled: true,
        sensitivity: 1.0,
        assistMax: 1.25,
        brakeMin: 0.65,
        confMin: 0.25,
      },
      behavior: { autoStartOnLive: false, autoStopOnEnd: false },
    },
    asr: {
      language: "en-US",
      preferredMicDeviceId: null,
      tuning: {
        confidenceFloor: 0.25,
        lagCompMs: 150,
        winBackLines: 3,
        winAheadLines: 6,
      },
    },
    workflow: {
      lastSpeakerProfileId: null,
      lastScript: { folderKey: null, fileKey: null, reopenOnBoot: true },
    },
    integrations: {
      obs: {
        enabled: false,
        websocketUrl: "ws://127.0.0.1:4455",
        password: null,
        sceneName: null,
        sourceName: null,
        autoRecord: false,
      },
    },
    dev: { logVerbosity: "normal", hybridLogThrottleMs: 500 },
  };
}

export function applyProfilePatch(base: TpProfileV1, patch: DeepPartial<TpProfileV1>): TpProfileV1 {
  const merged = deepMerge(
    base as unknown as AnyProfile,
    patch as unknown as AnyProfile,
  ) as AnyProfile;
  return coerceProfile(merged);
}

/** Normalize + clamp anything coming from Supabase/local */
export function coerceProfile(input: AnyProfile | null | undefined): TpProfileV1 {
  if (!input || typeof input !== "object") return defaultProfileV1();

  const migrated = migrateProfile(input);
  const p = deepMerge(
    defaultProfileV1() as unknown as AnyProfile,
    migrated as unknown as AnyProfile,
  ) as unknown as TpProfileV1;

  const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
  const clamp01 = (v: number) => clamp(v, 0, 1);

  for (const role of ["main", "display"] as const) {
    const t = p.ui.windows[role].typography;
    t.fontSizePx = clamp(num(t.fontSizePx, 56), 18, 140);
    t.lineHeight = clamp(num(t.lineHeight, 1.4), 1.0, 2.4);
    t.letterSpacingEm = clamp(num(t.letterSpacingEm, 0), -0.1, 0.2);
    t.maxLineWidthPx = t.maxLineWidthPx == null ? null : clamp(num(t.maxLineWidthPx, 600), 240, 2000);

    const l = p.ui.windows[role].layout;
    l.markerY = clamp01(num(l.markerY, 0.33));
    l.paddingTopPx = clamp(num(l.paddingTopPx, 16), 0, 200);
    l.paddingBottomPx = clamp(num(l.paddingBottomPx, 16), 0, 200);

    const h = p.ui.windows[role].highlight;
    h.intensity = clamp01(num(h.intensity, 0.35));
  }

  p.scroll.wpm.min = clamp(num(p.scroll.wpm.min, 60), 10, 600);
  p.scroll.wpm.max = clamp(num(p.scroll.wpm.max, 260), 10, 600);
  if (p.scroll.wpm.min > p.scroll.wpm.max) {
    const tmp = p.scroll.wpm.min;
    p.scroll.wpm.min = p.scroll.wpm.max;
    p.scroll.wpm.max = tmp;
  }
  p.scroll.wpm.value = clamp(num(p.scroll.wpm.value, 140), p.scroll.wpm.min, p.scroll.wpm.max);
  p.scroll.wpm.wplHint = clamp(num(p.scroll.wpm.wplHint, 8), 3, 30);

  p.scroll.timed.minPxPerSec = clamp(num(p.scroll.timed.minPxPerSec, 5), 0.1, 2000);
  p.scroll.timed.maxPxPerSec = clamp(num(p.scroll.timed.maxPxPerSec, 220), 0.1, 2000);
  if (p.scroll.timed.minPxPerSec > p.scroll.timed.maxPxPerSec) {
    const tmp = p.scroll.timed.minPxPerSec;
    p.scroll.timed.minPxPerSec = p.scroll.timed.maxPxPerSec;
    p.scroll.timed.maxPxPerSec = tmp;
  }
  p.scroll.timed.pxPerSec = clamp(num(p.scroll.timed.pxPerSec, 40), p.scroll.timed.minPxPerSec, p.scroll.timed.maxPxPerSec);

  p.scroll.hybrid.sensitivity = clamp(num(p.scroll.hybrid.sensitivity, 1.0), 0.25, 3);
  p.scroll.hybrid.assistMax = clamp(num(p.scroll.hybrid.assistMax, 1.25), 1.0, 3.0);
  p.scroll.hybrid.brakeMin = clamp(num(p.scroll.hybrid.brakeMin, 0.65), 0.1, 1.0);
  p.scroll.hybrid.confMin = clamp01(num(p.scroll.hybrid.confMin, 0.25));

  p.asr.tuning.confidenceFloor = clamp01(num(p.asr.tuning.confidenceFloor, 0.25));
  p.asr.tuning.lagCompMs = clamp(num(p.asr.tuning.lagCompMs, 150), 0, 2000);
  p.asr.tuning.winBackLines = clamp(num(p.asr.tuning.winBackLines, 3), 0, 80);
  p.asr.tuning.winAheadLines = clamp(num(p.asr.tuning.winAheadLines, 6), 0, 120);

  p.dev.hybridLogThrottleMs = clamp(num(p.dev.hybridLogThrottleMs, 500), 0, 5000);

  return p;
}

export function migrateProfile(input: AnyProfile): AnyProfile {
  const v = typeof (input as any).version === "number" ? (input as any).version : 0;

  // v0 -> v1: accept legacy keys if they exist
  if (v <= 0) {
    const out: AnyProfile = { ...input, version: 1 };
    const legacyWpl = safeNum((input as any).tp_wpl_hint ?? (input as any).wplHint ?? null);
    if (legacyWpl != null) {
      (out as any).scroll = (out as any).scroll ?? {};
      (out as any).scroll.wpm = (out as any).scroll.wpm ?? {};
      (out as any).scroll.wpm.wplHint = legacyWpl;
    }
    return out;
  }

  return input;
}

function num(v: unknown, fallback: number): number {
  const n = safeNum(v);
  return n == null ? fallback : n;
}

function safeNum(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string") {
    const n = parseFloat(v);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function isPlainObject(v: unknown): v is Record<string, any> {
  return !!v && typeof v === "object" && !Array.isArray(v);
}

function deepMerge<T extends Record<string, any>>(base: T, patch: Record<string, any>): T {
  const out: any = Array.isArray(base) ? [...base] : { ...base };
  for (const [k, v] of Object.entries(patch || {})) {
    if (v === undefined) continue;
    const bv = out[k];
    if (isPlainObject(bv) && isPlainObject(v)) out[k] = deepMerge(bv, v);
    else out[k] = v;
  }
  return out;
}
