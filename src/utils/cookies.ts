// src/utils/cookies.ts
export type PrefsV1 = {
  v: 1;
  theme?: 'light' | 'dark' | 'system';
  highContrast?: 0 | 1;
  fontScale?: number; // clamp 1.00..2.00, 2dp
  scrollMode?: 'hybrid' | 'asr' | 'step' | 'rehearsal';
  lastSource?: 'saved' | 'folder';
  lastFileName?: string; // basename only, ≤64 chars
};

const COOKIE = 'anvil_prefs';
const ONE_YEAR = 365 * 24 * 3600 * 1000;

function clampScale(n?: number) {
  if (typeof n !== 'number' || Number.isNaN(n)) return 1.0;
  return Math.round(Math.min(2.0, Math.max(1.0, n)) * 100) / 100;
}
function trimName(s?: string) {
  if (!s) return '';
  const base = s.split(/[\\/]/).pop() || '';
  return base.slice(0, 64);
}

export function readPrefsCookie(): PrefsV1 {
  const m = document.cookie.match(new RegExp('(?:^|; )' + COOKIE + '=([^;]+)'));
  let obj: Partial<PrefsV1> = {};
  if (m) {
    try { obj = JSON.parse(decodeURIComponent(m[1])); } catch {}
  }
  // migrate + defaults
  const out: PrefsV1 = {
    v: 1,
    theme: (obj.theme === 'light' || obj.theme === 'dark' || obj.theme === 'system') ? obj.theme : 'system',
    highContrast: obj.highContrast === 1 ? 1 : 0,
    fontScale: clampScale(obj.fontScale),
    scrollMode: (obj.scrollMode === 'asr' || obj.scrollMode === 'step' || obj.scrollMode === 'rehearsal') ? obj.scrollMode : 'hybrid',
    lastSource: (obj.lastSource === 'folder') ? 'folder' : 'saved',
    lastFileName: trimName(obj.lastFileName),
  };
  return out;
}

export function writePrefsCookie(updates: Partial<PrefsV1>) {
  const cur = readPrefsCookie();
  const next: PrefsV1 = {
    ...cur,
    ...updates,
    v: 1,
    fontScale: clampScale(updates.fontScale ?? cur.fontScale),
    lastFileName: trimName(updates.lastFileName ?? cur.lastFileName),
  };
  // serialize + basic size guard
  let v = encodeURIComponent(JSON.stringify(next));
  if (v.length > 1200) {
    // drop least critical fields to shrink
    const lean = { ...next, lastFileName: '' } as any;
    v = encodeURIComponent(JSON.stringify(lean));
  }
  const exp = new Date(Date.now() + ONE_YEAR).toUTCString();
  const secure = location.protocol === 'https:' ? ' Secure;' : '';
  document.cookie = `${COOKIE}=${v}; Expires=${exp}; SameSite=Lax; Path=/;${secure}`;
}
