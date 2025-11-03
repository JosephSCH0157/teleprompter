// src/logic/similarity.ts

/**
 * Compute character-level F1 using simple overlap heuristic.
 */
export function computeCharacterF1(text1: string, text2: string): number {
  const chars1 = text1.split('');
  const chars2 = text2.split('');
  const set1 = new Set(chars1);
  const set2 = new Set(chars2);
  const intersection = new Set([...set1].filter((x) => set2.has(x)));
  const precision = set1.size ? intersection.size / set1.size : 0;
  const recall = set2.size ? intersection.size / set2.size : 0;
  return precision + recall > 0 ? (2 * (precision * recall)) / (precision + recall) : 0;
}

export function computeJaccardSimilarity(tokens1: string[], tokens2: string[]): number {
  const stem1 = new Set(tokens1.map((t) => t.toLowerCase()));
  const stem2 = new Set(tokens2.map((t) => t.toLowerCase()));
  const intersection = new Set([...stem1].filter((x) => stem2.has(x)));
  const union = new Set([...stem1, ...stem2]);
  return union.size ? intersection.size / union.size : 0;
}

export function computeEntityBonus(tokens1: string[], tokens2: string[]): number {
  let bonus = 0;
  const nums1 = tokens1.filter((t) => /^\d+(\.\d+)?$/.test(t));
  const nums2 = tokens2.filter((t) => /^\d+(\.\d+)?$/.test(t));
  if (nums1.length > 0 && nums2.length > 0) {
    const numMatch = nums1.some((n1) => nums2.includes(n1)) ? 1 : 0;
    bonus += 0.1 * numMatch;
  }
  const names1 = tokens1.filter((t) => /^[A-Z][a-z]+$/.test(t));
  const names2 = tokens2.filter((t) => /^[A-Z][a-z]+$/.test(t));
  if (names1.length > 0 && names2.length > 0) {
    const nameMatch = names1.some((n1) => names2.includes(n1)) ? 1 : 0;
    bonus += 0.15 * nameMatch;
  }
  return bonus;
}

export function cosineSimilarity(vec1: number[], vec2: number[]): number {
  let dot = 0;
  let norm1 = 0;
  let norm2 = 0;
  for (let i = 0; i < vec1.length; i++) {
    dot += vec1[i] * vec2[i];
    norm1 += vec1[i] * vec1[i];
    norm2 += vec2[i] * vec2[i];
  }
  return norm1 && norm2 ? dot / (Math.sqrt(norm1) * Math.sqrt(norm2)) : 0;
}

export default {
  computeCharacterF1,
  computeJaccardSimilarity,
  computeEntityBonus,
  cosineSimilarity,
};
