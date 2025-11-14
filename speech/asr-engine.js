// Lightweight event emitter to keep engines framework-agnostic
export class Emitter {
    constructor() {
        this.ls = new Set();
    }
    on(fn) { this.ls.add(fn); }
    off(fn) { this.ls.delete(fn); }
    emit(e) { for (const fn of this.ls)
        fn(e); }
}
// Shared helpers
export function normalizeText(s) {
    return s
        .toLowerCase()
        .replace(/[\u2018\u2019]/g, "'")
        .replace(/[\u201C\u201D]/g, '"')
        .replace(/[^a-z0-9'\s]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}
export const FILLERS = new Set([
    'um', 'uh', 'like', 'you', 'know', 'er', 'ah', 'hmm', 'mm', 'okay', 'ok', 'right', 'so', 'well'
]);
export function stripFillers(s) {
    const toks = normalizeText(s).split(' ');
    return toks.filter(t => !FILLERS.has(t)).join(' ');
}
