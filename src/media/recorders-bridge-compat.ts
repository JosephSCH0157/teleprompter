// Typed shim around the legacy recorder bridge so UI code can toggle OBS cleanly.
import {
  init as initRecorderBridge,
  initBridge,
  initCompat,
  setEnabled as setObsBridgeEnabled,
  disconnect as disconnectObsBridge,
} from '../../recorders-bridge-compat';

let initialized = false;

function ensureBridgeInit(): void {
  if (initialized) return;
  initialized = true;
  try { initCompat(); } catch {}
  try { initRecorderBridge(); } catch {}
  try { initBridge(); } catch {}
}

export function registerObsAdapter(): void {
  ensureBridgeInit();
  try { setObsBridgeEnabled(true); } catch {}
}

export function unregisterObsAdapter(): void {
  ensureBridgeInit();
  try { setObsBridgeEnabled(false); } catch {}
  try { disconnectObsBridge(); } catch {}
}
