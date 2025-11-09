# Teleprompter Pro — Changelog

## v1.6.0-scroll-router (2025-11-09)

**Scroll Architecture Refactor**

- **UI Scroll Mode Router**: Unified `setScrollMode()` / `getScrollMode()` API coordinates all scroll subsystems
  - Single coordinator function (`applyUiScrollMode`) maps UI modes → internal modes
  - Routes to: Scroll Brain mode, Clamp mode (anti-jitter), ASR enabled state, Auto-scroll system
  - Exposed globally: `window.setScrollMode()`, `window.getScrollMode()`, `window.__tpScrollBrain`
  - Auto-scroll system integration: Timed and ASR modes now properly enable/disable window.\_\_tpAuto
- **Scroll Brain**: New TypeScript module manages all scroll movement
  - Modes: `'manual' | 'auto' | 'hybrid' | 'step' | 'rehearsal'`
  - Single requestAnimationFrame loop for all programmatic scrolling
  - Clean separation: UI mode (user-facing) vs internal mode (implementation)

- **WPM Mode**: Intelligent auto-scroll based on speech rate
  - Estimates words per minute from speech recognition tokens
  - Automatically adjusts scroll speed to match speaking pace
  - Live WPM display: "≈ {wpm} WPM → {pxs} px/s" updated every 200ms
  - Target WPM input for baseline speed (persisted to localStorage)
  - Typography-aware conversion using `mapWpmToPxPerSec()`
  - UI automatically toggles between manual speed controls and WPM controls

- **Clamp Mode Refactor**: Renamed from `scrollMode` to `clampMode` in scroll-control.js
  - Three modes: `'follow'` (monotonic forward), `'backtrack'` (allow reversal), `'free'` (no constraints)
  - ASR mode automatically enables `'follow'` clamp to prevent back-jogs
  - Exposed via `window.__tpSetClampMode()` for router coordination

- **ASR Integration**: Simplified control via `setEnabled(boolean)` method
  - ASR instance exposed as `window.__tpAsrMode`
  - Router automatically starts/stops ASR based on UI mode selection
  - Clean lifecycle: UI mode `'asr'` → hybrid brain + follow clamp + ASR on

- **Type Safety**: Full TypeScript support for scroll modes and event system
  - `ScrollMode` type exported from scroll-brain
  - `UiScrollMode` type for user-facing modes
  - Proper interface contracts for all scroll subsystems

**Bug Fixes**

- **Pre-roll Timing**: Fixed auto-scroll starting during countdown instead of after
  - Moved `tp:autoIntent` event dispatch from before `beginCountdownThen()` to inside callback
  - Ensures proper sequence: pause during "3...2...1..." → start scrolling after countdown completes
- **Speed Input Reactivity**: Fixed speed slider/input not responding in timed mode
  - Replaced direct element event listeners with document-level event delegation
  - Speed changes now apply immediately to running auto-scroll via `Auto.setSpeed()`
  - Handles input, change, and wheel events reliably regardless of DOM timing

## Unreleased

Stability and alignment improvements across matching, scrolling, and observability.

- Match/Scroll
  - Monotonic commit with hysteresis: require two stable hits before committing; per-commit step cap (max 6 indices); stricter backtracking (sim ≥ 0.86), forward sim ≥ 0.82; commit application throttled (~8/sec).
  - Distance-penalized candidate ranking with rarity gating: long jumps only accepted when the spoken phrase is distinctive (IDF sum ≥ 8); closer candidates favored. Junk-anchor gate v2: forbid >6-word jumps when the spoken tail is entirely junk tokens (so/and/…); keep small +8 hops only when accompanied by a distinctive token.
  - Duplicate-line disambiguation: subtract 0.08 from rank when paragraph text appears more than once; HUD shows dup, dupCount, dupPenalty.
  - Line-cluster disambiguation: penalize repeated beginnings (first 4 tokens) by ~0.06 to avoid bouncing within phrase families (e.g., “exactly … they stop … they miss …”).
  - Dynamic forward window shrink when tail tokens are common nearby to reduce far jumps in repetitive text.
  - End-of-script guard: stop scrolling when viewer is at the bottom.
  - End-game easing: tiny sim boost near the last ~30 words to reduce stalls; recheck bottom guard to never continue scrolling when at/near bottom.
  - Calm Mode: relax jump caps near end of script and increase ease step dynamically to avoid perceived slowdown.
  - Lost Mode: after jitter spike or sustained low similarity, freeze commits and re-anchor using high‑IDF 3‑gram anchors (excluding stop-words) in a widened local band.
  - Jitter meter: rolling std-dev of (bestIdx − idx) with temporary threshold elevation (~8s) on spikes.
  - Virtual lines: merge short runts into "virtual lines" for ranking/dup gating to reduce jitter on very short lines while preserving original highlighting via index mapping.
  - Coverage-based soft advance: when lingering on the same virtual line and coverage ≥ 0.82 for ~1.8s, allow a small forward hop if the next line meets a modest sim floor (≥ 0.68) to prevent stalls.
  - **PLL Controller**: Phase-Locked Loop bias controller for hybrid auto-scroll. Automatically adjusts scroll speed based on speech sync position. Features: PID-like feedback (Kp=0.022, Kd=0.0025), state machine (LOCK_SEEK/LOCKED/COAST/LOST), end-game taper (softens bias in last 20%), anchor rate-limiting (1200ms cooldown), forward-only bias at low confidence, pause breathing (faster decay during speech pauses), live readout (Lead/Lag, Bias, State), and telemetry counters.

- Speech
  - Phrase hints via SpeechGrammarList (JSGF) with small weight (0.4) for domain terms (ban, confiscation, transfer, possession); maxAlternatives increased.
  - **Pause Breathing**: PLL controller responds to speech pauses (onspeechend/onaudioend) with faster bias decay for natural feel.
  - Hybrid Auto-stop buffer: when using speech-activated Hybrid mode, auto-scroll now waits for 1.5s of continuous silence before pausing, reducing choppy stop/starts.

- HUD/Debug
  - Candidate vs commit logs separated; sim histogram and time-between-commits retained; scroll WPS gated to speech and started on first write; quiet filter for noisy tags.
  - Jitter and Lost Mode events logged; duplicate penalty fields surfaced in candidate logs (includes both original and virtual duplication info); spoken tail and line keys normalized to matcher tokens.
  - **PLL Logging**: Real-time PLL state, bias percentage, position error, and confidence in dedicated 'pll' filter.

- Scheduling/Fallback
  - Single-writer scroll scheduler; throttled commit applier and at-bottom guard; fallback nudge backoff; mid-band sim (0.72–0.80) patience (≈300ms) before nudging.

- Versioning
  - Bump to 1.6.0; update MANIFEST, VERSION.txt, HTML title, and APP_VERSION. PLL controller added to Advanced settings with live readout.

## [1.6.5] - 2025-11-08

Release: https://github.com/JosephSCH0157/teleprompter/releases/tag/v1.6.5

### Fixed

- OBS connection gating: never attempt to connect when disabled in Settings.
  - Unified armed gating across store and localStorage: prefer `__tpStore.get('obsEnabled')`; fall back to any of `tp_obs_enabled_v2`, `tp_obs_enabled_v1`, or `tp_obs_enabled`.
  - Persist all keys on toggle for compatibility; tie auto‑reconnect strictly to the armed flag; respect Rehearsal mode.
  - Exposed `window.__tpObs.{armed,setArmed,maybeConnect}` remains the single control surface.
- Auto‑record guard: when the selected recorder is OBS and it's disarmed, `doAutoRecordStart()` is a no‑op. Prevents unintended starts when OBS is off.
- ASR smoke “Mode flip no‑dup” reliability: test‑only `tp:speech-result` path now pre‑positions the index for synthetic large leaps, avoiding false suppressions in the headless harness. Runtime coverage‑based gating is unchanged.

### Tests

- Recording smoke suite remains green (fallback, handoff, idempotency).
- ASR smoke now passes “Mode flip no‑dup” along with existing gates (leap guard, freeze clamp, etc.).

## v1.5.7 — 2025-09-27

Stability baseline after init/boot fixes and camera/display guards.

- Fix: validateStandardTags now returns a message and properly closes, unblocking core definition.
- Fix: Removed stray closing brace at end of IIFE (syntax error).
- Fix: Declared missing globals (displayReady, camStream, wantCamRTC, camPC, recog, etc.).
- Fix: WebRTC signaling guards — only setRemoteDescription in `have-local-offer`, ignore late answers, only add ICE after remote description.
- Fix: Avoid duplicate cam-offer sends; safer renegotiation on camera switch.
- Improve: Settings helpers resilient before core init; avoid ReferenceErrors.
- Improve: Boot watchdog and trace retained; early minimal boot safe.
- Version: Bump to 1.5.7 and expose `window.APP_VERSION`.

This snapshot is declared the new baseline.

## [1.6.4] - 2025-11-06

Release: https://github.com/JosephSCH0157/teleprompter/releases/tag/v1.6.4

### Fixed

- UI crawl: enforce ≥60 lines for movement probes; reset viewer position; detect Auto-toggle clicks.
- Safety bridge: consistent label/data-state updates; start/stop fallback scroller; immediate scroll nudge.

### CI

- Gate passes reliably headless; OBS ws refusal remains benign WARN.

## v1.6.3 — 2025-11-06

Release hygiene and router hardening.

- Rebase hardening and conflict resolution across scroll-router; authoritative runtime remains `src/features/scroll-router.js`.
- Removed corrupted `src/features/scroll-router.ts`; added guards to prevent reintroduction:
  - TypeScript exclude and `.gitattributes` merge=ours rule
  - Pre-commit guard (`tools/guard_ts_js_shadow.js`) and CI step to block TS/JS shadowing
- Zero-warning ESLint and green TypeScript types
- Deterministic smokes stabilized: Save/UI crawl pass in CI; ASR smoke clean locally
