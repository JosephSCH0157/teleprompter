import type { AppStoreState } from '../state/app-store';

export function shouldShowHud(_state: AppStoreState): boolean {
  // TODO: Re-enable HUD once root/ui is fully migrated to TS layout
  return false;
}
