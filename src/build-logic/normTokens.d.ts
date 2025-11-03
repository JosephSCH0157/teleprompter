/**
 * Tokenize and normalize text for matching.
 * Mirrors legacy behavior (lowercase, remove punctuation, expand some contractions, split hyphens, numbers->words for 0..99)
 */
export declare function normTokens(text: string): string[];
export default normTokens;
