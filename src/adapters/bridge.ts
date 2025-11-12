// src/adapters/bridge.ts - minimal facade marker

try { (window as any).__tpLegacyBridge = 'facade'; } catch {}

export function createBridgeAdapter() { return undefined; }
export default {};
