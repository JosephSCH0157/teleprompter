try {
  const params = typeof location !== "undefined" ? location.search : "";
  const inCi = params.includes("ci=1") || typeof navigator !== "undefined" && navigator.webdriver;
  if (!inCi) {
    try {
      console.warn("[stub] obs legacy stub loaded outside CI/dev");
    } catch {
    }
  }
} catch {
}
async function connect() {
  return { ok: false, reason: "stub" };
}
function configure(_) {
}
async function test() {
  return true;
}
try {
  window.__tpObsLegacy = "stub";
} catch {
}
export {
  configure,
  connect,
  test
};
