export type ASRMode = 'off' | 'vad' | 'asr';

let _mode: ASRMode = 'off';
let _onTranscript: ((_t: string, _isFinal: boolean) => void) | null = null;

export function currentMode() {
  return _mode;
}

export async function startASRorVAD(onTranscript: ( _t: string, _isFinal: boolean) => void, preferASR = true) {
  _onTranscript = (t: string, isFinal: boolean) => onTranscript(t, isFinal);
  // Minimal wiring: preferASR hint but do not implement full recognizer here.
  _mode = preferASR ? 'asr' : 'vad';
  try { window.dispatchEvent(new CustomEvent('hud:asr:mode', { detail: { mode: _mode } })); } catch {}
  return _mode;
}

export function stopASRorVAD() {
  _onTranscript = null;
  _mode = 'off';
  try { window.dispatchEvent(new CustomEvent('hud:asr:mode', { detail: { mode: _mode } })); } catch {}
}

export function emitTranscript(text: string, isFinal = false) {
  try {
    if (_onTranscript) _onTranscript(text, isFinal);
    window.dispatchEvent(new CustomEvent('asr:transcript', { detail: { text, isFinal } }));
  } catch {}
}

export { };

