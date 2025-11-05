// =============================================================
// File: src/ui/topbar-asr.ts
// =============================================================
import { AsrMode } from '../features/asr-mode';
import { speechStore } from '../state/speech-store';

export class AsrTopbar {
  private chip!: HTMLSpanElement;
  private running = false;

  constructor(private mode: AsrMode) {}

  mount(targetSelector = '#topbarRight, .topbar, header, body') {
    const host = document.querySelector(targetSelector) || document.body;
    const wrap = document.createElement('div');
    wrap.className = 'asr-topbar flex items-center gap-2';

    this.chip = document.createElement('span');
    this.chip.className = 'rounded-full px-2 py-1 text-xs font-medium bg-gray-700 text-white';
    this.chip.textContent = 'ASR: off';

    wrap.appendChild(this.chip);
    host.appendChild(wrap);

    window.addEventListener('asr:state', (e: any) => {
      const st = e.detail?.state as string;
      const map: Record<string,string> = { idle: 'off', ready: 'ready', listening: 'listening', running: 'listening', error: 'error' };
      this.chip.textContent = `ASR: ${map[st] ?? st}`;
      if (st === 'idle' || st === 'error') { this.running = false; }
      if (st === 'running' || st === 'listening' || st === 'ready') { this.running = true; }
    });

    // hint: show engine/lang on hover
    this.chip.title = (() => {
      const s = speechStore.get();
      return `Engine: ${s.engine}  •  Lang: ${s.lang}`;
    })() as unknown as string;
  }

  // No toggle UI anymore; ASR start/stop is wired to Speech Sync + mode changes.
}
