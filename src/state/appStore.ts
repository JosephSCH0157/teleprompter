import type { AppStore } from './app-store';

/**
 * Helper to read the global app store exposed via window.__tpStore.
 */
export function getAppStore(): AppStore | null {
  if (typeof window === 'undefined') return null;
  try {
    const store = (window as any).__tpStore;
    return store || null;
  } catch {
    return null;
  }
}
