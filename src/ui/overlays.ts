// Legacy overlay module is disabled; TS ui-binds owns Settings/Help overlays.
export type OverlayId = 'none' | 'settings' | 'help' | 'shortcuts';

export function initOverlays(): void {
  return;
}
