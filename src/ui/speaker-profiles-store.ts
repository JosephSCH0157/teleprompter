import type { AsrThresholds } from '../asr/asr-thresholds';

export type SpeakerSlot = 's1' | 's2' | 'g1' | 'g2';

export type SpeakerProfile = {
  id: string;
  name: string;
  note?: string;
  asrTweaks?: Partial<AsrThresholds>;
  system?: boolean;
};

type SpeakerProfilesState = {
  profiles: SpeakerProfile[];
  bindings: Record<SpeakerSlot, string | null>;
  activeSlot: SpeakerSlot;
};

const STORAGE_KEY = 'tp_speaker_profiles_v1';
const BINDING_EVENT = 'tp:speaker:bindings';
const ACTIVE_SPEAKER_EVENT = 'tp:speaker:active';

const DEFAULT_PROFILES: SpeakerProfile[] = [
  { id: 'default-s1', name: 'Default S1', system: true },
  { id: 'default-s2', name: 'Default S2', system: true },
];

const DEFAULT_BINDINGS: Record<SpeakerSlot, string | null> = {
  s1: 'default-s1',
  s2: 'default-s2',
  g1: null,
  g2: null,
};

const DEFAULT_ACTIVE_SLOT: SpeakerSlot = 's1';
const VALID_SLOTS: SpeakerSlot[] = ['s1', 's2', 'g1', 'g2'];

const subscribers = new Set<(bindings: Record<SpeakerSlot, string | null>) => void>();
const activeSubscribers = new Set<(slot: SpeakerSlot) => void>();

function normalizeSlot(slot: unknown): SpeakerSlot {
  if (typeof slot !== 'string') return DEFAULT_ACTIVE_SLOT;
  if (VALID_SLOTS.includes(slot as SpeakerSlot)) return slot as SpeakerSlot;
  return DEFAULT_ACTIVE_SLOT;
}

function readStorage(): SpeakerProfilesState {
  if (typeof window === 'undefined') {
    return {
      profiles: [...DEFAULT_PROFILES],
      bindings: { ...DEFAULT_BINDINGS },
      activeSlot: DEFAULT_ACTIVE_SLOT,
    };
  }
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) throw new Error('missing');
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') throw new Error('bad');
    const profiles: SpeakerProfile[] = Array.isArray(parsed.profiles)
      ? parsed.profiles
      : [];
    const bindings = typeof parsed.bindings === 'object' && parsed.bindings
      ? (parsed.bindings as Record<SpeakerSlot, string | null>)
      : {};
    const activeSlot = normalizeSlot((parsed as any)?.activeSlot);
    return {
      profiles,
      bindings: {
        ...DEFAULT_BINDINGS,
        ...bindings,
      },
      activeSlot,
    };
  } catch {
    return {
      profiles: [...DEFAULT_PROFILES],
      bindings: { ...DEFAULT_BINDINGS },
      activeSlot: DEFAULT_ACTIVE_SLOT,
    };
  }
}

function writeStorage(state: SpeakerProfilesState): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // ignore
  }
}

function notifyBindings(): void {
  const bindings = getSpeakerBindings();
  try {
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent(BINDING_EVENT, { detail: { bindings } }));
    }
  } catch {}
  try {
    window?.sendToDisplay?.({ type: 'speaker-bindings', bindings });
  } catch {}
  subscribers.forEach((cb) => {
    try {
      cb(bindings);
    } catch {
      // ignore
    }
  });
}

function notifyActiveSpeaker(): void {
  const slot = getActiveSpeakerSlot();
  try {
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent(ACTIVE_SPEAKER_EVENT, { detail: { slot } }));
    }
  } catch {}
  try {
    window?.sendToDisplay?.({ type: 'speaker-active', slot });
  } catch {}
  activeSubscribers.forEach((cb) => {
    try {
      cb(slot);
    } catch {
      // ignore
    }
  });
}

let state = readStorage();
writeStorage(state);
notifyBindings();
notifyActiveSpeaker();

function persist(): void {
  writeStorage(state);
  notifyBindings();
  notifyActiveSpeaker();
}

export function getSpeakerProfiles(): SpeakerProfile[] {
  return state.profiles.slice();
}

export function upsertSpeakerProfile(profile: SpeakerProfile): SpeakerProfile {
  const trimmed = profile.name?.trim() || '';
  const next: SpeakerProfile = {
    ...profile,
    name: trimmed || 'Untitled',
    id: profile.id || `profile-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
  };
  state = {
    ...state,
    profiles: [
      ...state.profiles.filter((item) => item.id !== next.id),
      next,
    ],
  };
  persist();
  return next;
}

export function deleteSpeakerProfile(profileId: string): void {
  if (!profileId) return;
  const target = state.profiles.find((item) => item.id === profileId);
  if (!target || target.system) return;
  state = {
    ...state,
    profiles: state.profiles.filter((item) => item.id !== profileId),
    bindings: Object.fromEntries(
      (Object.entries(state.bindings) as Array<[SpeakerSlot, string | null]>).map(([slot, value]) => [
        slot,
        value === profileId ? null : value,
      ]),
    ) as Record<SpeakerSlot, string | null>,
  };
  persist();
}

export function getSpeakerBindings(): Record<SpeakerSlot, string | null> {
  return { ...state.bindings };
}

export function setSpeakerBinding(slot: SpeakerSlot, profileId: string | null): void {
  if (!slot) return;
  state = {
    ...state,
    bindings: {
      ...state.bindings,
      [slot]: profileId,
    },
  };
  persist();
}

export function getActiveSpeakerSlot(): SpeakerSlot {
  return state.activeSlot;
}

export function setActiveSpeakerSlot(slot: SpeakerSlot): void {
  if (!slot || !VALID_SLOTS.includes(slot)) return;
  if (state.activeSlot === slot) return;
  state = {
    ...state,
    activeSlot: slot,
  };
  persist();
}

export function subscribeActiveSpeaker(
  fn: (slot: SpeakerSlot) => void,
): () => void {
  activeSubscribers.add(fn);
  fn(getActiveSpeakerSlot());
  return () => activeSubscribers.delete(fn);
}

export function getProfileById(id: string | null): SpeakerProfile | undefined {
  if (!id) return undefined;
  return state.profiles.find((profile) => profile.id === id);
}

export function subscribeSpeakerBindings(
  fn: (bindings: Record<SpeakerSlot, string | null>) => void,
): () => void {
  subscribers.add(fn);
  fn(getSpeakerBindings());
  return () => subscribers.delete(fn);
}
