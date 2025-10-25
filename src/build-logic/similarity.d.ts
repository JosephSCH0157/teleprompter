/**
 * Compute character-level F1 using simple overlap heuristic.
 */
export declare function computeCharacterF1(text1: string, text2: string): number;
export declare function computeJaccardSimilarity(tokens1: string[], tokens2: string[]): number;
export declare function computeEntityBonus(tokens1: string[], tokens2: string[]): number;
export declare function cosineSimilarity(vec1: number[], vec2: number[]): number;
declare const _default: {
    computeCharacterF1: typeof computeCharacterF1;
    computeJaccardSimilarity: typeof computeJaccardSimilarity;
    computeEntityBonus: typeof computeEntityBonus;
    cosineSimilarity: typeof cosineSimilarity;
};
export default _default;
