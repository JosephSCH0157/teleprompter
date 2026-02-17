# Anvil Manifest (SSOT Map)
Version: v1.8.2 (2026-02-12)

This is the canonical manifest for Anvil's runtime architecture.
Purpose: **one map, one truth** -- where state lives, who owns it, and which modules are allowed to publish globals.

If a behavior is confusing, start here before editing code.

---

## 0) Golden Rules

1. **SSOT beats convenience.** "UI mode" and "engine mode" are not the same thing.
2. **One owner per truth.** If two modules can "own" the same state, we will eventually get split-brain.
3. **Globals are views.** `window.*` exports are allowed only as thin wrappers around SSOT.
4. **Dialects must translate.** Any subsystem with its own mode vocabulary must map into canonical types.
5. **ASR is an isolated lane.** In `scrollMode='asr'`, scrolling is commit-driven only. No motor/auto-intent/tick-driven scrolling is allowed. Movement must come from ASR commit -> writer seek when the DOM is line-addressable, with pixel fallback when writer/block mapping or line-addressability is unavailable.
6. **Viewer is the canonical scroller.** Runtime scroll reads/writes must resolve through `getScrollerEl()` and target `main#viewer.viewer` (fallback `#viewer`) for main viewer role.

---

## 1) Canonical SSOT Definitions

### 1.1 EngineScrollMode (CANON)

These are the only real engine modes:

- `timed`
- `wpm`
- `hybrid`
- `asr`
- `step`
- `rehearsal`

Everything else (`auto`, `off`, `manual`) is a UI/legacy convenience state, not an engine mode.

### 1.2 Runtime SSOT Keys

`scrollMode`
- **Owner:** `appStore`
- **Type:** `EngineScrollMode`
- **Read:** `appStore.get('scrollMode')`
- **Write:** `appStore.set('scrollMode', nextMode)`

`scrollEnabled`
- **Owner:** `appStore`
- **Type:** `boolean`
- **Purpose:** Represents run-state (`on/off`) without mutating engine mode identity.
- **Contract:** Required SSOT key. `Auto Off but mode=hybrid` must be representable as `scrollMode='hybrid' && scrollEnabled=false`.

`session.asrEngaged` / `session.asrArmed`
- **Owner:** `src/state/session.ts`
- **Type:** `boolean`
- **Contract:** Must gate ASR subscription and commit handling.
- **Arm path:** `Start speech sync` while `scrollMode='asr'` must set `session.asrArmed=true` before preroll/live driver creation.

### 1.3 ASR Mode Invariants (Hard Boundaries)

In `scrollMode='asr'`:
- Must not wire auto-intent listeners.
- Must not start timed/hybrid/wpm motors.
- Router auto-intent motor normalization is motorless in ASR: requested motor kinds are `auto|hybrid` only, and ASR gate blocking reason must remain `blocked:mode-asr-motorless` (no `asr` motor lane).
- Must not use preroll to trigger any scrolling.
- `session.scrollAutoOnLive` must not gate ASR startup/attach decisions.
- ASR driver attach/readiness is independent from movement arming: mode selection with script blocks present should attach/create driver + ingest path before live.
- `session.asrArmed` gates ASR movement permission only (commit may process bookkeeping while unarmed, but must not write scroll).
- Must only move on ASR commit (`tp:asr:commit` or canonical equivalent).
- Must prefer `ScrollWriter.seekToBlockAnimated()` (writer-first) only when line-addressable commit anchors are present in meaningful quantity.
- ASR commit movement is conditionally writer-first (`seekToBlockAnimated(...)`) with commit-target refinement: writer resolves block mapping first when the DOM is line-addressable; otherwise ASR must use the non-writer targetTop path (no free-running motor lane).
- After a successful ASR commit seek, run a post-commit readability guarantee: keep the active line near the marker band (not pinned at top) while preserving forward readable lines (minimum lookahead target) so commits remain readable without jumping ahead.
- Post-commit readability nudges must preserve a marker-centered active-line band and may not push the active line above that band solely to satisfy lookahead.
- Live ASR transport may force interim capture for responsiveness; movement remains commit-gated and thresholds still arbitrate advancement.
- Forward-evidence gating must not block strong small-delta forward/same matches (`delta>=0` within relaxed-small window) when similarity is at or above required threshold.
- Forward scan must evaluate speakable multi-line windows (next-line to small joined windows) instead of single-line-only probes so natural 2-4 line utterances can advance.
- Score arbitration must bias forward continuation when transcript evidence is longer than the current line and a forward multi-line window (`span>=2`) scores at/near current-line score (within small slack) and above floor.
- If current-line match has weak lexical overlap (token-poor anchor) while a forward candidate clears floor and near-score slack, prefer forward candidate over same-line recenter.
- Weak-current forward rescue is bounded to near-forward continuity (`delta<=2`, `span<=2`) so token-poor anchors cannot trigger paragraph jumps.
- Weak-current forward rescue may activate before LOST_FORWARD when same-line overlap is sparse (token-poor anchor) and bounded forward evidence is competitive, but only with strong evidence (final/strong-score or stable-growing interim) and never from LOST_FORWARD state alone; this must remain continuity-bounded (`+1` near start, max `+2` otherwise).
- If match arbitration regresses behind the current line after a forward commit, continuation recovery must stay near-forward (`+1` preferred, max `+2`) and must not long-jump.
- First near-start commit continuity is capped (`delta<=1`, non-forced) to avoid startup overshoot from buffered multi-line transcript bursts.
- Match selection must be band-preferred: choose best candidate from the active band first (with at most a tiny backward tolerance), but allow forward-window continuation/fallback before hard rejecting.
- Live block sync (`blocks:*`) must not overwrite ASR cursor truth (`currentIndex`/driver line index); index seeding is pre-live/bootstrap behavior only.
- In live ASR after the first commit, external cursor/index sync inputs must be monotonic: they may advance cursor truth but must not regress below the committed cursor floor.
- Successful ASR commits must publish canonical cursor truth (`currentIndex`, commit index signal) immediately so downstream sync paths read the committed line.
- During continuous interim growth (`bufferGrowing`), block arbitration may use a temporary forward lookahead up to `+2` blocks and score merged forward block text (`N + N+1`) before guard arbitration, without changing global similarity thresholds.
- After forward/forced commit movement, reseed the forward match band around the committed index (small back tolerance + forward window) so stale pre-commit windows cannot trigger immediate `match_out_of_band` lockout.
- If out-of-band guard blocks a candidate, it must be non-destructive (no evidence-buffer clear and no backward reseed/poisoning side effects); continue listening for in-band forward evidence.
- Add a stuck watchdog fail-safe: in live armed ASR sessions, if commit count does not change for the watchdog window while transcript traffic continues (finals, or sustained interim bursts in long-endpoint sessions), attempt a bounded forward recovery commit from the forward scan at a low floor.
- Watchdog forward recovery must be suppressed when a strong behind competitor is present (`idx<cursor` and `sim>=max(strongBackSim, requiredThreshold)`), so stale/lagging speech fragments cannot force a forward recovery commit.
- When watchdog selects a forward recovery candidate in a growing interim stream, treat that candidate as forward-progress evidence: do not let `interim_unstable` re-block it, and carry watchdog floor into low-sim arbitration for that recovery attempt.
- Add a progressive forward continuity floor for live armed ASR: after the first forward commit, when transcript evidence is still growing and best candidate is at/forward of cursor with no strong behind competitor, allow bounded forward continuity at a low floor (default `sim>=0.20`) without lowering global thresholds.
- Add a stable interim nudge bridge: in live armed ASR after first commit, if interim transcript shows meaningful prefix stability (stable leading phrase with append-only/minor tail edits) for ~0.4-0.5s while matching current line at/above progressive floor, trigger the same one-line nudge path used by final confirmations.
- Same-line nudge/confirmation paths must apply a cue-boundary bridge: when immediate forward lines are skippable (`blank` or cue-only), allow advancing to the first speakable line within `+3` before declaring same-line/noop.
- Cue-boundary bridge progression for multi-line advancement requires an actual bridge (`>=1` skipped skippable line). Same-line final confirmation may plain-advance only `+1` to the adjacent speakable line when confidence is strong (`sim>=0.82`); otherwise plain advancement without a bridge is disallowed.
- Same-line strong-final plain `+1` nudge may bypass short-line ambiguity HOLD only when current-line lexical overlap is strong (high token hit count and ratio), with no bridge skip and adjacent speakable target only.
- Same-line final forward promotion is commit-priority, not recenter-priority: bounded speakable advance may proceed even when current-line marker delta is outside recenter-near band, as long as commit clamps/floors are satisfied.
- Strict matcher lane may apply a bounded final-forward fallback (`forceReason='final-forward-fallback'`) when same-line final confidence/overlap are strong but no forward pick survived nudge arbitration; fallback target remains cue-bridge bounded and speakable.
- Dev tuning may run a permissive matcher lane (enabled by `__tpAsrPermissiveMatcher` / `asr_matcher=permissive`, default-on in dev): tie/low-sim/ambiguity guards log diagnostics but should not hard-stop forward commit selection.
- In permissive matcher lane, same-line final completions may promote to bounded `+1` speakable advance (`forceReason='permissive-final-advance'`) and pending commit gating must honor that bypass at progressive floor.
- Same-line final forward promotions (`final-forward-nudge` / `final-forward-fallback` / `permissive-final-advance`) must propagate into pending gating so low-sim/tie arbitration cannot re-block bounded forward progress in live armed ASR.
- In permissive matcher lane, ambiguity HOLD is diagnostic-only: active hold must not suppress bounded forward final advance when same-line final evidence is strong enough to progress.
- Cue-boundary bridge widening applies to same-line confirm/nudge flow only; full commit target resolution remains bounded by the normal commit clamp window.
- When same-line cue bridge selects a forward target, pending commit must carry the same bounded bridge delta (`<=+3`) through clamp arbitration; it must not clamp back to `+1` and re-block on an intermediate cue-only line.
- Pending commit cue-bridge bypass must be true bridge-only: intermediate skipped lines must all be cue/blank/note/speaker skippable, capped to a small span (`<=2` skipped lines), and target must be speakable.
- Multi-line cue-bridge commits must satisfy a stronger floor (`sim>=0.45`); low-floor (`~0.20`) bypass is not allowed for multi-line bridge jumps.
- Live armed ASR speech stalls may trigger `tp:asr:rescue`; driver may convert that into a bounded cue-bridge forward commit (`forceReason='stall-rescue'`) only when skipped lines are cue/meta/blank and the target speakable line is within the cue bridge cap (`+3`).
- Cue-bridge nudge/confirm into speakable content requires strong evidence (`strongSim` or large sim-gap or multi-event stability); low-sim nudges must not bridge content lines.
- Add progress-based LOST_FORWARD recovery with staged forward ramping: track a no-progress streak per ingest (reset when cursor advances). At streak `>=4`, enter LOST_FORWARD stage 0 (`+10` forward window), then stage 1 (`+25`) and stage 2 (`+60`) if no progress continues; exit/reset immediately on the next forward commit.
- LOST streaking must not escalate while confidently locked on the current line: when `bestIndex===cursorLine` with healthy lock confidence (`sim>=~0.58`), treat as healthy lock and reset streak/LOST state.
- Starvation-triggered LOST_FORWARD relock is bounded and local: when starvation is detected while LOST_FORWARD is active, attempt a forward re-anchor scan only within a small bounded window (`+5` lines), choose the best local candidate, and clear LOST_FORWARD only if that candidate clears a relock threshold slightly below normal commit need. This must not widen global windows or relax global thresholds.
- Logical starvation recovery must trigger early (before time-based starvation): when `lost_forward_gate` rejects and low-sim arbitration blocks immediate continuation (`delta=0..+1`) for the configured consecutive wall streak (`>=3`), attempt the same bounded forward relock immediately.
- Add controlled final-continuation leniency: for final transcripts only, when candidate continuity is same-line or immediate-forward (`delta=0..+1`) and similarity is within a tiny epsilon of commit need (`sim >= need - 0.02`), allow continuation pathing instead of low-sim rejection. This must not apply to larger forward jumps.
- ASR token normalization must canonicalize number forms across script and ASR text: recombine split tens+ones number tokens (for example `60 8 -> 68`) and normalize `%` to `percent` so `68%` and `68 percent` share comparable tokens.
- LOST_FORWARD teleport commits must be gated: long-enough phrase evidence and forward-only cap (`+25` unless deep-lost `+60`), with either (a) anchor-token overlap (numbers/rare tokens) at strong threshold, or (b) competitive read-ahead reseek evidence at lower floor (`sim>=~0.33`) backed by meaningful content-token overlap / earliest in-window overlap.
- In `low_sim_wait`, allow a bounded micro re-lock preference to `cursor-1` only when the previous line is speakable, in the same block, and clearly stronger (`simPrev >= need` and `simPrev - simCurrent >= margin`), with strict one-line scope and cooldown.
- `Reset Script` must perform a hard ASR engine reset: stop+abort active recognizers, clear recognizer handlers/references, clear ASR runtime streak/interim state, detach/dispose ASR driver state, and require a fresh recognizer instance on the next start.
- ASR commit target selection must never land on ignorable cue-only lines (`[pause]`, `[beat]`, blank/meta lines). If a commit target is cue-only, advance only to the next speakable line within the active forward clamp window; if none exists in-window, cancel the commit.
- Marker-derived ASR anchor block resolution must be cue-safe: if `computeMarkerLineIndex()` lands on an ignorable cue/meta/blank line, probe only within the bounded cue-bridge window (`+3`) for the next speakable line; if none exists, ignore marker anchoring and fall back to committed/corpus anchors.
- Marker-based consistency gating (`nearMarker`) must use the same cue-safe marker index; when the marker lands on cue/meta/blank content and no speakable line exists within the bounded probe window (`+3`), disable near-marker rejection for that sample rather than rejecting forward spoken matches against a cue marker.
- Too-short interim fragments are noise-gated before matcher arbitration (default `<3` tokens and `<12` normalized chars): they must not run matcher arbitration or perturb forward-evidence/band state.
- Commit-time safety clamp: before ASR writer/pixel commit finalization, bound forward index delta for all commits. If forward delta exceeds the clamp window (default `+1` line), allow the full jump only when confidence is strong (default `sim>=0.82`); otherwise clamp and emit a dev `ASR_CLAMP` line.
- Commit-time hard deny: any forward commit jump beyond `+1` line must satisfy multi-jump confidence floor (`sim>=0.45`), with a hard deny floor (`sim<0.30`) that never permits multi-line commit.
- Ambiguity arbitration is hold-first: when near-line candidates are low-confidence, near-tied, or low-information weak matches, enter HOLD (no commit), keep ingesting, and only exit on resolved confidence or strong forward anchor relock.
- Short-line ambiguity rule: when best candidate line is short (`<=7` content tokens), runner-up is nearby (`±1..2`) with a small sim gap (`<=0.08`), and confidence is weak/moderate, enter HOLD immediately (no commit, no cue-bridge) when overlap is sparse (`<=2`) or best/runner-up are near-duplicate in structure (shared start/end tokens or same-shape high-prefix match).
- Short-line ambiguity must not block clear anchor recovery: if a strong long-anchor candidate is present in the bounded forward window (`+8`), skip HOLD for that sample and prefer the long-anchor candidate (bounded leap) over adjacent short-line tie candidates.
- While short-line ambiguity HOLD applies to non-final evidence, forced recovery paths (`lost-forward`/watchdog/progressive-floor forcing) and cue-bridge progression are suppressed; keep ingesting until strong anchor rescue resolves.
- HOLD anchor rescue must stay bounded and strong: while HOLD is active, scan only the bounded forward window (`+8` lines) and relock only on long anchor evidence (long content line, strong similarity, meaningful shared content, and margin over runner-up).
- LOST_FORWARD rescue must de-prioritize adjacent short-line tie pockets (`±1..2` short candidates with near-tied scores) and prefer bounded strong long-anchor relock when present.
- AUTO_INTENT `reason='scriptEnd'` must never terminate live armed ASR sessions; router must ignore that stop-intent in `mode='asr' && phase='live' && session.asrArmed=true`.
- Post-commit grace rollback is one-shot and bounded: within a short post-commit window, if `cursor-1` is decisively stronger than current evidence, allow a single one-line rollback correction and apply cooldown to prevent backstep oscillation.
- Same-line final confirmations must prefer the bounded nudge path over forced outrun escalation: when final best match equals cursor with sufficient confidence, suppress forced outrun arbitration and let nudge/select-forward logic decide the next line.
- Scroll-event brake classification must treat recent ASR/writer programmatic scroll writes as `programmatic-writer` and must not emit `manual-scroll` brake reasons for those writes.
- ASR guard profile defaults are relaxed for forward continuity: shorter same-line throttle, lower forced-evidence floors, and earlier watchdog recovery with a still-bounded forward window.
- Non-finite (`NaN`/`Infinity`) values in ASR target/scroll math must be guarded at the writer and commit path choke points; reject the write/step and emit a dev-only diagnostic guard line.
- Forward-evidence gating may still block backward moves, large forward skips, and ambiguous multi-line collisions.
- For short-final utterances inside the recent-forward window, strong forward candidates above floor may satisfy forced-evidence without requiring the general token/char minima.
- Pixel `driveToLine` is fallback only when writer or block mapping is unavailable.
- WebSpeech `onend` while ASR session is active must auto-restart recognizer; explicit stop must not auto-restart.

---

## 2) Folder Map and Responsibilities

### `src/state/`
**App-wide SSOT state and persistence.**
- `src/state/app-store.ts`
  - defines storage keys for scroll prefs (timed speed, WPM target, hybrid attack/release/idle, step px, rehearsal prefs)
  - performs migration/normalization of stored modes
- `src/state/session.ts`
  - session-phase & ASR readiness/arming flags used to gate runtime behavior

**Rule:** state belongs here; other folders read/write via appStore only.

---

### `src/scroll/`
**Scroll engines and the engine routing layer.**
- `src/scroll/scroll-brain.ts`
  - canonical engine-mode union (currently the best "truth" location for mode vocabulary)
  - coordination logic for hybrid/timed/asr behavior (PLL/catchup, silence gating, etc.)
- `src/scroll/mode-router.ts`
  - maps engineMode -> which engines enable/disable
- `src/scroll/asr-mode.ts`, `src/scroll/asr-bridge.ts`
  - ASR-driven scrolling engine + event bridge (`tp:asr:*`)
- `src/scroll/wpm.ts`, `src/scroll/wpmSpeed.ts`, `src/scroll/wpm-bridge.ts`
  - WPM -> px/sec conversion and sidebar plumbing (`tp:wpm:change`)
- `src/scroll/step-scroll.ts`
  - discrete step scrolling; respects rehearsal clamp
- `src/scroll/rehearsal.ts`
  - clamp/guard behavior for rehearsal mode
- `src/scroll/scroll-control.ts`
  - core tick/RAF controller for continuous movement
- `src/scroll/scroller.ts`
  - canonical scroller resolver (`getScrollerEl('main'|'display')`)
  - `main` role resolves `main#viewer.viewer` then `#viewer`
  - all movement paths must reuse this resolver (no direct `document.scrollingElement` fallbacks)

**Rule:** This folder controls engines. It should not invent new mode unions outside canon.

---

### `src/features/scroll/`
**UI-to-engine glue layer (mode chips, router helpers, UI state).**
- `src/features/scroll/mode-router.ts`
  - currently defines a broader dialect including `auto` and `off`
- `src/features/scroll/mode-chip.ts`
  - UI control surface for selecting mode

**Rule:** Allowed to speak UI dialect, but must translate to canonical engine modes before touching SSOT.

---

### `src/features/kick/`
**Manual scroll nudge contract.**
- `src/features/kick/kick.ts`
  - Kick is manual movement and must not depend on motors or auto-intent.
  - Kick resolves scroller by viewer role (`main` vs `display`) before moving.
  - Kick path:
    - in `scrollMode='asr'`, Kick is manual forward assist (advance to next ASR block via writer seek)
    - prefer writer seek when block mapping is available
    - otherwise perform a small pixel nudge fallback
  - Kick must be wired from typed bindings only (hotkeys + button).
  - Hotkey typing-target suppression may only block true typing surfaces (`input`, `textarea`, or contenteditable); actionable buttons (including `#recBtn`) must not suppress Kick.
  - Dev-only debug global is allowed; production global publish is forbidden.

---

### `src/ui/`
**UI rendering and user interactions.**
- `src/ui/scrollMode.ts`
  - UI-level ScrollMode union currently missing `auto/off`
- `src/ui/dom.ts`
  - UI utilities and (currently) some `getScrollMode` hooks

**Rule:** UI should not own SSOT. It asks SSOT what is true.

---

### `src/hud/`
**HUD / indicators and display widgets.**
- `src/hud/scroll-strip.ts`
  - ScrollMode union used for display strip

**Rule:** HUD reads state; it should not define "truth unions" that drift.

---

### `src/settings/`
**UI prefs not strictly "engine state."**
- `src/settings/uiPrefs.ts`
  - UI preference schema (ex: `hybridGate`)

---

### `src/speech/`
**Speech subsystems (ASR loader, speech hooks).**
- (varies)
- `src/features/speech-loader.ts`
  - tracks last scroll mode as observed and may react to mode changes
  - for `reason='blocks:scroll-mode'`, ASR index seeding is block-native:
    - resolve block cursor first
    - derive line cursor from block range
    - skip cue-only lines (`[pause]`, `[beat]`, `[reflective pause]`) to first speakable line in the block
  - ASR cursor/evidence domain is speakable-line based (rendered cue/tag/note-only lines remain visible but are excluded from match/cursor math)

---

### `src/profile/`
**User profile schema and persistence for cross-device settings.**
- `src/profile/profile-schema.ts`
  - profile scroll mode dialect: `timed | wpm | asr | hybrid | off`

**Rule:** profile is a dialect; must map into canonical engine modes.
**Hydrate rule:** profile hydration may not change runtime `scrollMode` unless ASR is already engaged or the user explicitly selected ASR in this session.
**Audit rule:** hydrate writes must be attributable (`withScrollModeWriter` metadata) so scroll-audit output identifies source.

---

### `src/index-app.ts`
**Primary runtime assembly + global bindings.**
- Defines `UiScrollMode`
- exports globals:
  - `window.setScrollMode(mode)`
  - `window.getScrollMode()`
  - `window.__tpUiScrollMode`
  - `window.__tpScrollMode = { setMode, getMode }`

**Rule:** This is the only approved publisher of the above window globals.
**Forbidden outside `src/index-app.ts`:**
- `window.setScrollMode = ...`
- `window.getScrollMode = ...`
- `window.__tpScrollMode = ...`
- `window.kick = ...` or `window.__tpKickScroll = ...` (allowed only as dev-only export path from `index-app.ts`)

---

### `src/index-hooks/*`
**Legacy hooks and compatibility shims.**
- `asr.ts`, `asr-legacy.ts` (+ compiled js copy)
  - contain their own `getScrollMode()` logic

**Rule:** Hooks must not become owners of truth. They may query via published globals.

---

## 3) Canonical Mode Translation Table

### UI dialect (`off | auto | timed | wpm | hybrid | asr | step | rehearsal`)
-> Canon engineMode:

- timed     -> timed
- wpm       -> wpm
- hybrid    -> hybrid
- asr       -> asr
- step      -> step
- rehearsal -> rehearsal
- auto      -> keep `scrollMode` (fallback `hybrid`) + `scrollEnabled=true`
- off       -> keep `scrollMode` + `scrollEnabled=false`

### Profile dialect (`timed | wpm | asr | hybrid | off`)
-> Canon engineMode:

- timed  -> timed
- wpm    -> wpm
- asr    -> asr
- hybrid -> hybrid
- off    -> keep `scrollMode` + `scrollEnabled=false`

---

## 4) Known Drift Risks (Current Reality)

These modules define different ScrollMode unions today:

- `src/scroll/scroll-brain.ts` (canon-like)
- `src/features/scroll/mode-router.ts` (includes `auto/off`)
- `src/ui/scrollMode.ts` (missing `auto/off`)
- `src/hud/scroll-strip.ts` (UI display union)
- `src/profile/profile-schema.ts` (profile dialect; missing step/rehearsal)

**Policy:** SSOT doc wins. Code must converge toward a single canonical union + adapters.

---

## 5) Work Plan Pointer

Primary modernization objective:
- Centralize mode types + adapters into one module (SSOT)
- Replace local unions with imported canonical types
- Ensure only `index-app.ts` publishes scroll-related window globals

See `scroll-mode-ssot.md` for detailed Phase 1A tasks.
See `docs/scroll-contract.md` for executable runtime boundaries and allowed/forbidden flows.
