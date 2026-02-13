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
5. **ASR is an isolated lane.** In `scrollMode='asr'`, scrolling is commit-driven only. No motor/auto-intent/tick-driven scrolling is allowed. Movement must come from ASR commit -> writer seek, with pixel fallback only when writer/block mapping is unavailable.
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
- Must not use preroll to trigger any scrolling.
- `session.scrollAutoOnLive` must not gate ASR startup/attach decisions.
- ASR driver attach/readiness is independent from movement arming: mode selection with script blocks present should attach/create driver + ingest path before live.
- `session.asrArmed` gates ASR movement permission only (commit may process bookkeeping while unarmed, but must not write scroll).
- Must only move on ASR commit (`tp:asr:commit` or canonical equivalent).
- Must prefer `ScrollWriter.seekToBlockAnimated()` (writer-first).
- ASR writer seek target is block-top aligned (scroll block into view); marker-centered anchoring is for continuous modes, not ASR commits.
- After a successful ASR commit seek, run a post-commit readability guarantee: keep the active line in the upper viewport band and preserve forward readable lines (minimum lookahead target) so commits never strand the reader at the bottom with no upcoming text visible.
- Forward-evidence gating must not block strong small-delta forward/same matches (`delta>=0` within relaxed-small window) when similarity is at or above required threshold.
- Forward scan must evaluate speakable multi-line windows (next-line to small joined windows) instead of single-line-only probes so natural 2-4 line utterances can advance.
- Score arbitration must bias forward continuation when transcript evidence is longer than the current line and a forward multi-line window (`span>=2`) scores at/near current-line score (within small slack) and above floor.
- After forward/forced commit movement, reseed the forward match band around the committed index (small back tolerance + forward window) so stale pre-commit windows cannot trigger immediate `match_out_of_band` lockout.
- Non-finite (`NaN`/`Infinity`) values in ASR target/scroll math must be guarded at the writer and commit path choke points; reject the write/step and emit a dev-only diagnostic guard line.
- Forward-evidence gating may still block backward moves, large forward skips, and ambiguous multi-line collisions.
- Pixel `driveToLine` is fallback only when writer or block mapping is unavailable.

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
