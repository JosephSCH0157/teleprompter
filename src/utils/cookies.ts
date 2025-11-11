// src/utils/cookies.ts
// Lightweight prefs cookie helper (safe JSON storage)
export type Prefs = {
  lastSource?: 'saved' | 'folder';
  lastFileName?: string;
  theme?: 'light' | 'dark';
};

const COOKIE = 'anvil_prefs';

export function readPrefsCookie(): Prefs {
  try {
    const m = document.cookie.match(new RegExp('(?:^|; )' + COOKIE + '=([^;]+)'));
    if (!m) return {};
    try { return JSON.parse(decodeURIComponent(m[1])) as Prefs; } catch { return {}; }
  } catch { return {}; }
}

export function writePrefsCookie(p: Prefs) {
  try {
    const v = encodeURIComponent(JSON.stringify(p));
    const exp = new Date(Date.now() + 365 * 24 * 3600 * 1000).toUTCString();
    const secure = location.protocol === 'https:' ? ' Secure;' : '';
    document.cookie = `${COOKIE}=${v}; Expires=${exp}; SameSite=Lax; Path=/;${secure}`;
  } catch {}
}
