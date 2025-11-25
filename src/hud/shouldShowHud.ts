import type { AppStoreState } from '../state/app-store';

export function shouldShowHud(state: Partial<AppStoreState> | null | undefined): boolean {
  try {
    const snap = state || {};
    const supported = !!(snap as any).hudSupported;
    const enabled = !!(snap as any).hudEnabledByUser;
    return supported && enabled;
  } catch {
    return false;
  }
}
