import * as asr from './asr';
import * as pll from './pll';

declare global {
  interface Window {
    toggleSpeechSync?: (on?: boolean) => string;
  }
}

window.toggleSpeechSync = window.toggleSpeechSync || function (on?: boolean) {
  try {
    if (typeof on === 'boolean') {
      if (on) {
        asr.startASRorVAD((t, f) => {}, true);
        return String(asr.currentMode());
      } else {
        asr.stopASRorVAD();
        return 'off';
      }
    }
    // toggle
    if (asr.currentMode() === 'off') {
      asr.startASRorVAD((t, f) => {}, true);
    } else {
      asr.stopASRorVAD();
    }
    return String(asr.currentMode());
  } catch (e) {
    return 'error';
  }
};

export {};
