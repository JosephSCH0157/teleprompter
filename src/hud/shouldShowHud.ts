import type { AppStoreState } from '../state/app-store';

export function shouldShowHud(state: AppStoreState): boolean {
  const hudSupported = !!state?.hudSupported;
  const hudEnabledByUser = !!state?.hudEnabledByUser;
  const page = state?.page || 'scripts';

  if (!hudSupported) return false;
  if (!hudEnabledByUser) return false;

  // Show HUD on all pages except explicit display mode
  return page !== 'display';
}
