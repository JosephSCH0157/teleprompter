import * as asr from './asr';

declare global {
  interface Window {
    toggleSpeechSync?: (_on?: boolean) => string;
  }
}

window.toggleSpeechSync = window.toggleSpeechSync || function (on?: boolean) {
  try {
    if (typeof on === 'boolean') {
      if (on) {
        asr.startASRorVAD((_t, _f) => {}, true);
        return String(asr.currentMode());
      } else {
        asr.stopASRorVAD();
        return 'off';
      }
    }
    // toggle
    if (asr.currentMode() === 'off') {
      asr.startASRorVAD((_t, _f) => {}, true);
    } else {
      asr.stopASRorVAD();
    }
    return String(asr.currentMode());
  } catch {
    return 'error';
  }
};

export { };

