import { RecorderStatus, subscribeRecorderSettings } from '../state/recorder-settings';

function applyStatusText(text: string, status: ObsStatus) {
  const ids = ['obsConnStatus', 'obsStatusText', 'obsStatus'];
  ids.forEach((id) => {
    const el = document.getElementById(id);
    if (!el) return;
    el.textContent = text;
    el.dataset.state = status;
    el.classList?.remove?.('obs-status-idle', 'obs-status-busy', 'obs-status-ok', 'obs-status-error');
    const cls =
      status === 'connecting'
        ? 'obs-status-busy'
        : status === 'ready'
        ? 'obs-status-ok'
        : status === 'error' || status === 'offline'
        ? 'obs-status-error'
        : 'obs-status-idle';
    el.classList?.add?.(cls);
  });
}

export function bindObsStatusPills(): void {
  subscribeRecorderSettings((s) => {
    const enabled = !!s.enabled.obs;
    const status = s.obsStatus as ObsStatus | RecorderStatus;
    const label =
      status === 'connecting'
        ? 'OBS: connecting…'
        : status === 'connected'
        ? 'OBS: connected'
        : status === 'error'
        ? 'OBS: error'
        : enabled
        ? 'OBS: enabled'
        : 'OBS: disabled';
    const kind: ObsStatus =
      status && status !== 'unknown'
        ? status
        : enabled
        ? 'ready'
        : 'disabled';
    applyStatusText(label, kind);
  });
}
