# Anvil Manifest (SSOT Map)

This is the canonical manifest for Anvil's runtime architecture.
Purpose: **one map, one truth** -- where state lives, who owns it, and which modules are allowed to publish globals.

If a behavior is confusing, start here before editing code.

---

## 0) Golden Rules

1. **SSOT beats convenience.** "UI mode" and "engine mode" are not the same thing.
2. **One owner per truth.** If two modules can "own" the same state, we will eventually get split-brain.
3. **Globals are views.** `window.*` exports are allowed only as thin wrappers around SSOT.
4. **Dialects must translate.** Any subsystem with its own mode vocabulary must map into canonical types.

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

### 1.2 Runtime SSOT Owner

- **Owner:** `appStore`
- **Canonical key:** `scrollMode`
- **Type:** `EngineScrollMode`

Read:
- `appStore.get('scrollMode')`

Write:
- `appStore.set('scrollMode', nextMode)`

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

---

### `src/profile/`
**User profile schema and persistence for cross-device settings.**
- `src/profile/profile-schema.ts`
  - profile scroll mode dialect: `timed | wpm | asr | hybrid | off`

**Rule:** profile is a dialect; must map into canonical engine modes.

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
- auto      -> lastEngineMode (fallback hybrid) + enabled=true
- off       -> keep engineMode + enabled=false

### Profile dialect (`timed | wpm | asr | hybrid | off`)
-> Canon engineMode:

- timed  -> timed
- wpm    -> wpm
- asr    -> asr
- hybrid -> hybrid
- off    -> keep engineMode + enabled=false

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
