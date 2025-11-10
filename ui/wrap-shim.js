// ui/wrap-shim.js
// Provide a legacy-compatible window.wrapSelection(startTag, endTag)
// Used by toolbar buttons in the monolith during dev/CI. No-op if already defined.
(function(){
  try {
    if (typeof window.wrapSelection === 'function') return;
  } catch {}

  function wrap(startTag, endTag){
    try {
      var el = document.getElementById('editor');
      if (!el) return;
      var v = String(el.value || '');
      var s = Number(el.selectionStart || 0);
      var e = Number(el.selectionEnd || 0);
      if (s > e) { var tmp = s; s = e; e = tmp; }
      var before = v.slice(0, s);
      var mid    = v.slice(s, e);
      var after  = v.slice(e);
      // Insert tags around selection (or at cursor if empty)
      var next = before + String(startTag||'') + mid + String(endTag||'') + after;
      el.value = next;
      // Place cursor after endTag of inserted region
      var cursor = before.length + String(startTag||'').length + mid.length;
      try { el.selectionStart = el.selectionEnd = cursor; } catch {}
      try { el.focus(); } catch {}
      try { el.dispatchEvent(new Event('input', { bubbles: true })); } catch {}
    } catch {}
  }

  try { window.wrapSelection = wrap; } catch {}
})();
