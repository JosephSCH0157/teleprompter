// ui/stem.js - runtime shim exposing stemToken
(function(){
  function legacyStemToken(token){
    if(!token) return '';
    return String(token).toLowerCase().replace(/ing$|ed$|er$|est$|ly$|s$/g, '');
  }

  window.stemTokenImpl = window.stemTokenImpl || legacyStemToken;
  window.stemToken = window.stemToken || function(token){ try { return window.stemTokenImpl(token); } catch { return legacyStemToken(token); } };
})();
