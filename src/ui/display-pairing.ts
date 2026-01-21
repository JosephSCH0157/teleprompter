import QRCode from 'qrcode';
import { getNetworkDisplayStatus, onNetworkDisplayStatus } from '../net/display-ws-client';

type PairingResponse = {
  token: string;
  expiresAt: number;
  displayUrl: string;
  wsUrl: string;
};

type Elements = {
  mask: HTMLElement;
  input: HTMLInputElement;
  qr: HTMLImageElement;
  status: HTMLElement;
  wsLabel: HTMLElement;
  close: HTMLButtonElement;
  refresh: HTMLButtonElement;
  copy: HTMLButtonElement;
  expiry: HTMLElement;
};

let modalElements: Elements | null = null;
let currentPairing: PairingResponse | null = null;
let isRefreshing = false;
let expiryTimer: number | null = null;

async function getLanHostFromServer(): Promise<string | null> {
  try {
    const response = await fetch('/display/host', { cache: 'no-store' });
    if (!response.ok) return null;
    const data = await response.json();
    if (data && typeof data.host === 'string') {
      const trimmed = data.host.trim();
      return trimmed || null;
    }
  } catch {
    // ignore
  }
  return null;
}

function rewriteUrlHost(sourceUrl: string, hostOverride: string | null) {
  if (!hostOverride) return sourceUrl;
  try {
    const parsed = new URL(sourceUrl);
    parsed.hostname = hostOverride;
    return parsed.toString();
  } catch {
    return sourceUrl;
  }
}

function isDisplayContext(): boolean {
  try {
    const params = new URLSearchParams(location.search || '');
    if (params.get('display') === '1') return true;
    const path = (location.pathname || '').toLowerCase();
    if (path.endsWith('/display.html') || path === '/display.html') return true;
    if ((window as any).__TP_FORCE_DISPLAY) return true;
  } catch {
    // ignore
  }
  return false;
}

function ensureStyles() {
  if (document.getElementById('displayPairingStyles')) return;
  const css = `
    .display-pairing-mask {
      position: fixed;
      inset: 0;
      background: rgba(0, 0, 0, 0.55);
      display: none;
      align-items: center;
      justify-content: center;
      z-index: 3900;
      padding: 12px;
    }
    .display-pairing-mask.is-visible {
      display: flex;
    }
    .display-pairing-panel {
      background: #0b1220;
      border: 1px solid rgba(255, 255, 255, 0.08);
      border-radius: 16px;
      padding: 20px;
      max-width: 520px;
      width: 100%;
      box-shadow: 0 0 40px rgba(0, 0, 0, 0.45);
      color: #e7ebf0;
      font-family: system-ui, 'Segoe UI', sans-serif;
    }
    .display-pairing-panel header {
      font-size: 1.2rem;
      font-weight: 600;
      margin-bottom: 12px;
    }
    .display-pairing-field {
      margin-bottom: 14px;
    }
    .display-pairing-field label {
      display: block;
      font-size: 0.75rem;
      letter-spacing: 0.08em;
      text-transform: uppercase;
      color: #93a0b4;
      margin-bottom: 4px;
    }
    .display-pairing-input {
      display: flex;
      gap: 8px;
      align-items: stretch;
    }
    .display-pairing-input input {
      flex: 1;
      background: rgba(255, 255, 255, 0.05);
      border: 1px solid rgba(255, 255, 255, 0.1);
      border-radius: 8px;
      color: inherit;
      padding: 10px 12px;
      font-size: 0.95rem;
    }
    .display-pairing-status {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
      font-size: 0.85rem;
      color: #afc0d9;
    }
    .display-pairing-qr {
      display: flex;
      align-items: center;
      gap: 12px;
      margin-bottom: 12px;
    }
    .display-pairing-qr img {
      width: 176px;
      height: 176px;
      border-radius: 12px;
      background: #fff;
    }
    .display-pairing-actions {
      display: flex;
      justify-content: flex-end;
      gap: 8px;
      margin-top: 8px;
    }
    .display-pairing-panel .chip,
    .display-pairing-panel .btn {
      cursor: pointer;
    }
    .display-pairing-tip {
      font-size: 0.75rem;
      color: #9fb4c9;
      margin-top: 4px;
      line-height: 1.25;
    }
  `;
  const style = document.createElement('style');
  style.id = 'displayPairingStyles';
  style.textContent = css;
  document.head.appendChild(style);
}

function buildModal(): Elements | null {
  if (modalElements) return modalElements;
  const mask = document.createElement('div');
  mask.className = 'display-pairing-mask';
  mask.setAttribute('role', 'dialog');
  mask.setAttribute('aria-modal', 'true');

  const panel = document.createElement('section');
  panel.className = 'display-pairing-panel';
  panel.innerHTML = `
    <header>Pair Tablet Display</header>
    <div class="display-pairing-body">
      <div class="display-pairing-field">
        <label>LAN URL</label>
        <div class="display-pairing-input">
          <input readonly placeholder="Click refresh to generate" />
          <button type="button" class="chip display-pairing-btn-copy">Copy</button>
        </div>
      </div>
      <div class="display-pairing-field display-pairing-status">
        <span class="display-pairing-status-text">Connected: 0</span>
        <span class="display-pairing-status-ws">ws://.../ws/display</span>
      </div>
      <div class="display-pairing-field">
        <div class="display-pairing-qr">
          <img
            src="data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw=="
            alt="Display pairing QR code"
          />
          <div>
            <div class="display-pairing-actions">
              <button type="button" class="chip display-pairing-btn-refresh">Refresh token</button>
            </div>
            <div class="display-pairing-status" style="margin-top:8px;">
              <span class="display-pairing-status-expiry">Waiting for token...</span>
            </div>
          </div>
        </div>
        <div class="display-pairing-tip">
          Make sure both devices are on the same LAN (guest Wi-Fi / client isolation may block the WS connection). Allow inbound connections from Windows Firewall when using a Private network profile.
        </div>
      </div>
    </div>
    <div class="display-pairing-actions">
      <button type="button" class="btn btn-primary display-pairing-btn-close">Close</button>
    </div>
  `;

  mask.appendChild(panel);
  document.body.appendChild(mask);

  const input = panel.querySelector<HTMLInputElement>('input');
  const qr = panel.querySelector<HTMLImageElement>('img');
  const status = panel.querySelector<HTMLElement>('.display-pairing-status-text');
  const expiry = panel.querySelector<HTMLElement>('.display-pairing-status-expiry');
  const wsLabel = panel.querySelector<HTMLElement>('.display-pairing-status-ws');
  const close = panel.querySelector<HTMLButtonElement>('.display-pairing-btn-close');
  const refresh = panel.querySelector<HTMLButtonElement>('.display-pairing-btn-refresh');
  const copy = panel.querySelector<HTMLButtonElement>('.display-pairing-btn-copy');

  if (!input || !qr || !status || !wsLabel || !close || !refresh || !copy) {
    mask.remove();
    return null;
  }

  if (!expiry) {
    mask.remove();
    return null;
  }

  modalElements = { mask, input, qr, status, wsLabel, close, refresh, copy, expiry };
  return modalElements;
}

function clearExpiryTimer() {
  if (expiryTimer) {
    window.clearInterval(expiryTimer);
    expiryTimer = null;
  }
}

function toggleModal(on: boolean) {
  const elements = modalElements;
  if (!elements) return;
  elements.mask.classList.toggle('is-visible', on);
  if (on) {
    refreshStatus();
    ensurePairingToken();
  } else {
    clearExpiryTimer();
  }
}

function updateStatusText(text: string) {
  if (modalElements?.expiry) {
    modalElements.expiry.textContent = text;
  }
}

function updateWsLabel(url: string) {
  if (modalElements?.wsLabel) {
    modalElements.wsLabel.textContent = url;
  }
}

function updateInput(url: string) {
  if (modalElements?.input) {
    modalElements.input.value = url;
  }
}

function updateQr(url: string) {
  if (!modalElements?.qr) return;
  QRCode.toDataURL(url, { width: 200, margin: 1 })
    .then((dataUrl) => {
      modalElements?.qr.setAttribute('src', dataUrl);
    })
    .catch(() => {
      modalElements?.qr.setAttribute('src', '');
    });
}

function requestPairing(): Promise<PairingResponse | null> {
  return fetch('/display/pair', { cache: 'no-store' })
    .then((res) => {
      if (!res.ok) throw new Error('Relay unavailable');
      return res.json();
    })
    .catch(() => null);
}

async function ensurePairingToken() {
  if (isRefreshing) return;
  isRefreshing = true;
  updateStatusText('Generating token...');
  try {
    const pairing = await requestPairing();
    if (!pairing) {
      updateStatusText('Unable to generate pairing token. Is the relay running?');
      currentPairing = null;
      return;
    }
    const hostOverride = await getLanHostFromServer();
    const displayUrl = rewriteUrlHost(pairing.displayUrl, hostOverride);
    const wsUrl = rewriteUrlHost(pairing.wsUrl, hostOverride);
    currentPairing = { ...pairing, displayUrl, wsUrl };
    updateInput(displayUrl);
    updateWsLabel(wsUrl);
    updateStatusText(`Expires at ${new Date(pairing.expiresAt).toLocaleTimeString()}`);
    updateQr(displayUrl);
    clearExpiryTimer();
    expiryTimer = window.setInterval(() => {
      if (!currentPairing) return;
      const remaining = Math.max(0, currentPairing.expiresAt - Date.now());
      if (remaining <= 0) {
        window.clearInterval(expiryTimer!);
        expiryTimer = null;
        updateStatusText('Token expired. Refresh to generate a new one.');
        return;
      }
      updateStatusText(`Expires in ${Math.ceil(remaining / 1000)}s`);
    }, 1000);
  } finally {
    isRefreshing = false;
  }
}

function refreshStatus() {
  const current = getNetworkDisplayStatus();
  modalElements?.status && (modalElements.status.textContent = `Connected: ${current.connectedDisplays}`);
}

function bindModalEvents() {
  if (!modalElements) return;
  modalElements.close.addEventListener('click', () => toggleModal(false));
  modalElements.copy.addEventListener('click', () => {
    const url = modalElements?.input.value;
    if (!url) return;
    navigator.clipboard?.writeText(url).catch(() => {});
  });
  modalElements.refresh.addEventListener('click', () => ensurePairingToken());
  modalElements.mask.addEventListener('click', (event) => {
    if (event.target === modalElements?.mask) {
      toggleModal(false);
    }
  });
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      toggleModal(false);
    }
  });
}

function initDisplayPairingPanel() {
  if (typeof document === 'undefined' || isDisplayContext()) return;
  ensureStyles();
  const toggleBtn = document.getElementById('displayToggleBtn');
  const parent = toggleBtn?.parentElement || document.getElementById('topbarRight');
  if (!parent) return;
  const pairBtn = document.createElement('button');
  pairBtn.type = 'button';
  pairBtn.className = 'chip display-pair-btn';
  pairBtn.textContent = 'Pair Tablet';
  parent.insertBefore(pairBtn, toggleBtn?.nextSibling || null);

  const elements = buildModal();
  if (!elements) return;
  bindModalEvents();
  onNetworkDisplayStatus(({ connectedDisplays }) => {
    elements.status.textContent = `Connected: ${connectedDisplays}`;
  });

  pairBtn.addEventListener('click', () => toggleModal(true));
}

export { initDisplayPairingPanel };
