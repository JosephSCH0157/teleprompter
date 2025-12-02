// Legacy status writer disabled; SSOT + obs-status-bind own pill text
export function setObsStatus(_text: string) {}

declare global { interface Window { __tpObsBridge?: any; } }
window.__tpObsBridge = window.__tpObsBridge || {};
window.__tpObsBridge.setStatus = setObsStatus;

export { };

