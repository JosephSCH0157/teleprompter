// Runs only in dev. Verifies core UI exists & is wired.

function isDev(): boolean {
  try {
    return !!(window as any).__TP_BOOT_INFO?.isDev;
  } catch {
    return false;
  }
}

const q = <T extends Element = HTMLElement>(s: string) => document.querySelector<T>(s);

function must(sel: string, fails: string[], msg?: string) {
  if (!q(sel)) fails.push(msg || `${sel} missing`);
}

function checkParity() {
  const fails: string[] = [];

  must('.topbar', fails);
  must('#viewer', fails);
  ['#presentBtn', '#settingsBtn,[data-action="settings-open"]', '#shortcutsBtn,[data-action="help-open"]', '#speakerIndexChip', '#settingsOverlay', '#settingsClose,[data-action="settings-close"]', '#shortcutsOverlay', '#shortcutsClose,[data-action="help-close"]'].forEach((id) => must(id, fails));

  // Accept either legacy bottom meter (#dbMeter) or current top-bar meter (#dbMeterTop)
  const hasMeter = q('#dbMeterTop') || q('#dbMeter');
  if (!hasMeter) fails.push('#dbMeter missing');

  // topbar hairline present?
  try {
    const tb = q('.topbar');
    const st = tb && getComputedStyle(tb);
    if (!st || st.borderBottomWidth === '0px') fails.push('topbar hairline missing');
  } catch {
    /* ignore */
  }

  // paste hint exists (either #emptyHint, current .empty-msg banner, or editor placeholder contains "Paste")
  try {
    const ed = document.getElementById('editor');
    const hint = document.getElementById('emptyHint');
    const banner = document.querySelector('.empty-msg');
    const scriptHint = document.querySelector('.tp-paste-hint');
    const ok =
      !!hint ||
      !!banner ||
      !!scriptHint ||
      (!!ed && 'placeholder' in ed && /\bpaste\b/i.test((ed as HTMLTextAreaElement).placeholder || '')) ||
      (!!banner && /\bpaste\b/i.test(String(banner.textContent || ''))) ||
      (!!scriptHint && /\bpaste\b/i.test(String(scriptHint.textContent || '')));
    if (!ok) fails.push('paste-script hint missing');
  } catch {
    /* ignore */
  }

  // wiring checks (open/close overlays)
  try {
    const so = q('#shortcutsOverlay') as HTMLElement | null;
    const sb = q('#shortcutsBtn') as HTMLElement | null;
    const se = q('#settingsOverlay') as HTMLElement | null;
    const sb2 = q('#settingsBtn, [data-action="settings-open"]') as HTMLElement | null;
    sb?.click();
    if (so && so.classList.contains('hidden')) fails.push('Help overlay does not open');
    q('#shortcutsClose, [data-action="help-close"]')?.click();
    sb2?.click();
    if (se && se.classList.contains('hidden')) fails.push('Settings overlay does not open');
    q('#settingsClose, [data-action="settings-close"]')?.click();
  } catch {
    /* ignore */
  }

  // present toggle works (and reverts)
  try {
    const root = document.documentElement;
    const before = root.classList.contains('tp-present');
    q('#presentBtn')?.click();
    const after = root.classList.contains('tp-present');
    if (before === after) fails.push('Present toggle not working');
    q('#presentBtn')?.click();
  } catch {
    /* ignore */
  }

  if (fails.length) {
    try {
      console.warn('[UI PARITY FAIL]', fails);
      const box = document.createElement('div');
      box.style.cssText =
        'position:fixed;top:8px;left:8px;z-index:99999;background:#b00020;color:#fff;padding:8px 10px;border-radius:8px;font:600 12px system-ui';
      box.textContent = `UI parity fail: ${fails.join(' · ')}`;
      document.body.appendChild(box);
    } catch {
      /* ignore */
    }
  } else {
    try {
      console.log('%c[UI PARITY OK]', 'color:#0a0');
    } catch {
      /* ignore */
    }
  }
}

export function installParityGuard(): void {
  if (!isDev()) return;
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => checkParity(), { once: true });
  } else {
    checkParity();
  }
}

try {
  installParityGuard();
} catch {
  /* ignore */
}
