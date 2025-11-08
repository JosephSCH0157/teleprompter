// =============================================================
// File: src/features/asr-mode.ts
// =============================================================
import type { AsrEngine, AsrEngineName, AsrEvent } from '../speech/asr-engine';
import { normalizeText, stripFillers } from '../speech/asr-engine';
import { WebSpeechEngine } from '../speech/engines/webspeech';
import { speechStore } from '../state/speech-store';

export type AsrState = 'idle' | 'ready' | 'listening' | 'running' | 'error';

export interface AsrModeOptions {
  // DOM hooks
  rootSelector?: string;         // container holding .line elements
  lineSelector?: string;         // line selector within root
  markerOffsetPx?: number;       // top marker line offset
  windowSize?: number;           // lines to consider ahead
}

export class AsrMode {
  private engine: AsrEngine | null = null;
  private state: AsrState = 'idle';
  private opts: Required<AsrModeOptions>;
  private currentIdx = 0;
  private rescueCount = 0;
  
  // ASR feed-forward: track reading speed to lead the target
  private tokensPerSec = 0;
  private lastPartialTs = 0;
  private lastPartialTokens = 0;

  constructor(opts?: AsrModeOptions) {
    this.opts = {
      rootSelector: opts?.rootSelector ?? '#script, #scriptRoot, body',
      lineSelector: opts?.lineSelector ?? '.line, p',
      markerOffsetPx: opts?.markerOffsetPx ?? 140,
      windowSize: opts?.windowSize ?? 6,
    };
  }

  getState() { return this.state; }

  async start(): Promise<void> {
    const s = speechStore.get();
  this.engine = createEngine(s.engine);
  bindEngine(this.engine, (e: AsrEvent) => this.onEngineEvent(e));

    this.setState('ready');
    await this.engine.start({
      lang: s.lang,
      interim: s.interim,
      endpointingMs: s.endpointingMs,
      profanityFilter: false,
    });
  }

  async stop(): Promise<void> {
    await this.engine?.stop();
    this.setState('idle');
    this.dispatch('asr:state', { state: this.state });
  }

  private onEngineEvent(e: AsrEvent) {
    if (e.type === 'ready') this.setState('ready');
    if (e.type === 'listening') this.setState('listening');

    if (e.type === 'partial' || e.type === 'final') {
      if (this.state !== 'running') this.setState('running');
      const text = this.prepareText(e.text);
      
      // Feed-forward: track token rate on partials
      if (e.type === 'partial') {
        const now = performance.now();
        const tokens = text.split(/\s+/).filter(Boolean).length;
        if (this.lastPartialTs) {
          const dtSec = (now - this.lastPartialTs) / 1000;
          if (dtSec > 0 && tokens > this.lastPartialTokens) {
            const rate = (tokens - this.lastPartialTokens) / dtSec;
            this.tokensPerSec = 0.8 * this.tokensPerSec + 0.2 * rate;
          }
        }
        this.lastPartialTs = now;
        this.lastPartialTokens = tokens;
      }
      
      this.tryAdvance(text, e.type === 'final', e.confidence ?? (e.type === 'final' ? 1 : 0.5));
    }

    if (e.type === 'error') {
      this.setState('error');
      this.dispatch('asr:error', { code: e.code, message: e.message });
    }
    if (e.type === 'stopped') {
      this.setState('idle');
    }
  }

  private setState(next: AsrState) {
    this.state = next;
    this.dispatch('asr:state', { state: next });
  }

  private prepareText(s: string): string {
    const st = speechStore.get();
    return st.fillerFilter ? stripFillers(s) : normalizeText(s);
  }

  private tryAdvance(hyp: string, isFinal: boolean, confidence: number) {
    const { lines, idx0 } = this.getWindow();
    const threshold = speechStore.get().threshold;

    let bestIdx = -1; let bestScore = 0;
    for (let i = 0; i < lines.length; i++) {
      const coverage = coverageScore(lines[i], hyp);
      const score = coverage * confidence;
      if (score > bestScore) { bestScore = score; bestIdx = i; }
    }

    if (bestIdx >= 0 && bestScore >= threshold) {
      let newIdx = idx0 + bestIdx;
      
      // Feed-forward: lead the target slightly when reading actively
      const leadLines = this.getReadingLeadLines();
      if (leadLines > 0) {
        newIdx = Math.min(newIdx + leadLines, this.getAllLineEls().length - 1);
      }
      
      if (newIdx >= this.currentIdx) {
        this.currentIdx = newIdx;
        this.scrollToLine(newIdx);
        this.dispatch('asr:advance', { index: newIdx, score: bestScore, lead: leadLines });
      }
    } else if (isFinal) {
      // Rescue attempt on weak finals: nudge by one to keep momentum
      this.rescueCount++;
      if (this.rescueCount <= 2) {
        this.currentIdx = Math.min(this.currentIdx + 1, this.getAllLineEls().length - 1);
        this.scrollToLine(this.currentIdx);
        this.dispatch('asr:rescue', { index: this.currentIdx, reason: 'weak-final' });
      }
    }
  }
  
  /**
   * Calculate reading lead in lines based on current token rate
   * @returns Number of lines to lead (0-3)
   */
  private getReadingLeadLines(): number {
    // ~1 line per 8 tokens (tune per your scripts)
    const linesPerSec = this.tokensPerSec / 8;
    // Lead ~600ms ahead so scroll "meets you" instead of "chases you"
    return Math.max(0, Math.min(3, Math.round(linesPerSec * 0.6)));
  }

  private getWindow() {
    const els = this.getAllLineEls();
    const start = clamp(this.currentIdx, 0, Math.max(0, els.length - 1));
    const end = clamp(start + this.opts.windowSize, 0, els.length);
    const texts = els.slice(start, end).map(el => normalizeText(el.textContent || ''));
    return { lines: texts, idx0: start };
  }

  private getAllLineEls(): HTMLElement[] {
    const root = document.querySelector<HTMLElement>(this.opts.rootSelector) || document.body;
    const list = Array.from(root.querySelectorAll<HTMLElement>(this.opts.lineSelector));
    return list.length ? list : Array.from(document.querySelectorAll<HTMLElement>('.line, p'));
  }

  private scrollToLine(idx: number) {
    const els = this.getAllLineEls();
    const target = els[idx];
    if (!target) return;

    // Hold scrolling during pre-roll countdown, if visible
    try {
      const ov = document.getElementById('countOverlay') as HTMLElement | null;
      if (ov) {
        const cs = getComputedStyle(ov);
        const visible = cs.display !== 'none' && cs.visibility !== 'hidden' && !ov.classList.contains('hidden');
        if (visible) return;
      }
    } catch {}

    const scroller = findScroller(target);
    const marker = this.opts.markerOffsetPx;

    const top = elementTopRelativeTo(target, scroller) - marker;
    requestAnimationFrame(() => {
      if (scroller === document.scrollingElement || scroller === document.body) {
        window.scrollTo({ top, behavior: 'smooth' });
      } else {
        (scroller as HTMLElement).scrollTo({ top, behavior: 'smooth' });
      }
    });
  }

  private dispatch(name: string, detail: any) {
    window.dispatchEvent(new CustomEvent(name, { detail }));
  }
}

function createEngine(name: AsrEngineName): AsrEngine {
  switch (name) {
    case 'webspeech': return new WebSpeechEngine();
    case 'vosk': throw new Error('Vosk WASM engine not implemented yet');
    case 'whisper': throw new Error('Whisper bridge engine not implemented yet');
  }
}

function bindEngine(engine: AsrEngine, fn: (_e: AsrEvent) => void) {
  try { engine.on(fn); } catch {}
}

function clamp(n: number, lo: number, hi: number) { return Math.max(lo, Math.min(hi, n)); }

function coverageScore(line: string, hyp: string): number {
  const A = new Set(line.split(' ').filter(Boolean));
  const B = new Set(hyp.split(' ').filter(Boolean));
  let inter = 0;
  for (const w of A) if (B.has(w)) inter++;
  if (!A.size) return 0;
  return inter / A.size;
}

function findScroller(el: HTMLElement): Element | null {
  let node: any = el.parentElement;
  while (node) {
    const style = getComputedStyle(node);
    if (/(auto|scroll)/.test(style.overflowY || '')) return node;
    node = node.parentElement;
  }
  return document.scrollingElement || document.body;
}

function elementTopRelativeTo(el: HTMLElement, scroller: any): number {
  const r1 = el.getBoundingClientRect();
  const r2 = (scroller === document.scrollingElement || scroller === document.body)
    ? { top: 0 } as DOMRect
    : (scroller as HTMLElement).getBoundingClientRect();
  const scrollTop = (scroller === document.scrollingElement || scroller === document.body)
    ? window.pageYOffset
    : (scroller as HTMLElement).scrollTop;
  return r1.top - r2.top + scrollTop;
}
