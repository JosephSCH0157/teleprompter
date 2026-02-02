# Anvil Scroll Mode — Canonical SSOT Map (v1)

This document defines the **single source of truth (SSOT)** for scroll mode in Anvil.
**No guessing. No vibes.** This is the authoritative vocabulary + mapping for every layer:
UI, profile, legacy hooks, runtime engines, and window globals.

---

## 0) Terms

- **Engine mode**: a mode that changes which scroll engines run (timed/WPM/ASR/step/rehearsal).
- **UI mode**: what the UI shows/lets the user pick (may include convenience states like auto/off).
- **Enabled**: whether continuous engines are allowed to run right now (separate from mode).
- **Dialect**: a "mode vocabulary" used by a subsystem (UI/profile/legacy).

---

## 1) Canonical SSOT Vocabulary

### 1.1 EngineScrollMode (CANON)

These are the only **real** scroll modes:

- `timed`
- `wpm`
- `hybrid`
- `asr`
- `step`
- `rehearsal`

**Everything else is a dialect** and must be translated into this canonical set.

> Notes:
> - "manual" is NOT a mode string (manual scrolling = no engines running, and not in rehearsal).
> - "auto" is NOT an engine mode (it is a UI convenience state).
> - "off" is NOT an engine mode (it is an enabled/disabled state).

---

## 2) SSOT Ownership at Runtime

### 2.1 One runtime owner

**SSOT owner:** `appStore`
**Canonical key:** `scrollMode`
**Type:** `EngineScrollMode`

Rules:
- Read mode: `appStore.get('scrollMode')`
- Write mode: `appStore.set('scrollMode', nextMode)`

No other module maintains an independent "true mode" state.

### 2.2 Enabled is separate

To eliminate "auto/off/manual" confusion, **enabled must be treated as separate** from engine mode.

Recommended state split:
- `engineMode: EngineScrollMode`  (SSOT)
- `enabled: boolean`              (motor allowed to run; UI + session phase can gate this)

If `enabled` is not yet formalized in appStore, treat it as a derived boolean
from existing session/intent gates -- but do NOT encode it into the mode string.

---

## 3) Dialects and Translation Rules

### 3.1 UiScrollMode (UI dialect)

UI currently uses a broader set:

`off | auto | timed | wpm | hybrid | asr | step | rehearsal`

**Translation: `ui -> engine`**
- `timed`      -> `timed`
- `wpm`        -> `wpm`
- `hybrid`     -> `hybrid`
- `asr`        -> `asr`
- `step`       -> `step`
- `rehearsal`  -> `rehearsal`

Special UI states:
- `auto` -> return `lastEngineMode` (fallback default `hybrid`)
- `off`  -> keep `engineMode` unchanged AND set `enabled=false`

**Important:** `auto` and `off` MUST NOT be stored into `appStore.scrollMode`.

Derived UI display:
- UI may display `auto/off` without changing the SSOT engine mode.

---

### 3.2 Profile Scroll Mode (Profile dialect)

Profile schema currently supports:

`timed | wpm | asr | hybrid | off`

**Translation: `profile -> engine`**
- timed  -> timed
- wpm    -> wpm
- asr    -> asr
- hybrid -> hybrid
- off    -> keep engineMode unchanged + set enabled=false

**Schema gap:** profile does not represent `step` or `rehearsal`.
- If the user selects step/rehearsal, those must be treated as **runtime-only** until schema expands.
- Do not write step/rehearsal into profile unless/ until schema is updated.

---

### 3.3 Legacy / Lite Scroll Mode (Legacy dialect)

Legacy lite mode includes:

`manual | auto | hybrid | step | rehearsal`

**Translation: `lite -> engine`**
- hybrid     -> hybrid
- step       -> step
- rehearsal  -> rehearsal
- manual     -> lastEngineMode (fallback hybrid) AND set enabled=false (if manual implies "no engines")
- auto       -> lastEngineMode (fallback hybrid) AND set enabled=true

**Important:** manual/auto must never become SSOT engine mode strings.

---

## 4) Engine Activation Matrix (Source of Truth: scroll/README.md intent)

Mode -> which engines are enabled:

- **timed**
  - timed engine: ON
  - WPM adapter: OFF
  - ASR scroll: OFF
  - step engine: helper allowed
  - rehearsal clamp: OFF

- **wpm**
  - timed engine: ON
  - WPM adapter: ON
  - ASR scroll: OFF
  - step engine: helper allowed
  - rehearsal clamp: OFF

- **asr**
  - timed engine: OFF
  - WPM adapter: OFF
  - ASR scroll: ON
  - step engine: helper allowed
  - rehearsal clamp: OFF

- **hybrid**
  - timed engine: ON
  - WPM adapter: optional/ON
  - ASR scroll: ON
  - step engine: helper allowed (secondary)
  - rehearsal clamp: OFF

- **step**
  - timed engine: OFF
  - WPM adapter: OFF
  - ASR scroll: OFF
  - step engine: primary ON
  - rehearsal clamp: OFF

- **rehearsal**
  - all movement engines OFF
  - rehearsal clamp ON (blocks programmatic scroll)
  - step engine blocked by clamp/guards

---

## 5) Global Window Exports (Strict Rules)

### 5.1 Globals are views only

Any `window.*` scroll-mode globals are **views** and **thin wrappers** around SSOT.
They must never own independent state.

Allowed pattern:
- `window.__tpScrollMode.getMode()` -> returns `appStore.get('scrollMode')`
- `window.__tpScrollMode.setMode(m)` -> `appStore.set('scrollMode', m)`

### 5.2 Single publisher rule

Only ONE module is allowed to assign/publish:
- `window.__tpScrollMode`
- `window.__tpUiScrollMode`
- `window.setScrollMode`
- `window.getScrollMode`

All other modules must import the SSOT utilities instead of reassigning globals.

---

## 6) Prohibited Patterns (Hard Rules)

- NO: Declaring new `type ScrollMode = ...` unions outside SSOT (creates dialect drift).
- NO: Storing `auto/off/manual` into SSOT engine mode.
- NO: Multiple modules writing `window.__tpScrollMode` or `window.setScrollMode`.
- NO: "Mode" strings that combine state like "autoEnabled" or "manualOff".

---

## 7) Implementation Checklist (Phase 1A)

1. Create SSOT types + adapters in:
   - `src/scroll/scroll-mode-ssot.ts`
2. Ensure a single runtime key exists:
   - `appStore.scrollMode` is `EngineScrollMode`
3. Centralize global publishing in ONE module:
   - replace multi-writers with imports + wrappers
4. Replace scattered ScrollMode unions with imports from SSOT
5. Add log probes that print:
   - engineMode, enabled, source dialect, lastEngineMode

---

## 8) Minimal Debug Probe (copy/paste)

Log canonical state from console:

```js
({
  engineMode: window.__tpScrollMode?.getMode?.(),
  uiMode: window.__tpUiScrollMode,
})
```
