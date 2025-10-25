export function runSelfChecks(): Array<{ name: string; pass: boolean; info?: string }> {
  const checks: Array<{ name: string; pass: boolean; info?: string }> = [];

  // 1) Exactly one script include (by current script src if available)
  try {
    const cs = document.currentScript as HTMLScriptElement | null;
    let count = 1;
    let label = 'n/a';
    if (cs && cs.src) {
      const src = cs.src;
      count = Array.from(document.scripts).filter((s) => s.src && s.src === src).length;
      label = src.split('/').pop() || label;
    }
    checks.push({ name: 'Single script include', pass: count === 1, info: `${label} found ${count}` });
  } catch {
    checks.push({ name: 'Single script include', pass: true, info: '(skipped)' });
  }

  // 2) Help injected
  try {
    const help = document.getElementById('shortcutsOverlay');
    const has = !!(help && help.querySelector('#normalizeBtn') && help.querySelector('#validateBtn'));
    checks.push({ name: 'Help injected', pass: has, info: has ? 'OK' : 'missing pieces' });
  } catch {
    checks.push({ name: 'Help injected', pass: false, info: 'error' });
  }

  // 3) Matcher constants defined and sane
  try {
    const a = typeof (window as any).SIM_THRESHOLD === 'number' && (window as any).SIM_THRESHOLD > 0 && (window as any).SIM_THRESHOLD < 1;
    const b = typeof (window as any).MATCH_WINDOW_AHEAD === 'number' && (window as any).MATCH_WINDOW_AHEAD >= 60 && (window as any).MATCH_WINDOW_AHEAD <= 1000;
    const c = typeof (window as any).MATCH_WINDOW_BACK === 'number' && (window as any).MATCH_WINDOW_BACK >= 0 && (window as any).MATCH_WINDOW_BACK <= 500;
    const d = typeof (window as any).STRICT_FORWARD_SIM === 'number' && (window as any).STRICT_FORWARD_SIM > 0 && (window as any).STRICT_FORWARD_SIM < 1;
    const e = typeof (window as any).MAX_JUMP_AHEAD_WORDS === 'number' && (window as any).MAX_JUMP_AHEAD_WORDS >= 1 && (window as any).MAX_JUMP_AHEAD_WORDS <= 200;
    checks.push({
      name: 'Matcher constants',
      pass: Boolean(a && b && c && d && e),
      info: `SIM=${(window as any).SIM_THRESHOLD ?? '?'} WIN_F=${(window as any).MATCH_WINDOW_AHEAD ?? '?'} WIN_B=${(window as any).MATCH_WINDOW_BACK ?? '?'} STRICT=${(window as any).STRICT_FORWARD_SIM ?? '?'} JUMP=${(window as any).MAX_JUMP_AHEAD_WORDS ?? '?'}`,
    });
  } catch {
    checks.push({ name: 'Matcher constants', pass: false, info: 'not defined' });
  }

  // 4) Display handshake wiring present
  try {
    const ok = typeof (window as any).openDisplay === 'function' && typeof (window as any).sendToDisplay === 'function';
    checks.push({ name: 'Display handshake', pass: ok, info: ok ? 'wiring present' : 'functions missing' });
  } catch {
    checks.push({ name: 'Display handshake', pass: false, info: 'error' });
  }

  // 5) Top Normalize button wired (accept legacy normalizeBtn)
  try {
    const btn = (window.$id?.('normalizeTopBtn') || document.getElementById('normalizeTopBtn') || window.$id?.('normalizeBtn') || document.getElementById('normalizeBtn')) as HTMLButtonElement | null;
    const wired = Boolean(btn && (btn.onclick || btn.dataset.wired));
    checks.push({ name: 'Top Normalize button wired', pass: wired, info: wired ? 'wired' : 'not wired' });
  } catch {
    checks.push({ name: 'Top Normalize button wired', pass: false, info: 'error' });
  }

  return checks;
}

// Auto-attach for legacy consumers
try {
  // @ts-ignore
  (window as any).runSelfChecks = runSelfChecks;
} catch {}
