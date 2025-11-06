// =============================================================
// File: src/ui/settings-asr.ts
// =============================================================
import { speechStore } from '../state/speech-store';

export function mountAsrSettings(containerSelector = '#settingsSpeech, #settings, body') {
  const host = document.querySelector(containerSelector) || document.body;
  const box = document.createElement('section');
  box.className = 'settings-card asr';
  box.innerHTML = `
    <h3>ASR</h3>
    <div class="grid" style="gap:8px;grid-template-columns: repeat(auto-fit,minmax(160px,1fr));">
      <label>Engine
        <select id="asrEngine">
          <option value="webspeech">Web Speech (browser)</option>
          <option value="vosk">Offline (WASM)</option>
          <option value="whisper">Server (Whisper bridge)</option>
        </select>
      </label>
      <label>Language
        <input id="asrLang" type="text" placeholder="en-US" />
      </label>
      <label><input id="asrInterim" type="checkbox" /> Use interim results</label>
      <label><input id="asrFillers" type="checkbox" /> Filter filler words</label>
      <label>Threshold
        <input id="asrThresh" type="number" step="0.01" min="0" max="1" />
      </label>
      <label>Endpointing (ms)
        <input id="asrEndMs" type="number" min="200" step="50" />
      </label>
    </div>
  `;
  host.appendChild(box);

  const $ = <T extends HTMLElement>(id: string) => box.querySelector<T>(id)!;
  const eng = $('#asrEngine') as HTMLSelectElement;
  const lang = $('#asrLang') as HTMLInputElement;
  const interim = $('#asrInterim') as HTMLInputElement;
  const fillers = $('#asrFillers') as HTMLInputElement;
  const thresh = $('#asrThresh') as HTMLInputElement;
  const endms = $('#asrEndMs') as HTMLInputElement;

  const s = speechStore.get();
  eng.value = s.engine;
  lang.value = s.lang;
  interim.checked = s.interim;
  fillers.checked = s.fillerFilter;
  thresh.value = String(s.threshold);
  endms.value = String(s.endpointingMs);

  eng.addEventListener('change', () => speechStore.set({ engine: eng.value as any }));
  lang.addEventListener('change', () => speechStore.set({ lang: lang.value }));
  interim.addEventListener('change', () => speechStore.set({ interim: interim.checked }));
  fillers.addEventListener('change', () => speechStore.set({ fillerFilter: fillers.checked }));
  thresh.addEventListener('change', () => speechStore.set({ threshold: clamp(+thresh.value, 0, 1) }));
  endms.addEventListener('change', () => speechStore.set({ endpointingMs: Math.max(200, Math.round(+endms.value)) }));
}

function clamp(n: number, lo: number, hi: number) { return Math.max(lo, Math.min(hi, n)); }
