const KEY = 'tp_ui_prefs_v1';
export type HybridGatePref = 'db' | 'vad' | 'db_or_vad' | 'db_and_vad';
export type UiPrefs = { linkTypography: boolean; hybridGate: HybridGatePref; hybridUseProfileId?: string | null };
let state: UiPrefs = (() => {
  try {
    const parsed = (JSON.parse(localStorage.getItem(KEY) || '{}') || {}) as Partial<UiPrefs>;
    return { linkTypography: false, hybridGate: 'db_or_vad', hybridUseProfileId: (parsed as any).hybridUseProfileId || null, ...parsed } as UiPrefs;
  } catch {
    return { linkTypography: false, hybridGate: 'db_or_vad', hybridUseProfileId: null } as UiPrefs;
  }
})();
const subs = new Set<(_s: UiPrefs)=>void>();
export const getUiPrefs = () => state;
export function setUiPrefs(p: Partial<UiPrefs>) {
  state = { ...state, ...p } as UiPrefs;
  try { localStorage.setItem(KEY, JSON.stringify(state)); } catch {}
  subs.forEach(fn => { try { fn(state); } catch {} });
}
export const onUiPrefs = (fn:(_s:UiPrefs)=>void) => (subs.add(fn), () => subs.delete(fn));
