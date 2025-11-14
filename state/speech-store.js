const state = {
    engine: 'webspeech',
    lang: 'en-US',
    interim: true,
    threshold: 0.60,
    endpointingMs: 700,
    fillerFilter: true,
};
const subs = new Set();
export const speechStore = {
    get() { return { ...state }; },
    set(patch) {
        Object.assign(state, patch);
        for (const fn of subs)
            fn({ ...state });
    },
    subscribe(fn) { subs.add(fn); return () => subs.delete(fn); },
};
