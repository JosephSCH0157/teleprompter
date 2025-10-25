/**
 * Simple stemmer used by the matcher: removes common suffixes.
 * Pure function, no side-effects.
 */
export declare function stemToken(token: string): string;
export default stemToken;
