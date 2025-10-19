// ui/ngrams.js - runtime shim exposing getNgrams
(function(){
  function getNgrams(tokens, n) {
    if (window && typeof window.getNgramsImpl === 'function') {
      try { return window.getNgramsImpl(tokens, n); } catch (e) { /* fallthrough to local */ }
    }
    var ngrams = [];
    for (var i = 0; i <= tokens.length - n; i++) {
      ngrams.push(tokens.slice(i, i + n).join(' '));
    }
    return ngrams;
  }

  // expose both impl and public name
  window.getNgramsImpl = window.getNgramsImpl || function(tokens, n) { return getNgrams(tokens, n); };
  window.getNgrams = window.getNgrams || function(tokens, n) { return getNgrams(tokens, n); };
})();
