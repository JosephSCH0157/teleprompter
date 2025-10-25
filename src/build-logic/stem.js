// src/logic/stem.ts
/**
 * Simple stemmer used by the matcher: removes common suffixes.
 * Pure function, no side-effects.
 */
export function stemToken(token) {
    if (!token)
        return '';
    return token.toLowerCase().replace(/ing$|ed$|er$|est$|ly$|s$/g, '');
}
export default stemToken;
