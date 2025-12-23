// Legacy OBS wiring has been superseded by recorder-settings SSOT + obs/obs-wiring.
// Keep this module as a no-op to avoid double-binding UI or touching status elements.
export function initObsUI(): void {
  return;
}
