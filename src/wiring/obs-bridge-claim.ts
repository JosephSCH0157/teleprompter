// Safe OBS bridge claim utility.
// Attempts to talk to a Chrome extension bridge; degrades silently when unavailable.
// Returns a structured result logged to HUD.

export type ObsBridgeClaim = { ok: boolean; bridge?: string; version?: string; error?: string };

// Declare ambient chrome for type safety without pulling full @types/chrome
declare const chrome: any;

export function claimObsBridge(timeoutMs = 800): Promise<ObsBridgeClaim> {
  try {
    if (!("chrome" in window) || !(chrome as any)?.runtime?.sendMessage) {
      return Promise.resolve({ ok: false, error: 'no-chrome-runtime' });
    }
  } catch {
    return Promise.resolve({ ok: false, error: 'no-runtime' });
  }

  return new Promise((resolve) => {
    let settled = false;
    const settle = (val: ObsBridgeClaim) => {
      if (settled) return; settled = true; clearTimeout(timer); resolve(val);
    };
    const timer = setTimeout(() => settle({ ok: false, error: 'timeout' }), timeoutMs);
    try {
  (chrome as any).runtime.sendMessage({ type: 'OBS_BRIDGE_CLAIM' }, (resp: any) => {
        try {
          if (settled) return;
          if (!resp) return settle({ ok: false, error: 'no-response' });
          if (resp && typeof resp === 'object' && 'ok' in resp) return settle(resp);
          // Fallback mapping
          settle({ ok: false, error: 'malformed-response' });
        } catch (err) {
          settle({ ok: false, error: String((err as any)?.message || err) });
        }
      });
    } catch (err) {
      settle({ ok: false, error: String((err as any)?.message || err) });
    }
  });
}

export async function initObsBridgeClaim() {
  try {
    const res = await claimObsBridge();
    try { (window as any).HUD?.log?.('obs.bridge', res); } catch {}
    if (!res.ok) {
      // Soft gate: mark bridge missing so higher layers can choose alternate flow.
      try { (window as any).__tpObsBridgeMissing = true; } catch {}
    } else {
      try { (window as any).__tpObsBridgeVersion = res.version || null; } catch {}
    }
  } catch (err) {
    try { (window as any).HUD?.log?.('obs.bridge:error', { error: String((err as any)?.message || err) }); } catch {}
  }
}
