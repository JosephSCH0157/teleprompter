const KEY = 'tp_asr_profiles_v1';
let state = (() => {
    try {
        const raw = localStorage.getItem(KEY);
        const parsed = raw ? JSON.parse(raw) : {};
        return { profiles: {}, ...parsed };
    }
    catch {
        return { profiles: {} };
    }
})();
const subs = new Set();
function save() {
    try {
        localStorage.setItem(KEY, JSON.stringify(state));
    }
    catch { }
    subs.forEach(fn => { try {
        fn(state);
    }
    catch { } });
    try {
        window.dispatchEvent(new CustomEvent('tp:asrChanged', { detail: state }));
    }
    catch { }
}
export const getAsrState = () => state;
export function upsertProfile(p) {
    state.profiles[p.id] = { ...p, updatedAt: Date.now() };
    if (!state.activeProfileId)
        state.activeProfileId = p.id;
    save();
}
export function setActiveProfile(id) {
    state.activeProfileId = id;
    save();
}
export function onAsr(fn) {
    subs.add(fn);
    return () => subs.delete(fn);
}
// storage-sync so Display picks up changes:
try {
    window.addEventListener('storage', (e) => {
        try {
            if (e.key === KEY && e.newValue) {
                const next = JSON.parse(e.newValue);
                state = { ...next, profiles: next?.profiles || {} };
                subs.forEach(fn => { try {
                    fn(state);
                }
                catch { } });
            }
        }
        catch { }
    });
}
catch { }
