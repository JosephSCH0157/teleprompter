export interface AppStoreSnapshot {
  autoRecord?: boolean;
  obsEnabled?: boolean;
  [key: string]: unknown;
}

export interface AppStore {
  getSnapshot?: () => AppStoreSnapshot;
  state?: AppStoreSnapshot;
  get?: (key: string) => unknown;
}

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
