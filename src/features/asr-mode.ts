// =============================================================
// File: src/features/asr-mode.ts
// =============================================================
import type { AsrStateEvent, TranscriptEvent } from '../asr-types';
import { emit } from '../events';
import type { AsrEngine, AsrEngineName, AsrEvent } from '../speech/asr-engine';
import { normalizeText, stripFillers } from '../speech/asr-engine';
import { WebSpeechEngine } from '../speech/engines/webspeech';
import { getSpeechStore, type SpeechState } from './speech/speech-store';
import { emitScrollIntent } from '../scroll/scroll-intent-bus';

// How many lines the viewport is allowed to jump per ASR advance
const ASR_MAX_VISUAL_LEAP = 3;
// Track which line the screen is currently showing as "active"
let asrDisplayIndex = 0;

const RESCUE_JUMPS_ENABLED = false; // temp gate: log rescues without forcing hard jumps

declare global {
  interface Window {
    __tpAsrDebug?: { dump: () => AsrDebugConfig | null };
  }
}

interface AsrDebugConfig {
  engine: string;
  lang: string;
  useInterimResults: boolean;
  filterFillers: boolean;
  threshold: number;
  endpointingMs: number;
  timestamp: number;
}

const asrDebugState: { config: AsrDebugConfig | null } = { config: null };

function updateAsrDebugConfig(state: SpeechState): AsrDebugConfig {
  const snapshot: AsrDebugConfig = {
    engine: state.engine,
    lang: state.lang,
    useInterimResults: state.interim,
    filterFillers: state.fillerFilter,
    threshold: state.threshold,
    endpointingMs: state.endpointingMs,
    timestamp: Date.now(),
  };
  asrDebugState.config = snapshot;
  return snapshot;
}

function dumpAsrDebugConfig(): AsrDebugConfig | null {
  const cfg = asrDebugState.config;
  if (cfg) {
    try { console.table(cfg); } catch {}
  }
  return cfg;
}

if (typeof window !== 'undefined') {
  const win = window as any;
  if (!win.__tpAsrDebug) {
    win.__tpAsrDebug = { dump: dumpAsrDebugConfig };
  }
}

function isTpDevMode(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    const win = window as any;
    const params = new URLSearchParams(win.location.search || '');
    if (params.has('dev')) return true;
    const hash = (win.location.hash || '').replace(/^#/, '').toLowerCase();
    if (hash === 'dev' || hash === 'dev=1' || hash.includes('dev=1')) return true;
    if (win.__TP_DEV || win.__TP_DEV1 || win.__tpDevMode) return true;
    if (win?.localStorage?.getItem('tp_dev_mode') === '1') return true;
  } catch {
    return false;
  }
  return false;
}

function logAsrDebug(label: string, data: unknown): void {
  if (!isTpDevMode()) return;
  try { console.log(label, data); } catch {}
}

function logAsrEndpoint(action: string, detail?: Record<string, unknown>): void {
  if (!isTpDevMode()) return;
  try {
    const { endpointingMs } = getSpeechStore().get();
    const scrollState = (window as any).__tpAsrScrollState;
    console.log('[ASR endpoint]', { action, endpointMs: endpointingMs, scroll: scrollState, ...detail });
  } catch {}
}

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
  private lastAdvanceAt = 0;
  private readonly PROGRESS_TIMEOUT_MS = 8000;
  private progressWatchTimer: number | null = null;
  
  // ASR feed-forward: track reading speed to lead the target
  private tokensPerSec = 0;
  private lastPartialTs = 0;
  private lastPartialTokens = 0;
  
  // Transcript event throttling
  private lastTxAt = 0;
  private readonly TX_MIN_INTERVAL_MS = 90; // ~10–12 Hz max

  constructor(opts?: AsrModeOptions) {
    this.opts = {
      rootSelector: opts?.rootSelector ?? '#script, #scriptRoot, body',
      lineSelector: opts?.lineSelector ?? '.line, p',
      markerOffsetPx: opts?.markerOffsetPx ?? 140,
      windowSize: opts?.windowSize ?? 6,
    };
  }

  getState() { return this.state; }

  async setEnabled(enabled: boolean): Promise<void> {
    if (enabled) {
      if (this.state === 'idle') await this.start();
    } else {
      if (this.state !== 'idle') await this.stop();
    }
  }

  async start(): Promise<void> {
    const s = getSpeechStore().get();
    const cfgSnapshot = updateAsrDebugConfig(s);
    logAsrDebug('[ASR session start cfg]', cfgSnapshot);
    this.engine = createEngine(s.engine as AsrEngineName);
    bindEngine(this.engine, (e: AsrEvent) => this.onEngineEvent(e));

    this.currentIdx = clamp(this.currentIdx, 0, this.getAllLineEls().length - 1);
    asrDisplayIndex = this.currentIdx;

    this.setState('ready');
    const endpointingMs = Math.max(1400, s.endpointingMs);
    await this.engine.start({
      lang: s.lang,
      interim: s.interim,
      endpointingMs,
      profanityFilter: false,
    });
    logAsrEndpoint('ARM', { state: this.state });
  }

  async stop(): Promise<void> {
    logAsrEndpoint('STOP', { state: this.state, reason: 'manual-stop', scope: 'session-stop' });
    await this.engine?.stop();
    this.setState('idle', 'manual-stop');
  }

  private onEngineEvent(e: AsrEvent) {
    if (e.type === 'ready') this.setState('ready');
    if (e.type === 'listening') this.setState('listening');

    if (e.type === 'partial' || e.type === 'final') {
      if (this.state !== 'running') this.setState('running');
      const text = this.prepareText(e.text);
      const isFinal = e.type === 'final';
      const confidence = e.confidence ?? (isFinal ? 1 : 0.5);
      
      // Emit transcript event (throttled for partials)
      this.emitTranscript({
        text,
        confidence,
        partial: !isFinal,
        final: isFinal,
        lineIndex: isFinal ? this.currentIdx : undefined,
      });
      
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
      
      this.tryAdvance(text, isFinal, confidence);
    }

    if (e.type === 'error') {
      this.setState('error', e.message);
      this.dispatch('asr:error', { code: e.code, message: e.message });
    }
    if (e.type === 'stopped') {
      this.setState('idle');
    }
  }

  private setState(next: AsrState, reason?: string) {
    this.state = next;
    this.dispatch('asr:state', { state: next, reason });
    this.emitAsrState(next, reason);

    if (next === 'running') {
      this.lastAdvanceAt = performance.now();
      this.startProgressWatchdog();
    } else {
      this.stopProgressWatchdog();
      asrDisplayIndex = 0;
    }
  }

  private prepareText(s: string): string {
    const st = getSpeechStore().get();
    const normalized = normalizeText(s);
    const filtered = st.fillerFilter ? stripFillers(s) : normalized;
    if (st.fillerFilter && filtered !== normalized) {
      logAsrDebug('[ASR fillers]', { raw: normalized, filtered });
    }
    return filtered;
  }
  
  /**
   * Gate: only emit transcript events in dev OR when explicitly enabled in Settings
   */
  private shouldEmitTx(): boolean {
    return true;
  }
  
  /**
   * Emit transcript event with throttling for partials
   */
  private emitTranscript(detail: Omit<TranscriptEvent, 'timestamp'>): void {
    if (!this.shouldEmitTx()) return;
    const currentState = getSpeechStore().get();
    logAsrDebug('[ASR cfg]', { useInterimResults: currentState.interim });
    logAsrDebug('[ASR event]', {
      final: detail.final,
      len: typeof detail.text === 'string' ? detail.text.trim().length : 0,
      text: detail.text,
    });
    const now = performance.now();
    if (now - this.lastTxAt < this.TX_MIN_INTERVAL_MS && !detail.final) return; // throttle partials
    this.lastTxAt = now;
    const payload = { ...detail, timestamp: now };
    
    // Emit primary captions event
    emit<TranscriptEvent>('tp:captions:transcript', payload);
    // Also emit legacy speech event for backwards compatibility
    emit<TranscriptEvent>('tp:speech:transcript', payload);
  }
  
  /**
   * Emit ASR state change event
   */
  private emitAsrState(state: AsrStateEvent['state'], reason?: string): void {
    if (!this.shouldEmitTx()) return;
    const payload = { state, reason, timestamp: performance.now() };
    
    // Emit primary captions event
    emit<AsrStateEvent>('tp:captions:state', payload);
    // Also emit legacy speech event for backwards compatibility
    emit<AsrStateEvent>('tp:speech:state', payload);
  }

  private tryAdvance(hyp: string, isFinal: boolean, confidence: number) {
    const { lines, idx0 } = this.getWindow();
    const threshold = getSpeechStore().get().threshold;

    let bestIdx = -1; let bestScore = 0;
    for (let i = 0; i < lines.length; i++) {
      const coverage = coverageScore(lines[i], hyp);
      const score = coverage * confidence;
      if (score > bestScore) { bestScore = score; bestIdx = i; }
    }
    logAsrDebug('[ASR threshold]', {
      threshold,
      bestScore,
      bestIdx,
      accepted: bestScore >= threshold,
      idx0,
      isFinal,
    });

    if (bestIdx >= 0 && bestScore >= threshold) {
      let newIdx = idx0 + bestIdx;
      
      // Feed-forward: lead the target slightly when reading actively
      const leadLines = this.getReadingLeadLines();
      if (leadLines > 0) {
        newIdx = Math.min(newIdx + leadLines, this.getAllLineEls().length - 1);
      }
      
      if (newIdx >= this.currentIdx) {
        this.currentIdx = newIdx;
        this.markAdvance();
        const blockIdx = this.resolveBlockIdxFromLine(newIdx);
        if (blockIdx != null) {
          emitScrollIntent({
            source: 'asr',
            kind: 'seek_block',
            target: { blockIdx },
            confidence: bestScore,
            ts: Date.now(),
            reason: isFinal ? 'asr_match_final' : 'asr_match_interim',
          });
        }
        this.dispatch('asr:advance', { index: newIdx, score: bestScore, lead: leadLines });
      }
    } else if (isFinal) {
      // Rescue attempt on weak finals: nudge by one to keep momentum
      this.rescueCount++;
      if (this.rescueCount <= 2) {
        const rescueIdx = Math.min(this.currentIdx + 1, this.getAllLineEls().length - 1);
        this.dispatch('asr:rescue', { index: rescueIdx, reason: 'weak-final' });
        if (RESCUE_JUMPS_ENABLED) {
          this.currentIdx = rescueIdx;
          this.markAdvance();
          const blockIdx = this.resolveBlockIdxFromLine(this.currentIdx);
          if (blockIdx != null) {
            emitScrollIntent({
              source: 'asr',
              kind: 'seek_block',
              target: { blockIdx },
              confidence: 0,
              ts: Date.now(),
              reason: 'asr_rescue',
            });
          }
        }
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
        window.scrollTo({ top, behavior: 'auto' });
      } else {
        (scroller as HTMLElement).scrollTo({ top, behavior: 'auto' });
      }
    });
  }

  private markAdvance() {
    this.lastAdvanceAt = performance.now();
  }

  private scrollWithClamp(targetIdx: number) {
    if (!Number.isFinite(targetIdx)) return;

    if (asrDisplayIndex === 0) {
      asrDisplayIndex = targetIdx;
    }

    const diff = targetIdx - asrDisplayIndex;
    const clampedDiff = clamp(diff, -ASR_MAX_VISUAL_LEAP, ASR_MAX_VISUAL_LEAP);
    asrDisplayIndex += clampedDiff;

    this.scrollToLine(Math.round(asrDisplayIndex));
  }

  private resolveBlockIdxFromLine(lineIdx: number): number | null {
    const els = this.getAllLineEls();
    const target = els[lineIdx];
    if (!target) return null;
    const blockEl = target.closest('.tp-asr-block') as HTMLElement | null;
    const raw = blockEl?.dataset?.tpBlock;
    const idx = Number(raw);
    return Number.isFinite(idx) ? idx : null;
  }

  private startProgressWatchdog() {
    if (this.progressWatchTimer != null) return;

    const loop = () => {
      if (this.state !== 'running') {
        this.progressWatchTimer = null;
        return;
      }

      const idleFor = performance.now() - this.lastAdvanceAt;
      if (idleFor > this.PROGRESS_TIMEOUT_MS) {
        this.progressWatchTimer = null;
        try { this.engine?.stop(); } catch {}
        this.dispatch('asr:warning', { type: 'no-progress', idleMs: idleFor });
        this.setState('idle', 'timeout');
        return;
      }

      this.progressWatchTimer = window.setTimeout(loop, 1000);
    };

    this.progressWatchTimer = window.setTimeout(loop, 1000);
  }

  private stopProgressWatchdog() {
    if (this.progressWatchTimer != null) {
      window.clearTimeout(this.progressWatchTimer);
      this.progressWatchTimer = null;
    }
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
