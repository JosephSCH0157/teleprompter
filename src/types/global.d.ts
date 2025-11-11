// src/types/global.d.ts
import type { ScrollMode } from '../core/mode-state';

declare global {
  interface Window {
    __tpMode?: {
      getMode(): ScrollMode;
      setMode(m: ScrollMode): void;
      onMode(cb: (m: ScrollMode) => void): () => void;
    };
  }
}
export { };

