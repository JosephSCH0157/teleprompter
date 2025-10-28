export function setObsStatus(text: string) {
  try {
    const chip = document.getElementById('obsChip');
    if (chip) chip.textContent = text;
  } catch {}
  try {
    const pill = (window.$id?.('obsStatusText') || document.getElementById('obsStatusText') || document.getElementById('obsStatus')) as HTMLElement | null;
    if (pill) pill.textContent = text;
  } catch {}
}

declare global { interface Window { __tpObsBridge?: any; } }
window.__tpObsBridge = window.__tpObsBridge || {};
window.__tpObsBridge.setStatus = setObsStatus;

export { };

