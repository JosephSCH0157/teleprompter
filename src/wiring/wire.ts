// Legacy OBS wiring disabled: recorder-settings + obs-wiring own OBS enable/status.
// Keep initSettingsWiring as a no-op to avoid double-binding or pill/text mutations.
export function initSettingsWiring(): void {
  return;
}

export default initSettingsWiring;
