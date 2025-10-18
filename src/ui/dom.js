// Minimal DOM helpers for the UI layer

export function bindStaticDom() {
  console.log('[src/ui/dom] bindStaticDom');
  // All DOM reads/writes should be centralized here.
  // For now this is a no-op placeholder to keep responsibilities clear.
}

export function query(selector) {
  return document.querySelector(selector);
}

export function readText(selector) {
  const el = document.querySelector(selector);
  return el ? el.textContent : null;
}

export function setText(selector, txt) {
  const el = document.querySelector(selector);
  if (el) el.textContent = String(txt);
}
