// ui/similarity.js - runtime shim exposing similarity functions
(function(){
  function legacyComputeCharacterF1(text1, text2) {
    const chars1 = text1.split('');
    const chars2 = text2.split('');
    const set1 = new Set(chars1);
    const set2 = new Set(chars2);
    const intersection = new Set([...set1].filter((x) => set2.has(x)));
    const precision = set1.size ? intersection.size / set1.size : 0;
    const recall = set2.size ? intersection.size / set2.size : 0;
    return precision + recall > 0 ? (2 * (precision * recall)) / (precision + recall) : 0;
  }
  function legacyComputeJaccardSimilarity(tokens1, tokens2) {
    const stem1 = new Set(tokens1.map((t) => String(t).toLowerCase()));
    const stem2 = new Set(tokens2.map((t) => String(t).toLowerCase()));
    const intersection = new Set([...stem1].filter((x) => stem2.has(x)));
    const union = new Set([...stem1, ...stem2]);
    return union.size ? intersection.size / union.size : 0;
  }
  function legacyComputeEntityBonus(tokens1, tokens2) {
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
  function legacyCosineSimilarity(vec1, vec2) {
    let dot = 0, norm1 = 0, norm2 = 0;
    for (let i = 0; i < vec1.length; i++) {
      dot += vec1[i] * vec2[i];
      norm1 += vec1[i] * vec1[i];
      norm2 += vec2[i] * vec2[i];
    }
    return norm1 && norm2 ? dot / (Math.sqrt(norm1) * Math.sqrt(norm2)) : 0;
  }

  window.computeCharacterF1Impl = window.computeCharacterF1Impl || legacyComputeCharacterF1;
  window.computeCharacterF1 = window.computeCharacterF1 || function(a,b){ try { return window.computeCharacterF1Impl(a,b); } catch { return legacyComputeCharacterF1(a,b); } };

  window.computeJaccardSimilarityImpl = window.computeJaccardSimilarityImpl || legacyComputeJaccardSimilarity;
  window.computeJaccardSimilarity = window.computeJaccardSimilarity || function(a,b){ try { return window.computeJaccardSimilarityImpl(a,b); } catch { return legacyComputeJaccardSimilarity(a,b); } };

  window.computeEntityBonusImpl = window.computeEntityBonusImpl || legacyComputeEntityBonus;
  window.computeEntityBonus = window.computeEntityBonus || function(a,b){ try { return window.computeEntityBonusImpl(a,b); } catch { return legacyComputeEntityBonus(a,b); } };

  window.cosineSimilarityImpl = window.cosineSimilarityImpl || legacyCosineSimilarity;
  window.cosineSimilarity = window.cosineSimilarity || function(a,b){ try { return window.cosineSimilarityImpl(a,b); } catch { return legacyCosineSimilarity(a,b); } };
})();
