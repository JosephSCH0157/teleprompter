/* eslint-disable @typescript-eslint/consistent-type-imports */
import { type DeepPartial, type TpProfileV1 } from './profile-schema';
import { ProfileStore } from './profile-store';

export type ProfilePersister = {
  persist(patch: DeepPartial<TpProfileV1>): void;
  flush(): Promise<void>;
};

export type ProfilePersisterOptions = {
  delayMs?: number;
};

export function createProfilePersister(
  store: ProfileStore,
  options?: ProfilePersisterOptions,
): ProfilePersister {
  const delayMs = Number.isFinite(options?.delayMs ?? NaN) ? options!.delayMs! : 450;
  let pending: DeepPartial<TpProfileV1> | null = null;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let saving: Promise<TpProfileV1> | null = null;

  const isObject = (value: unknown): value is Record<string, any> =>
    !!value && typeof value === 'object' && !Array.isArray(value);

  const merge = (
    base: Record<string, any> | null,
    patch: Record<string, any>,
  ): Record<string, any> => {
    if (!base) return patch;
    const out: Record<string, any> = Array.isArray(base) ? [...base] : { ...base };
    for (const [key, value] of Object.entries(patch)) {
      if (value === undefined) continue;
      const existing = out[key];
      if (isObject(existing) && isObject(value)) {
        out[key] = merge(existing, value);
      } else {
        out[key] = value;
      }
    }
    return out;
  };

  const scheduleFlush = () => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => void flush(), delayMs);
  };

  const flush = async (): Promise<void> => {
    if (!pending) return;
    const patch = pending;
    pending = null;
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }
    try {
      saving = store.saveProfilePatch(patch);
      await saving;
    } finally {
      saving = null;
    }
  };

  const persist = (patch: DeepPartial<TpProfileV1>) => {
    pending = merge(pending ?? {}, patch as Record<string, any>) as DeepPartial<TpProfileV1>;
    scheduleFlush();
  };

  return {
    persist,
    flush,
  };
}
