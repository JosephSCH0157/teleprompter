# Scroll Brain — Responsibilities and Guardrails

File: `src/scroll/scroll-brain.ts`  
Role: Central coordinator for scroll behavior (the “scroll hive mind”).

## Responsibilities

- Hold the active scroll mode in memory and expose a tiny API (e.g., `getMode()`, `setMode(mode)`, `start()`, `stop()`, optional `onModeChange()`).
- Coordinate which scroll engines are allowed/active in each mode:
  - Timed engine (autoscroll)
  - WPM adapter (wpmSpeed / wpm-bridge)
  - ASR scroll engine (asr-mode)
  - Hybrid/PLL (scroll-control)
  - Step engine (step-scroll)
  - Rehearsal clamp (rehearsal)
- Control ticking/activity state: start/stop the scroll tick loop (scheduler/RAF) when continuous engines are enabled (timed / wpm / hybrid); track “active” vs idle.
- Implement the mode → engine matrix (scroll-only) as the single source of truth.

## Canonical Modes

`timed | wpm | hybrid | asr | step | rehearsal`

## Mode → Engine Matrix

| mode       | timed engine | WPM adapter | ASR scroll | PLL/catchup         | step engine         | rehearsal clamp      |
|------------|--------------|-------------|------------|---------------------|---------------------|----------------------|
| timed      | ON           | OFF         | OFF        | minimal (end-only)  | allowed             | OFF                  |
| wpm        | ON           | ON          | OFF        | minimal (end-only)  | allowed             | OFF                  |
| asr        | OFF          | OFF         | ON         | visual smoothing    | allowed (backup)    | OFF                  |
| hybrid     | ON           | optional    | ON         | full (ASR-driven)   | allowed (secondary) | OFF                  |
| step       | OFF          | OFF         | OFF        | OFF                 | ON (primary)        | OFF                  |
| rehearsal  | OFF          | OFF         | OFF        | OFF                 | blocked by guards   | ON (clamp/guards)    |

“ON”/“OFF” means allowed & coordinated by the brain (user still has to hit Start).

## Hard Boundaries (keep scroll-brain lean)

- **No DOM access**: no `document.getElementById`, no UI event listeners. UI is handled by routers/binders (mode-router, mode-bridge, etc.).
- **No persistence**: no localStorage reads/writes (mode persistence lives in the router/persistence layer).
- **No recording/HUD/OBS coupling**: scroll-brain only coordinates scroll engines.
- **No raw viewport scrolling**: never call `scrollTop`/`scrollTo`; engines/scroll-helpers own that.
- **No direct store writes**: mode is mirrored from the app store; scroll-brain should not call `store.set('scrollMode', ...)`.

## Pasteable Header Comment for `scroll-brain.ts`

```ts
/**
 * scroll-brain.ts — "Queen" of the scroll hive
 *
 * Responsibilities:
 * - Hold the active scroll mode in memory and provide a tiny API around it.
 * - Coordinate which scroll engines are allowed to run in each mode.
 * - Start/stop the continuous scroll tick loop when appropriate.
 * - Expose a small, engine-focused surface to orchestrators (mode-router, ASR bridge, etc.).
 *
 * Canonical scroll modes (from the app store `scrollMode` key):
 *   - "timed"    : fixed px/sec autoscroll, no speech following.
 *   - "wpm"      : autoscroll where px/sec is derived from target WPM + typography metrics.
 *   - "hybrid"   : timed + ASR + PLL catchup; auto scrolls and adjusts to match speech.
 *   - "asr"      : ASR-only scroll; script moves only when speech is recognized.
 *   - "step"     : pedal/arrow step scroll only; no continuous movement.
 *   - "rehearsal": practice bubble; no engines move the script, clamp blocks programmatic scroll.
 *
 * "Manual" is NOT a mode string. Manual scrolling = no engines running and not in rehearsal;
 * the user just wheels/drags the script themselves.
 *
 * Mode → engine matrix (scroll-brain is the single place that enforces this):
 *
 *   mode       timed engine   WPM adapter   ASR scroll   PLL/catchup         step engine         rehearsal clamp
 *   ----------------------------------------------------------------------------------------------------------------
 *   "timed"    ON             OFF           OFF          minimal (end-only)  allowed             OFF
 *   "wpm"      ON             ON            OFF          minimal (end-only)  allowed             OFF
 *   "asr"      OFF            OFF           ON           visual smoothing    allowed (backup)    OFF
 *   "hybrid"   ON             optional      ON           full (ASR-driven)   allowed (secondary) OFF
 *   "step"     OFF            OFF           OFF          OFF                 ON (primary)        OFF
 *   "rehearsal"OFF            OFF           OFF          OFF                 blocked by guards   ON (clamp/guards)
 *
 * Invariants:
 * - scroll-brain never touches the DOM directly (no document.getElementById, no HTML event listeners).
 * - scroll-brain never reads/writes localStorage or any persistence keys.
 * - scroll-brain does NOT know about recording, HUD, or OBS; it only coordinates scroll engines.
 * - scroll-brain does not directly call window.scrollBy / scrollTop; engines and scroll-helpers own viewport changes.
 * - scroll-brain does not call store.set('scrollMode', ...); mode is driven by the app store and reflected here.
 *
 * Expected integration:
 * - A higher-level mode-router subscribes to store.scrollMode and calls scroll-brain.setMode(mode).
 * - Engines (timed, wpm adapter, ASR scroll, PLL, step, rehearsal clamp) are injected or referenced here
 *   and toggled ON/OFF according to the matrix above.
 * - A scheduler/RAF utility is used to tick continuous engines in timed/wpm/hybrid modes while active.
 *
 * If you add a new scroll mode or engine, update this header and the matrix first,
 * then extend the implementation to keep the Queen as the single source of truth for scroll behavior.
 */
```
