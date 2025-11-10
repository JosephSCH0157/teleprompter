const KEY = 'tp_ui_prefs_v1';
let state = (() => {
    try {
        const parsed = (JSON.parse(localStorage.getItem(KEY) || '{}') || {});
        return { linkTypography: false, hybridGate: 'db_or_vad', hybridUseProfileId: parsed.hybridUseProfileId || null, ...parsed };
    }
    catch {
        return { linkTypography: false, hybridGate: 'db_or_vad', hybridUseProfileId: null };
    }
})();
const subs = new Set();
export const getUiPrefs = () => state;
export function setUiPrefs(p) {
    state = { ...state, ...p };
    try {
        localStorage.setItem(KEY, JSON.stringify(state));
    }
    catch { }
    subs.forEach(fn => { try {
        fn(state);
    }
    catch { } });
}
export const onUiPrefs = (fn) => (subs.add(fn), () => subs.delete(fn));
