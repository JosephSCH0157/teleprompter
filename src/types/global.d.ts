// src/types/global.d.ts
import type { ScrollMode } from '../core/mode-state';
import type { Settings } from '../core/settings-types';

declare global {
  interface Window {
    __tpMode?: {
      getMode(): ScrollMode;
      setMode(m: ScrollMode): void;
      onMode(cb: (m: ScrollMode) => void): () => void;
    };
    __tpSettings?: {
      get(): Settings;
      set(s: Settings): void;
      patch(p: Partial<Settings>): void;
      on(cb: (s: Settings, why: 'init'|'set'|'patch'|'migrate') => void): () => void;
    };
    __tpFolder?: {
      get(): FileSystemDirectoryHandle | null;
      pick(): Promise<boolean>;
      clear(): Promise<void>;
      list(): Promise<{ name: string; handle: FileSystemFileHandle }[]>;
    };
  }
}
export { };

