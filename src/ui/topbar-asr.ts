// =============================================================
// File: src/ui/topbar-asr.ts
// =============================================================
import { AsrMode } from '../features/asr-mode';
import { speechStore } from '../state/speech-store';

export class AsrTopbar {
  private chip!: HTMLSpanElement;
  private btn!: HTMLButtonElement;
  private running = false;

  constructor(private mode: AsrMode) {}

  mount(targetSelector = '#topbarRight, .topbar, header, body') {
    const host = document.querySelector(targetSelector) || document.body;
    const wrap = document.createElement('div');
    wrap.className = 'asr-topbar flex items-center gap-2';

    this.chip = document.createElement('span');
    this.chip.className = 'rounded-full px-2 py-1 text-xs font-medium bg-gray-700 text-white';
    this.chip.textContent = 'ASR: off';

  this.btn = document.createElement('button');
  // Use app's chip style for visual consistency and visibility on the top bar
  this.btn.className = 'chip asr-btn';
    this.btn.textContent = 'Start ASR';
    this.btn.addEventListener('click', () => this.toggle());

    wrap.appendChild(this.chip);
    wrap.appendChild(this.btn);
    host.appendChild(wrap);

    window.addEventListener('asr:state', (e: any) => {
      const st = e.detail?.state as string;
      const map: Record<string,string> = { idle: 'off', ready: 'ready', listening: 'listening', running: 'listening', error: 'error' };
      this.chip.textContent = `ASR: ${map[st] ?? st}`;
      if (st === 'idle' || st === 'error') { this.running = false; this.btn.textContent = 'Start ASR'; }
      if (st === 'running' || st === 'listening' || st === 'ready') { this.running = true; this.btn.textContent = 'Stop ASR'; }
    });

    // hint: show engine/lang on hover
    this.chip.title = (() => {
      const s = speechStore.get();
      return `Engine: ${s.engine}  •  Lang: ${s.lang}`;
    })() as unknown as string;
  }

  async toggle() {
    if (this.running) {
      await this.mode.stop();
      return;
    }
    // Ensure global Speech Sync is running so pre-roll/recorders and gates engage
    try {
      const body = document.body as HTMLElement | null;
      const speechOn = !!(body && (body.classList.contains('speech-listening') || body.classList.contains('listening'))) || (window as any).speechOn === true;
      if (!speechOn) {
        const recBtn = document.getElementById('recBtn') as HTMLButtonElement | null;
        recBtn?.click();
      }
    } catch {}
    await this.mode.start();
  }
}
