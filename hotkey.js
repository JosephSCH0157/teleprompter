try {
  const params = typeof location !== "undefined" ? location.search : "";
  const inCi = params.includes("ci=1") || typeof navigator !== "undefined" && navigator.webdriver;
  if (!inCi) {
    try {
      console.warn("[stub] hotkey legacy stub loaded outside CI/dev");
    } catch {
    }
  }
} catch {
}
function enable() {
}
function disable() {
}
function register(_) {
}
function unregister(_) {
}
try {
  window.__tpHotkeyLegacy = "stub";
} catch {
}
export {
  disable,
  enable,
  register,
  unregister
};
