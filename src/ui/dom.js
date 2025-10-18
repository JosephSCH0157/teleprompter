// Minimal DOM helpers for the UI layer

export function bindStaticDom() {
  console.log('[src/ui/dom] bindStaticDom');
  // Wire up very small, safe DOM references here if needed.
}

export function query(selector) {
  return document.querySelector(selector);
}
